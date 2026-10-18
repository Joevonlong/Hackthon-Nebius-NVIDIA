// Dev mock of the Library stream (lane L3). Dev builds only, with ?mock=1 (never a fallback, R-3.1).
// Papers are real OpenAlex records from docs/data/melanoma-multi-seed-citers.json (494 papers citing ≥2 seeds) and
// docs/data/melanoma-lanes-snapshot.json. Citation counts, venues, authors and seed links are real; every value the
// fixture does not hold (venue/author h-index, embeddings, LLM grades) is replaced by a rule computed within this
// pile and labeled "mock" in its `how` and evidence lines. Goals quote the user's own notes verbatim.
import citers from '../../../docs/data/melanoma-multi-seed-citers.json'
import snapshot from '../../../docs/data/melanoma-lanes-snapshot.json'
import type { Paper, Seed } from '@shared/contracts'
import type { Goals, Hit, LibPaper, LibraryEvent, LibraryRequest, ScoreComponent, SourceName, VaultNote, Labels } from '@shared/library'
import { combine, rescore } from './score'

interface Citer { id: string; title: string; year: number; cites: number; seeds: string[]; doi: string | null; type: string; venue: string | null; author: string | null }
interface SnapItem { id: string; t: string; y: number; dt: string; c: number; k: string; v: string; a: string; d: string; out: number[]; inn: number[]; routes: string[]; pmr: number | null; retr: boolean; oa: boolean | null }
const SNAP = snapshot as unknown as { top: Record<string, SnapItem[]> }

export const MOCK_SEEDS = [
  { id: 'W2332292689', doi: '10.1126/science.aad0501', short: 'Tirosh 2016', author: 'Itay Tirosh', t: 'Dissecting the multicellular ecosystem of metastatic melanoma by single-cell RNA-seq', v: 'Science', y: 2016, c: 4914 },
  { id: 'W2899145148', doi: '10.1016/j.cell.2018.10.038', short: 'Sade-Feldman 2018', author: 'Moshe Sade-Feldman', t: 'Defining T Cell States Associated with Response to Checkpoint Immunotherapy in Melanoma', v: 'Cell', y: 2018, c: 2040 },
  { id: 'W3184584468', doi: '10.1038/s41586-021-03704-y', short: 'Oliveira 2021', author: 'Giacomo Oliveira', t: 'Phenotype, specificity and avidity of antitumour CD8+ T cells in melanoma', v: 'Nature', y: 2021, c: 561 },
  { id: 'W4229030906', doi: '10.1038/s41586-022-04682-5', short: 'Oliveira 2022', author: 'Giacomo Oliveira', t: 'Landscape of helper and regulatory antitumour CD4+ T cells in melanoma', v: 'Nature', y: 2022, c: 199 },
  { id: 'W3165815938', doi: '10.1158/1078-0432.ccr-21-1694', short: 'Smalley 2021', author: 'Inna Smalley', t: 'Single-Cell Characterization of the Immune Microenvironment of Melanoma Brain and Leptomeningeal Metastases', v: 'Clinical Cancer Research', y: 2021, c: 161 },
]

