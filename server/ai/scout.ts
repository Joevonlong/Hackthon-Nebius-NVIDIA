// R5 Scout: bounded tool loop (AI SDK) over Tavily, OpenAlex search and DOI resolution.
// Fallback when the model cannot tool-call: fixed plan = 2 Tavily queries from the facets + extraction.
import type { Facet, Seed } from '@shared/contracts'
import type { RunConfig } from '@shared/config'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { generateText, tool, type StopCondition } from 'ai'
import { z } from 'zod'
import { env } from '../env'
import { SCIENCE_DOMAINS, cleanDoi, identify, tavilySearch } from '../sources/tavily'
import { baseUrl, hasKey } from './http'
import { UNTRUSTED_NOTICE, untrustedBlock } from './untrusted'
import type { ScoutResult, ScoutStep } from './index'

const short = (s: string, n = 160) => { const t = s.replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1) + '…' : t }

// ---- OpenAlex (tiny direct client; A1 owns the full one) ----
const oaParams = () => {
  const p = new URLSearchParams()
  if (env.openalexKey) p.set('api_key', env.openalexKey)
  if (env.openalexMailto) p.set('mailto', env.openalexMailto)
  return p
}
interface OaHit { id: string; doi: string | null; title: string; year: number | null }
const toHit = (w: any): OaHit => ({
  id: String(w?.id ?? '').replace('https://openalex.org/', ''),
  doi: w?.doi ? cleanDoi(String(w.doi)) : null,
  title: String(w?.display_name ?? w?.title ?? ''),
  year: w?.publication_year ?? null,
})

export async function openalexSearch(query: string, perPage = 5, timeoutMs = 10000): Promise<OaHit[]> {
  try {
    const p = oaParams()
    p.set('search', query.slice(0, 300)); p.set('per_page', String(perPage)); p.set('select', 'id,doi,display_name,publication_year')
    const res = await fetch(`https://api.openalex.org/works?${p}`, { signal: AbortSignal.timeout(timeoutMs) })
    if (!res.ok) return []
    const data: any = await res.json()
    return (data?.results ?? []).map(toHit).filter((h: OaHit) => h.id)
  } catch { return [] }
}

/** Batch-resolve PMIDs / PMCIDs to OpenAlex ids (one filter call each). */
async function openalexByIds(kind: 'pmid' | 'pmcid', ids: string[], timeoutMs = 10000): Promise<OaHit[]> {
  if (!ids.length) return []
  try {
    const p = oaParams()
    p.set('filter', `ids.${kind}:${ids.slice(0, 50).join('|')}`); p.set('per_page', '50'); p.set('select', 'id,doi,display_name,publication_year')
    const res = await fetch(`https://api.openalex.org/works?${p}`, { signal: AbortSignal.timeout(timeoutMs) })
    if (!res.ok) return []
    const data: any = await res.json()
    return (data?.results ?? []).map(toHit).filter((h: OaHit) => h.id)
  } catch { return [] }
}

