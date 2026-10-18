// Owner: lane L2. Test helper: build EnrichedRecords with sensible defaults (used by *.test.ts only).
import type { Paper } from '@shared/contracts'
import type { Goals } from '@shared/library'
import type { EnrichedRecord } from './types'

export function mkRecord(id: string, o: { paper?: Partial<Paper>; venue?: Partial<EnrichedRecord['venue']>; extra?: Partial<EnrichedRecord['extra']>; authors?: EnrichedRecord['authors']; hits?: EnrichedRecord['hits']; relations?: EnrichedRecord['relations'] } = {}): EnrichedRecord {
  const paper: Paper = {
    id, doi: null, pmid: null, pmcid: null, title: `Paper ${id}`, authors: ['A. First', 'B. Last'], year: 2020, publicationDate: '2020-06-01', venue: 'Journal X', type: 'article',
    citedByCount: 10, citationPct: null, isRetracted: false, isOa: null, oaUrl: null, abstract: `Abstract of ${id} about melanoma single-cell sequencing.`, abstractSource: 'openalex',
    referencedWorks: [], url: `https://openalex.org/${id}`, ...o.paper,
  }
  return {
    key: id, paper,
    authors: o.authors ?? [],
    venue: { id: null, name: paper.venue, type: 'journal', publisher: null, hIndex: null, meanCitedness2y: null, isCore: null, isInDoaj: null, issn: null, ...o.venue },
    hits: o.hits ?? [{ source: 'openalex', via: 'keyword', query: 'q', rank: 1, url: paper.url }],
    relations: o.relations ?? [],
    extra: { typeCrossref: null, fwci: null, oaStatus: null, primaryTopic: null, keywords: [], language: 'en', grants: [], pubmedTypes: [], mesh: [], arxiv: null, scholarCitedBy: null, ...o.extra },
  }
}

export const testGoals = (o: Partial<Goals> = {}): Goals => ({
  topic: 'melanoma immune single-cell', question: 'Which single-cell methods help study melanoma immune cells?',
  goals: ['map T cell states'], subtopics: [{ name: 'T cell states', query: 'melanoma T cell states single-cell' }, { name: 'Brain metastasis', query: 'melanoma brain metastasis immune' }],
  keywords: ['melanoma', 'single-cell', 'T cell'], knownPapers: [], evidence: [], model: null, ...o,
})
