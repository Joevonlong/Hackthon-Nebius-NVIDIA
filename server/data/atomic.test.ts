import { afterEach, describe, expect, it } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { atomicHooks, atomicWriteFileSync, atomicWriteJsonSync } from './atomic'

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
})
