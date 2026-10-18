// One-off: fills the per-entity OpenAlex cache (${DATA_DIR}/raw/openalex-entities.sqlite) from the URL-cache files already on disk
// (${DATA_DIR}/raw/openalex/*.json.gz). Read-only toward the old files; idempotent (entities are merged field-wise).
// Usage: DATA_DIR=/path/to/data npx tsx scripts/backfill-openalex-cache.ts      (no network, no keys needed)
// The server also does this lazily the first time it opens a fresh entity store, so this only saves that pause on the first build.
import { join } from 'node:path'
import { dataDir } from '../server/data/db'
import { backfillFromRawCache, EntityStore, entityFile } from '../server/library/sources/openalex-entities'

const t0 = Date.now()
const store = new EntityStore(entityFile())
const r = backfillFromRawCache(store, join(dataDir(), 'raw', 'openalex'))
console.log(JSON.stringify({ file: entityFile(), ...r, works: store.count('work'), authors: store.count('author'), sources: store.count('source'), ms: Date.now() - t0 }))
store.close()
