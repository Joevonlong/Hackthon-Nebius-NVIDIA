// PDF text extraction in a worker thread with a deadline (#12): a malformed or huge PDF can't block the event loop
// (so /api/health stays up) and is killed when the deadline passes.
import { Worker } from 'node:worker_threads'

// CommonJS source run via `eval: true`, so it works from tsx, vitest and the tsup bundle alike (unpdf's URL is resolved in the parent, so the cwd doesn't matter).
const PDF_WORKER_SOURCE = `
const { parentPort, workerData } = require('node:worker_threads')
;(async () => {
  const { getDocumentProxy, extractText } = await import(workerData.unpdf)
  const pdf = await getDocumentProxy(new Uint8Array(workerData.bytes))
  const { text } = await extractText(pdf, { mergePages: false })
  parentPort.postMessage({ pages: (Array.isArray(text) ? text : [text]).slice(0, workerData.maxPages) })
})().catch(e => parentPort.postMessage({ error: String((e && e.message) || e) }))
`

export const PDF_DEADLINE_MS = 20_000
const MAX_WORKERS = 2
let running = 0
const waiting: Array<() => void> = []
async function slot<T>(fn: () => Promise<T>): Promise<T> {
  if (running >= MAX_WORKERS) await new Promise<void>(r => waiting.push(r))
  running++
  try { return await fn() } finally { running--; waiting.shift()?.() }
}
function unpdfUrl(): string {
  try { return import.meta.resolve('unpdf') } catch { return 'unpdf' }
}

/** Text of the first `maxPages` pages; rejects on a parse error or when the deadline passes. `source` is overridable for tests. */
export function extractPdfPages(bytes: Uint8Array, opts: { maxPages?: number; deadlineMs?: number; source?: string } = {}): Promise<string[]> {
  return slot(() => runWorker(bytes, opts)) // at most MAX_WORKERS parse at once; the rest queue
}

function runWorker(bytes: Uint8Array, opts: { maxPages?: number; deadlineMs?: number; source?: string }): Promise<string[]> {
  const copy = bytes.slice() // own buffer, transferred to the worker; the caller's stays usable
  return new Promise((resolve, reject) => {
    const worker = new Worker(opts.source ?? PDF_WORKER_SOURCE, {
      eval: true,
      workerData: { bytes: copy.buffer, maxPages: opts.maxPages ?? 2, unpdf: unpdfUrl() },
      transferList: [copy.buffer],
      resourceLimits: { maxOldGenerationSizeMb: 512 },
    })
    let finished = false
    const done = (fn: () => void) => { if (finished) return; finished = true; clearTimeout(timer); void worker.terminate(); fn() }
    const timer = setTimeout(() => done(() => reject(new Error('PDF parsing timed out'))), opts.deadlineMs ?? PDF_DEADLINE_MS)
    worker.once('message', (m: { pages?: string[]; error?: string }) => done(() => (m.pages ? resolve(m.pages) : reject(new Error(m.error ?? 'PDF parse failed')))))
    worker.once('error', e => done(() => reject(e)))
    worker.once('exit', code => done(() => reject(new Error(`PDF worker exited (${code})`))))
  })
}
