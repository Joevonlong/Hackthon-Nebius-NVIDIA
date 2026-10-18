import { afterEach, describe, expect, it, vi } from 'vitest'
import { resolveConfig } from '@shared/config'

// A fake key so the Token Factory / Tavily paths run; fetch is stubbed per test.
vi.stubEnv('TOKEN_FACTORY_API_KEY', 'test-key')
vi.stubEnv('TAVILY_API_KEY', 'test-key')
vi.stubEnv('TRACE_CONSOLE', '0')
vi.stubEnv('RERANK_MODEL', 'Qwen/Qwen3-Reranker-8B')
vi.stubEnv('PLANNER_MODEL', 'nvidia/nemotron-3-super-120b-a12b')
vi.stubEnv('PLANNER_FALLBACK_MODEL', 'Qwen/Qwen3-235B-A22B-Instruct-2507')

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const chat = (content: string) => json({ choices: [{ message: { content } }] })
type Call = { url: string; body: any }
function stubFetch(handler: (c: Call) => Response): Call[] {
  const calls: Call[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const c = { url: String(url), body: init?.body ? JSON.parse(String(init.body)) : undefined }
    calls.push(c)
    return handler(c)
  }))
  return calls
}
afterEach(() => vi.unstubAllGlobals())

const cfg = resolveConfig('demo')
const FACETS = [
  { key: 'topic' as const, label: 'Topic', query: 'melanoma' },
  { key: 'method' as const, label: 'Method', query: 'single-cell RNA sequencing' },
  { key: 'population' as const, label: 'Population', query: 'therapy-resistant cells' },
]

describe('planner output checks', () => {
  it('rejects junk queries and facet echoes', async () => {
    const { usableQueries, usableFacets, isUsableQuery, cleanQuery } = await import('../planner')
    expect(usableQueries({ queries: ['>>>', '>>>'] })).toBe(false)
    expect(usableQueries({ queries: ['melanoma scRNA-seq resistance', 'melanoma scRNA-seq resistance'] })).toBe(false)
    expect(usableQueries({ queries: ['melanoma scRNA-seq resistance', 'AXL MITF cell states'] })).toBe(true)
    // measured 15:31: cleaned to "mRNA expression profiling | flow cytometry" — still an echo, so the fallback must run
    expect(usableQueries({ queries: ['>topic=mRNA expression profiling', '>method=flow cytometry'] })).toBe(false)
    expect(isUsableQuery('>topic=mRNA')).toBe(false)
    expect(cleanQuery('>method=scRNA-seq analysis')).toBe('scRNA-seq analysis')
    expect(usableFacets({ topic: { query: '>>>' }, method: { query: 'x y' }, population: { query: 'z' } })).toBe(false)
    expect(usableFacets({ topic: { query: 'melanoma' }, method: { query: 'scRNA-seq' }, population: { query: 'patients' } })).toBe(true)
  })

  it('expandQueries retries once with the fallback model when the planner returns junk', async () => {
    const calls = stubFetch(({ body }) =>
      body.model === 'nvidia/nemotron-3-super-120b-a12b'
        ? chat('{"queries": [">>>", ">>>"]}')
        : chat('{"queries": ["melanoma single-cell therapy resistance", "AXL MITF melanoma cell states"]}'))
    const { expandQueries } = await import('../index')
    expect(await expandQueries('q', FACETS, cfg)).toEqual(['melanoma single-cell therapy resistance', 'AXL MITF melanoma cell states'])
    expect(calls.map(c => c.body.model)).toEqual(['nvidia/nemotron-3-super-120b-a12b', 'Qwen/Qwen3-235B-A22B-Instruct-2507'])
  })

  it('keeps the primary answer when it is usable (no second call)', async () => {
    const calls = stubFetch(() => chat('{"queries": ["melanoma scRNA-seq resistance", "AXL MITF cell states"]}'))
    const { expandQueries } = await import('../index')
    expect(await expandQueries('q', FACETS, cfg)).toHaveLength(2)
    expect(calls).toHaveLength(1)
  })
})

describe('rerank without a served model', () => {
  it('checks GET /models once and never calls /rerank when the model is not listed', async () => {
    const calls = stubFetch(({ url }) => (url.endsWith('/models') ? json({ data: [{ id: 'Qwen/Qwen3-Embedding-8B' }] }) : json({ detail: 'not found' }, 404)))
    const { rerank } = await import('../index')
    expect(await rerank('q', ['a', 'b'], cfg)).toBeNull()
    expect(await rerank('q', ['a'], cfg)).toBeNull()
    expect(calls.map(c => c.url.split('/').pop())).toEqual(['models'])
  })
})

describe('Tavily', () => {
  it('search passes depth, time range and a capped max_results', async () => {
    const calls = stubFetch(() => json({ results: [{ url: 'https://www.biorxiv.org/content/10.1101/2024.01.01.123456v1', title: 'T', content: 'c', score: 0.9 }] }))
    const { tavilySearch } = await import('../../sources/tavily')
    const hits = await tavilySearch('melanoma', { searchDepth: 'advanced', timeRange: 'year', maxResults: 50, includeDomains: ['biorxiv.org'] })
    expect(hits).toHaveLength(1)
    expect(calls[0].url).toBe('https://api.tavily.com/search')
    expect(calls[0].body).toMatchObject({ query: 'melanoma', search_depth: 'advanced', time_range: 'year', max_results: 20, include_domains: ['biorxiv.org'] })
  })

  it('extract returns page text and drops failed URLs', async () => {
    const calls = stubFetch(() => json({
      results: [{ url: 'https://pubmed.ncbi.nlm.nih.gov/27124452/', raw_content: '# Dissecting the multicellular ecosystem…' }],
      failed_results: [{ url: 'https://www.cell.com/x', error: 'Failed to fetch url' }],
    }))
    const { tavilyExtract } = await import('../../sources/tavily')
    const pages = await tavilyExtract(['https://pubmed.ncbi.nlm.nih.gov/27124452/', 'https://www.cell.com/x', 'https://www.cell.com/x', 'not a url'])
    expect(pages).toEqual([{ url: 'https://pubmed.ncbi.nlm.nih.gov/27124452/', text: '# Dissecting the multicellular ecosystem…' }])
    expect(calls[0].body).toEqual({ urls: ['https://pubmed.ncbi.nlm.nih.gov/27124452/', 'https://www.cell.com/x'], extract_depth: 'basic' })
  })

  it('extract degrades to [] on HTTP errors', async () => {
    stubFetch(() => json({ detail: 'bad' }, 500))
    const { tavilyExtract } = await import('../../sources/tavily')
    expect(await tavilyExtract(['https://example.org/a'])).toEqual([])
  })
})