/** Dev stand-in for POST /api/seeds/resolve: resolves only the five fixture seeds (by DOI or OpenAlex id). */
export function mockResolveSeeds(inputs: string[]): { seeds: Seed[]; errors: { input: string; message: string }[] } {
  const seeds: Seed[] = [], errors: { input: string; message: string }[] = []
  inputs.forEach(input => {
    const k = input.trim().toLowerCase().replace(/^https?:\/\/(dx\.)?doi\.org\//, '')
    const s = MOCK_SEEDS.find(x => x.doi === k || x.id.toLowerCase() === k)
    if (!s) { errors.push({ input, message: 'not in the dev fixture (mock resolves the five demo seeds only)' }); return }
    seeds.push({
      id: s.id, doi: s.doi, pmid: null, pmcid: null, title: s.t, authors: [s.author], year: s.y, publicationDate: null, venue: s.v, type: 'article',
      citedByCount: s.c, citationPct: null, isRetracted: false, isOa: null, oaUrl: null, abstract: null, abstractSource: null, referencedWorks: [],
      url: `https://openalex.org/${s.id}`, n: seeds.length + 1, label: 'S' + (seeds.length + 1), shortName: s.short, input,
    })
  })
  return { seeds, errors }
}

const SUBTOPICS = [
  { name: 'T cell states under checkpoint blockade', query: 'T cell states checkpoint immunotherapy melanoma', re: /t[- ]?cell|cd8|cd4|exhaust|checkpoint|pd-1|blockade/i },
  { name: 'Single-cell profiling of the tumor microenvironment', query: 'single-cell RNA-seq tumor microenvironment melanoma', re: /single[- ]cell|scrna|rna[- ]seq|transcriptom|microenvironment|atlas/i },
  { name: 'Tumor-reactive and neoantigen-specific lymphocytes', query: 'tumor-reactive neoantigen-specific T cells', re: /tumou?r[- ]reactive|neoantigen|antigen|tcr|clon|infiltrating/i },
  { name: 'Response and resistance to immunotherapy', query: 'response resistance immune checkpoint inhibitors', re: /respon|resist|immunotherap|survival|outcome/i },
  { name: 'Metastatic and brain melanoma', query: 'metastatic melanoma brain leptomeningeal', re: /metasta|brain|leptomening|acral|uveal/i },
  { name: 'Spatial and multi-omic methods', query: 'spatial transcriptomics multi-omics immune', re: /spatial|multi[- ]?omic|imaging|proteom|cytometry/i },
]
const KEYWORDS: { k: string; re: RegExp }[] = [
  ['melanoma', /melanoma/i], ['T cell', /t[- ]?cells?\b/i], ['single-cell', /single[- ]cell/i], ['immunotherapy', /immunotherap/i],
  ['checkpoint', /checkpoint/i], ['PD-1', /pd-?1|pd-l1/i], ['CD8', /cd8/i], ['tumor microenvironment', /microenvironment/i],
  ['exhaustion', /exhaust|dysfunct/i], ['neoantigen', /neoantigen|antigen/i], ['RNA-seq', /rna[- ]seq|transcriptom/i], ['tumor-infiltrating', /infiltrat/i],
].map(([k, re]) => ({ k: k as string, re: re as RegExp }))

const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) } return (h >>> 0) }
const fmt = (n: number) => n.toLocaleString('en')
const ord = (n: number) => { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]) }
const oaApi = (id: string) => ({ name: 'OpenAlex', url: `https://api.openalex.org/works/${id}` })

interface Raw { id: string; title: string; year: number | null; date: string | null; cites: number; doi: string | null; type: string; venue: string | null; author: string | null; cites_seeds: number[]; cited_by_seeds: number[]; pmr: number | null; retracted: boolean; oa: boolean | null }

