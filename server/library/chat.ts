// Owner: lane U2. Library chat agent (D-26, D-29): answers questions about one library from its JSON (goals + every
// scored paper) and, when the user asks to change priorities, PROPOSES weights / pass rule / filters as a diff.
// The server never applies a proposal; the UI shows it and the user clicks Apply (POST /applied logs it).
// Every turn is traced: the model call to logs/runs/<id>/llm.jsonl (via chatJson), the turn to chat.jsonl.
import { z } from 'zod'
import { Labels, Proposal, type ChatRequest, type ChatResponse, type Filters, type Goals, type LibPaper, type Weights } from '@shared/library'
import { chatJson, hasKey, lastError } from '../ai/http'
import { env } from '../env'
import { clip, trace } from '../trace'
import { rescorePapers } from './score'

const KEYS = ['relevance', 'graph', 'citations', 'venue', 'authors', 'llm'] as const
type Key = (typeof KEYS)[number]
const SHORT: Record<Key, string> = { relevance: 'rel', graph: 'graph', citations: 'cit', venue: 'venue', authors: 'auth', llm: 'llm' }
const KINDS = Labels.shape.kind.options

/** D-25 letter grades. */
export const grade = (v: number | null | undefined) => v == null ? '–' : v >= 0.85 ? 'A' : v >= 0.7 ? 'B' : v >= 0.55 ? 'C' : v >= 0.4 ? 'D' : 'E'
const f2 = (v: number | null | undefined) => (v == null ? 'n/a' : v.toFixed(2))
const one = (s: string, n: number) => clip(s.replace(/\s+/g, ' ').trim(), n).replace(/… \(\+\d+ chars\)$/, '…')

function dist(xs: (string | number | null | undefined)[], max = 12): string {
  const m = new Map<string, number>()
  for (const x of xs) { const k = x == null || x === '' ? '(unknown)' : String(x); m.set(k, (m.get(k) ?? 0) + 1) }
  return [...m].sort((a, b) => b[1] - a[1]).slice(0, max).map(([k, n]) => `${k} ${n}`).join(', ') || '(none)'
}

const yearBucket = (y: number | null) => (y == null ? null : y <= 2015 ? '≤2015' : y <= 2019 ? '2016–2019' : String(y))

function paperLine(p: LibPaper, withEvidence: boolean): string {
  const v = Object.fromEntries(p.components.map(c => [c.key, c.value])) as Record<Key, number | null>
  const comps = KEYS.map(k => `${SHORT[k]} ${f2(v[k])}${v[k] == null ? '' : ' ' + grade(v[k])}`).join(' · ')
  const l = p.labels
  const meta = [
    l.studyDesign.length ? `design: ${l.studyDesign.slice(0, 3).join('/')}` : null,
    `oa: ${l.openAccess ?? '?'}`, `recency: ${l.recency}`, `peer: ${l.peerReviewed == null ? '?' : l.peerReviewed ? 'yes' : 'no'}`,
    l.subtopics.length ? `subtopics: ${l.subtopics.slice(0, 3).join(', ')}` : null,
    `cites: ${p.paper.citedByCount ?? '?'}`, `sources: ${l.sources.join('/')}`,
    p.llmRead ? `llm-read rel ${p.llmRead.relevance}/3 q ${p.llmRead.quality}/3` : null,
  ].filter(Boolean).join('; ')
  let s = `#${p.rank} "${one(p.paper.title, 140)}" (${p.paper.year ?? 'n.d.'}, ${one(p.paper.venue ?? 'no venue', 50)}, ${l.kind}) total ${p.total.toFixed(3)} ${grade(p.total)}${p.passed ? ' PASS' : ''}${p.excluded ? ` EXCLUDED(${p.excluded})` : ''}\n   ${comps}\n   ${meta}`
  if (withEvidence) {
    const ev = p.components.filter(c => c.value != null && c.evidence[0]).map(c => `${SHORT[c.key]}: ${one(c.evidence[0].text, 80)}`)
    if (ev.length) s += `\n   evidence — ${ev.join(' | ')}`
  }
  return s
}

