import { describe, expect, it } from 'vitest'
import { DEFAULT_WEIGHTS, LibPaper } from '@shared/library'
import { labelRecord } from './labels'
import {
  authorsComponent, buildContext, citationsComponent, combine, findDuplicates, graphComponent, llmValue, ordinal, passFlags, pct, TOPIC_FLOOR_TAG,
  relevanceComponent, scoreLibrary, venueComponent, type ScoreItem,
} from './score'
import { knownGroups } from './goals'
import { mkRecord, testGoals } from './test-records'
import type { EnrichedRecord } from './types'

const NOW = new Date('2026-10-18T12:00:00Z')
const item = (rec: EnrichedRecord, cos: number | null = 0.5, goals = testGoals()): ScoreItem => ({
  rec, labels: labelRecord(rec, goals, { now: NOW }), rel: cos == null ? null : { cos, best: 'T cell states', bestKind: 'subtopic', method: 'embedding' }, llm: null,
})

describe('percentiles', () => {
  it('pct is the share ≤ x; ordinal formats', () => {
    expect(pct([1, 2, 3, 4], 3)).toBe(0.75)
    expect(pct([], 3)).toBe(0.5)
    expect(ordinal(0.92)).toBe('92nd')
    expect(ordinal(0.11)).toBe('11th')
    expect(ordinal(0.01)).toBe('1st')
    expect(ordinal(0.9994)).toBe('99th')
    expect(ordinal(1)).toBe('100th')
  })
})

describe('relevance', () => {
  it('rescales min–max within the library and shows the best match with "of N"', () => {
    const items = [item(mkRecord('W1'), 0.3), item(mkRecord('W2'), 0.5), item(mkRecord('W3'), 0.7)]
    const ctx = buildContext(items, testGoals(), NOW)
    const c = relevanceComponent(items[1], ctx)
    expect(c.value).toBeCloseTo(0.5)
    expect(c.evidence[0].text).toMatch(/best match: subtopic 'T cell states' cos 0\.50 \(66th pct within this build \(3 papers\)\)/)
    expect(c.evidence[0].source?.url).toBe('https://openalex.org/W2')
    expect(relevanceComponent(item(mkRecord('W9'), null), ctx).value).toBeNull()
  })
})

