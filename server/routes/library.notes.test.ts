import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { library, noteHash } from './library'
import { hashText } from '../../client/src/stores/vault'

// Issue #13: conditional note writes (If-Match / If-None-Match) so a stale browser never overwrites a file changed elsewhere.
let dir: string; let prev: string | undefined
beforeAll(() => {
  prev = process.env.WORKSPACE_DIR
  dir = mkdtempSync(join(tmpdir(), 'pt-notes-'))
  process.env.WORKSPACE_DIR = dir
  mkdirSync(join(dir, 'Q', 'notes'), { recursive: true })
  writeFileSync(join(dir, 'Q', 'Question.md'), 'q')
})
afterAll(() => { if (prev === undefined) delete process.env.WORKSPACE_DIR; else process.env.WORKSPACE_DIR = prev })

const url = '/questions/Q/notes/notes/a.md'
const send = (method: string, content: string | null, headers: Record<string, string> = {}) =>
  library.request(url, { method, headers: { 'content-type': 'application/json', ...headers }, body: content === null ? undefined : JSON.stringify({ content }) })
const file = () => join(dir, 'Q', 'notes', 'a.md')

describe('conditional note writes', () => {
  it('uses the same hash as the client', () => {
    for (const s of ['', 'abc', '# Ünïcödé 研究 🧬\n\nbody']) expect(noteHash(s)).toBe(hashText(s))
  })

  it('no header: the write goes through (older clients)', async () => {
    expect((await send('PUT', 'v1')).status).toBe(200)
    expect(readFileSync(file(), 'utf8')).toBe('v1')
  })

  it('a matching If-Match writes; a stale one gets 412 with the current content and changes nothing', async () => {
    expect((await send('PUT', 'v2', { 'if-match': `"${noteHash('v1')}"` })).status).toBe(200)
    const r = await send('PUT', 'v3', { 'if-match': `"${noteHash('v1')}"` }) // v1 is stale now
    expect(r.status).toBe(412)
    expect(await r.json()).toMatchObject({ content: 'v2', hash: noteHash('v2') })
    expect(readFileSync(file(), 'utf8')).toBe('v2')
  })

  it('If-None-Match: * only creates a file that does not exist yet', async () => {
    expect((await send('PUT', 'x', { 'if-none-match': '*' })).status).toBe(412)
    expect(readFileSync(file(), 'utf8')).toBe('v2')
    expect((await library.request('/questions/Q/notes/notes/new.md', { method: 'PUT', headers: { 'content-type': 'application/json', 'if-none-match': '*' }, body: JSON.stringify({ content: 'n' }) })).status).toBe(200)
  })

  it('DELETE with a stale If-Match is refused; a matching one deletes; no header deletes', async () => {
    expect((await send('DELETE', null, { 'if-match': `"${noteHash('old')}"` })).status).toBe(412)
    expect(existsSync(file())).toBe(true)
    expect((await send('DELETE', null, { 'if-match': `"${noteHash('v2')}"` })).status).toBe(200)
    expect(existsSync(file())).toBe(false)
    await send('PUT', 'again')
    expect((await send('DELETE', null)).status).toBe(200)
  })
})