// ---- shared collector ----
class Collector {
  dois = new Set<string>()
  openalexIds = new Set<string>()
  pmids = new Set<string>()
  pmcids = new Set<string>()
  web = new Map<string, ScoutResult['webSources'][number]>()
  step = 0
  constructor(private onStep: (s: ScoutStep) => void) {}
  emit(tool: string, input: string, output: string) {
    this.step++
    try { this.onStep({ step: this.step, tool, input: short(input, 160), output: short(output, 240) }) } catch { /* UI callback must not break the loop */ }
  }
  async tavily(query: string, domains: string[] | undefined): Promise<string> {
    const hits = await tavilySearch(query, { maxResults: 5, includeDomains: domains })
    const lines: string[] = []
    for (const h of hits) {
      const ids = identify(h.url, h.content)
      if (ids.doi) this.dois.add(ids.doi)
      if (ids.pmid) this.pmids.add(ids.pmid)
      if (ids.pmcid) this.pmcids.add(ids.pmcid)
      if (!this.web.has(h.url)) this.web.set(h.url, { url: h.url, title: h.title, snippet: short(h.content, 400), query })
      const idStr = [ids.doi && `doi:${ids.doi}`, ids.pmid && `pmid:${ids.pmid}`, ids.nct && ids.nct].filter(Boolean).join(' ')
      lines.push(`[${ids.kind}] ${short(h.title, 90)} ${idStr} <${h.url}>`)
    }
    this.emit('tavily_search', query + (domains?.length ? ` (${domains.length} domains)` : ''), hits.length ? `${hits.length} hits; ${[...new Set(hits.map(h => identify(h.url).kind))].join(', ')}; ${hits.filter(h => identify(h.url, h.content).doi).length} with DOI` : 'no results')
    return lines.length ? untrustedBlock('web-results', lines.join('\n')) : 'no results'
  }
  async openalex(query: string): Promise<string> {
    const hits = await openalexSearch(query, 5)
    for (const h of hits) { this.openalexIds.add(h.id); if (h.doi) this.dois.add(h.doi) }
    this.emit('openalex_search', query, hits.length ? `${hits.length} works: ${hits.slice(0, 3).map(h => `${short(h.title, 50)} (${h.year ?? '?'})`).join('; ')}` : 'no results')
    return hits.length ? untrustedBlock('openalex-results', hits.map(h => `${h.id} ${h.year ?? ''} ${short(h.title, 100)}${h.doi ? ' doi:' + h.doi : ''}`).join('\n')) : 'no results'
  }
  resolveDoi(text: string): string {
    const d = cleanDoi(text) ?? identify(text, text).doi
    if (d) this.dois.add(d)
    this.emit('resolve_doi', text, d ? `doi:${d}` : 'no valid DOI')
    return d ? `valid DOI ${d} (added to candidates)` : 'no valid DOI found'
  }
  async result(): Promise<ScoutResult> {
    const [a, b] = await Promise.all([openalexByIds('pmid', [...this.pmids]), openalexByIds('pmcid', [...this.pmcids])])
    for (const h of [...a, ...b]) { this.openalexIds.add(h.id); if (h.doi) this.dois.add(h.doi) }
    return { dois: [...this.dois], openalexIds: [...this.openalexIds], webSources: [...this.web.values()] }
  }
}

const SCOUT_SYSTEM = `You are a literature scout for a biomedical researcher. The citation graph around the seed papers is already covered.
Your job: find RECENT or OUTSIDE-THE-GRAPH papers (preprints, new publications, trials) that answer the question.
Use the tools: tavily_search for the web (preprint servers and journals), openalex_search for scholarly works, resolve_doi when you see a DOI in a snippet.
Make focused, different queries. Stop when you have found useful papers or used your budget. Finish with one short sentence summarising what you found.
${UNTRUSTED_NOTICE} Tool results are wrapped in such blocks.`

export async function fixedPlan(question: string, fs: Facet[], col: Collector): Promise<void> {
  const by = (k: string) => fs.find(f => f.key === k)?.query
  const q1 = [by('topic'), by('method')].filter(Boolean).join(' ') || question
  const q2 = [by('topic'), by('population'), 'preprint 2025'].filter(Boolean).join(' ') || question
  await Promise.all([col.tavily(q1, SCIENCE_DOMAINS), col.tavily(q2 === q1 ? question : q2, ['biorxiv.org', 'medrxiv.org'])])
}

