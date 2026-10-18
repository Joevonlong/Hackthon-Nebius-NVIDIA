// Shared Token Factory plumbing: concurrency limiter, timeout, 429 / 5xx retry, JSON helpers.
// Never throws to callers of tf*(): returns null on any failure (callers degrade to null / []).
import { env } from '../env'
import { clip, trace } from '../trace'

export const hasKey = () => !!env.tokenFactoryKey
export const baseUrl = () => env.tokenFactoryBaseUrl.replace(/\/+$/, '') + '/'

/** Small promise limiter (FIFO). */
export function createLimiter(max: number) {
  let active = 0
  const queue: (() => void)[] = []
  const next = () => {
    if (active >= max || !queue.length) return
    active++
    queue.shift()!()
  }
  return async function run<T>(fn: () => Promise<T>): Promise<T> {
    await new Promise<void>(res => { queue.push(res); next() })
    try { return await fn() } finally { active--; next() }
  }
}

/** One limiter for every Token Factory call in the process. */
export const tfLimit = createLimiter(Number(env.raw.TF_MAX_CONCURRENCY || 12))

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

export function retryAfterMs(h: string | null, attempt: number): number {
  if (h) {
    const s = Number(h)
    if (!Number.isNaN(s)) return Math.min(s * 1000, 10_000)
    const d = Date.parse(h)
    if (!Number.isNaN(d)) return Math.min(Math.max(d - Date.now(), 0), 10_000)
  }
  return Math.min(500 * 2 ** attempt, 8000) + Math.random() * 250
}

export interface TfError { status: number; body: string }
export let lastError: TfError | null = null

/**
 * POST/GET to Token Factory with a hard deadline (timeoutMs covers queueing + retries).
 * Retries 429 (honouring Retry-After) and 5xx up to 3 times. Returns parsed JSON or null.
 */
export async function tfFetch<T = any>(path: string, body: unknown | undefined, timeoutMs: number, opts: { method?: string; err?: TfError } = {}): Promise<T | null> {
  const setErr = (e: TfError) => { lastError = e; if (opts.err) Object.assign(opts.err, e) }
  if (!hasKey()) return null
  const deadline = Date.now() + timeoutMs
  return tfLimit(async () => {
    for (let attempt = 0; attempt < 4; attempt++) {
      const left = deadline - Date.now()
      if (left <= 50) { setErr({ status: 0, body: 'timeout' }); return null }
      try {
        const t0 = Date.now()
        const res = await fetch(baseUrl() + path.replace(/^\//, ''), {
          method: opts.method || (body === undefined ? 'GET' : 'POST'),
          headers: { Authorization: `Bearer ${env.tokenFactoryKey}`, 'Content-Type': 'application/json' },
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: AbortSignal.timeout(left),
        })
        if (res.ok) { const json = (await res.json()) as T; traceTf(path, body, json, res.status, Date.now() - t0, attempt); return json }
        const text = (await res.text().catch(() => '')).slice(0, 500)
        traceTf(path, body, null, res.status, Date.now() - t0, attempt, text)
        setErr({ status: res.status, body: text })
        if (res.status === 429 || res.status >= 500) {
          const wait = retryAfterMs(res.headers.get('retry-after'), attempt)
          if (Date.now() + wait >= deadline) return null
          await sleep(wait)
          continue
        }
        return null // 4xx: not retryable
      } catch (e: any) {
        setErr({ status: 0, body: String(e?.name === 'TimeoutError' ? 'timeout' : e?.message || e).slice(0, 300) })
        if (e?.name === 'TimeoutError' || e?.name === 'AbortError') return null
        if (attempt >= 1) return null
        await sleep(300)
      }
    }
    return null
  })
}

/** Logs one Token Factory call with a readable request/response summary (never the key). */
function traceTf(path: string, body: any, json: any, status: number, ms: number, attempt: number, error?: string) {
  const rec: Record<string, unknown> = { endpoint: path, model: body?.model, status, ms, attempt }
  if (error) rec.error = error.slice(0, 300)
  if (Array.isArray(body?.messages)) {
    const sys = body.messages.find((m: any) => m.role === 'system')?.content
    const user = [...body.messages].reverse().find((m: any) => m.role === 'user')?.content
    if (sys) rec.system = clip(sys, 300)
    rec.prompt = clip(user, 1500)
    if (body.tools) rec.tools = body.tools.map((t: any) => t?.function?.name).filter(Boolean)
    if (body.response_format) rec.format = body.response_format.type
    const msg = json?.choices?.[0]?.message
    if (msg) {
      rec.response = clip(msg.content ?? '', 2000)
      if (msg.tool_calls?.length) rec.toolCalls = msg.tool_calls.map((c: any) => ({ name: c.function?.name, args: clip(c.function?.arguments, 300) }))
    }
    if (json?.usage) rec.usage = json.usage
  } else if (body?.input !== undefined) {
    const inputs = Array.isArray(body.input) ? body.input : [body.input]
    rec.inputs = inputs.length
    rec.firstInput = clip(inputs[0], 200)
    if (json?.data?.length) rec.vectors = `${json.data.length}×${json.data[0]?.embedding?.length ?? '?'}`
    if (json?.usage) rec.usage = json.usage
  } else if (body?.query !== undefined) {
    rec.query = clip(body.query, 300); rec.documents = body.documents?.length
    if (json?.results) rec.results = json.results.slice(0, 10)
  } else if (json?.data) rec.count = json.data.length
  trace('llm', rec)
}

