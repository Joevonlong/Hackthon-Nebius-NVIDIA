// Owner: lane L2. Goals agent (spec §1): notes → known paper ids (regex) + one planner call → Goals.
// Deterministic fallback without a key (or on planner failure): question note, headings, TF-IDF keywords.
import { z } from 'zod'
import { Goals, type VaultNote } from '@shared/library'
import { env } from '../env'
import { chatJson, hasKey } from '../ai/http'
import { verifyQuote } from '../ai/verify'
import { UNTRUSTED_NOTICE, untrustedBlock } from '../ai/untrusted'

// ---------- known paper ids ----------
// Output format (shared with L1): DOI "10.xxxx/…" (lowercase), "pmid:<n>", "arxiv:<id>", OpenAlex "W<n>".
const DOI_RE = /\b(10\.\d{4,9}\/[^\s"'`<>\]\[(){}|,;]+)/gi
const PMID_RE = /(?:\bPMID\s{0,5}:?\s{0,5}|pubmed\.ncbi\.nlm\.nih\.gov\/)(\d{5,9})\b/gi
const ARXIV_RE = /(?:\barXiv\s{0,5}:?\s{0,5}|arxiv\.org\/(?:abs|pdf)\/)(\d{4}\.\d{4,5})(?:v\d+)?/gi
/** Strips trailing punctuation with a scan from the end (a `[...]+$` regex rescans a long run from every start; #41). */
function trimTrailing(d: string): string {
  let end = d.length
  while (end > 0 && '.)]}>*_`\'"'.includes(d[end - 1])) end--
  return d.slice(0, end)
}
const ARXIV_DOI_RE = /^10\.48550\/arxiv\.(\d{4}\.\d{4,5})/i
const OPENALEX_RE = /(?:openalex\.org\/(?:works\/)?|\b)(W\d{6,12})\b/g

/** Seed notes live in Questions/<name>/seeds/ (or the old Seeds/); every other note is a "note". */
export const isSeedNote = (n: VaultNote) => /(^|\/)seeds\//i.test(n.path)

function idsIn(text: string, out: Set<string>) {
  for (const m of text.matchAll(DOI_RE)) {
    const doi = trimTrailing(m[1]).toLowerCase()
    const ax = doi.match(ARXIV_DOI_RE)
    out.add(ax ? `arxiv:${ax[1]}` : doi)
  }
  for (const m of text.matchAll(PMID_RE)) out.add(`pmid:${m[1]}`)
  for (const m of text.matchAll(ARXIV_RE)) out.add(`arxiv:${m[1]}`)
  for (const m of text.matchAll(OPENALEX_RE)) out.add(m[1])
}

/** Merges id groups that share an id (one paper can be named by DOI, PMID and OpenAlex id in different places). */
function mergeGroups(groups: string[][]): string[][] {
  const out: Set<string>[] = []
  for (const g of groups) {
    const hit = out.filter(o => g.some(id => o.has(id)))
    const merged = new Set<string>(g)
    for (const o of hit) { for (const id of o) merged.add(id); out.splice(out.indexOf(o), 1) }
    out.push(merged)
  }
  return out.map(o => [...o])
}

/**
 * Known papers as groups of ids, one group = one paper. A seed note names ONE paper (all its ids are one group); in other
 * notes, ids are merged only when they share one line / bullet item (a reference list is N papers). `fromNotes` are the groups named only in non-seed notes.
 */
export function knownBySource(notes: VaultNote[]): { seeds: string[][]; fromNotes: string[][] } {
  const seedGroups: string[][] = [], noteGroups: string[][] = []
  for (const n of notes) {
    if (isSeedNote(n)) { const o = new Set<string>(); idsIn(n.content, o); if (o.size) seedGroups.push([...o]) }
    else for (const block of n.content.split(/\n/)) { if (!block.trim()) continue; const o = new Set<string>(); idsIn(block, o); if (o.size) noteGroups.push([...o]) }
  }
  const seeds = mergeGroups(seedGroups)
  const seedIds = new Set(seeds.flat())
  const fromNotes = mergeGroups(noteGroups.map(g => g.filter(id => !seedIds.has(id))).filter(g => g.length))
  return { seeds, fromNotes }
}

/** `notesAsKnown` (default true): also count ids that appear only in non-seed notes. */
export function knownGroups(notes: VaultNote[], notesAsKnown = true): string[][] {
  const { seeds, fromNotes } = knownBySource(notes)
  return notesAsKnown ? [...seeds, ...fromNotes] : seeds
}
export const extractKnownPapers = (notes: VaultNote[], notesAsKnown = true): string[] => [...new Set(knownGroups(notes, notesAsKnown).flat())]

// ---------- deterministic fallback ----------
const STOP = new Set(('a an and are as at be been but by can could do does for from had has have how i if in into is it its may might more most no not of on or our over such than that the their them then there these they this those to under up use used using was we were what when where which while who why will with within without would you your also each other only very between both after before about across per via vs'
  + ' note notes paper papers study studies seed seeds question doi pmid arxiv http https www org com et al').split(' '))

const tokens = (s: string) => s.toLowerCase().replace(/https?:\/\/\S+/g, ' ').replace(/10\.\d{4,9}\/\S+/g, ' ').match(/[a-z][a-z0-9+-]{2,}/g) ?? []

export function tfidfKeywords(notes: VaultNote[], k = 12): string[] {
  const df = new Map<string, number>()
  const tf = new Map<string, number>()
  for (const n of notes) {
    const ts = tokens(`${n.title} ${n.content}`).filter(t => !STOP.has(t))
    for (const t of ts) tf.set(t, (tf.get(t) ?? 0) + 1)
    for (const t of new Set(ts)) df.set(t, (df.get(t) ?? 0) + 1)
  }
  const N = notes.length
  return [...tf].map(([t, f]) => ({ t, s: f * (Math.log((N + 1) / (df.get(t)! + 0.5)) + 1) }))
    .sort((a, b) => b.s - a.s || a.t.localeCompare(b.t)).slice(0, k).map(x => x.t)
}

const isQuestionNote = (n: VaultNote) => /question/i.test(n.path) || /question/i.test(n.title)
// per line, with the closing #s cut by a scan: a lazy `(.+?)\s*#*\s*$` rescans a long whitespace run from every start (#41)
const headingsOf = (s: string) => s.split('\n').flatMap(line => {
  const m = /^#{1,3}[ \t]+(.*)$/.exec(line.replace(/\r$/, '')); if (!m) return []
  let t = m[1].trim()
  while (t.endsWith('#')) t = t.slice(0, -1)
  t = t.trim()
  return t ? [t] : []
})
const firstQuestionLine = (s: string) => s.split('\n').map(l => l.replace(/^[#>*\-\s]+/, '').trim()).find(l => l.endsWith('?') && l.length > 10)

export function fallbackGoals(notes: VaultNote[], knownPapers: string[]): Goals {
  const q = notes.find(isQuestionNote) ?? notes[0]
  const body = q.content.replace(/^#.*$/gm, '').replace(/\s+/g, ' ').trim()
  const question = firstQuestionLine(q.content) ?? (body.slice(0, 300) || q.title)
  const topic = q.title || question.slice(0, 80)
  const seen = new Set<string>()
  const subtopics: Goals['subtopics'] = []
  for (const n of notes) for (const h of headingsOf(n.content)) {
    const key = h.toLowerCase()
    if (seen.has(key) || key === topic.toLowerCase() || h.length < 4 || /^(notes?|summary|references|todo|question)$/i.test(h)) continue
    seen.add(key); subtopics.push({ name: h.slice(0, 60), query: h.slice(0, 120) })
  }
  return {
    topic, question, goals: [question], subtopics: subtopics.slice(0, 8), keywords: tfidfKeywords(notes, 12),
    knownPapers, evidence: [], model: null,
  }
}

// ---------- planner call ----------
const PlannerOut = z.object({
  topic: z.string().min(2),
  question: z.string().min(5),
  goals: z.array(z.string().min(3)).min(1),
  subtopics: z.array(z.object({ name: z.string().min(2), query: z.string().min(2) })).min(1),
  keywords: z.array(z.string().min(2)).min(1),
  evidence: z.array(z.object({ goal: z.number().int().optional(), notePath: z.string(), quote: z.string() })).default([]),
})

const str = { type: 'string' }
const PLANNER_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['topic', 'question', 'goals', 'subtopics', 'keywords', 'evidence'],
  properties: {
    topic: str, question: str,
    goals: { type: 'array', items: str },
    subtopics: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['name', 'query'], properties: { name: str, query: str } } },
    keywords: { type: 'array', items: str },
    evidence: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['goal', 'notePath', 'quote'], properties: { goal: { type: 'integer' }, notePath: str, quote: str } } },
  },
}

const SYSTEM = 'You read a researcher\'s note vault (one research topic) and plan a literature search. Reply with JSON only. ' + UNTRUSTED_NOTICE
const NOTE_BUDGET = 24000

export function buildGoalsPrompt(notes: VaultNote[], knownPapers: string[]): string {
  const per = Math.max(800, Math.floor(NOTE_BUDGET / notes.length))
  const ordered = [...notes].sort((a, b) => Number(isQuestionNote(b)) - Number(isQuestionNote(a)))
  const body = ordered.map(n => untrustedBlock('note', `${n.title}\n${n.content.slice(0, per)}`, { path: n.path })).join('\n\n')
  return `${body}

KNOWN PAPER IDS FOUND IN THE NOTES: ${knownPapers.join(', ') || '(none)'}

Return JSON {"topic","question","goals","subtopics","keywords","evidence"}:
- topic: the research topic of the whole vault, 3-10 words.
- question: the main research question, one sentence ending with "?".
- goals: 3-5 concrete things the researcher wants to find out or build, each one sentence.
- subtopics: 4-8 objects {"name": 2-5 words, "query": an OpenAlex search query of 3-8 plain words, no boolean operators}.
- keywords: 8-15 specific search terms (genes, methods, diseases, cell types), not generic words.
- evidence: for EACH goal (goal = 0-based index) one quote COPIED CHARACTER FOR CHARACTER from a note (8-30 words) that shows the goal comes from the notes, with that note's path. Do not paraphrase.`
}

/** Keeps only evidence quotes that really occur in the named note (normalized substring, else ≥95% fuzzy); returns the verbatim text. */
export function verifyEvidence(evidence: { notePath: string; quote: string }[], notes: VaultNote[]): Goals['evidence'] {
  const out: Goals['evidence'] = []
  for (const e of evidence) {
    const candidates = [notes.find(n => n.path === e.notePath), ...notes.filter(n => n.path !== e.notePath)].filter(Boolean) as VaultNote[]
    for (const n of candidates) {
      const m = verifyQuote(e.quote, n.content, 0.95)
      if (m.verified) { out.push({ notePath: n.path, quote: m.text }); break }
    }
  }
  return out
}

const clean = (s: string, n: number) => s.replace(/\s+/g, ' ').trim().slice(0, n)
const uniq = (xs: string[]) => [...new Map(xs.map(x => [x.toLowerCase(), x])).values()]

export async function deriveGoals(notes: VaultNote[], opts: { timeoutMs?: number; notesAsKnown?: boolean } = {}): Promise<Goals> {
  const knownPapers = extractKnownPapers(notes, opts.notesAsKnown ?? true)
  const fb = fallbackGoals(notes, knownPapers)
  if (!hasKey()) return fb
  try {
    const res = await chatJson({
      model: env.models.planner, system: SYSTEM, user: buildGoalsPrompt(notes, knownPapers),
      temperature: 0, maxTokens: 1600, schema: { name: 'library_goals', schema: PLANNER_SCHEMA }, timeoutMs: opts.timeoutMs ?? 45000,
    })
    const p = PlannerOut.safeParse(res?.data)
    if (!p.success) return fb
    const d = p.data
    const goals: Goals = {
      topic: clean(d.topic, 120),
      question: clean(d.question, 400),
      goals: uniq(d.goals.map(g => clean(g, 300))).slice(0, 5),
      subtopics: d.subtopics.slice(0, 8).map(s => ({ name: clean(s.name, 60), query: clean(s.query.replace(/\b(AND|OR|NOT)\b|[()"]/g, ' '), 120) })).filter(s => s.query.length > 2),
      keywords: uniq(d.keywords.map(k => clean(k, 60))).slice(0, 15),
      knownPapers,
      evidence: verifyEvidence(d.evidence, notes),
      model: env.models.planner,
    }
    if (!goals.subtopics.length) goals.subtopics = fb.subtopics
    return Goals.parse(goals)
  } catch {
    return fb
  }
}
