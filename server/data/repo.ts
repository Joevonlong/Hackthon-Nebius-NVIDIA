// Owner: lane A1. The only module other code uses to touch the store (spec §4.5).
import type { Candidate, Judgement, Paper, RunSnapshot } from '@shared/contracts'
import { getDb } from './db'
import { sha256 } from './http'

const now = () => new Date().toISOString()

function rowToPaper(r: any): Paper {
  return {
    id: r.id, doi: r.doi, pmid: r.pmid, pmcid: r.pmcid, title: r.title, authors: JSON.parse(r.authors || '[]'),
    year: r.year, publicationDate: r.publication_date, venue: r.venue, type: r.type, citedByCount: r.cited_by_count,
    citationPct: r.citation_pct, isRetracted: !!r.is_retracted, isOa: r.is_oa == null ? null : !!r.is_oa, oaUrl: r.oa_url,
    abstract: r.abstract, abstractSource: r.abstract_source, referencedWorks: JSON.parse(r.referenced_works || '[]'),
    url: `https://openalex.org/${r.id}`,
  }
}

export function upsertPapers(papers: Paper[]) {
  const db = getDb()
  const up = db.prepare(`INSERT INTO papers (id, doi, pmid, pmcid, title, abstract, abstract_source, year, publication_date, venue, type,
      cited_by_count, citation_pct, is_retracted, is_oa, oa_url, authors, referenced_works, updated_at)
    VALUES (@id, @doi, @pmid, @pmcid, @title, @abstract, @abstractSource, @year, @publicationDate, @venue, @type,
      @citedByCount, @citationPct, @isRetracted, @isOa, @oaUrl, @authors, @referencedWorks, @updatedAt)
    ON CONFLICT(id) DO UPDATE SET doi=excluded.doi, pmid=excluded.pmid, pmcid=excluded.pmcid, title=excluded.title,
      abstract=COALESCE(excluded.abstract, papers.abstract), abstract_source=COALESCE(excluded.abstract_source, papers.abstract_source),
      year=excluded.year, publication_date=excluded.publication_date, venue=excluded.venue, type=excluded.type,
      cited_by_count=excluded.cited_by_count, citation_pct=excluded.citation_pct, is_retracted=excluded.is_retracted,
      is_oa=excluded.is_oa, oa_url=excluded.oa_url, authors=excluded.authors, referenced_works=excluded.referenced_works,
      updated_at=excluded.updated_at`)
  const alias = db.prepare(`INSERT OR REPLACE INTO paper_ids (alias, kind, paper_id) VALUES (?, ?, ?)`)
  const cite = db.prepare(`INSERT OR IGNORE INTO citations (citing_id, cited_id) VALUES (?, ?)`)
  const t = now()
  db.transaction((ps: Paper[]) => {
    for (const p of ps) {
      up.run({ ...p, isRetracted: p.isRetracted ? 1 : 0, isOa: p.isOa == null ? null : p.isOa ? 1 : 0, authors: JSON.stringify(p.authors), referencedWorks: JSON.stringify(p.referencedWorks), updatedAt: t })
      if (p.doi) alias.run(`doi:${p.doi}`, 'doi', p.id)
      if (p.pmid) alias.run(`pmid:${p.pmid}`, 'pmid', p.id)
      if (p.pmcid) alias.run(`pmcid:${p.pmcid}`, 'pmcid', p.id)
      for (const r of p.referencedWorks) cite.run(p.id, r)
    }
  })(papers)
}

export function getPaper(idOrAlias: string): Paper | null {
  const db = getDb()
  let r = db.prepare(`SELECT * FROM papers WHERE id = ?`).get(idOrAlias)
  if (!r) {
    const a = db.prepare(`SELECT paper_id FROM paper_ids WHERE alias = ?`).get(idOrAlias) as { paper_id: string } | undefined
    if (a) r = db.prepare(`SELECT * FROM papers WHERE id = ?`).get(a.paper_id)
  }
  return r ? rowToPaper(r) : null
}

export function setAbstract(id: string, abstract: string, source: string) {
  getDb().prepare(`UPDATE papers SET abstract = ?, abstract_source = ? WHERE id = ?`).run(abstract, source, id)
}