describe('citations', () => {
  const ctxOf = (recs: EnrichedRecord[]) => buildContext(recs.map(r => item(r)), testGoals(), NOW)
  it('uses OpenAlex normalized percentile when present', () => {
    const r = mkRecord('W1', { paper: { citationPct: 0.99, citedByCount: 1522 } })
    const c = citationsComponent(item(r), ctxOf([r]))
    expect(c.value).toBe(0.99)
    expect(c.evidence[0].text).toBe('cited_by 1,522 · 99th percentile for field and year (OpenAlex)')
  })
  it('new papers use FWCI, or are not assessed (no neutral 0.5)', () => {
    const a = mkRecord('W1', { paper: { publicationDate: '2026-03-01', year: 2026 }, extra: { fwci: 1 } })
    const b = mkRecord('W2', { paper: { publicationDate: '2026-03-01', year: 2026 } })
    expect(citationsComponent(item(a), ctxOf([a, b])).value).toBeCloseTo(0.5)
    const nb = citationsComponent(item(b), ctxOf([a, b]))
    expect(nb.value).toBeNull()
    expect(nb.how).toMatch(/^Not assessed: paper < 2 years old/)
  })
  it('older papers without a percentile use log(cited_by+1) percentile within the library', () => {
    const recs = [0, 10, 100, 1000].map((c, i) => mkRecord(`W${i}`, { paper: { citedByCount: c } }))
    const c = citationsComponent(item(recs[3]), ctxOf(recs))
    expect(c.value).toBe(1)
    expect(c.evidence[0].text).toMatch(/100th pct within this build \(4 papers\)/)
  })
  // Q2-1: OpenAlex 429 / not enriched → citedByCount 0 is a placeholder, not data
  const noOa = (id: string, o: Parameters<typeof mkRecord>[1] = {}) => mkRecord(id, { ...o, paper: { id: `pmid:${id}`, url: `https://pubmed.ncbi.nlm.nih.gov/${id}/`, citedByCount: 0, ...o.paper } })
  it('Q2-1: no OpenAlex record and no Scholar count → not assessed, weight redistributed, and left out of the library percentile', () => {
    const missing = noOa('111')
    const real = [5, 50].map((c, i) => mkRecord(`W${i}`, { paper: { citedByCount: c } }))
    const ctx = ctxOf([missing, ...real])
    const c = citationsComponent(item(missing), ctx)
    expect(c.value).toBeNull()
    expect(c.how).toBe('Not assessed: no citation data from OpenAlex for this paper (rate-limited or not indexed).')
    expect(ctx.logCites).toHaveLength(2)
    const { components } = combine([{ key: 'relevance', value: 1, how: 'r', evidence: [] }, c], DEFAULT_WEIGHTS)
    expect(components[1].contribution).toBe(0)
    expect(components[1].how).toMatch(/redistributed/)
    expect(components[0].weight).toBeCloseTo(1)
  })
  it('Q2-1: a genuine 0 with a real OpenAlex record stays 0 (not "100th pct" among other zeros)', () => {
    const recs = [0, 0, 0].map((c, i) => mkRecord(`W${i}`, { paper: { citedByCount: c } }))
    const c = citationsComponent(item(recs[0]), ctxOf(recs))
    expect(c.value).toBe(0)
    expect(c.evidence[0].text).toBe('cited_by 0 (OpenAlex) · 0th pct within this build (3 papers)')
  })
  it('Q2-1: no OpenAlex record but a Google Scholar count → assessed from Scholar', () => {
    const r = noOa('222', { paper: { citedByCount: 40 }, extra: { scholarCitedBy: 40 } })
    const other = mkRecord('W1', { paper: { citedByCount: 10 } })
    const c = citationsComponent(item(r), ctxOf([r, other]))
    expect(c.value).toBe(1)
    expect(c.evidence[0].text).toMatch(/cited_by 40 \(Google Scholar\)/)
  })
  it('Q2-1: authors and venue without OpenAlex data say why they are not assessed', () => {
    const r = noOa('333', { authors: [{ id: null, name: 'Yan M', position: 'first', hIndex: null, worksCount: null, citedByCount: null, institutions: [] }] })
    const ctx = ctxOf([r])
    const a = authorsComponent(item(r), ctx)
    expect(a.value).toBeNull()
    expect(a.how).toBe('Not assessed: no author data from OpenAlex for this paper (rate-limited or not indexed).')
    const v = venueComponent(item(r), ctx)
    expect(v.value).toBeNull()
    expect(v.how).toBe('Not assessed: no venue metrics from OpenAlex for this paper (rate-limited or not indexed).')
  })
})

describe('graph', () => {
  const known = mkRecord('W100', { paper: { doi: '10.1/known', title: 'Known paper' } })
  const goals = testGoals({ knownPapers: ['10.1/known', 'W200'] })
  const recs = [
    known,
    mkRecord('W1'),
    mkRecord('W2', { relations: [{ type: 'cites', paperId: 'W100' }] }),
    mkRecord('W3', { relations: [{ type: 'cited_by', paperId: 'W100' }], paper: { referencedWorks: ['W200'] } }),
  ]
  const items = recs.map(r => item(r, 0.5, goals))
  const ctx = buildContext(items, goals, NOW)
  it('0 links = 0, 1 = 0.5, ≥2 = 1; the vault paper itself = 1', () => {
    expect(graphComponent(items[1], ctx).value).toBe(0)
    const g2 = graphComponent(items[2], ctx)
    expect(g2.value).toBe(0.5)
    expect(g2.evidence[0].text).toMatch(/^cites your paper "Known paper" \(OpenAlex referenced_works\)/)
    expect(g2.evidence.map(e => e.text).join(' ')).not.toMatch(/\bK\d+\b/)
    expect(graphComponent(items[3], ctx).value).toBe(1)
    expect(graphComponent(items[0], ctx).evidence[0].text).toMatch(/in your notes \("Known paper"\)/)
  })
  it('null when the notes name no papers', () => {
    const ctx0 = buildContext(items, testGoals(), NOW)
    expect(graphComponent(items[2], ctx0).value).toBeNull()
  })
})

