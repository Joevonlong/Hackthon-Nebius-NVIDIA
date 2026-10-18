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
  pubmed: new Gate(1, 350), // ≤3 req/s without an NCBI key
  europepmc: new Gate(4, 100),
}

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
  const gate = gates[api] ?? gates.openalex
  const retries = opts.retries ?? 4
  let lastErr: unknown
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const t0 = Date.now()
      const res = await gate.run(() => fetch(url, { signal: AbortSignal.timeout(opts.timeoutMs ?? 30000), headers: { 'user-agent': 'PaperTrail/0.1 (hackathon)' } }))
      const body = await res.text()
      trace('api', { api, url: key, cached: false, status: res.status, ms: Date.now() - t0, bytes: body.length, attempt, raw: res.ok ? `data/raw/${api}/${hash}.json.gz` : undefined, error: res.ok ? undefined : body.slice(0, 200) })
      if (res.status === 429 || res.status >= 500) {
        lastErr = new HttpError(res.status, key, body)
        const ra = Number(res.headers.get('retry-after'))
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
      if (e instanceof HttpError && e.status < 500 && e.status !== 429) throw e
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
