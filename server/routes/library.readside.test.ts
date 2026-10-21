import { mkdtempSync, mkdirSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { library } from './library'
import { runs } from './runs'
import { listNotes } from '../library/workspace'

vi.mock('../sources/openalex', async orig => ({ ...(await orig<typeof import('../sources/openalex')>()), getWork: vi.fn(async () => null) }))

// Issue #41: read-side symlink containment, single decode of the question id, no cross-site side effects on GET /papers/:id.
let ws: string; let outside: string; let prev: string | undefined
beforeAll(() => {
  prev = process.env.WORKSPACE_DIR
  ws = mkdtempSync(join(tmpdir(), 'pt-read-'))
  outside = mkdtempSync(join(tmpdir(), 'pt-outside-'))
  process.env.WORKSPACE_DIR = ws
  writeFileSync(join(outside, 'secret.md'), 'outside text')
  mkdirSync(join(outside, 'dir'))
  writeFileSync(join(outside, 'dir', 'inner.md'), 'outside folder text')
  mkdirSync(join(ws, 'Q', 'notes'), { recursive: true })
  writeFileSync(join(ws, 'Q', 'Question.md'), '# Q\n\nq')
  writeFileSync(join(ws, 'Q', 'notes', 'real.md'), 'inside')
  writeFileSync(join(ws, 'Q', 'notes', 'target.md'), 'linked inside')
  symlinkSync(join(ws, 'Q', 'notes', 'target.md'), join(ws, 'Q', 'notes', 'link-in.md'))
  symlinkSync(join(outside, 'secret.md'), join(ws, 'Q', 'notes', 'link-out.md'))
  symlinkSync(join(outside, 'dir'), join(ws, 'Q', 'notes', 'dir-out'))
  symlinkSync(join(ws, 'Q'), join(ws, 'Q', 'notes', 'loop'))
})
afterAll(() => { if (prev === undefined) delete process.env.WORKSPACE_DIR; else process.env.WORKSPACE_DIR = prev })
const json = { 'content-type': 'application/json' }

describe('read-side containment', () => {
  it('lists links that stay inside the workspace and skips links that lead outside', () => {
    const paths = listNotes('Q')!.map(n => n.path).sort()
    expect(paths).toEqual(['Question.md', 'notes/link-in.md', 'notes/real.md', 'notes/target.md'])
    expect(listNotes('Q')!.find(n => n.path === 'notes/link-in.md')!.content).toBe('linked inside')
  })
  it('refuses to read a link that leads outside (409), still reads one inside', async () => {
    const bad = await library.request('/questions/Q/notes/notes%2Flink-out.md', { method: 'PUT', headers: { ...json, 'if-match': '"x:1"' }, body: JSON.stringify({ content: 'y' }) })
    expect(bad.status).toBe(409)
    expect((await bad.json()).code).toBe('symlink_outside_workspace')
    const ok = await library.request('/questions/Q/notes/notes%2Flink-in.md', { method: 'PUT', headers: { ...json, 'if-match': '"x:1"' }, body: JSON.stringify({ content: 'y' }) })
    expect(ok.status).toBe(412) // reached the precondition read; hash differs
    expect((await ok.json()).content).toBe('linked inside')
  })
})

describe('question id is decoded once', () => {
  it('a folder named with %xx text resolves to itself, not to another folder', async () => {
    for (const name of ['a%41', '%2e%2e']) {
      mkdirSync(join(ws, name), { recursive: true })
      writeFileSync(join(ws, name, 'Question.md'), '# T\n\nliteral ' + name)
    }
    mkdirSync(join(ws, 'aA')); writeFileSync(join(ws, 'aA', 'Question.md'), '# T\n\nother folder')
    for (const name of ['a%41', '%2e%2e']) {
      const r = await library.request(`/questions/${encodeURIComponent(name)}/notes`)
      expect(r.status).toBe(200)
      expect(((await r.json()).notes as { content: string }[])[0].content).toContain('literal ' + name)
    }
  })
  it('traversal stays impossible', async () => {
    const r = await library.request('/questions/%2e%2e/notes')
    expect(r.status).toBe(404)
    expect((await library.request('/questions/..%2F..%2Fx/notes')).status).toBe(404)
  })
})

describe('GET /papers/:id side effects', () => {
  const get = (h: Record<string, string>) => runs.request('/papers/10.1234%2Fabc', { headers: h })
  it('refuses a cross-site request before any upstream call', async () => {
    expect((await get({ 'sec-fetch-site': 'cross-site' })).status).toBe(403)
    expect((await get({ 'sec-fetch-site': 'same-site' })).status).toBe(403)
  })
  it('lets a same-origin request (or a client without the header) through', async () => {
    expect((await get({ 'sec-fetch-site': 'same-origin' })).status).toBe(404) // reached the lookup; nothing found
    expect((await get({})).status).toBe(404)
  })
})