describe('known papers (Seed links)', () => {
  it('a seed with DOI + PMID + OpenAlex id is ONE paper; two ids of one paper make one link', () => {
    const seed = mkRecord('W9', { paper: { doi: '10.1/seed', pmid: '111111' } })
    const other = mkRecord('W8', { paper: { referencedWorks: ['W9'] } })
    const items = [item(seed), item(other)]
    const g = { ...testGoals(), knownPapers: ['10.1/seed', 'pmid:111111', 'W9'] }
    const ctx = buildContext(items, g, NOW)
    expect(ctx.knownCount).toBe(1)
    expect(graphComponent(items[1], ctx).value).toBe(0.5) // one linked paper, not two
  })
  it('a seed that is NOT in the records still counts once, via its id group', () => {
    const items = [item(mkRecord('W1'))]
    const g = { ...testGoals(), knownPapers: ['10.1234/absent', 'pmid:222222', 'W77', '10.1234/other'] }
    expect(buildContext(items, g, NOW, false, [['10.1234/absent', 'pmid:222222', 'W77'], ['10.1234/other']]).knownCount).toBe(2)
    expect(buildContext(items, g, NOW).knownCount).toBe(4) // without groups every id is its own paper
  })
})

describe('reference list in a note', () => {
  it('a single-spaced list of DOIs is N known papers: all N are excluded and counted', () => {
    const notes = [{ path: 'Questions/q/Refs.md', title: 'Refs', content: '- 10.1111/aaa\n- 10.2222/bbb\n- 10.3333/ccc' }]
    const groups = knownGroups(notes)
    expect(groups).toHaveLength(3)
    const recs = ['aaa', 'bbb', 'ccc'].map((x, i) => mkRecord(`W${i + 1}`, { paper: { doi: `10.${i + 1}${i + 1}${i + 1}${i + 1}/${x}` } }))
    const g = { ...testGoals(), knownPapers: groups.flat() }
    const ctx = buildContext(recs.map(r => item(r)), g, NOW, false, groups)
    expect(ctx.knownCount).toBe(3)
    expect(ctx.knownKeys.size).toBe(3)
    const out = scoreLibrary(recs.map(r => item(r)), g, { weights: DEFAULT_WEIGHTS, threshold: 0, topPercent: 100, now: NOW, knownGroups: groups })
    expect(out.every(p => p.excluded === 'already in your vault')).toBe(true)
  })
  it('ids on one line (or a whole seed note) are one paper, but every matching record is still excluded', () => {
    const a = mkRecord('W1', { paper: { doi: '10.1111/aaa' } }), b = mkRecord('W2', { paper: { pmid: '1234567' } })
    const ctx = buildContext([item(a), item(b)], { ...testGoals(), knownPapers: ['10.1111/aaa', 'pmid:1234567'] }, NOW, false, [['10.1111/aaa', 'pmid:1234567']])
    expect(ctx.knownCount).toBe(1)
    expect(ctx.knownKeys.size).toBe(2)
  })
})

