// Atomic file writes for user data: temp file in the same folder -> fsync -> rename -> fsync the folder.
// A crash or a throw before the rename leaves the previous file untouched (never a truncated one).
import { closeSync, fsyncSync, mkdirSync, openSync, renameSync, rmSync, writeSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { basename, dirname, join } from 'node:path'

/** Test seam: runs after the temp file is complete and before it replaces the target. */
export const atomicHooks: { beforeRename: ((tmp: string, target: string) => void) | null } = { beforeRename: null }

export interface AtomicOptions { /** fsync the file and folder (default true). Off for re-creatable cache files. */ fsync?: boolean }

export function atomicWriteFileSync(file: string, data: string | Uint8Array, opts: AtomicOptions = {}): void {
  const dir = dirname(file)
  mkdirSync(dir, { recursive: true })
  // hidden name: the file listings skip dot files, so a leftover temp file never shows up as a note or paper
  const tmp = join(dir, `.${basename(file)}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`)
  const sync = opts.fsync !== false
  try {
    const fd = openSync(tmp, 'w')
    try {
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
