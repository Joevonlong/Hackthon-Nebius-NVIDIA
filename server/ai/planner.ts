// Planner calls: question → facets (topic / method / population) and R4 query expansion.
import type { Facet, Seed } from '@shared/contracts'
import type { RunConfig } from '@shared/config'
import { z } from 'zod'
import { env } from '../env'
import { chatJson, hasKey } from './http'

const FacetOut = z.object({
  topic: z.object({ label: z.string(), query: z.string() }),
  method: z.object({ label: z.string(), query: z.string() }),
  population: z.object({ label: z.string(), query: z.string() }),
})

const facetItem = { type: 'object', additionalProperties: false, required: ['label', 'query'], properties: { label: { type: 'string' }, query: { type: 'string' } } }
const FACET_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['topic', 'method', 'population'],
  properties: { topic: facetItem, method: facetItem, population: facetItem },
}

export function fallbackFacets(question: string): Facet[] {
  return [
    { key: 'topic', label: 'Topic', query: question },
    { key: 'method', label: 'Method', query: question },
    { key: 'population', label: 'Population', query: question },
  ]
}

const seedList = (seeds: Seed[]) => seeds.slice(0, 10).map(s => `- ${s.label} ${s.shortName}: ${s.title}`).join('\n')

const clip = (s: string, n: number) => s.replace(/\s+/g, ' ').trim().slice(0, n)

export async function facets(question: string, seeds: Seed[], cfg: RunConfig): Promise<Facet[]> {
  const fb = fallbackFacets(question)
  if (!hasKey()) return fb
  try {
    const res = await chatJson({
      model: env.models.planner,
      timeoutMs: cfg.timeoutMs,
      maxTokens: 400,
      schema: { name: 'facets', schema: FACET_SCHEMA },
      system: 'You split a biomedical research question into search facets. Reply with JSON only.',
      user: `Research question: ${question}

Seed papers:
${seedList(seeds) || '(none)'}

Return JSON {"topic":{"label","query"},"method":{"label","query"},"population":{"label","query"}}.
- topic: the disease / biological entity / phenomenon studied.
- method: the technique, assay, intervention or analysis approach.
- population: the organism, patient group, cell type or sample studied.
Each "query" is a short search query (3-8 words, no boolean operators). Each "label" is 1-4 words.
If the question does not mention a facet, infer it from the seed papers.`,
    })
    const parsed = FacetOut.safeParse(res?.data)
    if (!parsed.success) return fb
    return (['topic', 'method', 'population'] as const).map((key, i) => {
      const f = parsed.data[key]
      const query = clip(f.query, 120)
      return { key, label: clip(f.label, 40) || fb[i].label, query: query || question }
    })
  } catch {
    return fb
  }
}

const QUERIES_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['queries'],
  properties: { queries: { type: 'array', items: { type: 'string' } } },
}

export async function expandQueries(question: string, fs: Facet[], cfg: RunConfig): Promise<string[]> {
  if (!hasKey()) return []
  try {
    const res = await chatJson({
      model: env.models.planner,
      timeoutMs: cfg.timeoutMs,
      maxTokens: 400,
      schema: { name: 'queries', schema: QUERIES_SCHEMA },
      system: 'You write literature search queries for the OpenAlex full-text search API. Reply with JSON only.',
      user: `Research question: ${question}
Facets: ${fs.map(f => `${f.key}=${f.query}`).join('; ')}

Return {"queries":[...]} with 2 to 4 distinct queries of 3-7 plain keywords each (no quotes, no AND/OR, no field tags).
Combine the facets differently in each query; use the standard terminology and common synonyms.`,
    })
    const qs = z.object({ queries: z.array(z.string()) }).safeParse(res?.data)
    if (!qs.success) return []
    const seen = new Set<string>()
    const out = qs.data.queries
      // Nemotron sometimes echoes the facet format ("topic=… method=…"): strip labels and stray markers.
      .map(q => clip(q.replace(/\b(topic|method|population|outcome)\s*[=:]\s*/gi, ' ').replace(/[>"()=]/g, ' ').replace(/\b(AND|OR|NOT)\b/g, ' ').replace(/\s+/g, ' ').trim(), 120))
      .filter(q => q.length >= 3 && !seen.has(q.toLowerCase()) && seen.add(q.toLowerCase()))
      .slice(0, 4)
    // Measured: Nemotron sometimes returns a single query. Pad with deterministic facet pairs to reach ≥2.
    const by = (k: string) => fs.find(f => f.key === k)?.query ?? ''
    for (const pad of [`${by('topic')} ${by('method')}`, `${by('topic')} ${by('population')}`]) {
      const p = clip(pad, 120)
      if (out.length >= 2) break
      if (p.length >= 3 && !seen.has(p.toLowerCase())) { seen.add(p.toLowerCase()); out.push(p) }
    }
    return out
  } catch {
    return []
  }
}
