import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

vi.hoisted(() => { process.env.TRACE_CONSOLE = '0' })

import { addCitationFallback } from './citations-fallback'
import { citationsComponent, buildContext, venueComponent, authorsComponent, type ScoreItem } from '../score'
import { mkRecord, testGoals } from '../test-records'
import type { Labels } from '@shared/library'

const tmp = mkdtempSync(join(tmpdir(), 'cf-'))
process.env.LOG_DIR = join(tmp, 'logs')
process.env.DATA_DIR = join(tmp, 'data')

// a record as built without an OpenAlex work (PubMed id, placeholder citedByCount 0)
const pm = (pmid: string, o: { doi?: string; year?: number; journal?: string } = {}) => mkRecord(`pmid:${pmid}`, {
  paper: { pmid, doi: o.doi ?? null, year: o.year ?? 2017, url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`, citedByCount: 0, venue: o.journal ?? 'Journal of personality' },
  venue: { name: o.journal ?? 'Journal of personality' },
})
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const labels = { kind: 'journal-article' } as Labels
const item = (rec: ReturnType<typeof pm>): ScoreItem => ({ rec, labels, rel: null, llm: null })

afterEach(() => { vi.unstubAllGlobals() })

describe('CR-14 citation / venue fallback', () => {
  it('batches PMIDs into one Europe PMC query, falls back to Crossref by DOI, matches venue by ISSN', async () => {
    const a = pm('111'), b = pm('222', { doi: '10.1000/xyz', journal: 'Some Other J' }), c = pm('333', { year: 2001 })
    const urls: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (u: string) => {
      urls.push(String(u))
      if (String(u).includes('europepmc')) return json({ resultList: { result: [
        { id: '111', source: 'MED', pmid: '111', citedByCount: 42, journalIssn: '0022-3506; 1467-6494; ' },
        { id: '333', source: 'MED', pmid: '333', citedByCount: 0 },
      ] } })
      if (String(u).includes('crossref')) return json({ message: { 'is-referenced-by-count': 7, ISSN: ['9999-0000'], 'container-title': ['X'] } })
      return json({}, 404)
    }))
    const sources = [{ id: 'https://openalex.org/S1', display_name: 'Journal of Personality', type: 'journal', issn_l: '0022-3506', summary_stats: { h_index: 150 }, is_core: true }]
    const r = await addCitationFallback([a, b, c], { sources })
    expect(urls.filter(u => u.includes('europepmc'))).toHaveLength(1)
    expect(new URL(urls[0]).searchParams.get('query')).toContain('EXT_ID:(111 OR 222 OR 333) AND SRC:MED')
    expect(urls.some(u => u.startsWith('https://api.crossref.org/works/10.1000'))).toBe(true)
    expect(a.extra.citedByFallback).toMatchObject({ count: 42, source: 'Europe PMC' })
    expect(b.extra.citedByFallback).toMatchObject({ count: 7, source: 'Crossref' })
    expect(c.extra.citedByFallback?.count).toBe(0) // genuine 0, not null
    expect(a.venue.id).toBe('S1'); expect(a.extra.venueMatch).toBe('ISSN')
    expect(r.citations).toBe(3)
    const ctx = buildContext([a, b, c].map(item), testGoals(), new Date('2026-10-18'), true)
    const v = venueComponent(item(a), ctx)
    expect(v.value).not.toBeNull(); expect(v.evidence[0].text).toContain('matched cached OpenAlex source by ISSN')
    expect(authorsComponent(item(a), ctx).how).toContain('OpenAlex unavailable (budget exhausted) — no free author data source')
  })

  it('scores fallback counts as a year-band percentile; OpenAlex wins; 0 is 0', () => {
    const recs = [10, 20, 30, 40, 50].map((n, i) => { const r = pm(String(i + 1), { year: 2017 }); r.extra.citedByFallback = { count: n, source: 'Europe PMC', url: 'u' }; return r })
    const old = pm('9', { year: 1990 }); old.extra.citedByFallback = { count: 1000, source: 'Crossref', url: 'u' }
    const zero = pm('8', { year: 2017 }); zero.extra.citedByFallback = { count: 0, source: 'Europe PMC', url: 'u' }
    const oa = mkRecord('W1', { paper: { citationPct: 0.9, citedByCount: 5 } }); oa.extra.citedByFallback = { count: 999, source: 'Europe PMC', url: 'u' }
    const all = [...recs, old, zero, oa]
    const ctx = buildContext(all.map(item), testGoals(), new Date('2026-10-18'), true)
    const c = citationsComponent(item(recs[4]), ctx)
    expect(c.value).toBeCloseTo(6 / 6) // 50 is the max of the 2016–2018 band (5 + zero = 6 peers; the 1990 paper is out)
    expect(c.evidence[0].text).toBe('Europe PMC cited-by 50 · 100th percentile within this build (6 papers, 2016–2018)')
    expect(c.how).toContain('Library-relative fallback because OpenAlex unavailable')
    expect(citationsComponent(item(recs[0]), ctx).value).toBeCloseTo(2 / 6)
    expect(citationsComponent(item(zero), ctx).value).toBe(0)
    expect(citationsComponent(item(old), ctx).evidence[0].text).toContain('all years)') // <5 peers in 1989–1991
    expect(citationsComponent(item(oa), ctx).value).toBe(0.9) // OpenAlex wins
  })
})
