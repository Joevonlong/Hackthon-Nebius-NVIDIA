// Run tracing (captain-owned). Every outbound call and every intermediate result is appended as JSON lines:
//   ${LOG_DIR:-./logs}/runs/<runId>/<channel>.jsonl   when inside a run
//   ${LOG_DIR:-./logs}/server/<channel>.jsonl         otherwise (e.g. seed preview, smoke tests)
// Channels: api (OpenAlex / PubMed / Europe PMC HTTP), llm (Token Factory), tavily, events (RunEvents),
//           papers (every candidate + seed), relations (every edge: cites / cited_by_seed / pubmed_similar / query / web).
// At the end of a run, summary.md is written next to them. Secrets never reach the logs (URLs are scrubbed).
// LOG_PROMPTS=metadata: the llm and chat channels keep model, timing, status, token usage and sizes, but no prompt,
//   response, query or reply text (those fields become { chars: n }). Unset or `full` keeps the text, for debugging.
import { AsyncLocalStorage } from 'node:async_hooks'
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const als = new AsyncLocalStorage<{ runId: string }>()
const SECRET_PARAMS = /([?&](?:api_key|apikey|key|token|mailto|email)=)[^&]*/gi

export const logRoot = () => resolve(process.env.LOG_DIR || './logs')
export const runLogDir = (runId: string) => join(logRoot(), 'runs', runId)
export const currentRunId = () => als.getStore()?.runId
export const scrubUrl = (url: string) => url.replace(SECRET_PARAMS, '$1***')

/** Runs fn with runId as the trace context for everything it awaits. */
export function withRun<T>(runId: string, fn: () => Promise<T>): Promise<T> {
  return als.run({ runId }, fn)
}

/** Fields of the llm / chat channels that hold prompt or response text (or text derived from it). */
const TEXT_FIELDS = new Set(['system', 'prompt', 'response', 'firstInput', 'query', 'reply', 'reason', 'error', 'proposal', 'kindQuestion', 'toolCalls'])
const metadataOnly = () => process.env.LOG_PROMPTS === 'metadata'

/** LOG_PROMPTS=metadata: replace text fields by their size. Exported for tests. */
export function redactText(channel: string, rec: Record<string, unknown>): Record<string, unknown> {
  if (!metadataOnly() || (channel !== 'llm' && channel !== 'chat')) return rec
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(rec)) {
    if (!TEXT_FIELDS.has(k) || v == null) out[k] = v
    else out[k] = { chars: (typeof v === 'string' ? v : JSON.stringify(v)).length }
  }
  return out
}

const quiet = () => process.env.TRACE_CONSOLE === '0'
const ensured = new Set<string>()

export function trace(channel: string, rec: Record<string, unknown>, runId = currentRunId()): void {
  try {
    rec = redactText(channel, rec)
    const dir = runId ? runLogDir(runId) : join(logRoot(), 'server')
    if (!ensured.has(dir)) { mkdirSync(dir, { recursive: true }); ensured.add(dir) }
    appendFileSync(join(dir, `${channel}.jsonl`), JSON.stringify({ t: new Date().toISOString(), ...rec }) + '\n')
    if (!quiet()) console.log(`[trace${runId ? ' ' + runId.slice(0, 8) : ''}] ${channel} ${oneLine(rec)}`)
  } catch { /* logging must never break a run */ }
}

export function writeRunFile(runId: string, name: string, content: string): void {
  try { const dir = runLogDir(runId); mkdirSync(dir, { recursive: true }); writeFileSync(join(dir, name), content) } catch { /* ignore */ }
}

export const clip = (s: unknown, n = 600) => { const t = typeof s === 'string' ? s : JSON.stringify(s ?? null); return t.length > n ? t.slice(0, n) + `… (+${t.length - n} chars)` : t }

function oneLine(rec: Record<string, unknown>): string {
  const pick = ['api', 'endpoint', 'model', 'type', 'stage', 'status', 'cached', 'ms', 'url', 'query', 'count', 'kind', 'title']
  return pick.filter(k => rec[k] !== undefined).map(k => `${k}=${clip(rec[k], 90)}`).join(' ')
}