export interface ChatContext { text: string; ranked: LibPaper[] }

/** ~12k-token cap: the top 60 by rank (evidence for the top 25) + aggregates for the whole library. */
export function buildChatContext(goals: Goals | null, papers: LibPaper[], current: ChatRequest['current'], maxChars = 46_000): ChatContext {
  const ranked = rescorePapers(papers, current.weights, { topPercent: current.topPercent, threshold: current.threshold })
  const live = ranked.filter(p => !p.excluded)
  const L: string[] = []
  if (goals) {
    L.push(`TOPIC: ${goals.topic}`, `QUESTION: ${goals.question}`, `GOALS: ${goals.goals.map((g, i) => `(${i + 1}) ${g}`).join(' ')}`,
      `SUBTOPICS: ${goals.subtopics.map(s => s.name).join('; ')}`, `KEYWORDS: ${goals.keywords.join(', ')}`)
  }
  const w = current.weights
  L.push('', `CURRENT SETTINGS: weights ${KEYS.map(k => `${k} ${w[k]}`).join(', ')} (normalized to sum 1 in the UI) · pass rule: top ${current.topPercent}% AND total ≥ ${current.threshold} · filters: ${JSON.stringify(current.filters ?? {})}`)
  L.push('', `AGGREGATES (all ${ranked.length} scored papers; ${live.length} not excluded; ${live.filter(p => p.passed).length} pass):`,
    `- kind: ${dist(live.map(p => p.labels.kind))}`,
    `- year: ${dist(live.map(p => yearBucket(p.paper.year)), 14)}`,
    `- sources: ${dist(live.flatMap(p => p.labels.sources))}`,
    `- open access: ${dist(live.map(p => p.labels.openAccess))}`,
    `- recency: ${dist(live.map(p => p.labels.recency))}`,
    `- study design: ${dist(live.flatMap(p => p.labels.studyDesign))}`,
    `- subtopics: ${dist(live.flatMap(p => p.labels.subtopics))}`,
    `- grade of total: ${dist(live.map(p => grade(p.total)))}`)
  const TOP = 60
  const rest = live.filter(p => p.rank > TOP)
  const notable = ['review', 'systematic-review', 'meta-analysis', 'preprint', 'conference-paper']
  for (const k of notable) {
    const xs = rest.filter(p => p.labels.kind === k).slice(0, 12)
    if (xs.length) L.push(`- more ${k} papers below #${TOP}: ${xs.map(p => `#${p.rank} "${one(p.paper.title, 70)}" (${p.paper.year ?? 'n.d.'}, ${p.total.toFixed(2)})`).join('; ')}`)
  }
  const trials = rest.filter(p => p.labels.studyDesign.some(d => /trial/.test(d))).slice(0, 12)
  if (trials.length) L.push(`- more clinical trials below #${TOP}: ${trials.map(p => `#${p.rank} "${one(p.paper.title, 70)}" (${p.paper.year ?? 'n.d.'})`).join('; ')}`)
  const head = L.join('\n')
  const top = ranked.slice(0, TOP)
  let lines = top.map(p => paperLine(p, p.rank <= 25))
  let body = lines.join('\n')
  // over budget: drop evidence from the bottom up, then papers from the bottom
  for (let i = Math.min(25, lines.length) - 1; i >= 0 && head.length + body.length > maxChars; i--) { lines[i] = paperLine(top[i], false); body = lines.join('\n') }
  while (lines.length > 10 && head.length + body.length > maxChars) { lines = lines.slice(0, -1); body = lines.join('\n') }
  return { text: `${head}\n\nPAPERS (rank order with the current settings; component values 0..1 with letter grades):\n${body}`, ranked }
}

// ---------- model output → ChatResponse ----------
const ModelOut = z.object({
  reply: z.string().min(1),
  cited: z.array(z.union([z.number(), z.string(), z.object({ rank: z.union([z.number(), z.string()]) }).passthrough()])).nullish(),
  proposal: z.unknown().nullish(),
})

const num = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : typeof x === 'string' && x.trim() !== '' && Number.isFinite(Number(x)) ? Number(x) : null)
const r2 = (x: number) => Math.round(x * 100) / 100
const EXPLICIT_LLM = /\b(llm|language model|model read|ai read|llm read|the model'?s (read|opinion|judg(e)?ment))\b/i

/** Validates and repairs a model proposal: weights in 0..1, LLM read stays lowest unless asked, kinds from the contract. */
export function sanitizeProposal(raw: unknown, current: ChatRequest['current'], lastUser: string): z.infer<typeof Proposal> | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, any>
  const notes: string[] = []
  const out: z.infer<typeof Proposal> = { rationale: typeof r.rationale === 'string' ? r.rationale.trim() : '' }
  if (r.weights && typeof r.weights === 'object') {
    const vals = KEYS.map(k => num(r.weights[k]))
    const scale = vals.some(v => v != null && v > 1) && vals.every(v => v == null || v <= 100) ? 100 : 1 // percentages → fractions
    const w: Partial<Weights> = {}
    KEYS.forEach((k, i) => { const v = vals[i]; if (v != null) { const c = r2(Math.min(1, Math.max(0, v / scale))); if (Math.abs(c - current.weights[k]) > 0.004) w[k] = c } })
    const merged = { ...current.weights, ...w }
    const minOthers = Math.min(...KEYS.filter(k => k !== 'llm').map(k => merged[k]))
    if (merged.llm >= minOthers) {
      if (!EXPLICIT_LLM.test(lastUser)) {
        w.llm = r2(Math.max(0, minOthers - 0.02))
        if (Math.abs(w.llm - current.weights.llm) <= 0.004) delete w.llm
        notes.push('LLM read stays the lowest weight by design (D-29).')
      } else if (merged.llm > Math.min(...KEYS.filter(k => k !== 'llm').map(k => current.weights[k]))) {
        notes.push('You asked about the LLM read explicitly, so it is no longer the lowest weight.')
      }
    }
    if (Object.keys(w).length) out.weights = w
  }
  const tp = num(r.topPercent)
  if (tp != null) { const c = Math.round(Math.min(100, Math.max(1, tp < 1 && tp > 0 ? tp * 100 : tp))); if (c !== current.topPercent) out.topPercent = c }
  const th = num(r.threshold)
  if (th != null) { const c = r2(Math.min(1, Math.max(0, th > 1 && th <= 100 ? th / 100 : th))); if (Math.abs(c - current.threshold) > 0.004) out.threshold = c }
  if (r.filters && typeof r.filters === 'object') {
    const f: Filters = {}
    if (Array.isArray(r.filters.kinds)) { const ks = r.filters.kinds.map(String).filter((k: string) => (KINDS as readonly string[]).includes(k)); if (ks.length) f.kinds = [...new Set<string>(ks)] }
    const minY = num(r.filters.minYear), maxY = num(r.filters.maxYear)
    if (minY != null && minY > 1800 && minY < 2100) f.minYear = Math.round(minY)
    if (maxY != null && maxY > 1800 && maxY < 2100) f.maxYear = Math.round(maxY)
    // false is the no-filter default: keep it only when it switches off a filter that is on now
    if (r.filters.openAccessOnly === true || (r.filters.openAccessOnly === false && current.filters?.openAccessOnly)) f.openAccessOnly = r.filters.openAccessOnly
    if (r.filters.peerReviewedOnly === true || (r.filters.peerReviewedOnly === false && current.filters?.peerReviewedOnly)) f.peerReviewedOnly = r.filters.peerReviewedOnly
    if (Object.keys(f).length && JSON.stringify(f) !== JSON.stringify(current.filters ?? {})) out.filters = f
  }
  if (!out.weights && out.topPercent == null && out.threshold == null && !out.filters) return null
  if (notes.length) out.rationale = [out.rationale, ...notes].filter(Boolean).join(' ')
  if (!out.rationale) out.rationale = 'Adjusted to match your request.'
  const ok = Proposal.safeParse(out)
  return ok.success ? ok.data : null
}

/** Rewrites loose citations (#9 "Title", **#9** Title…) into the [#9 Title] form the UI links. */
export function normalizeCitations(reply: string): string {
  return reply
    .replace(/(^|[^[\w])\*{0,2}#(\d{1,4})\*{0,2}[ :.\-–]*["“]([^"”\n]{3,200})["”]/g, (_m, pre, n, t) => `${pre}[#${n} ${t.trim()}]`)
    .replace(/\[\s*#(\d{1,4})\s*\]\s*["“]([^"”\n]{3,200})["”]/g, (_m, n, t) => `[#${n} ${t.trim()}]`)
    // a list line that starts with a bare "#9 Title (2020)" → "- [#9 Title] (2020)"
    .replace(/^(\s*(?:[-*•]|\d{1,3}[.)])?\s*)\*{0,2}#(\d{1,4})\*{0,2}[ :.\-–]+([^\n([\]]{3,200}?)(\s*\((?=\s*(?:19|20)\d\d\b))/gm,
      (_m, pre, n, t, post) => `${pre.trim() ? pre : '- '}[#${n} ${t.trim()}]${post}`)
}

/** Cited papers: the model's list plus every [#rank …] in the reply, resolved against the ranked library. */
export function resolveCited(reply: string, cited: unknown[] | null | undefined, ranked: LibPaper[]): ChatResponse['cited'] {
  const byRank = new Map(ranked.map(p => [p.rank, p]))
  const ranks = new Set<number>()
  for (const c of cited ?? []) { const n = num(typeof c === 'object' && c ? (c as any).rank : c); if (n != null) ranks.add(Math.round(n)) }
  for (const m of reply.matchAll(/\[#(\d{1,4})\b/g)) ranks.add(Number(m[1]))
  return [...ranks].map(r => byRank.get(r)).filter((p): p is LibPaper => !!p).slice(0, 40).map(p => ({ rank: p.rank, paperId: p.paper.id, title: p.paper.title }))
}

const SYSTEM = `You are PaperTrail's library assistant. The user built a scored research library for one question; the full library data is below.
Answer ONLY from this data. Be concise (under 180 words unless asked for more), concrete, and use numbers from the data.
Cite papers inline in square brackets as [#rank Title], e.g. "[#9 CD8+ T cell states in human cancer] (2020, review) …", with the exact rank from PAPERS (a long title may be shortened to its first 6–8 words). Use markdown bullets for lists. Never invent papers, ranks or numbers.
When asked "why is #a above #b", compare their component values and weights.
Score = Σ weight·value over assessed components / Σ assessed weights. Components: relevance (embedding similarity to the goals), graph (citation links to the user's own papers), citations (field/year-normalized impact), venue (journal standing), authors (track record), llm (an LLM's read of the abstract; lowest weight by design).
PROPOSALS: only when the user asks to change priorities, filters or the pass rule (e.g. "care more about recent clinical papers", "ignore preprints", "venue matters more than citations", "be stricter"), add a proposal; otherwise proposal is null.
A proposal never applies itself: the user clicks Apply. Weights are each in 0..1 (they are normalized to sum 1 in the UI); only include weights you change. Keep "llm" the lowest weight unless the user explicitly asks about the LLM read, and say so in the rationale.
There is no "recency" weight: express recency with filters.minYear. There is no study-design filter: express a clinical focus by raising relevance (and venue) and say which clinical papers would rise. Only set filters.kinds when the user asks to include or exclude a kind; "ignore preprints" = filters.kinds listing every kind to KEEP (valid kinds: ${KINDS.join(', ')}). Omit filter fields you do not change.
topPercent (1..100) and threshold (0..1, the absolute floor) form the pass rule. In the reply, summarize the proposed change in one or two sentences.
Respond with ONE JSON object and nothing else:
{"reply": "markdown answer", "cited": [rank numbers], "proposal": null | {"weights": {"venue": 0.3}, "topPercent": 25, "threshold": 0.5, "filters": {"kinds": ["journal-article"], "minYear": 2020, "maxYear": 2026, "openAccessOnly": false, "peerReviewedOnly": false}, "rationale": "one or two sentences"}}`

export function transcript(messages: ChatRequest['messages']): string {
  const hist = messages.slice(-12)
  const last = hist[hist.length - 1]
  const prior = hist.slice(0, -1).map(m => `${m.role === 'user' ? 'USER' : 'ASSISTANT'}: ${clip(m.content, 1500)}`).join('\n\n')
  return `${prior ? `Conversation so far:\n${prior}\n\n` : ''}Latest user message:\n${clip(last.content, 3000)}`
}

export interface ChatDeps { call?: typeof chatJson; now?: () => number }

/** One chat turn: planner model, JSON, zod-validated, one retry, graceful text on failure. Never throws. */
export async function runChat(libraryId: string, lib: { goals: Goals | null; papers: LibPaper[] }, req: ChatRequest, deps: ChatDeps = {}): Promise<ChatResponse> {
  const call = deps.call ?? chatJson
  const t0 = Date.now()
  const lastUser = [...req.messages].reverse().find(m => m.role === 'user')?.content ?? ''
  const ctx = buildChatContext(lib.goals, lib.papers, req.current)
  const model = env.models.planner
  let res: ChatResponse | null = null
  let error: string | null = null
  let attempts = 0
  if (!hasKey() && !deps.call) {
    error = 'no TOKEN_FACTORY_API_KEY'
  } else {
    const system = `${SYSTEM}\n\n=== LIBRARY ${libraryId} ===\n${ctx.text}`
    const timeoutMs = Number(env.raw.LIBRARY_CHAT_TIMEOUT_MS || 60000)
    for (attempts = 1; attempts <= 2 && !res; attempts++) {
      const user = attempts === 1 ? transcript(req.messages) : `${transcript(req.messages)}\n\n(Your previous answer was not a valid JSON object of the required shape. Reply with exactly one JSON object: {"reply": string, "cited": number[], "proposal": object|null}.)`
      const out = await call({ model, system, user, temperature: 0.2, maxTokens: 1500, timeoutMs: attempts === 1 ? timeoutMs : Math.min(timeoutMs, 40000) })
      if (!out) { error = lastError ? `model call failed (${lastError.status || ''} ${lastError.body.slice(0, 120)})`.trim() : 'model call failed'; if (lastError?.body === 'timeout') error = 'the model timed out'; continue }
      const parsed = ModelOut.safeParse(out.data)
      if (!parsed.success) { error = `invalid model JSON: ${parsed.error.issues.slice(0, 2).map(i => `${i.path.join('.')} ${i.message}`).join('; ')}`; continue }
      const reply = normalizeCitations(parsed.data.reply.trim())
      res = { reply, cited: resolveCited(reply, parsed.data.cited, ctx.ranked), proposal: sanitizeProposal(parsed.data.proposal, req.current, lastUser), model }
      error = null
    }
    attempts--
  }
  if (!res) {
    const why = error === 'no TOKEN_FACTORY_API_KEY' ? 'the server has no model key configured' : error ?? 'unknown error'
    res = { reply: `Sorry, I could not answer just now (${why}). Nothing was changed; please try again.`, cited: [], proposal: null, model: null }
  }
  trace('chat', { type: 'turn', prompt: clip(lastUser, 2000), turns: req.messages.length, current: req.current, reply: clip(res.reply, 3000), cited: res.cited.map(c => c.rank), proposal: res.proposal, model: res.model, attempts, error, contextChars: ctx.text.length, ms: (deps.now?.() ?? Date.now()) - t0 }, libraryId)
  return res
}

export const AppliedBody = z.object({ prompt: z.string().max(5000), proposal: Proposal, before: z.array(z.string()).max(100), after: z.array(z.string()).max(100) })
export type AppliedBody = z.infer<typeof AppliedBody>

export function logApplied(libraryId: string, b: AppliedBody): { ok: true; movedIn: number } {
  const movedIn = b.after.filter(id => !b.before.includes(id))
  const movedOut = b.before.filter(id => !b.after.includes(id))
  trace('chat', { type: 'applied', prompt: clip(b.prompt, 2000), proposal: b.proposal, before: b.before, after: b.after, movedIn, movedOut }, libraryId)
  return { ok: true, movedIn: movedIn.length }
}