export interface ProvenanceRow { paperId: string; route: string; viaSeedId?: string | null; api: string; requestUrl?: string | null; rawHash?: string | null }
export function addProvenance(runId: string, rows: ProvenanceRow[]) {
  const db = getDb()
  const st = db.prepare(`INSERT INTO provenance (paper_id, run_id, route, via_seed_id, api, request_url, raw_hash, fetched_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
  const t = now()
  db.transaction(() => { for (const r of rows) st.run(r.paperId, runId, r.route, r.viaSeedId ?? null, r.api, r.requestUrl ?? null, r.rawHash ?? null, t) })()
}

export function addWebSources(runId: string, rows: { url: string; title: string; snippet: string; query: string }[]) {
  const db = getDb()
  const st = db.prepare(`INSERT INTO web_sources (run_id, url, domain, kind, title, snippet, query) VALUES (?, ?, ?, ?, ?, ?, ?)`)
  db.transaction(() => {
    for (const r of rows) {
      let domain = ''
      try { domain = new URL(r.url).hostname } catch { /* keep empty */ }
      st.run(runId, r.url, domain, 'other', r.title, r.snippet, r.query)
    }
  })()
}

export function createRun(run: { id: string; question: string; preset: string; params: unknown; models: unknown }) {
  getDb().prepare(`INSERT INTO runs (id, question, preset, params, models, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
    .run(run.id, run.question, run.preset, JSON.stringify(run.params), JSON.stringify(run.models), now())
}

export function finishRun(snapshot: RunSnapshot, status: 'done' | 'error') {
  getDb().prepare(`UPDATE runs SET status = ?, snapshot = ?, facets = ?, seed_ids = ?, finished_at = ? WHERE id = ?`)
    .run(status, JSON.stringify(snapshot), JSON.stringify(snapshot.facets), JSON.stringify(snapshot.seeds.map(s => s.id)), now(), snapshot.runId)
}

export function getRunSnapshot(id: string): RunSnapshot | null {
  const r = getDb().prepare(`SELECT snapshot FROM runs WHERE id = ?`).get(id) as { snapshot: string | null } | undefined
  return r?.snapshot ? JSON.parse(r.snapshot) : null
}

export function saveCandidates(runId: string, cands: Candidate[]) {
  const db = getDb()
  const st = db.prepare(`INSERT OR REPLACE INTO candidates (run_id, paper_id, lane, routes, signals, features, score, rank, why_ranked) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
  db.transaction(() => {
    for (const c of cands) st.run(runId, c.paper.id, c.lane, JSON.stringify(c.routes), JSON.stringify(c.signals), JSON.stringify(c.features), c.score, c.rank, c.whyRanked)
  })()
}

export function saveJudgement(runId: string, paperId: string, j: Judgement) {
  getDb().prepare(`INSERT OR REPLACE INTO judgements (run_id, paper_id, model, prompt_hash, output, quote_start, quote_end, verified) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(runId, paperId, j.model, null, JSON.stringify(j), j.quoteRef?.start ?? null, j.quoteRef?.end ?? null, j.verified ? 1 : 0)
}

// ---- embeddings: fp16 BLOBs keyed by (owner, model, dims, text_hash) -------------------------------

export const textHash = (t: string) => sha256(t).slice(0, 32)

export function f32ToF16(x: number): number {
  const f = new Float32Array(1); const u = new Uint32Array(f.buffer)
  f[0] = x
  const b = u[0]
  const sign = (b >>> 16) & 0x8000
  let exp = ((b >>> 23) & 0xff) - 127 + 15
  let mant = b & 0x7fffff
  if (exp >= 31) return sign | 0x7c00
  if (exp <= 0) {
    if (exp < -10) return sign
    mant = (mant | 0x800000) >> (1 - exp)
    return sign | ((mant + 0x1000) >> 13)
  }
  return (sign | (exp << 10) | (mant >> 13)) + ((mant >> 12) & 1)
}
export function f16ToF32(h: number): number {
  const s = h & 0x8000 ? -1 : 1
  const e = (h >> 10) & 0x1f
  const m = h & 0x3ff
  if (e === 0) return s * 2 ** -14 * (m / 1024)
  if (e === 31) return m ? NaN : s * Infinity
  return s * 2 ** (e - 15) * (1 + m / 1024)
}
export function encodeVec(v: number[]): Buffer {
  const u = new Uint16Array(v.length)
  for (let i = 0; i < v.length; i++) u[i] = f32ToF16(v[i])
  return Buffer.from(u.buffer)
}
export function decodeVec(b: Buffer): number[] {
  const u = new Uint16Array(b.buffer, b.byteOffset, b.byteLength / 2)
  return Array.from(u, f16ToF32)
}

export function getEmbeddings(ownerType: string, model: string, dims: number, items: { id: string; text: string }[]): Map<string, number[]> {
  const st = getDb().prepare(`SELECT vec FROM embeddings WHERE owner_type = ? AND owner_id = ? AND model = ? AND dims = ? AND text_hash = ?`)
  const out = new Map<string, number[]>()
  for (const it of items) {
    const r = st.get(ownerType, it.id, model, dims, textHash(it.text)) as { vec: Buffer } | undefined
    if (r) out.set(it.id, decodeVec(r.vec))
  }
  return out
}

export function putEmbeddings(ownerType: string, model: string, dims: number, items: { id: string; text: string; vec: number[] }[]) {
  const db = getDb()
  const st = db.prepare(`INSERT OR REPLACE INTO embeddings (owner_type, owner_id, model, dims, text_hash, dtype, vec) VALUES (?, ?, ?, ?, ?, 'fp16', ?)`)
  db.transaction(() => { for (const it of items) st.run(ownerType, it.id, model, dims, textHash(it.text), encodeVec(it.vec)) })()
}
