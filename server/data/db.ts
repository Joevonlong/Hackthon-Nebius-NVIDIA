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
  const handle = new Database(path)
  try {
    handle.pragma('journal_mode = WAL')
    handle.pragma('synchronous = NORMAL')
    runMigrations(handle)
  } catch (e) {
    handle.close() // never cache a database whose migrations failed or were refused
    throw e
  }
  db = handle
  return db
}

export function closeDb() { db?.close(); db = null }
