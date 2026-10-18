// Owner: lane L2. Deterministic labels from an EnrichedRecord (spec §4). Pure functions.
import type { Goals, Labels, SourceName } from '@shared/library'
import type { EnrichedRecord } from './types'

type Kind = Labels['kind']

const has = (types: string[], re: RegExp) => types.some(t => re.test(t))

/** kind precedence: review family > editorial > book/chapter/dataset/thesis > conference > preprint > journal article > other. */
export function kindOf(rec: EnrichedRecord): Kind {
  const pt = rec.extra.pubmedTypes
  const type = (rec.paper.type || '').toLowerCase()
  const cr = (rec.extra.typeCrossref || '').toLowerCase()
  const title = rec.paper.title.toLowerCase()
  const venueType = (rec.venue.type || '').toLowerCase()
  if (has(pt, /^meta-analysis$/i) || /\bmeta-analy[sz]is\b/.test(title)) return 'meta-analysis'
  if (has(pt, /^systematic review$/i) || /\bsystematic review\b/.test(title)) return 'systematic-review'
  if (has(pt, /^review$/i) || type === 'review' || cr === 'review') return 'review'
  if (['editorial', 'letter', 'erratum', 'comment'].includes(type) || has(pt, /^(editorial|letter|comment)$/i)) return 'editorial'
  if (type === 'book' || cr === 'book' || cr === 'monograph') return 'book'
  if (type === 'book-chapter' || cr === 'book-chapter') return 'book-chapter'
  if (type === 'dataset' || cr === 'dataset') return 'dataset'
  if (type === 'dissertation' || cr === 'dissertation') return 'thesis'
  if (venueType === 'conference' || cr === 'proceedings-article') return 'conference-paper'
  const arxivOnly = !!rec.extra.arxiv && !rec.extra.arxiv.journalRef && venueType !== 'journal'
  if (type === 'preprint' || cr === 'posted-content' || venueType === 'repository' || arxivOnly) return 'preprint'
  if (type === 'article' || cr === 'journal-article' || venueType === 'journal') return 'journal-article'
  return 'other'
}

const DESIGN_SKIP = /^(journal article|research support|english abstract|review|systematic review|meta-analysis|editorial|letter|comment|published erratum)/i
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

/** PubMed publication types → study designs (RCT, clinical trial, case report, cohort, …). Review types live in `kind`. */
export function studyDesignOf(pubmedTypes: string[]): string[] {
  const out = new Set<string>()
  for (const t of pubmedTypes) {
    if (DESIGN_SKIP.test(t)) continue
    if (/^randomized controlled trial$/i.test(t)) out.add('randomized-controlled-trial')
    else if (/^clinical trial, phase/i.test(t)) { out.add('clinical-trial'); out.add(slug(t)) }
    else if (/^clinical trial/i.test(t)) out.add('clinical-trial')
    else if (/^case reports?$/i.test(t)) out.add('case-report')
    else out.add(slug(t))
  }
  return [...out]
}

export function recencyOf(publicationDate: string | null, year: number | null, now = new Date()): Labels['recency'] {
  const d = publicationDate ? new Date(publicationDate) : year ? new Date(Date.UTC(year, 6, 1)) : null
  if (!d || Number.isNaN(d.getTime())) return 'classic'
  const months = (now.getTime() - d.getTime()) / (30.44 * 24 * 3600 * 1000)
  if (months <= 18) return 'fresh'
  if (months <= 60) return 'recent'
  if (months <= 180) return 'established'
  return 'classic'
}

const METHOD_RE = /\b(software|tools?|toolkit|pipelines?|packages?|algorithms?|web ?server|R package|python|framework for|computational method)\b/i

export function tagsOf(rec: EnrichedRecord): string[] {
  const tags = new Set<string>()
  if (METHOD_RE.test(rec.paper.title) || rec.extra.keywords.some(k => METHOD_RE.test(k))) tags.add('method/tool')
  for (const g of rec.extra.grants.slice(0, 8)) if (g.trim()) tags.add(`funded:${g.trim()}`)
  if (rec.paper.isRetracted) tags.add('retracted')
  if (!rec.paper.abstract) tags.add('no-abstract')
  if (rec.extra.language && rec.extra.language !== 'en') tags.add('non-english')
  return [...tags]
}

const words = (s: string) => new Set(s.toLowerCase().match(/[a-z0-9+-]{3,}/g) ?? [])

/** Keyword fallback for subtopic matching: ≥ half of the subtopic query's terms (min 1) occur in title+abstract. */
export function subtopicsByKeywords(rec: EnrichedRecord, goals: Goals): string[] {
  const text = words(`${rec.paper.title} ${rec.paper.abstract ?? ''}`)
  return goals.subtopics.filter(s => {
    const terms = [...words(s.query)]
    if (!terms.length) return false
    const hit = terms.filter(t => text.has(t)).length
    return hit >= Math.max(1, Math.ceil(terms.length / 2))
  }).map(s => s.name)
}

export function labelRecord(rec: EnrichedRecord, goals: Goals, opts: { subtopics?: string[]; now?: Date } = {}): Labels {
  const kind = kindOf(rec)
  const venueType = (rec.venue.type || '').toLowerCase()
  const peerReviewed = kind === 'preprint' ? false : venueType === 'journal' || venueType === 'conference' ? true : null
  const pt = rec.extra.primaryTopic
  return {
    kind,
    studyDesign: studyDesignOf(rec.extra.pubmedTypes),
    peerReviewed,
    openAccess: rec.extra.oaStatus,
    field: pt?.field ?? null, subfield: pt?.subfield ?? null, topic: pt?.topic ?? null,
    keywords: rec.extra.keywords,
    mesh: rec.extra.mesh,
    arxivCategories: rec.extra.arxiv?.categories ?? [],
    language: rec.extra.language,
    recency: recencyOf(rec.paper.publicationDate, rec.paper.year, opts.now),
    retracted: rec.paper.isRetracted,
    hasAbstract: !!rec.paper.abstract,
    sources: [...new Set(rec.hits.map(h => h.source))] as SourceName[],
    subtopics: opts.subtopics ?? subtopicsByKeywords(rec, goals),
    tags: tagsOf(rec),
  }
}
