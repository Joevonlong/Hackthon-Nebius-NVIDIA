// Shared contracts (client + server). Owner: captain. Change only with a note in hack/DECISIONS.md.
// Spec: docs/RANKING_AND_STORAGE.md · decisions: docs/PRODUCT_PLAN.md §1
import { z } from 'zod'

export const AbstractSource = z.enum(['openalex', 'pubmed', 'europepmc'])

export const Paper = z.object({
  id: z.string(), // canonical OpenAlex work id, e.g. "W2332292689"
  doi: z.string().nullable(), // lowercased, no https://doi.org/ prefix
  pmid: z.string().nullable(),
  pmcid: z.string().nullable(),
  title: z.string(),
  authors: z.array(z.string()), // display names, first 10
  year: z.number().nullable(),
  publicationDate: z.string().nullable(), // YYYY-MM-DD
  venue: z.string().nullable(),
  type: z.string().nullable(), // OpenAlex type: article | review | preprint | ...
  citedByCount: z.number(),
  citationPct: z.number().nullable(), // OpenAlex citation_normalized_percentile (0..1)
  isRetracted: z.boolean(),
  isOa: z.boolean().nullable(),
  oaUrl: z.string().nullable(),
  abstract: z.string().nullable(),
  abstractSource: AbstractSource.nullable(),
  referencedWorks: z.array(z.string()), // OpenAlex ids
  url: z.string(), // https://openalex.org/W...
})
export type Paper = z.infer<typeof Paper>

export const Seed = Paper.extend({
  n: z.number(), // 1-based seed number
  label: z.string(), // "S1"
  shortName: z.string(), // "Tirosh 2016"
  input: z.string(), // what the user typed (DOI, PMID, OpenAlex id)
})
export type Seed = z.infer<typeof Seed>

export const RouteId = z.enum(['R1', 'R2', 'R3', 'R4', 'R5'])
export type RouteId = z.infer<typeof RouteId>
export const ROUTE_LABEL: Record<RouteId, string> = {
  R1: 'References of seeds',
  R2: 'Papers citing ≥2 seeds',
  R3: 'PubMed similar articles',
  R4: 'Query expansion',
  R5: 'Scout agent (Tavily)',
}

export const SourceRef = z.object({ name: z.string(), url: z.string() })
export type SourceRef = z.infer<typeof SourceRef>

export const Signal = z.object({
  kind: z.enum(['cites_seed', 'cited_by_seed', 'pubmed_similar', 'query', 'web', 'coupling', 'link_dropped_date']),
  route: RouteId,
  seedNs: z.array(z.number()).default([]),
  value: z.number().optional(),
  source: SourceRef,
  note: z.string().optional(),
})
export type Signal = z.infer<typeof Signal>

export const Lane = z.enum(['Retracted', 'NotAssessable', 'Core', 'Fresh', 'Linked', 'Bridges'])
export type Lane = z.infer<typeof Lane>
export const LANE_ORDER: Lane[] = ['Core', 'Fresh', 'Linked', 'Bridges', 'NotAssessable', 'Retracted']

export const FacetKey = z.enum(['topic', 'method', 'population'])
export type FacetKey = z.infer<typeof FacetKey>
export const Facet = z.object({ key: FacetKey, label: z.string(), query: z.string() })
export type Facet = z.infer<typeof Facet>

export const PaperType = z.enum(['primary', 'review', 'method_tool', 'trial', 'other'])

export const QuoteRef = z.object({
  source: AbstractSource, // where the verified text came from
  start: z.number(), // char offsets into Paper.abstract (or chunk text)
  end: z.number(),
})

export const Judgement = z.object({
  model: z.string(),
  relevance: z.number().min(0).max(3),
  facets: z.object({ topic: z.number().min(0).max(3), method: z.number().min(0).max(3), population: z.number().min(0).max(3) }),
  paperType: PaperType,
  why: z.string(),
  quote: z.string().nullable(),
  quoteRef: QuoteRef.nullable(),
  verified: z.boolean(),
  uncertainty: z.string(),
  seedLinks: z.array(z.object({ seedN: z.number(), relation: z.string() })),
})
export type Judgement = z.infer<typeof Judgement>

