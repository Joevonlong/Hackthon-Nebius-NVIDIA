// Versioned SQLite migrations. The version lives in PRAGMA user_version; each migration runs once, in order, in its own
// transaction together with the version bump, so a crash leaves the database at the last complete version.
// To change the schema: add NNN-name.ts exporting a Migration with the next version, and list it below. Never edit a shipped one.
import type Database from 'better-sqlite3'
import { baseline } from './001-baseline'
import { candidatesByPaper } from './002-candidates-by-paper'

export interface Migration { version: number; name: string; up(db: Database.Database): void }

export const MIGRATIONS: Migration[] = [baseline, candidatesByPaper]
export const LATEST_VERSION = MIGRATIONS[MIGRATIONS.length - 1].version

/** Brings db to the latest version; safe to call on every start (idempotent). Returns the versions it applied. */
export function runMigrations(db: Database.Database, migrations: Migration[] = MIGRATIONS): number[] {
  const latest = migrations[migrations.length - 1].version
  const current = db.pragma('user_version', { simple: true }) as number
  if (current > latest) throw new Error(`The database is at schema version ${current}, newer than this PaperTrail (${latest}). Update PaperTrail; the database was not changed.`)
  const applied: number[] = []
  for (const m of migrations) {
    if (m.version <= current) continue
    db.transaction(() => {
      m.up(db)
      db.pragma(`user_version = ${m.version}`)
    })()
    applied.push(m.version)
  }
  return applied
}
