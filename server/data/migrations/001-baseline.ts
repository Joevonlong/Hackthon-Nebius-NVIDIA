// Migration 1: the schema as it was before versioning (all CREATE ... IF NOT EXISTS, so libraries made by older builds
// that sit at user_version 0 with these tables already present adopt it without change).
import type { Migration } from './index'

export const baseline: Migration = {
  version: 1,
  name: 'baseline',
  up(db) {
    db.exec(`
CREATE TABLE IF NOT EXISTS papers (
  id TEXT PRIMARY KEY, doi TEXT, pmid TEXT, pmcid TEXT, title TEXT NOT NULL, abstract TEXT, abstract_source TEXT,
  year INTEGER, publication_date TEXT, venue TEXT, type TEXT, cited_by_count INTEGER NOT NULL DEFAULT 0,
  citation_pct REAL, is_retracted INTEGER NOT NULL DEFAULT 0, is_oa INTEGER, oa_url TEXT, license TEXT,
  authors TEXT NOT NULL DEFAULT '[]', referenced_works TEXT NOT NULL DEFAULT '[]', updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS papers_doi ON papers(doi);
CREATE INDEX IF NOT EXISTS papers_pmid ON papers(pmid);
CREATE TABLE IF NOT EXISTS paper_ids (alias TEXT PRIMARY KEY, kind TEXT NOT NULL, paper_id TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS paper_ids_paper ON paper_ids(paper_id);
CREATE TABLE IF NOT EXISTS citations (citing_id TEXT NOT NULL, cited_id TEXT NOT NULL, PRIMARY KEY (citing_id, cited_id));
CREATE INDEX IF NOT EXISTS citations_cited ON citations(cited_id);
CREATE TABLE IF NOT EXISTS provenance (
  paper_id TEXT NOT NULL, run_id TEXT NOT NULL, route TEXT NOT NULL, via_seed_id TEXT, api TEXT, request_url TEXT,
  raw_hash TEXT, fetched_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS provenance_run ON provenance(run_id);
CREATE TABLE IF NOT EXISTS web_sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT, run_id TEXT, url TEXT NOT NULL, domain TEXT, kind TEXT, title TEXT, snippet TEXT, query TEXT, raw_hash TEXT
);
CREATE TABLE IF NOT EXISTS embeddings (
  owner_type TEXT NOT NULL, owner_id TEXT NOT NULL, model TEXT NOT NULL, dims INTEGER NOT NULL, text_hash TEXT NOT NULL,
  dtype TEXT NOT NULL DEFAULT 'fp16', vec BLOB NOT NULL, PRIMARY KEY (owner_type, owner_id, model, dims, text_hash)
);
CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY, question TEXT NOT NULL, preset TEXT NOT NULL, facets TEXT, seed_ids TEXT, params TEXT, models TEXT,
  status TEXT NOT NULL DEFAULT 'running', snapshot TEXT, created_at TEXT NOT NULL, finished_at TEXT
);
CREATE TABLE IF NOT EXISTS candidates (
  run_id TEXT NOT NULL, paper_id TEXT NOT NULL, lane TEXT NOT NULL, routes TEXT, signals TEXT, features TEXT,
  score REAL, rank INTEGER, why_ranked TEXT, PRIMARY KEY (run_id, paper_id)
);
CREATE TABLE IF NOT EXISTS judgements (
  run_id TEXT NOT NULL, paper_id TEXT NOT NULL, model TEXT, prompt_hash TEXT, output TEXT NOT NULL, quote_chunk_id TEXT,
  quote_start INTEGER, quote_end INTEGER, verified INTEGER, PRIMARY KEY (run_id, paper_id)
);
CREATE TABLE IF NOT EXISTS feedback (run_id TEXT, paper_id TEXT, label TEXT, reason TEXT, created_at TEXT);
`)
  },
}
