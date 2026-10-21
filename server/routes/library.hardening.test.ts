import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { library } from './library'

// Issue #35: note paths for a question folder named "notes", read-only export GET, generic errors.
let dir: string; let prev: string | undefined
const libId = 'lib_hardening_test'
beforeAll(() => {
  prev = process.env.WORKSPACE_DIR
  dir = mkdtempSync(join(tmpdir(), 'pt-hard-'))
  process.env.WORKSPACE_DIR = dir
  mkdirSync(join(dir, 'notes'), { recursive: true })
  writeFileSync(join(dir, 'notes', 'Question.md'), 'q')
  const ld = join(process.env.DATA_DIR!, 'library', libId)
  mkdirSync(ld, { recursive: true })
  writeFileSync(join(ld, 'library.json'), JSON.stringify({ libraryId: libId, questionId: 'notes', request: {} }))
})
afterAll(() => { if (prev === undefined) delete process.env.WORKSPACE_DIR; else process.env.WORKSPACE_DIR = prev })
const json = { 'content-type': 'application/json' }
const put = (p: string, content = 'x') => library.request(p, { method: 'PUT', headers: json, body: JSON.stringify({ content }) })

describe('note paths', () => {
  it('a question folder named "notes": PUT and DELETE hit the right file', async () => {
    expect((await put('/questions/notes/notes/a.md', 'one')).status).toBe(200)
    expect(readFileSync(join(dir, 'notes', 'a.md'), 'utf8')).toBe('one')
    expect(existsSync(join(dir, 'notes', 'notes', 'a.md'))).toBe(false)
    expect((await library.request('/questions/notes/notes/a.md', { method: 'DELETE' })).status).toBe(200)
    expect(existsSync(join(dir, 'notes', 'a.md'))).toBe(false)
  })
  it('an encoded note path still decodes, and a malformed escape is a 400 (not a 500)', async () => {
    expect((await put('/questions/notes/notes/S1%20Tirosh.md')).status).toBe(200)
    expect(existsSync(join(dir, 'notes', 'S1 Tirosh.md'))).toBe(true)
    expect((await put('/questions/notes/notes/%E0%A4%A.md')).status).toBe(400)
  })
})

describe('export route', () => {
  it('GET returns the library and writes nothing to the question folder', async () => {
    const r = await library.request(`/library/${libId}/export`)
    expect(r.status).toBe(200)
    expect(existsSync(join(dir, 'notes', 'exports'))).toBe(false)
  })
})

describe('error responses', () => {
  it('a file that fails to parse gets a generic message and a code, not the parser text', async () => {
    const form = new FormData()
    form.set('file', new File([new Uint8Array([1, 2, 3, 4])], 'broken.pdf', { type: 'application/pdf' }))
    const r = await library.request('/seeds/import', { method: 'POST', body: form })
    expect(r.status).toBe(422)
    const body = await r.json() as { error: string; code: string }
    expect(body.code).toBe('seed_unreadable')
    expect(body.error).toBe('Could not read broken.pdf.')
  })
})
