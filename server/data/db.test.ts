import { describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { closeDb, getDb } from './db'

describe('getDb', () => {
  it('does not cache a database whose migrations were refused: every call throws', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'db-')), 'papertrail.sqlite')
    const newer = new Database(file); newer.pragma('user_version = 99'); newer.close()
    closeDb()
    expect(() => getDb(file)).toThrow(/newer than this PaperTrail/)
    expect(() => getDb(file)).toThrow(/newer than this PaperTrail/)
    closeDb()
  })
})