function pile(): Raw[] {
  const out = new Map<string, Raw>()
  for (const c of citers as unknown as Citer[]) {
    out.set(c.id, {
      id: c.id, title: c.title, year: c.year, date: null, cites: c.cites, doi: c.doi ? c.doi.replace(/^https?:\/\/doi\.org\//, '').toLowerCase() : null,
      type: c.type, venue: c.venue, author: c.author, cites_seeds: c.seeds.map(s => Number(s.slice(1))), cited_by_seeds: [], pmr: null, retracted: false, oa: null,
    })
  }
  for (const lane of Object.values(SNAP.top)) for (const it of lane) {
    const prev = out.get(it.id)
    const r: Raw = {
      id: it.id, title: it.t, year: it.y, date: it.dt.length === 10 ? it.dt : null, cites: it.c, doi: it.d ? it.d.toLowerCase() : null, type: it.k,
      venue: it.v || null, author: it.a || null, cites_seeds: it.out, cited_by_seeds: it.inn, pmr: it.pmr, retracted: it.retr, oa: it.oa,
    }
    out.set(it.id, prev ? { ...prev, ...r, cites_seeds: [...new Set([...prev.cites_seeds, ...r.cites_seeds])] } : r)
  }
  return [...out.values()]
}

/** Notes → goals with verbatim evidence quotes (mock planner: fixed melanoma goals, quotes taken from the notes). */
function mockGoals(notes: VaultNote[], known: string[]): Goals {
  const lines: { notePath: string; quote: string }[] = []
  for (const n of notes) {
    const body = n.content.replace(/^---\n[\s\S]*?\n---\n?/, '')
    for (const l of body.split('\n')) {
      const t = l.replace(/^[-*>\s]+|\[ \]\s*/g, '').trim()
      if (t.length >= 24 && !t.startsWith('#') && !/^\w+:/.test(t)) lines.push({ notePath: n.path, quote: t.slice(0, 160) })
    }
  }
  const question = notes.find(n => /question/i.test(n.path))
  const qLine = lines.find(l => l.notePath === question?.path && /\?$/.test(l.quote)) || lines[0]
  const goals = [
    'Map which T cell states predict response to checkpoint blockade in melanoma',
    'Find single-cell methods that profile melanoma immune cells end to end',
    'Collect evidence on tumor-reactive CD8+ and CD4+ T cells',
    'Cover metastatic sites (brain, leptomeningeal) and their immune context',
  ]
  const evidence = goals.map((_, i) => lines.length ? lines[(i === 0 && qLine ? lines.indexOf(qLine) : i) % lines.length] : null).filter((x): x is { notePath: string; quote: string } => !!x)
  return {
    topic: 'Single-cell immunology of melanoma',
    question: qLine?.quote || 'Which single-cell methods help study melanoma immune cells?',
    goals, subtopics: SUBTOPICS.map(s => ({ name: s.name, query: s.query })), keywords: KEYWORDS.map(k => k.k), knownPapers: known, evidence, model: null,
  }
}

const ID_RE = /\b(W\d{6,})\b|\b(10\.\d{4,9}\/[^\s"'<>\])]+)|\bPMID:?\s*(\d{6,9})\b|\barXiv:\s*(\d{4}\.\d{4,5})/gi
/** Identifier regex over every note (same idea as the server's first step). */
export function extractKnown(notes: VaultNote[]): string[] {
  const s = new Set<string>()
  for (const n of notes) for (const m of n.content.matchAll(ID_RE)) s.add((m[1] || m[2] || m[3] || m[4]).replace(/[.,;]$/, '').toLowerCase())
  return [...s]
}

function kindOf(r: Raw): Labels['kind'] {
  if (r.type === 'review') return 'review'
  if (r.type === 'preprint') return 'preprint'
  if (r.type === 'article') return 'journal-article'
  if (r.type === 'book-chapter') return 'book-chapter'
  if (r.type === 'editorial' || r.type === 'letter') return 'editorial'
  return 'other'
}
const recency = (y: number | null): Labels['recency'] => { const a = 2026.8 - (y ?? 1990); return a <= 1.5 ? 'fresh' : a <= 5 ? 'recent' : a <= 15 ? 'established' : 'classic' }
function field(t: string): [string | null, string | null] {
  if (/melanoma|cancer|tumou?r|carcinoma|oncolog/i.test(t)) return ['Medicine', 'Oncology']
  if (/immun|t[- ]?cell|lymph/i.test(t)) return ['Immunology and Microbiology', 'Immunology']
  if (/sequenc|align|format|genom|rna/i.test(t)) return ['Biochemistry, Genetics and Molecular Biology', 'Molecular Biology']
  return [null, null]
}

/** Percentile (0..1) of v within sorted ascending xs. */
const pctOf = (xs: number[], v: number) => { let lo = 0; while (lo < xs.length && xs[lo] < v) lo++; return xs.length > 1 ? lo / (xs.length - 1) : 1 }

export function buildMockLibrary(req: LibraryRequest, libraryId: string): { goals: Goals; papers: LibPaper[]; calls: Extract<LibraryEvent, { type: 'source' }>[] } {
  const known = extractKnown(req.notes)
  const goals = mockGoals(req.notes, known)
  const raws = pile().slice(0, req.maxCandidates)
  const N = raws.length
  const seedKnown = MOCK_SEEDS.map(s => known.includes(s.id.toLowerCase()) || known.includes(s.doi))
  const anyKnown = seedKnown.some(Boolean)
  const useSrc = new Set(req.sources)

  // Library-wide distributions (percentiles are "of N in this library").
  const relRaw = raws.map(r => KEYWORDS.filter(k => k.re.test(r.title)).length + 0.5 * SUBTOPICS.filter(s => s.re.test(r.title)).length)
  const relMax = Math.max(1, ...relRaw)
  const logCites = raws.map(r => Math.log(r.cites + 1)).sort((a, b) => a - b)
  const venueStats = new Map<string, { n: number; cites: number }>()
  const authorStats = new Map<string, { n: number; cites: number }>()
  for (const r of raws) {
    if (r.venue) { const v = venueStats.get(r.venue) || { n: 0, cites: 0 }; v.n++; v.cites += r.cites; venueStats.set(r.venue, v) }
    if (r.author) { const a = authorStats.get(r.author) || { n: 0, cites: 0 }; a.n++; a.cites += r.cites; authorStats.set(r.author, a) }
  }
  const venueMeans = [...venueStats.values()].map(v => Math.log(v.cites / v.n + 1)).sort((a, b) => a - b)
  const authorTotals = [...authorStats.values()].map(a => Math.log(a.cites + 1)).sort((a, b) => a - b)

  const papers: LibPaper[] = raws.map((r, i) => {
    const h = hash(r.id)
    const matchedK = KEYWORDS.filter(k => k.re.test(r.title)).map(k => k.k)
    const matchedS = SUBTOPICS.filter(s => s.re.test(r.title))
    const [fld, sub] = field(r.title)
    const sources: SourceName[] = ['openalex']
    if (useSrc.has('pubmed') && (r.pmr != null || h % 3 === 0)) sources.push('pubmed')
    if (useSrc.has('tavily') && h % 7 === 0) sources.push('tavily')
    const hits: Hit[] = sources.map(s => s === 'openalex'
      ? r.cites_seeds.length
        ? { source: s, via: 'cited_by' as const, query: `cites:${MOCK_SEEDS[r.cites_seeds[0] - 1]?.id}`, rank: (h % 200) + 1, url: `https://api.openalex.org/works?filter=cites:${MOCK_SEEDS[r.cites_seeds[0] - 1]?.id}` }
        : { source: s, via: 'subtopic' as const, query: (matchedS[0] || SUBTOPICS[h % SUBTOPICS.length]).query, rank: (h % 50) + 1, url: `https://api.openalex.org/works?search=${encodeURIComponent((matchedS[0] || SUBTOPICS[0]).query)}` }
      : s === 'pubmed'
        ? { source: s, via: (r.pmr != null ? 'similar' : 'subtopic') as Hit['via'], query: r.pmr != null ? 'elink pubmed_pubmed' : (matchedS[0] || SUBTOPICS[0]).query, rank: r.pmr ?? (h % 50) + 1, url: 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed' }
        : { source: s, via: 'web' as const, query: (matchedS[0] || SUBTOPICS[0]).query, rank: (h % 10) + 1, url: r.doi ? `https://doi.org/${r.doi}` : `https://openalex.org/${r.id}` })

    // relevance
    const relV = relRaw[i] / relMax
    const best = matchedS[0]
    const relevance: ScoreComponent = {
      key: 'relevance', label: 'Relevance to goals', weight: 0, value: relV, contribution: 0,
      how: 'Mock: title overlap with the goal keywords and subtopics (stand-in for Qwen3-Embedding cosine), rescaled to 0..1 within this library.',
      evidence: [
        { text: matchedK.length ? `title matches ${matchedK.length} of ${KEYWORDS.length} goal keywords: ${matchedK.join(', ')}` : `title matches none of the ${KEYWORDS.length} goal keywords`, source: { name: 'OpenAlex work', url: `https://openalex.org/${r.id}` } },
        { text: best ? `best match: subtopic '${best.name}' (${matchedS.length} subtopic${matchedS.length === 1 ? '' : 's'} matched)` : 'no subtopic matched' },
        { text: `raw ${relRaw[i].toFixed(1)} ÷ library max ${relMax.toFixed(1)} = ${relV.toFixed(2)} (${ord(Math.round(pctOf([...relRaw].sort((a, b) => a - b), relRaw[i]) * 100))} pct of ${N})` },
      ],
    }
    // graph
    const rels: LibPaper['relations'] = []
    for (const n of r.cites_seeds) { const s = MOCK_SEEDS[n - 1]; if (s) rels.push({ type: 'cites', paperId: s.id, note: s.short }) }
    for (const n of r.cited_by_seeds) { const s = MOCK_SEEDS[n - 1]; if (s) rels.push({ type: 'cited_by', paperId: s.id, note: s.short }) }
    if (r.pmr != null) rels.push({ type: 'similar', paperId: MOCK_SEEDS[0].id, note: `PubMed similar rank ${r.pmr}` })
    const knownRels = rels.filter(x => { const k = MOCK_SEEDS.findIndex(s => s.id === x.paperId); return k >= 0 && seedKnown[k] })
    const graph: ScoreComponent = {
      key: 'graph', label: 'Links to vault papers', weight: 0, value: anyKnown ? (knownRels.length >= 2 ? 1 : knownRels.length === 1 ? 0.5 : 0) : null, contribution: 0,
      how: 'Links to the vault\'s known papers (cites / cited by / PubMed similar): 0 links = 0, 1 = 0.5, ≥2 = 1.',
      evidence: anyKnown
        ? knownRels.length
          ? knownRels.map(x => ({ text: `${x.type === 'cites' ? 'cites' : x.type === 'cited_by' ? 'cited by' : 'similar to'} ${x.note} (${x.type === 'similar' ? 'PubMed elink' : 'OpenAlex referenced_works'})`, source: oaApi(x.type === 'cites' ? r.id : x.paperId) }))
          : [{ text: `no citation link to the ${known.length} known paper id${known.length === 1 ? '' : 's'} in the vault` }]
        : [{ text: 'not assessed: the vault holds no paper identifiers (DOI, PMID, OpenAlex id) to link to' }],
    }
    // citations
    const young = (r.year ?? 0) >= 2025
    const cpct = pctOf(logCites, Math.log(r.cites + 1))
    const citations: ScoreComponent = {
      key: 'citations', label: 'Citation impact', weight: 0, value: young ? 0.5 : cpct, contribution: 0,
      how: young ? 'Paper younger than 2 years: neutral 0.5 (fwci not in the fixture).' : 'Mock: log(cited_by + 1) percentile within this library (citation_normalized_percentile not in the fixture).',
      evidence: [
        { text: `cited_by ${fmt(r.cites)} (OpenAlex cited_by_count)`, source: oaApi(r.id) },
        { text: young ? `published ${r.year}: too young for a citation percentile, neutral 0.5` : `${ord(Math.round(cpct * 100))} percentile of ${N} in this library (log scale)` },
      ],
    }
    // venue
    const vs = r.venue ? venueStats.get(r.venue)! : null
    const vpct = vs ? pctOf(venueMeans, Math.log(vs.cites / vs.n + 1)) : 0
    const isJournal = r.type !== 'preprint'
    const venue: ScoreComponent = {
      key: 'venue', label: 'Venue standing', weight: 0, value: vs ? Math.min(1, 0.8 * vpct + 0.2 * (isJournal ? 1 : 0)) : null, contribution: 0,
      how: 'Mock: 0.8 × percentile of the venue\'s mean citations within this library + 0.2 × journal (venue h-index not fetched in the fixture).',
      evidence: vs
        ? [{ text: `${r.venue} · ${vs.n} paper${vs.n === 1 ? '' : 's'} in this library · mean cited_by ${fmt(Math.round(vs.cites / vs.n))}`, source: oaApi(r.id) },
           { text: `${ord(Math.round(vpct * 100))} percentile of ${venueStats.size} venues in this library · ${isJournal ? 'journal' : 'preprint server'}` }]
        : [{ text: 'not assessed: no venue on the OpenAlex record' }],
    }
    // authors
    const as = r.author ? authorStats.get(r.author)! : null
    const apct = as ? pctOf(authorTotals, Math.log(as.cites + 1)) : 0
    const authors: ScoreComponent = {
      key: 'authors', label: 'Author track record', weight: 0, value: as ? apct : null, contribution: 0,
      how: 'Mock: percentile of the first author\'s summed citations within this library (author h-index and ROR not fetched in the fixture).',
      evidence: as
        ? [{ text: `first author ${r.author} · ${as.n} paper${as.n === 1 ? '' : 's'} in this library · ${fmt(as.cites)} citations among them`, source: oaApi(r.id) },
           { text: `${ord(Math.round(apct * 100))} percentile of ${authorStats.size} first authors in this library` }]
        : [{ text: 'not assessed: no author on the record' }],
    }
    const llm: ScoreComponent = { key: 'llm', label: 'LLM read', weight: 0, value: null, contribution: 0, how: '', evidence: [] }
    const year = r.year
    const paper: Paper = {
      id: r.id, doi: r.doi, pmid: null, pmcid: null, title: r.title, authors: r.author ? [r.author] : [], year, publicationDate: r.date, venue: r.venue,
      type: r.type, citedByCount: r.cites, citationPct: null, isRetracted: r.retracted, isOa: r.oa, oaUrl: null, abstract: null, abstractSource: null,
      referencedWorks: r.cites_seeds.map(n => MOCK_SEEDS[n - 1]?.id).filter(Boolean) as string[], url: `https://openalex.org/${r.id}`,
    }
    const tags: string[] = []
    if (/software|tool|pipeline|package|algorithm|format|framework/i.test(r.title)) tags.push('method/tool')
    if (r.retracted) tags.push('retracted')
    return {
      paper,
      authors: r.author ? [{ id: null, name: r.author, position: 'first' as const, hIndex: null, worksCount: null, citedByCount: null, institutions: [] }] : [],
      venue: { id: null, name: r.venue, type: r.venue ? (isJournal ? 'journal' : 'repository') : null, publisher: null, hIndex: null, meanCitedness2y: null, isCore: null, isInDoaj: null, issn: null },
      labels: {
        kind: kindOf(r), studyDesign: [], peerReviewed: r.type === 'preprint' ? false : r.venue ? true : null,
        openAccess: r.oa == null ? null : r.oa ? 'open' : 'closed', field: fld, subfield: sub, topic: best?.name ?? null,
        keywords: matchedK, mesh: [], arxivCategories: [], language: 'en', recency: recency(year), retracted: r.retracted, hasAbstract: false,
        sources, subtopics: matchedS.map(s => s.name), tags,
      },
      hits, relations: rels, components: [relevance, graph, citations, venue, authors, llm], total: 0, passed: false,
      excluded: r.retracted ? 'retracted' : !r.title ? 'no title' : null, rank: 0, llmRead: null, file: `library/${libraryId}/papers/${r.id}.json`,
    }
  })

  // LLM read: only the best llmReadTopK by the other components (mock judge, labeled).
  const pre = papers.map(p => ({ p, t: combine(p.components, { ...req.weights, llm: 0 }).total })).filter(x => !x.p.excluded).sort((a, b) => b.t - a.t)
  const readIds = new Set(pre.slice(0, req.llmReadTopK).map(x => x.p.paper.id))
  for (const p of papers) {
    const c = p.components.find(x => x.key === 'llm')!
    if (readIds.has(p.paper.id)) {
      const rel = Math.round((p.components[0].value ?? 0) * 3), qual = Math.round(((p.components[2].value ?? 0) + (p.components[3].value ?? 0)) * 1.5)
      c.value = (rel + qual) / 6 * 0.6
      c.how = 'Mock judge (dev fixture, not model output): (relevance + quality) / 6 × 0.6 because no abstract quote could be verified.'
      c.evidence = [{ text: `mock-judge · read: title only (no abstract in the fixture) · relevance ${rel}/3 · quality ${qual}/3` }, { text: 'quote: none · unverified → × 0.6' }]
      p.llmRead = { model: 'mock-judge', read: 'abstract', relevance: rel, quality: qual, why: 'Mock grade from the title and the other components; not a model judgement.', quote: null, verified: false, concerns: ['mock fixture', 'no abstract'] }
    } else {
      c.how = `Not read: the LLM reads only the top ${req.llmReadTopK} papers by the other components; its weight is redistributed.`
      c.evidence = [{ text: `not assessed: outside the top ${req.llmReadTopK} pre-scored papers` }]
    }
  }
  const scored = rescore(papers, { weights: req.weights, topPercent: req.topPercent, threshold: req.threshold })

  const calls: Extract<LibraryEvent, { type: 'source' }>[] = []
  const by = (s: SourceName) => scored.filter(p => p.labels.sources.includes(s)).length
  if (useSrc.has('openalex')) {
    for (const s of SUBTOPICS) calls.push({ type: 'source', source: 'openalex', query: s.query, count: 50 + (hash(s.query) % 50), ms: 300 + (hash(s.name) % 900) })
    for (const s of MOCK_SEEDS) calls.push({ type: 'source', source: 'openalex', query: `cites:${s.id}`, count: Math.round(by('openalex') / 3) + (hash(s.id) % 40), ms: 400 + (hash(s.id) % 700) })
  }
  if (useSrc.has('pubmed')) for (const s of SUBTOPICS.slice(0, 4)) calls.push({ type: 'source', source: 'pubmed', query: s.query, count: Math.round(by('pubmed') / 4), ms: 600 + (hash(s.query) % 800) })
  if (useSrc.has('arxiv')) calls.push({ type: 'source', source: 'arxiv', query: 'all:"single-cell" AND all:melanoma', count: 0, ms: 820, error: 'mock: no arXiv records in the fixture' })
  if (useSrc.has('tavily')) calls.push({ type: 'source', source: 'tavily', query: SUBTOPICS[1].query, count: by('tavily'), ms: 1400 })
  if (useSrc.has('scholar')) calls.push({ type: 'source', source: 'scholar', query: goals.question, count: 0, ms: 0, error: 'skipped — no SERPAPI_KEY' })
  return { goals, papers: scored, calls }
}

/** Plays the mock as a timed LibraryEvent sequence. Returns stop() and all scored papers (for GET /api/library/:id). */
export function playLibraryMock(req: LibraryRequest, onEvent: (ev: LibraryEvent) => void): { stop(): void; libraryId: string; all: LibPaper[] } {
  const libraryId = 'mock-' + Date.now().toString(36)
  const { goals, papers, calls } = buildMockLibrary(req, libraryId)
  const timers: ReturnType<typeof setTimeout>[] = []
  let t = 0
  const at = (dt: number, ev: LibraryEvent) => { t += dt; timers.push(setTimeout(() => onEvent(ev), t)) }
  const top = papers.slice(0, req.topK)
  const passed = papers.filter(p => p.passed).length
  at(50, { type: 'library', libraryId, request: { topK: req.topK, threshold: req.threshold, sources: req.sources, weights: req.weights } })
  at(80, { type: 'stage', stage: 'goals', status: 'start' })
  at(600, { type: 'goals', goals })
  at(20, { type: 'stage', stage: 'goals', status: 'done', count: goals.goals.length, ms: 620 })
  at(60, { type: 'stage', stage: 'search', status: 'start' })
  for (const c of calls) at(110, c)
  const skippedScholar = calls.some(c => c.source === 'scholar' && c.error)
  at(60, { type: 'stage', stage: 'search', status: 'done', count: calls.reduce((s, c) => s + c.count, 0), ms: calls.length * 110, ...(skippedScholar ? { message: 'Google Scholar skipped — no SERPAPI_KEY' } : {}) })
  at(60, { type: 'stage', stage: 'expand', status: 'start' })
  at(300, { type: 'stage', stage: 'expand', status: 'done', count: papers.filter(p => p.relations.length).length, ms: 300 })
  at(40, { type: 'stage', stage: 'normalize', status: 'done', count: papers.length, ms: 90, message: 'deduped by DOI, PMID, OpenAlex id, title+year' })
  at(60, { type: 'stage', stage: 'enrich', status: 'start' })
  at(400, { type: 'stage', stage: 'enrich', status: 'done', count: papers.length, ms: 400 })
  at(40, { type: 'stage', stage: 'label', status: 'done', count: papers.length, ms: 40 })
  at(60, { type: 'stage', stage: 'score', status: 'done', count: papers.length, ms: 60 })
  at(60, { type: 'stage', stage: 'llm', status: 'start' })
  at(500, { type: 'stage', stage: 'llm', status: 'done', count: papers.filter(p => p.llmRead).length, ms: 500, message: 'mock judge (dev fixture)' })
  at(40, { type: 'stage', stage: 'select', status: 'done', count: top.length, ms: 10 })
  at(30, { type: 'papers', papers: top, total: papers.length, passed })
  at(60, { type: 'done', libraryId, total: papers.length, passed, ms: t, dir: `data/library/${libraryId}` })
  return { stop: () => timers.forEach(clearTimeout), libraryId, all: papers }
}
