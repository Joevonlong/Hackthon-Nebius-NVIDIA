// Embeddings (Qwen3-Embedding-8B) and reranking (Qwen3-Reranker-8B) via plain fetch.
import type { RunConfig } from '@shared/config'
import { env } from '../env'
import { hasKey, tfFetch, type TfError } from './http'

export const QUERY_INSTRUCTION = 'Given a biomedical research question, retrieve relevant paper abstracts'
export const queryPrefix = (q: string) => `Instruct: ${QUERY_INSTRUCTION}\nQuery: ${q}`

const BATCH = 64
const MAX_CHARS = 6000 // ~1.5k tokens; titles + abstracts fit

export function l2normalize(v: number[]): number[] {
  let n = 0
  for (const x of v) n += x * x
  n = Math.sqrt(n)
  return n > 0 ? v.map(x => x / n) : v
}

/** Truncate to `dims` and renormalize (Matryoshka-style; used when the API ignores `dimensions`). */
export function fitDims(v: number[], dims: number): number[] {
  return l2normalize(dims > 0 && v.length > dims ? v.slice(0, dims) : v)
}

// null = unknown, true = API honours `dimensions`, false = send without it and truncate locally
let dimsSupported: boolean | null = null

async function embedBatch(input: string[], timeoutMs: number): Promise<number[][] | null> {
  const dims = env.models.embedDims
  const call = (withDims: boolean, err?: TfError) =>
    tfFetch<any>('embeddings', { model: env.models.embed, input, encoding_format: 'float', ...(withDims && dims ? { dimensions: dims } : {}) }, timeoutMs, { err })
  let res: any = null
  if (dimsSupported !== false) {
    const err: TfError = { status: 0, body: '' }
    res = await call(true, err)
    if (!res && err.status === 400 && /dimension/i.test(err.body)) { dimsSupported = false }
    else if (res) dimsSupported = true
    else return null
  }
  if (!res) res = await call(false)
  const data: any[] = res?.data
  if (!Array.isArray(data) || data.length !== input.length) return null
  const sorted = [...data].sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
  const out = sorted.map(d => d?.embedding)
  if (!out.every(e => Array.isArray(e) && e.length)) return null
  return out.map((e: number[]) => fitDims(e, dims))
}

export async function embed(texts: string[], kind: 'query' | 'document', cfg: RunConfig): Promise<number[][] | null> {
  try {
    if (!hasKey() || !texts.length) return texts.length ? null : []
    const prepared = texts.map(t => {
      const s = (t || '').trim().slice(0, MAX_CHARS) || '(empty)'
      return kind === 'query' ? queryPrefix(s) : s
    })
    const batches: string[][] = []
    for (let i = 0; i < prepared.length; i += BATCH) batches.push(prepared.slice(i, i + BATCH))
    const results = await Promise.all(batches.map(b => embedBatch(b, cfg.timeoutMs)))
    if (results.some(r => !r)) return null
    return results.flat() as number[][]
  } catch {
    return null
  }
}

const RERANK_CHUNK = 50
const sigmoid = (x: number) => 1 / (1 + Math.exp(-x))

async function rerankChunk(query: string, docs: string[], timeoutMs: number): Promise<number[] | null> {
  const res = await tfFetch<any>('rerank', { model: env.models.rerank, query, documents: docs, top_n: docs.length }, timeoutMs)
  const results: any[] = res?.results ?? res?.data
  if (!Array.isArray(results)) return null
  const scores: (number | null)[] = docs.map(() => null)
  for (const r of results) {
    const i = r?.index
    const s = r?.relevance_score ?? r?.score
    if (typeof i === 'number' && i >= 0 && i < docs.length && typeof s === 'number') scores[i] = s
  }
  return scores.map(s => (s == null ? 0 : s))
}

export async function rerank(query: string, docs: string[], cfg: RunConfig): Promise<number[] | null> {
  try {
    if (!hasKey()) return null
    if (!docs.length) return []
    const prepared = docs.map(d => (d || '').trim().slice(0, MAX_CHARS) || '(empty)')
    const chunks: string[][] = []
    for (let i = 0; i < prepared.length; i += RERANK_CHUNK) chunks.push(prepared.slice(i, i + RERANK_CHUNK))
    const results = await Promise.all(chunks.map(c => rerankChunk(query, c, cfg.timeoutMs)))
    if (results.some(r => !r)) return null
    const flat = results.flat() as number[]
    // Scores should be probabilities; map logits into 0..1 if the endpoint returns raw scores.
    const outOfRange = flat.some(s => s < 0 || s > 1)
    return flat.map(s => (outOfRange ? sigmoid(s) : s))
  } catch {
    return null
  }
}