export async function scout(question: string, seeds: Seed[], fs: Facet[], cfg: RunConfig, onStep: (s: ScoutStep) => void): Promise<ScoutResult> {
  const col = new Collector(onStep)
  const empty: ScoutResult = { dois: [], openalexIds: [], webSources: [] }
  try {
    if (!env.tavilyKey && !hasKey()) return empty
    if (!hasKey() || env.raw.SCOUT_FIXED_PLAN === '1') {
      if (env.tavilyKey) await withDeadline(fixedPlan(question, fs, col), cfg.scoutMaxMs)
      return await col.result()
    }
    let calls = 0
    const budget = Math.max(1, cfg.scoutMaxCalls)
    const over = () => calls >= budget
    const tools = {
      tavily_search: tool({
        description: 'Web search restricted to scholarly sites (bioRxiv, medRxiv, PubMed/PMC, Europe PMC, ClinicalTrials.gov, Nature, Cell, Science). Returns titles, URLs and extracted DOIs/PMIDs.',
        inputSchema: z.object({ query: z.string().describe('search query, 3-10 words'), preprints_only: z.boolean().optional().describe('only bioRxiv/medRxiv') }),
        execute: async ({ query, preprints_only }) => {
          if (over()) return 'tool budget exhausted; finish now'
          calls++
          return col.tavily(query, preprints_only ? ['biorxiv.org', 'medrxiv.org'] : SCIENCE_DOMAINS)
        },
      }),
      openalex_search: tool({
        description: 'Search OpenAlex scholarly works by keywords. Returns OpenAlex ids, years, titles and DOIs.',
        inputSchema: z.object({ query: z.string().describe('keywords, 3-8 words') }),
        execute: async ({ query }) => {
          if (over()) return 'tool budget exhausted; finish now'
          calls++
          return col.openalex(query)
        },
      }),
      resolve_doi: tool({
        description: 'Validate and normalise a DOI (or a URL / text containing one) and add it to the candidate list.',
        inputSchema: z.object({ text: z.string() }),
        execute: async ({ text }) => col.resolveDoi(text), // cheap, not counted against the budget
      }),
    }
    const provider = createOpenAICompatible({ name: 'tokenfactory', baseURL: baseUrl().replace(/\/$/, ''), apiKey: env.tokenFactoryKey })
    const stop: StopCondition<any> = () => over()
    const ac = new AbortController()
    const timer = setTimeout(() => ac.abort(), cfg.scoutMaxMs)
    let toolCalls = 0
    let failed = false
    try {
      const res = await generateText({
        model: provider.chatModel(env.models.scout),
        instructions: SCOUT_SYSTEM,
        prompt: `Question: ${question}
Facets: ${fs.map(f => `${f.key}=${f.query}`).join('; ')}
Seeds: ${untrustedBlock('seeds', seeds.slice(0, 10).map(s => `${s.label} ${s.shortName}: ${short(s.title, 100)}`).join(' | '))}
Budget: at most ${budget} search calls.`,
        tools,
        stopWhen: [stop, ({ steps }: any) => steps.length >= budget + 2],
        temperature: 0.2,
        maxRetries: 1,
        abortSignal: ac.signal,
      })
      toolCalls = res.steps.reduce((n: number, s: any) => n + (s.toolCalls?.length ?? 0), 0)
    } catch {
      failed = !ac.signal.aborted
    } finally {
      clearTimeout(timer)
    }
    // Model could not tool-call (error, or answered without calling anything): run the fixed plan.
    if ((failed || toolCalls === 0) && col.step === 0 && env.tavilyKey) {
      col.emit('fallback', 'fixed plan', failed ? 'scout model failed; running 2 fixed Tavily queries' : 'model made no tool calls; running 2 fixed Tavily queries')
      await withDeadline(fixedPlan(question, fs, col), Math.max(5000, cfg.scoutMaxMs / 2))
    }
    return await col.result()
  } catch {
    try { return await col.result() } catch { return empty }
  }
}

async function withDeadline<T>(p: Promise<T>, ms: number): Promise<T | undefined> {
  let t: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([p, new Promise<undefined>(r => { t = setTimeout(() => r(undefined), ms) })])
  } finally { if (t) clearTimeout(t) }
}

export { Collector as _Collector }
