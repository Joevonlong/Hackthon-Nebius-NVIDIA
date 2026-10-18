// Owner: lane L1. Per-entity OpenAlex cache. The raw HTTP cache (server/data/http.ts) is keyed by the exact request URL, so a
// batch `filter=openalex_id:W1|W2|…` with a different id set misses even when every entity was fetched before. This store keeps
// every work / author / source object individually (key = OpenAlex short id; works also under DOI and PMID aliases), plus
// "not found" markers for ids a batch asked for and OpenAlex did not return. Batches serve what is here and request only the rest.
// File: ${DATA_DIR}/raw/openalex-entities.sqlite (a cache; deleting it only costs re-fetches). The old URL-cache files stay untouched.
import Database from 'better-sqlite3'
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { dataDir } from '../../data/db'

export type EntityKind = 'work' | 'author' | 'source'
export type LookupKey = 'openalex_id' | 'doi' | 'pmid'

/** "Not found" markers older than this are ignored (OpenAlex adds works daily). */
const NEGATIVE_TTL_MS = 14 * 24 * 3600 * 1000

const SCHEMA = `
CREATE TABLE IF NOT EXISTS entities (kind TEXT NOT NULL, id TEXT NOT NULL, fields TEXT NOT NULL, json TEXT NOT NULL, fetched_at TEXT NOT NULL, PRIMARY KEY (kind, id));
CREATE TABLE IF NOT EXISTS aliases (kind TEXT NOT NULL, alias TEXT NOT NULL, id TEXT NOT NULL, PRIMARY KEY (kind, alias));
CREATE TABLE IF NOT EXISTS negatives (kind TEXT NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL, at TEXT NOT NULL, PRIMARY KEY (kind, key, value));
CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT NOT NULL);
`

