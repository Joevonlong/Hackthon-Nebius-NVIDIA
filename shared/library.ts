// Library mode contracts (captain-owned). Spec: docs/LIBRARY_SPEC.md.
// The whole vault is one research topic: goals → multi-source search → label → quality-score with evidence → top N.
import { z } from 'zod'
import { Paper, SourceRef } from './contracts'

export const SourceName = z.enum(['openalex', 'pubmed', 'arxiv', 'tavily', 'scholar'])
export type SourceName = z.infer<typeof SourceName>

export const VaultNote = z.object({ path: z.string(), title: z.string(), content: z.string() })
export type VaultNote = z.infer<typeof VaultNote>

export const Weights = z.object({
  relevance: z.number(), // embedding similarity to goals/subtopics
  graph: z.number(), // citation links to the vault's own papers
  citations: z.number(), // field- and year-normalized citation impact
  venue: z.number(), // journal/conference standing
  authors: z.number(), // author track record + affiliation
  llm: z.number(), // LLM read (lowest weight by design)
})
export type Weights = z.infer<typeof Weights>
export const DEFAULT_WEIGHTS: Weights = { relevance: 0.3, graph: 0.15, citations: 0.18, venue: 0.15, authors: 0.12, llm: 0.1 }

export const LibraryRequest = z.object({
  notes: z.array(VaultNote).min(1),
  topK: z.number().int().min(5).max(200).default(30), // papers returned (UI parameter)
  threshold: z.number().min(0).max(1).default(0.5), // absolute floor (D-27): never pass below this total
  topPercent: z.number().min(1).max(100).default(25), // D-27: pass = top X% of this library AND total ≥ threshold
  sources: z.array(SourceName).default(['openalex', 'pubmed', 'arxiv', 'tavily', 'scholar']),
  weights: Weights.default(DEFAULT_WEIGHTS),
  maxCandidates: z.number().int().min(50).max(3000).default(600), // pile size cap before scoring
  llmReadTopK: z.number().int().min(0).max(100).default(40), // LLM reads only the best pre-scored papers
  questionId: z.string().max(200).optional(), // D-33: the research question folder this build reads (Questions/<name>/)
  questionName: z.string().max(200).optional(),
  notesAsKnown: z.boolean().optional(), // default true: ids named in non-seed notes count as known papers; false = seeds only
})
export type LibraryRequest = z.infer<typeof LibraryRequest>

export const Evidence = z.object({ text: z.string(), source: SourceRef.optional() }) // one line of proof
export type Evidence = z.infer<typeof Evidence>

export const Goals = z.object({
  topic: z.string(),
  question: z.string(),
  goals: z.array(z.string()),
  subtopics: z.array(z.object({ name: z.string(), query: z.string() })),
  keywords: z.array(z.string()),
  knownPapers: z.array(z.string()), // DOIs / PMIDs / arXiv ids / OpenAlex ids found in the notes
  evidence: z.array(z.object({ notePath: z.string(), quote: z.string() })), // where in the notes each goal comes from
  model: z.string().nullable(),
})
export type Goals = z.infer<typeof Goals>

export const Hit = z.object({ // one search result that led to a paper (provenance)
  source: SourceName,
  via: z.enum(['keyword', 'subtopic', 'known_paper', 'references', 'cited_by', 'similar', 'web', 'scout']),
  query: z.string().nullable(),
  rank: z.number().nullable(), // position in that source's result list (1 = first)
  url: z.string(),
})
export type Hit = z.infer<typeof Hit>

export const AuthorInfo = z.object({
  id: z.string().nullable(), name: z.string(), position: z.enum(['first', 'middle', 'last']),
  hIndex: z.number().nullable(), worksCount: z.number().nullable(), citedByCount: z.number().nullable(),
  institutions: z.array(z.object({ name: z.string(), ror: z.string().nullable(), type: z.string().nullable(), country: z.string().nullable() })),
})
export const VenueInfo = z.object({
  id: z.string().nullable(), name: z.string().nullable(), type: z.string().nullable(), // journal | conference | repository | book series | ebook platform
  publisher: z.string().nullable(), hIndex: z.number().nullable(), meanCitedness2y: z.number().nullable(),
  isCore: z.boolean().nullable(), isInDoaj: z.boolean().nullable(), issn: z.string().nullable(),
})

