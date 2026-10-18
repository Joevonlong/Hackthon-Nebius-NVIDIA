// LLM judge (Nemotron, json_schema, temperature 0) + deterministic quote verification.
import { Judgement, PaperType, type Paper, type Seed } from '@shared/contracts'
import type { RunConfig } from '@shared/config'
import { z } from 'zod'
import { env } from '../env'
import { chatJson, createLimiter, hasKey } from './http'
import { verifyQuote } from './verify'
import type { JudgeInput } from './index'

const grade = z.coerce.number().transform(n => Math.max(0, Math.min(3, Math.round(n))))

/** What the model returns (before model / quoteRef / verified are added). */
export const JudgeOut = z.object({
  relevance: grade,
  facets: z.object({ topic: grade, method: grade, population: grade }),
  paperType: z.string().transform(s => {
    const t = s.toLowerCase().replace(/[^a-z_]/g, '')
    const ok = PaperType.safeParse(t)
    if (ok.success) return ok.data
    if (/tool|method|software|pipeline|resource|database/.test(t)) return 'method_tool' as const
    if (/review|meta/.test(t)) return 'review' as const
    if (/trial|rct/.test(t)) return 'trial' as const
    return 'other' as const
  }),
  why: z.string(),
  quote: z.string().nullable().optional().transform(q => (q && q.trim() ? q.trim() : null)),
  uncertainty: z.string().optional().default(''),
  seedLinks: z.array(z.object({ seedN: z.coerce.number(), relation: z.string() })).optional().default([]),
})
export type JudgeOut = z.infer<typeof JudgeOut>

const g03 = { type: 'integer', minimum: 0, maximum: 3 }
export const JUDGE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['relevance', 'facets', 'paperType', 'why', 'quote', 'uncertainty', 'seedLinks'],
  properties: {
    relevance: g03,
    facets: { type: 'object', additionalProperties: false, required: ['topic', 'method', 'population'], properties: { topic: g03, method: g03, population: g03 } },
    paperType: { type: 'string', enum: ['primary', 'review', 'method_tool', 'trial', 'other'] },
    why: { type: 'string' },
    quote: { type: ['string', 'null'] },
    uncertainty: { type: 'string' },
    seedLinks: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['seedN', 'relation'], properties: { seedN: { type: 'integer' }, relation: { type: 'string' } } } },
  },
}

export const JUDGE_SYSTEM = `You are a careful biomedical literature screener. You grade one candidate paper for a researcher's question using ONLY its title and abstract. Reply with one JSON object and nothing else.

Grades are integers 0-3 with this anchored rubric:
3 = same entity: the abstract studies exactly this (same disease/phenomenon, same method, same population)
2 = closely related: a near neighbour (related disease subtype, comparable method, overlapping population)
1 = tangential: mentioned in passing or only loosely connected
0 = absent or unclear from the abstract

Fields:
- relevance: overall usefulness for answering the question (same 0-3 scale).
- facets.topic / facets.method / facets.population: grade each facet query separately.
- paperType: "primary" (original research), "review" (review, meta-analysis, perspective), "method_tool" (software, tool, pipeline, database, atlas or protocol whose main contribution is the method), "trial" (clinical trial report), "other".
- why: one sentence, at most 30 words, saying why this paper matters (or not) for the question.
- quote: a fragment copied CHARACTER FOR CHARACTER from the ABSTRACT (not the title), 8-40 words, that best supports your grade. Do not paraphrase, do not join separate sentences, do not add ellipses. null if the abstract is empty.
- uncertainty: short note on what the abstract does not tell you (empty string if nothing).
- seedLinks: for each seed this paper is linked to (given as facts), {"seedN": n, "relation": 3-8 words, e.g. "extends method of", "contradicts", "applies to new cohort"}. Only use seed numbers from the facts.`

function seedFacts(seeds: Seed[], out: number[], inn: number[]): string {
  const name = (n: number) => { const s = seeds.find(x => x.n === n); return s ? `${s.label} (${s.shortName})` : `S${n}` }
  const lines: string[] = []
  if (out.length) lines.push(`This paper cites ${out.map(name).join(', ')}.`)
  if (inn.length) lines.push(`This paper is cited by ${inn.map(name).join(', ')}.`)
  return lines.join(' ') || 'No citation links to the seeds.'
}

export function buildJudgePrompt(input: JudgeInput): string {
  const { question, facets, seeds, paper, features } = input
  const abstract = (paper.abstract || '').replace(/\s+/g, ' ').trim().slice(0, 6000)
  return `QUESTION: ${question}

FACETS:
${facets.map(f => `- ${f.key}: ${f.query}`).join('\n')}

SEEDS: ${seeds.map(s => `${s.label} = ${s.shortName}`).join('; ') || '(none)'}
SEED-LINK FACTS: ${seedFacts(seeds, features.out, features.in)}

CANDIDATE
Title: ${paper.title}
Year: ${paper.year ?? 'unknown'} · Venue: ${paper.venue ?? 'unknown'} · OpenAlex type: ${paper.type ?? 'unknown'}
ABSTRACT: ${abstract || '(no abstract)'}

Return the JSON object now.`
}

const clipWords = (s: string, n: number) => { const w = s.replace(/\s+/g, ' ').trim().split(' '); return w.length > n ? w.slice(0, n).join(' ') + '…' : w.join(' ') }

/** Turns the model's (already parsed) object into a contract Judgement with verification applied. */
export function finalizeJudgement(out: JudgeOut, paper: Paper, model: string, seeds: Seed[]): Judgement {
  const m = verifyQuote(out.quote, paper.abstract)
  const validSeeds = new Set(seeds.map(s => s.n))
  const j: Judgement = {
    model,
    relevance: out.relevance,
    facets: out.facets,
    paperType: out.paperType,
    why: clipWords(out.why, 30),
    quote: m.verified ? m.text : out.quote,
    quoteRef: m.verified ? { source: paper.abstractSource ?? 'openalex', start: m.start, end: m.end } : null,
    verified: m.verified,
    uncertainty: clipWords(out.uncertainty || '', 40),
    seedLinks: out.seedLinks.filter(l => validSeeds.has(l.seedN)).map(l => ({ seedN: l.seedN, relation: clipWords(l.relation, 10) })),
  }
  return Judgement.parse(j)
}

let judgeLimit: ReturnType<typeof createLimiter> | null = null
let judgeLimitSize = 0

export async function judge(input: JudgeInput, cfg: RunConfig): Promise<Judgement | null> {
  if (!hasKey()) return null
  if (!judgeLimit || judgeLimitSize !== cfg.judgeConcurrency) { judgeLimitSize = Math.max(1, cfg.judgeConcurrency); judgeLimit = createLimiter(judgeLimitSize) }
  return judgeLimit(async () => {
    try {
      const user = buildJudgePrompt(input)
      const deadline = Date.now() + cfg.timeoutMs
      for (let attempt = 0; attempt < 2; attempt++) {
        const left = deadline - Date.now()
        if (left < 1000) return null
        const res = await chatJson({
          model: env.models.judge, system: JUDGE_SYSTEM, user: attempt ? user + '\n\nYour previous reply was not valid JSON for the schema. Reply with the JSON object only.' : user,
          temperature: 0, maxTokens: 700, schema: { name: 'judgement', schema: JUDGE_SCHEMA }, timeoutMs: left,
        })
        if (!res) return null // timeout or API failure: no retry burn
        const parsed = JudgeOut.safeParse(res.data)
        if (parsed.success) return finalizeJudgement(parsed.data, input.paper, env.models.judge, input.seeds)
      }
      return null
    } catch {
      return null
    }
  })
}