export const shortOaId = (x: unknown) => (x ? String(x).split('/').pop()!.toUpperCase() : '')
export const normDoiKey = (d: unknown) => (d ? String(d).trim().toLowerCase().replace(/^https?:\/\/(dx\.)?doi\.org\//, '').replace(/^doi:/, '') : '')
export const normPmidKey = (p: unknown) => (p ? String(p).trim().split('/').pop()!.replace(/^pmid:/i, '') : '')

export function normValue(key: LookupKey, v: string): string {
  return key === 'doi' ? normDoiKey(v) : key === 'pmid' ? normPmidKey(v) : shortOaId(v)
}

/** Sorted field list of a select param; '*' = no select (full object). */
export function fieldSig(select: string | null | undefined): string {
  if (!select) return '*'
  return [...new Set(select.split(',').map(s => s.trim()).filter(Boolean))].sort().join(',')
}
function covers(have: string, want: string): boolean {
  if (have === '*') return true
  if (want === '*') return false
  const h = new Set(have.split(','))
  return want.split(',').every(f => h.has(f))
}
function unionSig(a: string, b: string): string {
  if (a === '*' || b === '*') return '*'
  return fieldSig(a + ',' + b)
}

/** Counters for the current process (reported in the gather stats and the verification). */
export const entityStats = { served: 0, negativeServed: 0, requested: 0, stored: 0 }
export function resetEntityStats() { entityStats.served = 0; entityStats.negativeServed = 0; entityStats.requested = 0; entityStats.stored = 0 }

export class EntityStore {
  private db: Database.Database
  constructor(file: string) {
    if (file !== ':memory:') mkdirSync(resolve(file, '..'), { recursive: true })
    this.db = new Database(file)
    if (file !== ':memory:') { this.db.pragma('journal_mode = WAL'); this.db.pragma('synchronous = NORMAL') }
    this.db.exec(SCHEMA)
  }
  close() { this.db.close() }

  meta(k: string): string | null { return (this.db.prepare('SELECT v FROM meta WHERE k = ?').get(k) as { v: string } | undefined)?.v ?? null }
  setMeta(k: string, v: string) { this.db.prepare('INSERT OR REPLACE INTO meta (k, v) VALUES (?, ?)').run(k, v) }

  count(kind?: EntityKind): number {
    const r = (kind ? this.db.prepare('SELECT COUNT(*) n FROM entities WHERE kind = ?').get(kind) : this.db.prepare('SELECT COUNT(*) n FROM entities').get()) as { n: number }
    return r.n
  }

  /** Every cached object of a kind (CR-14 venue matching). */
  list(kind: EntityKind): any[] {
    return (this.db.prepare('SELECT json FROM entities WHERE kind = ?').all(kind) as { json: string }[]).map(r => JSON.parse(r.json))
  }

  /** Stores objects (merged field-wise into what is there). `asked` records not-found markers for batch values OpenAlex did not return. */
  put(kind: EntityKind, objs: any[], select: string | null | undefined, asked?: { key: LookupKey; values: string[] }, fetchedAt = new Date().toISOString()): number {
    const sig = fieldSig(select)
    const getRow = this.db.prepare('SELECT json FROM entities WHERE kind = ? AND id = ?')
    const getFields = this.db.prepare('SELECT fields FROM entities WHERE kind = ? AND id = ?')
    const upsert = this.db.prepare('INSERT OR REPLACE INTO entities (kind, id, fields, json, fetched_at) VALUES (?, ?, ?, ?, ?)')
    const alias = this.db.prepare('INSERT OR REPLACE INTO aliases (kind, alias, id) VALUES (?, ?, ?)')
    const neg = this.db.prepare('INSERT OR REPLACE INTO negatives (kind, key, value, at) VALUES (?, ?, ?, ?)')
    const unneg = this.db.prepare('DELETE FROM negatives WHERE kind = ? AND key = ? AND value = ?')
    let n = 0
    this.db.transaction(() => {
      const seen = { openalex_id: new Set<string>(), doi: new Set<string>(), pmid: new Set<string>() }
      for (const o of objs) {
        const id = shortOaId(o?.id)
        if (!id) continue
        const old = getFields.get(kind, id) as { fields: string } | undefined
        n++
        // same or narrower projection already stored: keep it (no JSON work); wider: overwrite; incomparable: merge field-wise
        if (old && old.fields !== sig && covers(old.fields, sig)) { /* keep */ }
        else if (!old || covers(sig, old.fields)) upsert.run(kind, id, sig, JSON.stringify(o), fetchedAt)
        else {
          const prev = JSON.parse((getRow.get(kind, id) as { json: string }).json)
          upsert.run(kind, id, unionSig(old.fields, sig), JSON.stringify({ ...prev, ...o }), fetchedAt)
        }
        seen.openalex_id.add(id); unneg.run(kind, 'openalex_id', id)
        if (kind === 'work') {
          const doi = normDoiKey(o.doi ?? o.ids?.doi)
          const pmid = normPmidKey(o.ids?.pmid)
          if (doi) { alias.run('doi', doi, id); seen.doi.add(doi); unneg.run(kind, 'doi', doi) }
          if (pmid) { alias.run('pmid', pmid, id); seen.pmid.add(pmid); unneg.run(kind, 'pmid', pmid) }
        }
      }
      if (asked) {
        for (const v of asked.values) {
          const nv = normValue(asked.key, v)
          if (nv && !seen[asked.key].has(nv) && !(asked.key !== 'openalex_id' && this.resolveAlias(asked.key, nv))) neg.run(kind, asked.key, nv, fetchedAt)
        }
      }
    })()
    entityStats.stored += n
    return n
  }

  private resolveAlias(key: LookupKey, v: string): string | null {
    if (key === 'openalex_id') return v
    return (this.db.prepare('SELECT id FROM aliases WHERE kind = ? AND alias = ?').get(key, v) as { id: string } | undefined)?.id ?? null
  }

  /** Splits a batch request into cached objects, values known not to exist, and values that still need a request. */
  lookup(kind: EntityKind, key: LookupKey, values: string[], select: string | null | undefined, now = Date.now()): { hits: any[]; missing: string[]; negatives: string[] } {
    const want = fieldSig(select)
    const getRow = this.db.prepare('SELECT fields, json FROM entities WHERE kind = ? AND id = ?')
    const getNeg = this.db.prepare('SELECT at FROM negatives WHERE kind = ? AND key = ? AND value = ?')
    const hits: any[] = []; const missing: string[] = []; const negatives: string[] = []
    const got = new Set<string>()
    for (const v of values) {
      const nv = normValue(key, v)
      if (!nv) continue
      const id = this.resolveAlias(key, nv)
      const row = id ? getRow.get(kind, id) as { fields: string; json: string } | undefined : undefined
      if (row && covers(row.fields, want)) { if (!got.has(id!)) { got.add(id!); hits.push(JSON.parse(row.json)) } continue }
      const n = getNeg.get(kind, key, nv) as { at: string } | undefined
      if (n && now - Date.parse(n.at) < NEGATIVE_TTL_MS) { negatives.push(v); continue }
      missing.push(v)
    }
    entityStats.served += hits.length; entityStats.negativeServed += negatives.length; entityStats.requested += missing.length
    return { hits, missing, negatives }
  }
}

let current: { path: string; store: EntityStore } | null = null
export const entityFile = () => resolve(join(dataDir(), 'raw', 'openalex-entities.sqlite'))

/** The store for the current DATA_DIR. On first open of a fresh store, the existing URL-cache files are harvested once. */
export function entities(): EntityStore {
  const path = entityFile()
  if (current?.path === path) return current.store
  current?.store.close()
  const store = new EntityStore(path)
  current = { path, store }
  if (!store.meta('backfilled_at') && process.env.OPENALEX_ENTITY_BACKFILL !== '0') backfillFromRawCache(store, join(dataDir(), 'raw', 'openalex'))
  return store
}
export function closeEntities() { current?.store.close(); current = null }

/** Which entity kind / batch key a cached OpenAlex URL describes. */
export function classifyUrl(url: string): { kind: EntityKind; select: string | null; asked?: { key: LookupKey; values: string[] }; single?: boolean } | null {
  let u: URL
  try { u = new URL(url) } catch { return null }
  const parts = u.pathname.split('/').filter(Boolean)
  const kind = ({ works: 'work', authors: 'author', sources: 'source' } as Record<string, EntityKind>)[parts[0] ?? '']
  if (!kind) return null
  const select = u.searchParams.get('select')
  if (parts.length > 1) return { kind, select, single: true } // /works/W1, /works/doi:10.x — the body is the entity itself
  const filter = u.searchParams.get('filter') ?? ''
  const m = /^(openalex_id|doi|pmid):(.+)$/.exec(filter)
  // only a lone id filter of the batch kind yields not-found markers; search / cites: / title.search: responses are harvested only
  if (m && !filter.includes(',') && !u.searchParams.has('search') && Number(u.searchParams.get('page') ?? 1) === 1) {
    return { kind, select, asked: { key: m[1] as LookupKey, values: m[2].split('|') } }
  }
  return { kind, select }
}

/** Harvests every entity in the URL-cache files under `rawDir` (read-only). Returns counts. */
export function backfillFromRawCache(store: EntityStore, rawDir: string): { files: number; used: number; entities: number; errors: number } {
  const out = { files: 0, used: 0, entities: 0, errors: 0 }
  if (!existsSync(rawDir)) { store.setMeta('backfilled_at', new Date().toISOString()); return out }
  for (const f of readdirSync(rawDir)) {
    if (!f.endsWith('.json.gz')) continue
    out.files++
    try {
      const env = JSON.parse(gunzipSync(readFileSync(join(rawDir, f))).toString('utf8'))
      if (env.status !== 200 || !env.url || !env.body) continue
      const c = classifyUrl(env.url)
      if (!c) continue
      const body = JSON.parse(env.body)
      const objs: any[] = c.single ? [body] : body.results ?? []
      // a batch page that hit the per-page cap may have dropped values: no not-found markers then
      const asked = c.asked && objs.length < Number(new URL(env.url).searchParams.get('per-page') ?? 25) ? c.asked : undefined
      out.entities += store.put(c.kind, objs, c.select, asked, env.fetchedAt ?? new Date().toISOString())
      out.used++
    } catch { out.errors++ }
  }
  store.setMeta('backfilled_at', new Date().toISOString())
  store.setMeta('backfill_stats', JSON.stringify(out))
  return out
}