export const Labels = z.object({
  kind: z.enum(['journal-article', 'conference-paper', 'preprint', 'review', 'systematic-review', 'meta-analysis', 'book', 'book-chapter', 'dataset', 'thesis', 'editorial', 'other']),
  studyDesign: z.array(z.string()), // e.g. randomized-controlled-trial, clinical-trial, case-report, cohort (PubMed publication types)
  peerReviewed: z.boolean().nullable(),
  openAccess: z.string().nullable(), // gold | green | hybrid | bronze | diamond | closed
  field: z.string().nullable(), subfield: z.string().nullable(), topic: z.string().nullable(), // OpenAlex primary topic
  keywords: z.array(z.string()), mesh: z.array(z.string()), arxivCategories: z.array(z.string()),
  language: z.string().nullable(), recency: z.enum(['fresh', 'recent', 'established', 'classic']),
  retracted: z.boolean(), hasAbstract: z.boolean(),
  sources: z.array(SourceName), // which search sources found it
  subtopics: z.array(z.string()), // goal subtopics it matched
  tags: z.array(z.string()), // free extra labels (e.g. "method/tool", "funded:NIH")
})
export type Labels = z.infer<typeof Labels>

export const ScoreComponent = z.object({
  key: z.enum(['relevance', 'graph', 'citations', 'venue', 'authors', 'llm']),
  label: z.string(),
  weight: z.number(),
  value: z.number().min(0).max(1).nullable(), // null = could not assess (weight is redistributed, and that is shown)
  contribution: z.number(), // weight × value after redistribution
  how: z.string(), // the rule used, in one sentence
  evidence: z.array(Evidence), // concrete numbers with their source links
})
export type ScoreComponent = z.infer<typeof ScoreComponent>

export const LlmRead = z.object({
  model: z.string(), read: z.enum(['abstract', 'full-text']), relevance: z.number().min(0).max(3), quality: z.number().min(0).max(3),
  why: z.string(), quote: z.string().nullable(), verified: z.boolean(), concerns: z.array(z.string()),
})

export const LibPaper = z.object({
  paper: Paper,
  authors: z.array(AuthorInfo),
  venue: VenueInfo,
  labels: Labels,
  hits: z.array(Hit),
  relations: z.array(z.object({ type: z.enum(['cites', 'cited_by', 'similar', 'same_query']), paperId: z.string(), note: z.string().optional() })),
  components: z.array(ScoreComponent),
  total: z.number(), // 0..1
  passed: z.boolean(), // total ≥ threshold and not excluded
  excluded: z.string().nullable(), // hard gate reason (retracted, duplicate, off-language…)
  rank: z.number(), // 1 = best
  llmRead: LlmRead.nullable(),
  file: z.string(), // relative path of this paper's JSON file
})
export type LibPaper = z.infer<typeof LibPaper>

export const LibraryStage = z.enum(['goals', 'search', 'expand', 'normalize', 'enrich', 'label', 'score', 'llm', 'select'])

export const LibraryEvent = z.discriminatedUnion('type', [
  z.object({ type: z.literal('library'), libraryId: z.string(), request: z.object({ topK: z.number(), threshold: z.number(), sources: z.array(SourceName), weights: Weights }) }),
  z.object({ type: z.literal('stage'), stage: LibraryStage, status: z.enum(['start', 'done', 'skipped', 'error']), count: z.number().optional(), message: z.string().optional(), ms: z.number().optional() }),
  z.object({ type: z.literal('goals'), goals: Goals }),
  z.object({ type: z.literal('source'), source: SourceName, query: z.string(), count: z.number(), ms: z.number(), error: z.string().optional() }),
  z.object({ type: z.literal('papers'), papers: z.array(LibPaper), total: z.number(), passed: z.number() }), // top topK, sorted by rank
  z.object({ type: z.literal('done'), libraryId: z.string(), total: z.number(), passed: z.number(), ms: z.number(), dir: z.string() }),
  z.object({ type: z.literal('error'), message: z.string() }),
])
export type LibraryEvent = z.infer<typeof LibraryEvent>