/** Remove <think>…</think> blocks (and a dangling unterminated <think> prefix). */
export function stripThink(s: string): string {
  let out = s.replace(/<think>[\s\S]*?<\/think>/gi, '')
  // Some reasoning models emit only the closing tag (prompt opened <think> for them).
  const close = out.toLowerCase().lastIndexOf('</think>')
  if (close >= 0) out = out.slice(close + '</think>'.length)
  const open = out.toLowerCase().indexOf('<think>')
  if (open >= 0) out = out.slice(0, open)
  return out.trim()
}

/** Parse the first JSON object in a model reply (handles <think>, ```json fences, prose around it). */
export function parseJsonLoose(raw: string | null | undefined): any | null {
  if (!raw) return null
  let s = stripThink(raw)
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) s = fence[1]
  try { return JSON.parse(s) } catch { /* fall through */ }
  const start = s.indexOf('{')
  if (start < 0) return null
  // balanced-brace scan, string aware
  let depth = 0, inStr = false, esc = false
  for (let i = start; i < s.length; i++) {
    const c = s[i]
    if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue }
    if (c === '"') inStr = true
    else if (c === '{') depth++
    else if (c === '}' && --depth === 0) {
      try { return JSON.parse(s.slice(start, i + 1)) } catch { return null }
    }
  }
  return null
}

export interface ChatOpts {
  model: string
  system?: string
  user: string
  temperature?: number
  maxTokens?: number
  schema?: { name: string; schema: Record<string, unknown> }
  timeoutMs: number
  /** Rejects parsed-but-useless output (e.g. Nemotron's `{"queries": [">>>"]}`); triggers the fallback model. */
  validate?: (data: any) => boolean
  /** Asked once, inside the same deadline, when the primary model fails or `validate` rejects its output. */
  fallbackModel?: string
}

/** Extra body params that switch off reasoning traces on Nemotron / Qwen3 chat templates. */
export const noThinkParams = () => (env.raw.TF_NO_THINK === '0' ? {} : { chat_template_kwargs: { enable_thinking: false } })

/** One model, json_schema then json_object. Returns the message content (think-stripped) or null. */
async function chatOnce(o: ChatOpts, model: string, timeoutMs: number): Promise<{ data: any; raw: string } | null> {
  const messages = [
    ...(o.system ? [{ role: 'system', content: o.system }] : []),
    { role: 'user', content: o.user },
  ]
  const base = { model, messages, temperature: o.temperature ?? 0, max_tokens: o.maxTokens ?? 800, ...noThinkParams() }
  const formats: any[] = o.schema
    ? [{ type: 'json_schema', json_schema: { name: o.schema.name, schema: o.schema.schema, strict: true } }, { type: 'json_object' }]
    : [{ type: 'json_object' }]
  for (const response_format of formats) {
    const err: TfError = { status: 0, body: '' }
    const res = await tfFetch<any>('chat/completions', { ...base, response_format }, timeoutMs, { err })
    if (!res) {
      if (err.status >= 400 && err.status < 500 && err.status !== 429) continue // format unsupported: try next
      return null
    }
    const msg = res?.choices?.[0]?.message
    const raw: string = msg?.content ?? ''
    const data = parseJsonLoose(raw)
    if (data) return { data, raw }
    return { data: null, raw }
  }
  return null
}

/**
 * Chat completion returning parsed JSON. Falls back from json_schema to json_object, and from
 * `model` to `fallbackModel` (once) when the reply is missing, unparseable or rejected by `validate`.
 * `model` in the result names the model whose answer is returned.
 */
export async function chatJson(o: ChatOpts): Promise<{ data: any; raw: string; model: string } | null> {
  const deadline = Date.now() + o.timeoutMs
  const ok = (r: { data: any } | null) => !!r?.data && (!o.validate || safeValidate(o.validate, r.data))
  const first = await chatOnce(o, o.model, o.timeoutMs)
  if (ok(first) || !o.fallbackModel || o.fallbackModel === o.model) return first && { ...first, model: o.model }
  const left = deadline - Date.now()
  if (left < 1000) return first && { ...first, model: o.model }
  trace('llm', { endpoint: 'fallback', model: o.fallbackModel, from: o.model, reason: first ? `rejected output: ${clip(first.raw, 200)}` : (lastError ? `${lastError.status} ${clip(lastError.body, 200)}` : 'no reply') })
  const second = await chatOnce(o, o.fallbackModel, left)
  if (ok(second)) return { ...second!, model: o.fallbackModel }
  return first && { ...first, model: o.model }
}

function safeValidate(v: (d: any) => boolean, d: any): boolean {
  try { return v(d) } catch { return false }
}

const modelIds = new Map<string, Promise<Set<string> | null>>()

/** Whether Token Factory lists `id` in GET /models (cached per process; null = list unavailable). */
export async function modelListed(id: string): Promise<boolean | null> {
  if (!hasKey()) return null
  if (!modelIds.has('all')) {
    modelIds.set('all', tfFetch<any>('models', undefined, 15000).then(r => (Array.isArray(r?.data) ? new Set<string>(r.data.map((m: any) => String(m?.id))) : null)))
  }
  const ids = await modelIds.get('all')!
  if (!ids) { modelIds.delete('all'); return null } // retry the list next time
  return ids.has(id)
}
