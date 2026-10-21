import { afterEach, describe, expect, it } from 'vitest'
import { mkdirSync, chmodSync, existsSync, lstatSync, mkdtempSync, readFileSync, readdirSync, statSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SymlinkOutsideError, atomicHooks, atomicWriteFileSync, atomicWriteJsonSync } from './atomic'

afterEach(() => { atomicHooks.beforeRename = null })

describe('atomic writes', () => {
  it('replaces the file and leaves no temp file behind', () => {
    const dir = mkdtempSync(join(tmpdir(), 'atomic-'))
    const f = join(dir, 'a', 'note.md') // creates the folder
    atomicWriteFileSync(f, 'one')
    atomicWriteFileSync(f, 'two ✓')
    expect(readFileSync(f, 'utf8')).toBe('two ✓')
    expect(readdirSync(join(dir, 'a'))).toEqual(['note.md'])
    atomicWriteJsonSync(join(dir, 'x.json'), { a: 1 })
    expect(JSON.parse(readFileSync(join(dir, 'x.json'), 'utf8'))).toEqual({ a: 1 })
  })

  it('a failure between write and rename leaves the previous file intact and cleans up', () => {
    const dir = mkdtempSync(join(tmpdir(), 'atomic-'))
    const f = join(dir, 'library.json')
    writeFileSync(f, '{"old":true}')
    atomicHooks.beforeRename = (tmp) => { expect(readFileSync(tmp, 'utf8')).toBe('{"new":true}'); throw new Error('crash before rename') }
    expect(() => atomicWriteFileSync(f, '{"new":true}')).toThrow('crash before rename')
    expect(readFileSync(f, 'utf8')).toBe('{"old":true}')
    expect(readdirSync(dir)).toEqual(['library.json'])
    expect(existsSync(join(dir, 'never'))).toBe(false)
  })

  it('keeps the permissions of the file it replaces', () => {
    const dir = mkdtempSync(join(tmpdir(), 'atomic-'))
    const f = join(dir, 'private.md')
    writeFileSync(f, 'a'); chmodSync(f, 0o600)
    atomicWriteFileSync(f, 'b')
    expect(statSync(f).mode & 0o777).toBe(0o600)
  })

  it('writes through a symlink that stays inside the workspace instead of replacing the link', () => {
    const dir = mkdtempSync(join(tmpdir(), 'atomic-'))
    process.env.WORKSPACE_DIR = dir
    const real = join(dir, 'real.md'); const link = join(dir, 'link.md')
    writeFileSync(real, 'old'); symlinkSync(real, link)
    atomicWriteFileSync(link, 'new')
    expect(lstatSync(link).isSymbolicLink()).toBe(true)
    expect(readFileSync(real, 'utf8')).toBe('new')
  })

  it('removes stale temp files of its own naming from a crash, and nothing else', () => {
    const dir = mkdtempSync(join(tmpdir(), 'atomic-'))
    const stale = join(dir, '.note.md.123.deadbeef.tmp'); const fresh = join(dir, '.other.md.123.cafebabe.tmp'); const foreign = join(dir, '.keep.tmp')
    for (const f of [stale, fresh, foreign]) writeFileSync(f, 'x')
    const old = new Date(Date.now() - 2 * 3600_000)
    utimesSync(stale, old, old); utimesSync(foreign, old, old)
    atomicWriteFileSync(join(dir, 'note.md'), 'y')
    expect(readdirSync(dir).sort()).toEqual(['.keep.tmp', '.other.md.123.cafebabe.tmp', 'note.md'])
  })

  it('refuses a symlink to a file outside the folders and leaves the outside folder untouched', () => {
    const ws = mkdtempSync(join(tmpdir(), 'atomic-ws-')); const outside = mkdtempSync(join(tmpdir(), 'atomic-out-'))
    process.env.WORKSPACE_DIR = ws
    const secret = join(outside, 'bashrc'); writeFileSync(secret, 'keep me'); chmodSync(secret, 0o640)
    const stale = join(outside, '.x.md.1.deadbeef.tmp'); writeFileSync(stale, 'x'); utimesSync(stale, new Date(0), new Date(0))
    const link = join(ws, 'x.md'); symlinkSync(secret, link)
    let err: unknown
    try { atomicWriteFileSync(link, 'pwned') } catch (e) { err = e }
    expect(err).toBeInstanceOf(SymlinkOutsideError)
    expect((err as SymlinkOutsideError).getResponse().status).toBe(409)
    expect(readFileSync(secret, 'utf8')).toBe('keep me')
    expect(statSync(secret).mode & 0o777).toBe(0o640)
    expect(readdirSync(outside).sort()).toEqual(['.x.md.1.deadbeef.tmp', 'bashrc']) // no temp file, no sweep
    expect(lstatSync(link).isSymbolicLink()).toBe(true)
  })

  it('refuses a symlinked folder that points outside the workspace and writes nothing there', () => {
    const ws = mkdtempSync(join(tmpdir(), 'atomic-ws-')); const outside = mkdtempSync(join(tmpdir(), 'atomic-out-'))
    process.env.WORKSPACE_DIR = ws
    mkdirSync(join(ws, 'Q'))
    symlinkSync(outside, join(ws, 'Q', 'notes'))
    expect(() => atomicWriteFileSync(join(ws, 'Q', 'notes', 'a.md'), 'x')).toThrow(SymlinkOutsideError)
    expect(() => atomicWriteFileSync(join(ws, 'Q', 'notes', 'new', 'a.md'), 'x')).toThrow(SymlinkOutsideError) // not-yet-existing subfolder
    expect(readdirSync(outside)).toEqual([])
    // a whole question folder that is a link
    symlinkSync(outside, join(ws, 'L'))
    expect(() => atomicWriteFileSync(join(ws, 'L', 'Question.md'), 'x')).toThrow(/WORKSPACE_DIR/)
    expect(readdirSync(outside)).toEqual([])
  })

  it('still writes through a symlinked folder that stays inside the workspace', () => {
    const ws = mkdtempSync(join(tmpdir(), 'atomic-ws-'))
    process.env.WORKSPACE_DIR = ws
    mkdirSync(join(ws, 'real-notes'))
    symlinkSync(join(ws, 'real-notes'), join(ws, 'notes'))
    atomicWriteFileSync(join(ws, 'notes', 'a.md'), 'ok')
    expect(readFileSync(join(ws, 'real-notes', 'a.md'), 'utf8')).toBe('ok')
  })
})
