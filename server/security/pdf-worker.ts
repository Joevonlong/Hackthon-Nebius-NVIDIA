// PDF text extraction in a worker thread with a deadline (#12): a malformed or huge PDF can't block the event loop
// (so /api/health stays up) and is killed when the deadline passes.
import { Worker } from 'node:worker_threads'

// CommonJS source run via `eval: true`, so it works from tsx, vitest and the tsup bundle alike (unpdf resolves from cwd/node_modules).
const PDF_WORKER_SOURCE = `
const { parentPort, workerData } = require('node:worker_threads')
;(async () => {
  const { getDocumentProxy, extractText } = await import('unpdf')
  const pdf = await getDocumentProxy(new Uint8Array(workerData.bytes))
  const { text } = await extractText(pdf, { mergePages: false })
  parentPort.postMessage({ pages: (Array.isArray(text) ? text : [text]).slice(0, workerData.maxPages) })
})().catch(e => parentPort.postMessage({ error: String((e && e.message) || e) }))
`

export const PDF_DEADLINE_MS = 20_000

/** Text of the first `maxPages` pages; rejects on a parse error or when the deadline passes. `source` is overridable for tests. */
export function extractPdfPages(bytes: Uint8Array, opts: { maxPages?: number; deadlineMs?: number; source?: string } = {}): Promise<string[]> {
  const copy = bytes.slice() // own buffer, transferred to the worker; the caller's stays usable
  return new Promise((resolve, reject) => {
    const worker = new Worker(opts.source ?? PDF_WORKER_SOURCE, {
      eval: true,
      workerData: { bytes: copy.buffer, maxPages: opts.maxPages ?? 2 },
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