describe('topic-fit floor', () => {
  it('keyword overlap 0 does not drop a title-only record (no abstract to judge)', () => {
    const kw = (r: ReturnType<typeof mkRecord>) => { const i = item(r, 0); i.rel = { cos: 0, best: '', bestKind: 'keywords', method: 'keywords' }; return i }
    const out = scoreLibrary([kw(mkRecord('W1', { paper: { abstract: null } })), kw(mkRecord('W2'))], testGoals(), { weights: DEFAULT_WEIGHTS, threshold: 0, topPercent: 100, now: NOW })
    expect(out.find(p => p.paper.id === 'W1')!.passed).toBe(true)
    expect(out.find(p => p.paper.id === 'W2')!.passed).toBe(false)
  })
  const opts = { weights: DEFAULT_WEIGHTS, threshold: 0, topPercent: 100, now: NOW }
  const passedOf = (out: ReturnType<typeof scoreLibrary>, id: string) => out.find(p => p.paper.id === id)!

  it('keeps 5 on-topic papers with cosines 0.80–0.85 (the floor is on the raw signal, not min–max)', () => {
    const items = [0.8, 0.81, 0.82, 0.83, 0.85].map((c, i) => item(mkRecord(`W${i + 1}`), c))
    const out = scoreLibrary(items, testGoals(), opts)
    expect(out.every(p => p.passed)).toBe(true)
    expect(out.some(p => p.labels.tags.includes(TOPIC_FLOOR_TAG))).toBe(false)
  })
  it('drops a paper whose raw cosine is under the floor (embedding) or whose keyword overlap is 0', () => {
    const kw = item(mkRecord('W3'), 0); kw.rel = { cos: 0, best: '', bestKind: 'keywords', method: 'keywords' }
    const out = scoreLibrary([item(mkRecord('W1'), 0.7), item(mkRecord('W2'), 0.2), kw], testGoals(), opts)
    expect(passedOf(out, 'W1').passed).toBe(true)
    expect(passedOf(out, 'W2').passed).toBe(false)
    expect(passedOf(out, 'W2').labels.tags).toContain(TOPIC_FLOOR_TAG)
    expect(passedOf(out, 'W3').passed).toBe(false)
  })
  it('the tag is derived per pass: an LLM read in between rescues the paper and the shared labels are never mutated', () => {
    const low = item(mkRecord('W2'), 0.2)
    const items = [item(mkRecord('W1'), 0.7), low]
    const before = [...low.labels.tags]
    expect(passedOf(scoreLibrary(items, testGoals(), opts), 'W2').labels.tags).toContain(TOPIC_FLOOR_TAG)
    expect(low.labels.tags).toEqual(before)
    low.llm = { model: 'm', read: 'abstract', relevance: 3, quality: 3, why: 'on topic', quote: null, verified: false, concerns: [] } as unknown as ScoreItem['llm']
    const second = passedOf(scoreLibrary(items, testGoals(), opts), 'W2')
    expect(second.labels.tags).not.toContain(TOPIC_FLOOR_TAG)
    expect(second.passed).toBe(true)
  })
  it('passFlags: the LLM read decides when present, else the stored tag', () => {
    const base = { total: 0.9, excluded: null }
    const rule = { topPercent: 100, threshold: 0.5 }
    expect(passFlags([{ ...base, labels: { tags: [TOPIC_FLOOR_TAG] } }, { ...base, labels: { tags: [] } },
      { ...base, labels: { tags: [TOPIC_FLOOR_TAG] }, llmRead: { relevance: 3 } }, { ...base, labels: { tags: [] }, llmRead: { relevance: 1 } }], rule)).toEqual([false, true, true, false])
  })
})

describe('venue + authors', () => {
  it('preprint servers get 0.2; missing metrics → null; full metrics are scored', () => {
    const pre = mkRecord('W1', { paper: { type: 'preprint', venue: 'bioRxiv' }, venue: { type: 'repository' } })
    const none = mkRecord('W2')
    const full = mkRecord('W3', { venue: { id: 'https://openalex.org/S1', name: 'Nature', hIndex: 1000, isCore: true, issn: '0028-0836' } })
    const low = mkRecord('W4', { venue: { id: 'S2', name: 'Small J', hIndex: 10, isCore: false } })
    const items = [pre, none, full, low].map(r => item(r))
    const ctx = buildContext(items, testGoals(), NOW)
    expect(venueComponent(items[0], ctx).value).toBe(0.2)
    expect(venueComponent(items[1], ctx).value).toBeNull()
    const v = venueComponent(items[2], ctx)
    expect(v.value).toBeCloseTo(1)
    expect(v.evidence[0].source?.url).toBe('https://openalex.org/S1')
    expect(v.evidence[0].text).toMatch(/Nature · h-index 1,000 \(100th pct within this build \(2 papers\)\) · core source · journal · ISSN/)
    expect(venueComponent(items[3], ctx).value).toBeCloseTo((0.6 * 0.5 + 0.1) / 1)
  })
  it('venue without a source h-index is not assessed, even with core / ISSN (was 1.00)', () => {
    const r = mkRecord('W5', { venue: { id: 'S5', name: 'Core J', hIndex: null, isCore: true, issn: '1234-5678', type: 'journal' } })
    const items = [item(r)]
    const v = venueComponent(items[0], buildContext(items, testGoals(), NOW))
    expect(v.value).toBeNull()
    expect(v.how).toMatch(/^Not assessed/)
  })
  it('authors: 0.7·pct(max lead h-index) + 0.3·ROR, null without h-index', () => {
    const inst = [{ name: 'Dana-Farber', ror: 'https://ror.org/02jzgtq86', type: 'healthcare', country: 'US' }]
    const a = mkRecord('W1', { authors: [{ id: 'A1', name: 'A. First', position: 'first', hIndex: 10, worksCount: 50, citedByCount: 100, institutions: [] }, { id: 'A2', name: 'B. Last', position: 'last', hIndex: 88, worksCount: 412, citedByCount: 9000, institutions: inst }] })
    const b = mkRecord('W2', { authors: [{ id: null, name: 'C', position: 'first', hIndex: 5, worksCount: null, citedByCount: null, institutions: [] }] })
    const c = mkRecord('W3')
    const items = [a, b, c].map(r => item(r))
    const ctx = buildContext(items, testGoals(), NOW)
    const ca = authorsComponent(items[0], ctx)
    expect(ca.value).toBeCloseTo(1)
    expect(ca.evidence[1].text).toBe('last author B. Last, h-index 88, 412 works, Dana-Farber (ROR 02jzgtq86)')
    expect(ca.evidence[1].source?.url).toBe('https://openalex.org/A2')
    expect(authorsComponent(items[1], ctx).value).toBeCloseTo(0.35)
    expect(authorsComponent(items[2], ctx).value).toBeNull()
  })
})

