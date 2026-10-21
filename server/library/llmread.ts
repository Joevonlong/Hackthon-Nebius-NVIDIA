// Owner: lane L2. LLM read (spec §5, lowest weight by design): the judge model reads title + abstract of the
// top `llmReadTopK` papers by pre-LLM score. Quote verified against the abstract. Never throws; no key → empty map.
import { z } from 'zod'
import { LlmRead, type Goals } from '@shared/library'
import { env } from '../env'
import { chatJson, createLimiter, hasKey } from '../ai/http'
import { verifyQuote } from '../ai/verify'
import { UNTRUSTED_NOTICE, untrustedBlock } from '../ai/untrusted'
import type { EnrichedRecord } from './types'
import type { LlmReadT } from './score'

const Out = z.object({
  relevance: z.coerce.number().int().min(0).max(3),
  quality: z.coerce.number().int().min(0).max(3),
  why: z.string().min(1),
  quote: z.string().nullable().optional(),
  concerns: z.array(z.string()).default([]),
})

const str = { type: 'string' }
const SCHEMA = {
  type: 'object', additionalProperties: false, required: ['relevance', 'quality', 'why', 'quote', 'concerns'],
  properties: { relevance: { type: 'integer', minimum: 0, maximum: 3 }, quality: { type: 'integer', minimum: 0, maximum: 3 }, why: str, quote: { type: ['string', 'null'] }, concerns: { type: 'array', items: str } },
}

const SYSTEM = `You are a careful senior researcher screening papers for a literature library. You read one paper's title and abstract and grade it. Reply with JSON only:
${UNTRUSTED_NOTICE}
{"relevance":0-3,"quality":0-3,"why":"…","quote":"…","concerns":["…"]}
- relevance: 3 = directly answers the research question or a goal, 2 = clearly useful for a subtopic, 1 = tangential, 0 = off-topic.
- quality: 3 = strong design and clear, substantial results (large cohort, rigorous method, validated), 2 = solid, 1 = weak or preliminary, 0 = not a research contribution or not assessable.
- why: one sentence, at most 30 words.
- quote: a fragment copied CHARACTER FOR CHARACTER from the ABSTRACT (not the title), 8-40 words, that best supports your grades. No paraphrase, no ellipses.
- concerns: 0-3 short notes (small sample, no validation, preprint, mouse only, …). Empty list if none.`

export function buildReadPrompt(goals: Goals, rec: EnrichedRecord): string {
  const abs = (rec.paper.abstract || '').replace(/\s+/g, ' ').trim().slice(0, 6000)
  return `RESEARCH QUESTION: ${goals.question}
GOALS:
${goals.goals.map((g, i) => `${i + 1}. ${g}`).join('\n')}
SUBTOPICS: ${goals.subtopics.map(s => s.name).join('; ')}

PAPER
${untrustedBlock('paper', `Title: ${rec.paper.title}\nYear: ${rec.paper.year ?? 'unknown'} · Venue: ${rec.paper.venue ?? 'unknown'} · Type: ${rec.paper.type ?? 'unknown'}\nABSTRACT: ${abs}`, { id: rec.paper.id })}

Return the JSON object now.`
}

export function finalizeRead(out: z.infer<typeof Out>, rec: EnrichedRecord, model: string): LlmReadT {
  const m = verifyQuote(out.quote ?? null, rec.paper.abstract)
  const words = (s: string, n: number) => { const w = s.replace(/\s+/g, ' ').trim().split(' '); return w.length > n ? w.slice(0, n).join(' ') + '…' : w.join(' ') }
  return LlmRead.parse({
    model, read: 'abstract', relevance: out.relevance, quality: out.quality, why: words(out.why, 40),
    quote: m.verified ? m.text : (out.quote?.trim() || null), verified: m.verified, concerns: out.concerns.slice(0, 3).map(c => words(c, 20)),
  })
}

export interface LlmReadOptions { timeoutMs?: number; concurrency?: number; onRead?: (key: string, r: LlmReadT | null, ms: number) => void }

export async function readOne(goals: Goals, rec: EnrichedRecord, timeoutMs: number): Promise<LlmReadT | null> {
  if (!hasKey() || !rec.paper.abstract) return null
  const user = buildReadPrompt(goals, rec)
  const deadline = Date.now() + timeoutMs
  for (let attempt = 0; attempt < 2; attempt++) {
    const left = deadline - Date.now()
    if (left < 1000) return null
    const res = await chatJson({ model: env.models.judge, system: SYSTEM, user: attempt ? user + '\n\nYour previous reply was not valid JSON for the schema. Reply with the JSON object only.' : user, temperature: 0, maxTokens: 600, schema: { name: 'library_read', schema: SCHEMA }, timeoutMs: left })
    if (!res) return null
    const p = Out.safeParse(res.data)
    if (p.success) return finalizeRead(p.data, rec, env.models.judge)
  }
  return null
}

/** Reads the given records (already the top K) with bounded concurrency. Returns key → read for the ones that succeeded. */
export async function llmReadAll(goals: Goals, recs: EnrichedRecord[], opts: LlmReadOptions = {}): Promise<Map<string, LlmReadT>> {
  const out = new Map<string, LlmReadT>()
  if (!hasKey() || !recs.length) return out
  const limit = createLimiter(Math.max(1, opts.concurrency ?? 8))
  await Promise.all(recs.map(rec => limit(async () => {
    const t0 = Date.now()
    let r: LlmReadT | null = null
    try { r = await readOne(goals, rec, opts.timeoutMs ?? 25000) } catch { r = null }
    if (r) out.set(rec.key, r)
    opts.onRead?.(rec.key, r, Date.now() - t0)
  })))
  return out
}
