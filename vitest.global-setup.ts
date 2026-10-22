// Removes the per-run temp root that vitest.config.ts points LOG_DIR, DATA_DIR and WORKSPACE_DIR at.
import { rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export default function setup() {
  return () => rmSync(join(tmpdir(), `papertrail-test-${process.pid}`), { recursive: true, force: true })
}