describe('combine + llm', () => {
  it('redistributes the weight of null components and says so', () => {
    const raw = [
      { key: 'relevance' as const, value: 1, how: 'r', evidence: [] }, { key: 'graph' as const, value: null, how: 'g', evidence: [] },
      { key: 'citations' as const, value: 0.5, how: 'c', evidence: [] }, { key: 'venue' as const, value: null, how: 'v', evidence: [] },
      { key: 'authors' as const, value: null, how: 'a', evidence: [] }, { key: 'llm' as const, value: null, how: 'l', evidence: [] },
    ]
    const { components, total } = combine(raw, DEFAULT_WEIGHTS)
    const S = DEFAULT_WEIGHTS.relevance + DEFAULT_WEIGHTS.citations
    expect(total).toBeCloseTo((DEFAULT_WEIGHTS.relevance * 1 + DEFAULT_WEIGHTS.citations * 0.5) / S)
    expect(components.reduce((s, c) => s + c.contribution, 0)).toBeCloseTo(total)
    expect(components[0].weight).toBeCloseTo(DEFAULT_WEIGHTS.relevance / S)
    expect(components[0].how).toMatch(/not assessed: graph, venue, authors, llm/)
    expect(components[1].contribution).toBe(0)
    expect(components[1].how).toMatch(/redistributed/)
  })
  it('llm value = (relevance + quality)/6 × (verified ? 1 : 0.6)', () => {
    const base = { model: 'm', read: 'abstract' as const, why: 'w', quote: 'q', concerns: [] }
    expect(llmValue({ ...base, relevance: 3, quality: 3, verified: true })).toBe(1)
    expect(llmValue({ ...base, relevance: 3, quality: 0, verified: false })).toBeCloseTo(0.3)
  })
})

describe('scoreLibrary', () => {
  it('gates retracted / duplicate / untitled, ranks passed first, every paper matches the LibPaper contract', () => {
    const recs = [
      mkRecord('W1', { paper: { citationPct: 0.9 } }),
      mkRecord('W2', { paper: { citationPct: 0.2 } }),
      mkRecord('W3', { paper: { isRetracted: true, citationPct: 1 } }),
      mkRecord('W4', { paper: { doi: '10.1/x', citationPct: 0.95 } }),
      mkRecord('W5', { paper: { doi: '10.1/x', citationPct: 0.95 }, hits: [] }),
      mkRecord('W6', { paper: { title: '  ', citationPct: 0.95 } }),
    ]
    const items = recs.map((r, i) => item(r, 0.2 + i * 0.1))
    const out = scoreLibrary(items, testGoals(), { weights: DEFAULT_WEIGHTS, threshold: 0.5, now: NOW })
    for (const p of out) expect(LibPaper.safeParse(p).success).toBe(true)
    const by = Object.fromEntries(out.map(p => [p.paper.id, p]))
    expect(by.W3.excluded).toBe('retracted')
    expect(by.W5.excluded).toBe('duplicate of W4')
    expect(by.W6.excluded).toBe('no title')
    expect(out.map(p => p.rank)).toEqual([1, 2, 3, 4, 5, 6])
    expect(out.slice(-3).every(p => p.excluded)).toBe(true)
    expect(out[0].passed).toBe(true)
    expect(out.filter(p => p.passed).every(p => p.total >= 0.5)).toBe(true)
    expect(new Set(out.map(p => p.file)).size).toBe(out.length)
  })
  it('findDuplicates keeps the record with more hits', () => {
    const a = mkRecord('W1', { paper: { title: 'Same Title', year: 2020 }, hits: [] })
    const b = mkRecord('W2', { paper: { title: 'same  title!', year: 2020 } })
    expect(findDuplicates([a, b]).get('W1')).toBe('W2')
  })
})
