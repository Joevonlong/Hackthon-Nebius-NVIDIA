// Owner: lane L1. gather() = search all sources → normalize/dedupe → enrich (OpenAlex works, venues, authors; PubMed types/MeSH; arXiv).
import type { Goals, LibraryRequest } from '@shared/library'
import type { EnrichedRecord, SourceCall } from '../types'

export async function gather(_goals: Goals, _req: LibraryRequest, _onCall: (c: SourceCall) => void): Promise<EnrichedRecord[]> {
  return []
}
