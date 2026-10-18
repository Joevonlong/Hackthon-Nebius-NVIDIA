// Owner: lane A1. Every OpenAlex / PubMed GET goes through here: raw cache (gzip under
// ${DATA_DIR}/raw/<api>/<sha256(url)>.json.gz), retry with backoff on 429/5xx, per-API concurrency/throttle.
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { gunzipSync, gzipSync } from 'node:zlib'
import { dataDir } from './db'
import { trace } from '../trace'

export class HttpError extends Error {
  constructor(public status: number, public url: string, body: string) { super(`HTTP ${status} for ${url}: ${body.slice(0, 200)}`) }
}

/** Secrets and contact params never become part of the cache key (nor of what is written to disk). */
const PRIVATE_PARAMS = ['api_key', 'mailto', 'email']
export function cacheKeyUrl(url: string): string {
  const u = new URL(url)
  for (const p of PRIVATE_PARAMS) u.searchParams.delete(p)
  return u.toString()
}
export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex')

/** Simple semaphore + minimum interval between request starts. */
class Gate {
  private active = 0
  private queue: (() => void)[] = []
  private last = 0
  constructor(private max: number, private minIntervalMs: number) {}
  /** After a 429 every queued request of this API waits: the next start is pushed `ms` into the future. */
  cool(ms: number) { this.last = Math.max(this.last, Date.now() + ms) }
  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.active >= this.max) await new Promise<void>(r => this.queue.push(r))
    this.active++
    try {
      const wait = this.last + this.minIntervalMs - Date.now()
      this.last = Math.max(Date.now(), this.last + this.minIntervalMs)
      if (wait > 0) await sleep(wait)
      return await fn()
    } finally {
      this.active--
      this.queue.shift()?.()
    }
  }
}
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

const gates: Record<string, Gate> = {
  openalex: new Gate(8, 0),
  // NCBI: ≤3 req/s without a key (≤10 with NCBI_API_KEY). Up to 3 in flight, request starts spaced ≥340 ms apart.
  pubmed: process.env.NCBI_API_KEY ? new Gate(6, 110) : new Gate(3, 400),
  europepmc: new Gate(6, 80),
  // arXiv etiquette asks for ≤1 request / 3 s on bulk use; a library build issues ≤ ~6 (deduped) searches, so 1 / s is used
  // (ARXIV_MIN_INTERVAL_MS overrides). Cached responses never touch the gate.
  arxiv: new Gate(1, Number(process.env.ARXIV_MIN_INTERVAL_MS || 1000)),
  serpapi: new Gate(2, 200),
}

/** Circuit breaker: an API whose budget is exhausted (429 with a long Retry-After) gets no more network calls until then. Cache reads still work. */
export const blockedUntil: Record<string, number> = {}
export const isBlocked = (api: string) => (blockedUntil[api] ?? 0) > Date.now()

export const stats = { hits: 0, misses: 0 }

export interface CachedResponse { url: string; status: number; body: string; fetchedAt: string; hash: string; cached: boolean }

/** GET with raw cache. Cache hit = no network. Errors are not cached. */
export async function cachedGet(api: keyof typeof gates | string, url: string, opts: { timeoutMs?: number; retries?: number } = {}): Promise<CachedResponse> {
  const key = cacheKeyUrl(url)
  const hash = sha256(key)
  const dir = join(dataDir(), 'raw', api)
  const file = join(dir, `${hash}.json.gz`)
  if (existsSync(file)) {
    try {
      const env = JSON.parse(gunzipSync(readFileSync(file)).toString('utf8'))
      stats.hits++
      trace('api', { api, url: key, cached: true, status: env.status, bytes: env.body?.length ?? 0, raw: `data/raw/${api}/${hash}.json.gz` })
      return { ...env, hash, cached: true }
    } catch { /* corrupt entry: refetch */ }
  }
  stats.misses++
  if (isBlocked(api)) throw new HttpError(429, key, `${api} budget exhausted — circuit open until ${new Date(blockedUntil[api]).toISOString()}`)
  const gate = gates[api] ?? gates.openalex
  const retries = opts.retries ?? 4
  let lastErr: unknown
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const t0 = Date.now()
      // re-checked inside the gate: requests queued before the breaker opened must not go out either
      const res = await gate.run(() => {
        if (isBlocked(api)) throw new HttpError(429, key, `${api} budget exhausted — circuit open until ${new Date(blockedUntil[api]).toISOString()}`)
        return fetch(url, { signal: AbortSignal.timeout(opts.timeoutMs ?? 30000), headers: { 'user-agent': 'PaperTrail/0.1 (hackathon)' } })
      })
      const body = await res.text()
      trace('api', { api, url: key, cached: false, status: res.status, ms: Date.now() - t0, bytes: body.length, attempt, raw: res.ok ? `data/raw/${api}/${hash}.json.gz` : undefined, error: res.ok ? undefined : body.slice(0, 200) })
      if (res.status === 429 || res.status >= 500) {
        lastErr = new HttpError(res.status, key, body)
        const ra = Number(res.headers.get('retry-after'))
        if (res.status === 429 && ((Number.isFinite(ra) && ra > 60) || /insufficient budget/i.test(body))) {
          // daily budget ("Resets at midnight UTC"): closed until then; otherwise Retry-After, capped at 1 h
          const midnight = /midnight utc/i.test(body) ? (() => { const d = new Date(); d.setUTCHours(24, 0, 0, 0); return d.getTime() })() : 0
          const was = isBlocked(api)
          blockedUntil[api] = Math.max(blockedUntil[api] ?? 0, midnight || Date.now() + Math.min(Number.isFinite(ra) && ra > 0 ? ra : 3600, 3600) * 1000)
          if (!was) trace('api', { api, breaker: 'opened', until: new Date(blockedUntil[api]).toISOString(), url: key, reason: body.slice(0, 200) })
          throw lastErr
        }
        if (res.status === 429) gate.cool(1000)
        await sleep(Number.isFinite(ra) && ra > 0 ? Math.min(ra, 10) * 1000 : 800 * 2 ** attempt)
        continue
      }
      if (!res.ok) throw new HttpError(res.status, key, body)
      const env = { url: key, status: res.status, body, fetchedAt: new Date().toISOString() }
      mkdirSync(dir, { recursive: true })
      writeFileSync(file, gzipSync(JSON.stringify(env)))
      return { ...env, hash, cached: false }
    } catch (e) {
      if (!(e instanceof HttpError)) trace('api', { api, url: key, cached: false, attempt, error: String((e as Error)?.message ?? e).slice(0, 200) })
      if (e instanceof HttpError && ((e.status < 500 && e.status !== 429) || isBlocked(api))) throw e
      lastErr = e
      await sleep(800 * 2 ** attempt)
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr))
}

export async function cachedJson<T = any>(api: string, url: string, opts?: { timeoutMs?: number }): Promise<{ data: T; hash: string; url: string }> {
  const r = await cachedGet(api, url, opts)
  return { data: JSON.parse(r.body) as T, hash: r.hash, url: r.url }
}

/** Runs fn over items with at most `n` in flight. */
export async function mapLimit<T, R>(items: T[], n: number, fn: (t: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i], i) }
  }))
  return out
}