export const Features = z.object({
  links: z.number(), // distinct seeds linked either way (after date check)
  out: z.array(z.number()), // seed numbers this paper cites
  in: z.array(z.number()), // seed numbers that cite this paper
  coupling: z.number().nullable(),
  eSeed: z.number().nullable(), // max cosine to a seed
  eQuestion: z.number().nullable(),
  eFacets: z.object({ topic: z.number(), method: z.number(), population: z.number() }).nullable(),
  rerank: z.number().nullable(), // 0..1 reranker score vs question
  impact: z.number().nullable(), // citation percentile 0..1
  pubmedRank: z.number().nullable(), // best PubMed similar rank (1 = most similar)
})
export type Features = z.infer<typeof Features>

export const Candidate = z.object({
  paper: Paper,
  lane: Lane,
  routes: z.array(RouteId),
  signals: z.array(Signal),
  features: Features,
  judgement: Judgement.nullable(),
  score: z.number(), // within-lane score (higher = earlier)
  rank: z.number(), // 1-based rank within its lane
  whyRanked: z.string(), // deterministic explanation, never LLM text
})
export type Candidate = z.infer<typeof Candidate>

export const RunPreset = z.enum(['demo', 'deep'])
export type RunPreset = z.infer<typeof RunPreset>

export const RunRequest = z.object({
  question: z.string().min(3),
  seeds: z.array(z.string().min(3)).min(1).max(20), // DOIs, PMIDs or OpenAlex ids
  preset: RunPreset.default('demo'),
})
export type RunRequest = z.infer<typeof RunRequest>

export const StageName = z.enum(['resolve', 'r1', 'r2', 'r3', 'r4', 'scout', 'lanes', 'embed', 'rerank', 'judge', 'verify'])
export type StageName = z.infer<typeof StageName>

const LaneCounts = z.record(z.string(), z.number())

export const RunEvent = z.discriminatedUnion('type', [
  z.object({ type: z.literal('run'), runId: z.string(), question: z.string(), preset: RunPreset, config: z.record(z.string(), z.union([z.number(), z.boolean(), z.string()])) }),
  z.object({ type: z.literal('stage'), stage: StageName, status: z.enum(['start', 'done', 'skipped', 'error']), count: z.number().optional(), message: z.string().optional(), ms: z.number().optional() }),
  z.object({ type: z.literal('seeds'), seeds: z.array(Seed) }),
  z.object({ type: z.literal('facets'), facets: z.array(Facet) }),
  z.object({ type: z.literal('candidates'), candidates: z.array(Candidate), counts: LaneCounts, total: z.number() }),
  z.object({ type: z.literal('judgement'), paperId: z.string(), judgement: Judgement }),
  z.object({ type: z.literal('agent'), step: z.number(), tool: z.string(), input: z.string(), output: z.string() }),
  z.object({ type: z.literal('done'), runId: z.string(), counts: LaneCounts, total: z.number(), ms: z.number() }),
  z.object({ type: z.literal('error'), message: z.string(), stage: StageName.optional() }),
])
export type RunEvent = z.infer<typeof RunEvent>

/** Final state of a run, as returned by GET /api/runs/:id and stored in demo recordings. */
export const RunSnapshot = z.object({
  runId: z.string(),
  question: z.string(),
  preset: RunPreset,
  seeds: z.array(Seed),
  facets: z.array(Facet),
  candidates: z.array(Candidate), // only the top N per lane are sent (see config.sendPerLane)
  counts: LaneCounts,
  total: z.number(),
  events: z.array(RunEvent),
})
export type RunSnapshot = z.infer<typeof RunSnapshot>

// HTTP API (server/routes):
//   GET  /api/health                      -> { ok: true, version, models, keys: {tokenFactory, tavily, openalex} }
//   POST /api/seeds/resolve  {inputs[]}   -> { seeds: Seed[], errors: {input, message}[] }
//   POST /api/runs           RunRequest   -> { runId }
//   GET  /api/runs/:id/stream             -> text/event-stream of RunEvent (replays past events, then live). ?demo=1 replays the recording.
//   GET  /api/runs/:id                    -> RunSnapshot
//   GET  /api/demo                        -> { runId } of the recorded demo run (server/demo/recordings/melanoma.json)
//   GET  /api/papers/:id                  -> Paper
