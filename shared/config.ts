// Run size presets (decision D-16). Env vars override preset values on the server.
import type { RunPreset } from './contracts'

export interface RunConfig {
  rerankTopK: number
  rerankFacets: boolean
  judgeTopK: number // Core + Linked
  judgeExtraK: number // best Fresh / Bridges
  judgeConcurrency: number
  embedMaxDocs: number
  scoutMaxCalls: number
  scoutMaxMs: number
  r2MaxPerPair: number // OpenAlex works fetched per seed pair (R2)
  r3PerSeed: number // PubMed similar articles per seed (R3)
  freshMonths: number
  sendPerLane: number // candidates per lane sent to the client
  timeoutMs: number // per model call
}

export const PRESETS: Record<RunPreset, RunConfig> = {
  demo: { rerankTopK: 60, rerankFacets: false, judgeTopK: 30, judgeExtraK: 5, judgeConcurrency: 8, embedMaxDocs: 600, scoutMaxCalls: 4, scoutMaxMs: 30000, r2MaxPerPair: 400, r3PerSeed: 60, freshMonths: 18, sendPerLane: 40, timeoutMs: 20000 },
  deep: { rerankTopK: 150, rerankFacets: true, judgeTopK: 50, judgeExtraK: 10, judgeConcurrency: 8, embedMaxDocs: 1500, scoutMaxCalls: 6, scoutMaxMs: 45000, r2MaxPerPair: 400, r3PerSeed: 100, freshMonths: 18, sendPerLane: 80, timeoutMs: 25000 },
}

const ENV_KEYS: Record<keyof RunConfig, string> = {
  rerankTopK: 'RERANK_TOP_K', rerankFacets: 'RERANK_FACETS', judgeTopK: 'JUDGE_TOP_K', judgeExtraK: 'JUDGE_EXTRA_K',
  judgeConcurrency: 'JUDGE_CONCURRENCY', embedMaxDocs: 'EMBED_MAX_DOCS', scoutMaxCalls: 'SCOUT_MAX_CALLS', scoutMaxMs: 'SCOUT_MAX_MS',
  r2MaxPerPair: 'R2_MAX_PER_PAIR', r3PerSeed: 'R3_PER_SEED', freshMonths: 'FRESH_MONTHS', sendPerLane: 'SEND_PER_LANE', timeoutMs: 'MODEL_TIMEOUT_MS',
}

export function resolveConfig(preset: RunPreset, env: Record<string, string | undefined> = {}): RunConfig {
  const base = { ...PRESETS[preset] }
  for (const key of Object.keys(ENV_KEYS) as (keyof RunConfig)[]) {
    const raw = env[ENV_KEYS[key]]
    if (raw == null || raw === '') continue
    if (typeof base[key] === 'boolean') (base as any)[key] = raw === '1' || raw === 'true'
    else if (!Number.isNaN(Number(raw))) (base as any)[key] = Number(raw)
  }
  return base
}
