import { describe, expect, it, vi } from 'vitest'

// #35: upstream and parser text stays in the server log; the app's own known causes keep their message.
vi.mock('../library/seed-import', async orig => ({ ...(await orig<typeof import('../library/seed-import')>()), parseSeedPdf: vi.fn() }))
vi.mock('../sources/openalex', async orig => ({ ...(await orig<typeof import('../sources/openalex')>()), getWork: vi.fn(async () => { throw new Error('HTTP 500 for https://api.openalex.org/works/x: UPSTREAM-LEAK') }) }))

import { library } from './library'
import { runs } from './runs'
import { parseSeedPdf } from '../library/seed-import'
import { PdfBusyError, PdfTimeoutError } from '../security/pdf-worker'

const upload = () => {
  const form = new FormData()
  form.set('file', new File([new Uint8Array([1, 2, 3])], 'slow.pdf', { type: 'application/pdf' }))
  return library.request('/seeds/import', { method: 'POST', body: form })
}

describe('seed import errors', () => {
  it('a PDF timeout keeps its own message and gets seed_timeout', async () => {
    vi.mocked(parseSeedPdf).mockRejectedValueOnce(new PdfTimeoutError())
    const r = await upload()
    expect(r.status).toBe(422)
    expect(await r.json()).toEqual({ error: 'PDF parsing timed out', code: 'seed_timeout' })
  })
  it('busy keeps its message and gets pdf_busy', async () => {
    vi.mocked(parseSeedPdf).mockRejectedValueOnce(new PdfBusyError())
    const r = await upload()
    expect(r.status).toBe(503)
    expect(await r.json()).toMatchObject({ code: 'pdf_busy' })
  })
  it('anything else is generic', async () => {
    vi.mocked(parseSeedPdf).mockRejectedValueOnce(new Error('pdfjs: InvalidPDFException internals'))
    const r = await upload()
    expect(await r.json()).toEqual({ error: 'Could not read slow.pdf.', code: 'seed_unreadable' })
  })
})

describe('papers route', () => {
  it('an upstream failure is a generic 502 with a code', async () => {
    const r = await runs.request('/papers/10.1234%2Fupstream-test', { headers: { 'sec-fetch-site': 'same-origin' } })
    expect(r.status).toBe(502)
    const text = await r.text()
    expect(text).not.toContain('UPSTREAM-LEAK')
    expect(JSON.parse(text)).toEqual({ error: 'The source did not answer; try again later.', code: 'upstream_error' })
  })
})
