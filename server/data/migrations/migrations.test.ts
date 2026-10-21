import { describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { LATEST_VERSION, MIGRATIONS, runMigrations } from './index'

// old-schema.sql is the schema as shipped before versioning (user_version 0)
const OLD_SCHEMA = readFileSync(new URL('./old-schema.sql', import.meta.url), 'utf8')

describe('SQLite migrations', () => {
  it('upgrades a database created by the old schema and keeps its rows', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'mig-')), 'papertrail.sqlite')
    const old = new Database(file)
    old.exec(OLD_SCHEMA)
    old.prepare("INSERT INTO papers (id, title, updated_at) VALUES ('W1', 'Old paper', '2025-01-01')").run()
    expect(old.pragma('user_version', { simple: true })).toBe(0)
    old.close()

    const db = new Database(file)
    expect(runMigrations(db)).toEqual(MIGRATIONS.map(m => m.version))
    expect(db.pragma('user_version', { simple: true })).toBe(LATEST_VERSION)
    expect(db.prepare('SELECT title FROM papers WHERE id = ?').get('W1')).toEqual({ title: 'Old paper' })
    expect(db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'candidates_paper'").get()).toBeTruthy()
    db.close()
  })

  it('is idempotent and creates a fresh database at the latest version', () => {
    const db = new Database(':memory:')
    expect(runMigrations(db).length).toBe(MIGRATIONS.length)
    expect(runMigrations(db)).toEqual([])
    expect(db.pragma('user_version', { simple: true })).toBe(LATEST_VERSION)
  })

  it('rolls a failing migration back and keeps the earlier version', () => {
    const db = new Database(':memory:')
    const bad = { version: 3, name: 'bad', up: (d: Database.Database) => { d.exec('CREATE TABLE half (x)'); throw new Error('boom') } }
    expect(() => runMigrations(db, [...MIGRATIONS, bad])).toThrow('boom')
    expect(db.pragma('user_version', { simple: true })).toBe(LATEST_VERSION)
    expect(db.prepare("SELECT name FROM sqlite_master WHERE name = 'half'").get()).toBeUndefined()
  })

  it('refuses a database from a newer PaperTrail without changing it', () => {
    const db = new Database(':memory:')
    db.pragma('user_version = 99')
    expect(() => runMigrations(db)).toThrow(/newer than this PaperTrail/)
    expect(db.pragma('user_version', { simple: true })).toBe(99)
  })
})