// D-35: one saved library in the History list (GET /api/libraries?questionId=). questionId null = "Earlier libraries".
export const LibrarySummary = z.object({
  libraryId: z.string(),
  questionId: z.string().nullable(),
  questionName: z.string().nullable(),
  question: z.string().nullable(), // the question text the goals agent read
  name: z.string().nullable(), // user rename (stored in library.json)
  createdAt: z.string(),
  total: z.number(),
  passed: z.number(),
  topK: z.number(),
  topTitle: z.string().nullable(), // rank #1 paper title
})
export type LibrarySummary = z.infer<typeof LibrarySummary>

// HTTP API (server/routes/library.ts):
//   POST /api/library                       LibraryRequest -> { libraryId }
//   GET  /api/library/:id/stream            SSE of LibraryEvent (replay then live)
//   GET  /api/library/:id                   { goals, papers: LibPaper[] (all scored), request }
//   GET  /api/library/:id/papers/:paperId   the per-paper JSON file (LibPaper)
//   GET  /api/libraries?questionId=         { libraries: LibrarySummary[] } newest first (D-35)
//   PATCH /api/library/:id                  { name } -> LibrarySummary (rename)
//   DELETE /api/library/:id                 moves the folder to ${DATA_DIR}/library/.trash/ -> { ok }
//   GET  /api/library/:id/export            one JSON download { library, goals, papers }
//   POST /api/seeds/import                  multipart file (.bib .ris .json .csv .txt .pdf) -> { ids, format, file } (D-36)
// Files: ${DATA_DIR}/library/<libraryId>/{goals.json, library.json, papers/<paperId>.json}; traces in logs/runs/<libraryId>/.

// ---- Chat (D-26, D-29) -------------------------------------------------------------------------------
export const ChatMessage = z.object({ role: z.enum(['user', 'assistant']), content: z.string() })
export type ChatMessage = z.infer<typeof ChatMessage>
export const Filters = z.object({
  kinds: z.array(z.string()).optional(), // Labels.kind values to keep
  minYear: z.number().optional(),
  maxYear: z.number().optional(),
  openAccessOnly: z.boolean().optional(),
  peerReviewedOnly: z.boolean().optional(),
})
export type Filters = z.infer<typeof Filters>
export const Proposal = z.object({ // never applied by the server; the user clicks Apply in the UI
  weights: Weights.partial().optional(),
  topPercent: z.number().min(1).max(100).optional(),
  threshold: z.number().min(0).max(1).optional(),
  filters: Filters.optional(),
  rationale: z.string(),
})
export type Proposal = z.infer<typeof Proposal>
export const ChatRequest = z.object({
  messages: z.array(ChatMessage).min(1), // full history, last one is the user's
  current: z.object({ weights: Weights, topPercent: z.number(), threshold: z.number(), filters: Filters }),
})
export type ChatRequest = z.infer<typeof ChatRequest>
export const ChatResponse = z.object({
  reply: z.string(), // markdown; cite papers as [#rank Title]
  cited: z.array(z.object({ rank: z.number(), paperId: z.string(), title: z.string() })),
  proposal: Proposal.nullable(),
  model: z.string().nullable(),
})
export type ChatResponse = z.infer<typeof ChatResponse>
//   POST /api/library/:id/chat     ChatRequest -> ChatResponse   (logged to logs/runs/<id>/chat.jsonl and <library folder>/chat.jsonl)
//   POST /api/library/:id/applied  { prompt, proposal, before: string[], after: string[] } -> { ok }  (logs an applied change)

