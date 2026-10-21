// Atomic file writes for user data: temp file in the same folder -> fsync -> rename -> fsync the folder.
// A crash or a throw before the rename leaves the previous file untouched (never a truncated one).
import { HTTPException } from 'hono/http-exception'
import { closeSync, existsSync, lstatSync, fchmodSync, fsyncSync, mkdirSync, openSync, readdirSync, realpathSync, renameSync, rmSync, statSync, writeSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { basename, dirname, join, resolve, sep } from 'node:path'

/** Test seam: runs after the temp file is complete and before it replaces the target. */
export const atomicHooks: { beforeRename: ((tmp: string, target: string) => void) | null } = { beforeRename: null }

export interface AtomicOptions { /** fsync the file and folder (default true). Off for re-creatable cache files. */ fsync?: boolean }

/** A write target is a symlink that leads outside the workspace, data and log folders: refused, never replaced or followed. */
export class SymlinkOutsideError extends HTTPException {
  constructor(public file: string) {
    const message = `Not saved: ${basename(file)} is a symbolic link that points outside the PaperTrail folders. Replace the link with a regular file or move the target inside the workspace.`
    super(409, { message, res: Response.json({ error: message, code: 'symlink_outside_workspace' }, { status: 409 }) })
  }
}

const realRoots = () => [process.env.WORKSPACE_DIR || './workspace', process.env.DATA_DIR || './data', process.env.LOG_DIR || './logs']
  .map(r => { try { return realpathSync(resolve(r)) } catch { return resolve(r) } }) // a root that is itself a link (macOS /tmp) compares by real path
const insideRoots = (real: string) => realRoots().some(r => real === r || real.startsWith(r + sep))

const TMP_RE = /^\..+\.\d+\.[0-9a-f]{8}\.tmp$/ // exactly the names this module creates
const STALE_MS = 3600_000
const swept = new Set<string>()
/** Once per folder and process: removes temp files a crash left behind (older than an hour, so a live writer's is safe). */
function sweepStaleTemps(dir: string) {
  if (swept.has(dir)) return
  swept.add(dir)
  try {
    for (const n of readdirSync(dir)) {
      if (!TMP_RE.test(n)) continue
      try { if (Date.now() - statSync(join(dir, n)).mtimeMs > STALE_MS) rmSync(join(dir, n), { force: true }) } catch { /* ignore */ }
    }
  } catch { /* ignore */ }
}

export function atomicWriteFileSync(target: string, data: string | Uint8Array, opts: AtomicOptions = {}): void {
  // a symlinked target is written through to the real file, never replaced by a regular one
  let file = target
  let mode: number | null = null
  if (existsSync(target)) {
    if (lstatSync(target).isSymbolicLink()) {
      file = realpathSync(target)
      if (!insideRoots(file)) throw new SymlinkOutsideError(target) // before any temp file, sweep or chmod near the outside folder
    }
    mode = statSync(file).mode & 0o7777
  }
  const dir = dirname(file)
  mkdirSync(dir, { recursive: true })
  sweepStaleTemps(dir)
  // hidden name: the file listings skip dot files, so a leftover temp file never shows up as a note or paper
  const tmp = join(dir, `.${basename(file)}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`)
  const sync = opts.fsync !== false
  try {
    const fd = openSync(tmp, 'w')
    try {
      if (mode !== null) fchmodSync(fd, mode) // keep the permissions the user set (e.g. 600)
      const buf = typeof data === 'string' ? Buffer.from(data, 'utf8') : data
      let off = 0
      while (off < buf.length) off += writeSync(fd, buf, off, buf.length - off)
      if (sync) fsyncSync(fd)
    } finally { closeSync(fd) }
    atomicHooks.beforeRename?.(tmp, file)
    renameSync(tmp, file)
  } catch (e) {
    try { rmSync(tmp, { force: true }) } catch { /* ignore */ }
    throw e
  }
  if (sync) {
    try { const dfd = openSync(dir, 'r'); try { fsyncSync(dfd) } finally { closeSync(dfd) } } catch { /* folder fsync is not supported everywhere (Windows) */ }
  }
}

export const atomicWriteJsonSync = (file: string, value: unknown, opts?: AtomicOptions) =>
  atomicWriteFileSync(file, JSON.stringify(value, null, 2), opts)
