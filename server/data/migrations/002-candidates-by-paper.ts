// Migration 2: look up a paper's candidacy across runs (provenance and history views) without scanning candidates.
import type { Migration } from './index'

export const candidatesByPaper: Migration = {
  version: 2,
  name: 'candidates-by-paper',
  up(db) {
    db.exec('CREATE INDEX IF NOT EXISTS candidates_paper ON candidates(paper_id)')
  },
}
