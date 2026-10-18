// Per-entity OpenAlex cache + circuit breaker, with a mocked fetch (no network).
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { blockedUntil, sha256 } from '../../data/http'
import { backfillFromRawCache, closeEntities, entities, EntityStore } from './openalex-entities'
import { authorsBy, breakerLog, LIB_SELECT, OaBudget, resetBreakerLog, sourcesBy, worksBy } from './openalex-lib'

const work = (n: number, extra: Record<string, unknown> = {}) => ({ id: `https://openalex.org/W${n}`, doi: `https://doi.org/10.1/x${n}`, ids: { pmid: `https://pubmed.ncbi.nlm.nih.gov/${1000 + n}` }, display_name: `Work ${n}`, ...extra })
const ok = (results: any[]) => new Response(JSON.stringify({ results }), { status: 200 })
const filterIds = (url: string) => (new URL(url).searchParams.get('filter') ?? '').replace(/^[a-z_]+:/, '').split('|')
const BUDGET_429 = JSON.stringify({ error: 'Rate limit exceeded', message: 'Insufficient budget. This request costs $0.001 but you only have $0 remaining. Resets at midnight UTC.' })

let fetchMock: ReturnType<typeof vi.fn>
beforeEach(() => {
  process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'oa-ent-'))
  process.env.LOG_DIR = mkdtempSync(join(tmpdir(), 'oa-log-'))
  process.env.TRACE_CONSOLE = '0'
  delete blockedUntil.openalex
  resetBreakerLog()
  closeEntities()
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => { vi.unstubAllGlobals(); closeEntities(); delete blockedUntil.openalex })

describe('per-entity cache', () => {
  it('serves cached ids and requests only the missing ones', async () => {
    entities().put('work', [work(1), work(2)], LIB_SELECT)
    fetchMock.mockImplementation(async (url: string) => ok(filterIds(url).map(id => work(Number(id.slice(1))))))
    const ws = await worksBy(new OaBudget(), 'openalex_id', ['W2', 'W3', 'W1'])
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(filterIds(fetchMock.mock.calls[0][0])).toEqual(['W3'])
    expect(ws.map(w => w.id).sort()).toEqual(['https://openalex.org/W1', 'https://openalex.org/W2', 'https://openalex.org/W3'])
    // a different id set made of known entities: no request at all
    const again = await worksBy(new OaBudget(), 'openalex_id', ['W3', 'W1'])
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(again).toHaveLength(2)
  })

  it('resolves DOI and PMID aliases case-insensitively, and remembers not-found ids', async () => {
    entities().put('work', [work(7)], LIB_SELECT)
    expect(await worksBy(new OaBudget(), 'doi', ['10.1/X7'])).toHaveLength(1)
    expect(await worksBy(new OaBudget(), 'pmid', ['1007'])).toHaveLength(1)
    expect(fetchMock).not.toHaveBeenCalled()
    fetchMock.mockResolvedValueOnce(ok([work(8)]))
    await worksBy(new OaBudget(), 'openalex_id', ['W8', 'W9'])
    const r = await worksBy(new OaBudget(), 'openalex_id', ['W8', 'W9'])
    expect(fetchMock).toHaveBeenCalledTimes(1) // W9 is a remembered "not found", W8 is cached
    expect(r).toHaveLength(1)
  })

  it('does not serve a narrower projection for a wider select', async () => {
    entities().put('work', [work(4)], 'id,doi')
    fetchMock.mockResolvedValueOnce(ok([work(4)]))
    await worksBy(new OaBudget(), 'openalex_id', ['W4'])
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('a failed request still returns every cached entity', async () => {
    entities().put('author', [{ id: 'https://openalex.org/A1', display_name: 'Ada' }], 'id,display_name,summary_stats,works_count,cited_by_count,last_known_institutions')
    fetchMock.mockImplementation(async () => new Response('unauthorized', { status: 401 }))
    const errs: unknown[] = []
    const as = await authorsBy(new OaBudget(), ['A1', 'A2'], e => errs.push(e))
    expect(as.map(a => a.display_name)).toEqual(['Ada'])
    expect(errs).toHaveLength(1)
  })
})

describe('circuit breaker', () => {
  it('a daily-budget 429 stops every later OpenAlex call and is traced once per stage', async () => {
    fetchMock.mockImplementation(async () => new Response(BUDGET_429, { status: 429 }))
    entities().put('work', [work(1)], LIB_SELECT)
    const ids = ['W1', ...Array.from({ length: 160 }, (_, i) => `W${100 + i}`)]
    const errs: unknown[] = []
    const ws = await worksBy(new OaBudget(), 'openalex_id', ids, e => errs.push(e), 'fill-works')
    expect(ws).toHaveLength(1) // the cached one
    expect(errs).toHaveLength(1) // one error for the whole batch, not one per chunk
    const first = fetchMock.mock.calls.length
    expect(first).toBeGreaterThanOrEqual(1)
    expect(first).toBeLessThanOrEqual(4) // only chunks already in flight; no retries
    expect(blockedUntil.openalex).toBeGreaterThan(Date.now() + 1000)
    // later stages: zero network calls
    await sourcesBy(new OaBudget(), ['S1', 'S2'], () => {})
    await authorsBy(new OaBudget(), ['A1'], () => {})
    await worksBy(new OaBudget(), 'openalex_id', ids, () => {}, 'fill-works')
    expect(fetchMock.mock.calls.length).toBe(first)
    expect(breakerLog.map(b => b.stage)).toEqual(['fill-works', 'venues', 'authors'])
  })
})

describe('backfill from the URL cache', () => {
  it('harvests batch, search and single-work files without touching them', () => {
    const raw = join(process.env.DATA_DIR!, 'raw', 'openalex')
    mkdirSync(raw, { recursive: true })
    const file = (url: string, body: unknown) => {
      writeFileSync(join(raw, `${sha256(url)}.json.gz`), gzipSync(JSON.stringify({ url, status: 200, body: JSON.stringify(body), fetchedAt: new Date().toISOString() })))
    }
    const sel = encodeURIComponent(LIB_SELECT)
    file(`https://api.openalex.org/works?filter=openalex_id%3AW5%7CW6&per-page=50&select=${sel}`, { results: [work(5)] })
    file(`https://api.openalex.org/works?search=melanoma&per-page=50&page=1&select=${sel}`, { results: [work(11), work(12)] })
    file(`https://api.openalex.org/works/doi:10.1/x13?select=id,doi`, work(13))
    const store = new EntityStore(join(process.env.DATA_DIR!, 'raw', 'openalex-entities.sqlite'))
    const r = backfillFromRawCache(store, raw)
    expect(r).toMatchObject({ files: 3, used: 3, errors: 0 })
    const l = store.lookup('work', 'openalex_id', ['W5', 'W6', 'W11', 'W12', 'W13'], LIB_SELECT)
    expect(l.hits).toHaveLength(3)
    expect(l.negatives).toEqual(['W6'])
    expect(l.missing).toEqual(['W13']) // stored with a narrower select
    expect(store.lookup('work', 'doi', ['10.1/x13'], 'id,doi').hits).toHaveLength(1)
    store.close()
  })
})
