// Library internal types shared by lanes L1 (sources/enrich) and L2 (goals/labels/score/pipeline). Captain-owned.
import type { Paper } from '@shared/contracts'
import type { Goals, Hit, LibraryRequest, SourceName } from '@shared/library'
import type { z } from 'zod'
import type { AuthorInfo, VenueInfo } from '@shared/library'

/** One paper after search + normalize + enrich (before labels and scores). */
export interface EnrichedRecord {
  key: string // stable id: OpenAlex W-id, else "arxiv:<id>", "pmid:<id>", "scholar:<hash>"
  paper: Paper // contract Paper (abstract filled by the waterfall when possible)
  authors: z.infer<typeof AuthorInfo>[]
  venue: z.infer<typeof VenueInfo>
  hits: Hit[] // every search result that led here
  relations: { type: 'cites' | 'cited_by' | 'similar' | 'same_query'; paperId: string; note?: string }[]
  extra: {
    typeCrossref: string | null
    fwci: number | null
    oaStatus: string | null // gold | green | hybrid | bronze | diamond | closed
    primaryTopic: { topic: string; subfield: string; field: string; domain: string } | null
    keywords: string[]
    language: string | null
    grants: string[] // funder names
    pubmedTypes: string[] // PubMed PublicationType list
    mesh: string[]
    arxiv: { id: string; primaryCategory: string | null; categories: string[]; journalRef: string | null; comment: string | null } | null
    scholarCitedBy: number | null
    /** CR-14: cited-by count from Europe PMC / Crossref when OpenAlex gave none. */
    citedByFallback?: { count: number; source: 'Europe PMC' | 'Crossref'; url: string } | null
    /** CR-14: venue matched to a cached OpenAlex source (no OpenAlex work record). */
    venueMatch?: 'ISSN' | 'name' | null
  }
}

export interface SourceCall { source: SourceName; query: string; count: number; ms: number; error?: string }

/** L1 entry points (implemented in server/library/sources/index.ts). */
export interface SourcesApi {
  /** Runs keyword + subtopic searches on the requested sources, plus graph expansion of goals.knownPapers. */
  gather(goals: Goals, req: LibraryRequest, onCall: (c: SourceCall) => void): Promise<EnrichedRecord[]>
}
