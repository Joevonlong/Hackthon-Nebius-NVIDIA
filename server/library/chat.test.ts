import { describe, expect, it } from 'vitest'
import { ChatResponse, DEFAULT_WEIGHTS, type LibPaper } from '@shared/library'
import { buildChatContext, CLINICAL_KINDS, completeKindReply, detectKindQuestion, kindAnswer, kindListText, normalizeCitations, percentify, resolveCited, runChat, sanitizeProposal, weightPct } from './chat'
import { labelRecord } from './labels'
import { scoreLibrary } from './score'
import { mkRecord, testGoals } from './test-records'

process.env.TRACE_CONSOLE = '0'
process.env.LOG_DIR = process.env.LOG_DIR || './logs/test'
const current = { weights: { ...DEFAULT_WEIGHTS }, topPercent: 25, threshold: 0.5, filters: {} }

function library(n = 80): LibPaper[] {
  const goals = testGoals()
  const items = Array.from({ length: n }, (_, i) => {
    const rec = mkRecord(`W${i + 1}`, { paper: { title: `Melanoma single-cell paper number ${i + 1}`, citedByCount: i * 3, year: 2010 + (i % 16), type: i % 7 === 0 ? 'review' : 'article' } })
    return { rec, labels: labelRecord(rec, goals), rel: { cos: 0.3 + (i % 10) / 20, best: 'q', bestKind: 'question' as const, method: 'embedding' as const }, llm: null }
  })
  return scoreLibrary(items, goals, { weights: DEFAULT_WEIGHTS, threshold: 0.3, topPercent: 25, now: new Date('2026-10-18') })
}

describe('chat proposal validation', () => {
  it('clamps weights to 0..1, converts percentages, keeps LLM read lowest unless asked', () => {
    const p = sanitizeProposal({ weights: { venue: 40, citations: 5, llm: 30 }, rationale: 'Venue matters more.' }, current, 'venue matters more than citations')
    expect(p?.weights?.venue).toBe(0.4)
    expect(p?.weights?.citations).toBe(0.05)
    expect(p!.weights!.llm!).toBeLessThan(0.05)
    expect(p!.rationale).toMatch(/lowest weight/)
  })
  it('lets the LLM weight rise when the user explicitly asks, and says so', () => {
    const p = sanitizeProposal({ weights: { llm: 0.5 }, rationale: 'More LLM.' }, current, 'trust the LLM read more')
    expect(p?.weights?.llm).toBe(0.5)
    expect(p!.rationale).toMatch(/explicitly/)
  })
  it('filters keep only contract kinds; unchanged or empty proposals become null', () => {
    const p = sanitizeProposal({ filters: { kinds: ['journal-article', 'review', 'bogus'], minYear: 2020 }, rationale: 'r' }, current, 'ignore preprints')
    expect(p?.filters).toEqual({ kinds: ['journal-article', 'review'], minYear: 2020 })
    expect(sanitizeProposal({ weights: { ...DEFAULT_WEIGHTS }, rationale: 'same' }, current, 'x')).toBeNull()
    expect(sanitizeProposal(null, current, 'x')).toBeNull()
    expect(sanitizeProposal({ topPercent: 10, threshold: 0.6 }, current, 'be stricter')).toMatchObject({ topPercent: 10, threshold: 0.6 })
  })
})

