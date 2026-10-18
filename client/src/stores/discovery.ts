// Run state from the SSE stream. Owner: lane C.
import { defineStore } from 'pinia'
import type { Candidate, Facet, RunEvent, RunPreset, Seed } from '@shared/contracts'

export const useDiscovery = defineStore('discovery', {
  state: () => ({
    runId: null as string | null,
    question: 'Which single-cell methods help study melanoma immune cells?',
    seedInputs: ['10.1126/science.aad0501', '10.1016/j.cell.2018.10.038', '10.1038/s41586-021-03704-y', '10.1038/s41586-022-04682-5', '10.1158/1078-0432.CCR-21-1694'],
    preset: 'demo' as RunPreset,
    seeds: [] as Seed[],
    facets: [] as Facet[],
    candidates: [] as Candidate[],
    counts: {} as Record<string, number>,
    total: 0,
    events: [] as RunEvent[],
    status: 'idle' as 'idle' | 'running' | 'done' | 'error',
  }),
  actions: {},
})
