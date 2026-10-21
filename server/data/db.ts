// Owner: lane A1. SQLite store (spec §4.2). Plain SQL schema; one file at ${DATA_DIR}/papertrail.sqlite.
import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { runMigrations } from './migrations'

export type DB = Database.Database

let db: DB | null = null

export function dataDir(): string {
  return process.env.DATA_DIR || './data'
}

/** Opens (once) the SQLite file. Pass ':memory:' in tests. */
export function getDb(file?: string): DB {
  if (db) return db
  const path = file ?? (() => { mkdirSync(dataDir(), { recursive: true }); return join(dataDir(), 'papertrail.sqlite') })()
  db = new Database(path)
  db.pragma('journal_mode = WAL')
  db.pragma('synchronous = NORMAL')
  runMigrations(db)
  return db
}

export function closeDb() { db?.close(); db = null }
