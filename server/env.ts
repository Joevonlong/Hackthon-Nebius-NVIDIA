// Loads .env.local / .env by walking up from cwd (worktrees under .claude/worktrees find the repo-root file).
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

function load(file: string) {
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (!m || line.trim().startsWith('#')) continue
    const val = m[2].replace(/^['"]|['"]$/g, '')
    if (process.env[m[1]] === undefined) process.env[m[1]] = val
  }
}

let dir = resolve(process.cwd())
for (let i = 0; i < 8; i++) {
  for (const name of ['.env.local', '.env']) { const f = join(dir, name); if (existsSync(f)) load(f) }
  const up = dirname(dir); if (up === dir) break; dir = up
}

export const env = {
  port: Number(process.env.PORT || 3000),
  dataDir: process.env.DATA_DIR || './data',
  tokenFactoryKey: process.env.TOKEN_FACTORY_API_KEY || '',
  tokenFactoryBaseUrl: process.env.TOKEN_FACTORY_BASE_URL || 'https://api.tokenfactory.nebius.com/v1/',
  tavilyKey: process.env.TAVILY_API_KEY || '',
  openalexKey: process.env.OPENALEX_API_KEY || '',
  openalexMailto: process.env.OPENALEX_MAILTO || '',
  models: {
    embed: process.env.EMBED_MODEL || 'Qwen/Qwen3-Embedding-8B',
    embedDims: Number(process.env.EMBED_DIMS || 1024),
    rerank: process.env.RERANK_MODEL || 'Qwen/Qwen3-Reranker-8B',
    judge: process.env.JUDGE_MODEL || 'nvidia/Nemotron-3_5-Lightning',
    planner: process.env.PLANNER_MODEL || 'nvidia/nemotron-3-super-120b-a12b',
    scout: process.env.SCOUT_MODEL || 'nvidia/nemotron-3-super-120b-a12b',
  },
  raw: process.env as Record<string, string | undefined>,
}