describe('chat context + citations', () => {
  it('caps the context and lists the top 60 + aggregates', () => {
    const ctx = buildChatContext(testGoals(), library(), current)
    expect(ctx.text).toContain('AGGREGATES (all 80 scored papers')
    expect(ctx.text).toContain('#60 ')
    expect(ctx.text).not.toMatch(/\n#61 /)
    expect(buildChatContext(testGoals(), library(), current, 9000).text.length).toBeLessThan(12_000)
  })
  it('normalizes loose citations and resolves ranks', () => {
    expect(normalizeCitations('#9 "CD8+ T cells" (2020)\n- **#3** "Other paper"')).toBe('[#9 CD8+ T cells] (2020)\n- [#3 Other paper]')
    expect(normalizeCitations('#9 CD8+ T cell states in cancer (2020)\n#19 Dynamics of T cells (2023)')).toBe('- [#9 CD8+ T cell states in cancer] (2020)\n- [#19 Dynamics of T cells] (2023)')
    expect(normalizeCitations('- #3 has higher relevance (0.94 vs 0.67)')).toBe('- #3 has higher relevance (0.94 vs 0.67)')
    const ranked = library(10)
    const cited = resolveCited('see [#2 Foo] and [#99 nope]', [1, { rank: '2' }], ranked)
    expect(cited.map(c => c.rank)).toEqual([1, 2])
    expect(cited[0].paperId).toBe(ranked[0].paper.id)
  })
})

describe('runChat', () => {
  const lib = { goals: testGoals(), papers: library(20) }
  const req = { messages: [{ role: 'user' as const, content: 'Prioritize venue over citations' }], current }
  it('one retry on invalid JSON, then a validated ChatResponse', async () => {
    let n = 0
    const call = async () => (++n === 1 ? { data: { nope: 1 }, raw: '{}', model: 'm' } : { data: { reply: 'Top is [#1 Melanoma].', cited: [1], proposal: { weights: { venue: 0.3, citations: 0.1 }, rationale: 'Venue first.' } }, raw: '', model: 'm' })
    const res = await runChat('lib_test', lib, req, { call })
    expect(n).toBe(2)
    expect(ChatResponse.safeParse(res).success).toBe(true)
    // citations 0.1 would tie the LLM read (0.1), so the LLM weight is pushed below it
    expect(res.proposal?.weights).toEqual({ venue: 0.3, citations: 0.1, llm: 0.08 })
    expect(res.cited[0].rank).toBe(1)
  })
  it('graceful text when the model fails twice', async () => {
    const res = await runChat('lib_test', lib, req, { call: async () => null })
    expect(res.model).toBeNull()
    expect(res.proposal).toBeNull()
    expect(res.reply).toMatch(/could not answer/)
    expect(res.reply).not.toMatch(/Bearer|sk-|key=/)
  })
})

describe('Q-3 intents + normalized weights', () => {
  it('"recent clinical studies, ignore preprints" → minYear, clinical kinds, relevance up, even without a model proposal', () => {
    const p = sanitizeProposal(null, current, 'Prioritize recent clinical studies and ignore preprints', 2026)
    expect(p?.filters?.minYear).toBe(2023)
    expect(p?.filters?.kinds).toEqual(CLINICAL_KINDS)
    expect(p!.weights!.relevance!).toBeGreaterThan(current.weights.relevance)
    expect(p!.rationale).toMatch(/no study-design filter/)
  })
  it('"last 5 years" overrides the model minYear; "no preprints" strips preprint from the model kinds', () => {
    const p = sanitizeProposal({ filters: { minYear: 2010, kinds: ['journal-article', 'preprint'] }, rationale: 'r' }, current, 'only papers from the last 5 years, no preprints', 2026)
    expect(p?.filters).toEqual({ kinds: ['journal-article'], minYear: 2021 })
  })
  it('drops filter fields that do not change and an open-ended maxYear', () => {
    const cur = { ...current, filters: { kinds: [...CLINICAL_KINDS], minYear: 2023 } }
    const p = sanitizeProposal({ weights: { venue: 0.3 }, filters: { kinds: [...CLINICAL_KINDS], minYear: 2023, maxYear: 2026 }, rationale: 'r' }, cur, 'venue matters more', 2026)
    expect(p?.filters).toBeUndefined()
    expect(p?.weights?.venue).toBe(0.3)
  })
  it('questions do not create proposals', () => {
    expect(sanitizeProposal(null, current, 'Which papers are recent clinical trials?', 2026)).toBeNull()
  })
  it('rewrites raw weights in text into normalized % shares, keeps component values', () => {
    const next = { ...current.weights, relevance: 0.4 } // sum 1.1 → relevance 36%
    expect(weightPct(next, 'relevance')).toBe(36)
    expect(percentify('Raise relevance to 0.4 (from 0.3).', next, current.weights)).toBe('Raise relevance to 36% (from 30%).')
    expect(percentify('relevance weight 40%', next, current.weights)).toBe('relevance weight 36%')
    expect(percentify('#3 has relevance 0.94 vs 0.67', next, current.weights)).toBe('#3 has relevance 0.94 vs 0.67')
  })
})

describe('double-escaped replies', () => {
  it('turns a literal \\n into a line break before citations', () => {
    expect(normalizeCitations('Top picks:\\n#14 "Some paper" (2021)')).toBe('Top picks:\n[#14 Some paper] (2021)')
  })
})

describe('Q2-10 kind questions are answered completely from labels', () => {
  const papers = library(80)
  const rankedOf = (ps: LibPaper[]) => buildChatContext(testGoals(), ps, current).ranked
  const passingReviews = rankedOf(papers).filter(p => p.passed && !p.excluded && p.labels.kind === 'review')
  it('detects kind questions, not change requests', () => {
    expect(detectKindQuestion('Which papers are reviews?')?.label).toBe('reviews')
    expect(detectKindQuestion('Any preprints?')?.label).toBe('preprints')
    expect(detectKindQuestion('which ones are meta-analyses')?.label).toBe('meta-analyses')
    expect(detectKindQuestion('List the clinical trials')?.label).toBe('clinical trials')
    expect(detectKindQuestion('ignore preprints')).toBeNull()
    expect(detectKindQuestion('prioritize reviews')).toBeNull()
    expect(detectKindQuestion('Why is #3 above #4?')).toBeNull()
  })
  it('the list holds every passing review and respects the current filters', () => {
    expect(passingReviews.length).toBeGreaterThanOrEqual(3)
    const ranked = rankedOf(papers)
    const a = kindAnswer('Which papers are reviews?', ranked, {})!
    expect(a.papers.map(p => p.rank)).toEqual(passingReviews.map(p => p.rank))
    const minYear = Math.max(...passingReviews.map(p => p.paper.year!))
    const f = kindAnswer('Which papers are reviews?', ranked, { minYear })!
    expect(f.papers.every(p => p.paper.year! >= minYear)).toBe(true)
    expect(f.papers.length).toBeLessThan(a.papers.length)
    expect(kindListText(f)).toMatch(/with the current filters/)
    const whole = kindAnswer('Which reviews are in the library?', ranked, {})!
    expect(whole.papers.length).toBeGreaterThan(a.papers.length)
  })
  it('the model gets the full list, and a reply that lists only 2 is completed', async () => {
    let system = ''
    const two = passingReviews.slice(0, 2)
    const call = async (o: { system: string }) => {
      system = o.system
      return { data: { reply: `Two reviews: ${two.map(p => `[#${p.rank} ${p.paper.title}]`).join(', ')}.`, cited: two.map(p => p.rank), proposal: null }, raw: '', model: 'm' }
    }
    const res = await runChat('lib_test', { goals: testGoals(), papers }, { messages: [{ role: 'user', content: 'Which papers are reviews?' }], current }, { call: call as never })
    expect(system).toMatch(/ANSWER LIST/)
    for (const p of passingReviews) expect(system).toContain(`[#${p.rank} `)
    expect(res.reply).toMatch(new RegExp(`All ${passingReviews.length} passing reviews`))
    expect(res.cited.map(c => c.rank).sort((x, y) => x - y)).toEqual(passingReviews.map(p => p.rank).sort((x, y) => x - y))
    expect(ChatResponse.safeParse(res).success).toBe(true)
  })
  it('a complete reply is left as is', () => {
    const a = kindAnswer('Which papers are reviews?', rankedOf(papers), {})!
    const full = a.papers.map(p => `[#${p.rank} x]`).join(' ')
    expect(completeKindReply(full, a)).toBe(full)
  })
  it('without a model the deterministic list is the answer', async () => {
    const res = await runChat('lib_test', { goals: testGoals(), papers }, { messages: [{ role: 'user', content: 'Which papers are reviews?' }], current }, { call: async () => null })
    expect(res.model).toBeNull()
    expect(res.reply).toMatch(/^All \d+ passing reviews/)
    expect(res.cited).toHaveLength(passingReviews.length)
  })
})
