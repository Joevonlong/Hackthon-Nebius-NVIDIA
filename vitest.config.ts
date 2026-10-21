// Test config (vite.config.ts uses root 'client', which would hide server tests).
import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Tests never write into the real ./logs, ./data or ./workspace: one temp root per test run.
const scratch = mkdtempSync(join(tmpdir(), 'papertrail-test-'))

export default defineConfig({
  resolve: {
    alias: {
      '@shared': fileURLToPath(new URL('./shared', import.meta.url)),
      '@client': fileURLToPath(new URL('./client/src', import.meta.url)),
    },
  },
  test: {
    include: ['server/**/*.test.ts', 'shared/**/*.test.ts', 'client/src/**/*.test.ts'],
    exclude: ['node_modules', 'dist', '.claude'],
    env: { LOG_DIR: join(scratch, 'logs'), DATA_DIR: join(scratch, 'data'), WORKSPACE_DIR: join(scratch, 'workspace') },
  },
})
