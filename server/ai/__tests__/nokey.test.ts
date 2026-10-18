import { describe, expect, it, vi } from 'vitest'
import { resolveConfig } from '@shared/config'

// Empty strings are "defined", so server/env.ts will not load the real keys from .env.local.
vi.stubEnv('TOKEN_FACTORY_API_KEY', '')
vi.stubEnv('TAVILY_API_KEY', '')

describe('without keys every AI function degrades and never throws', () => {
  it('returns null / [] / fallback facets', async () => {
    const ai = await import('../index')
    const cfg = resolveConfig('demo')
    expect(await ai.embed(['a'], 'document', cfg)).toBeNull()
    expect(await ai.rerank('q', ['a'], cfg)).toBeNull()
    const fs = await ai.facets('melanoma resistance', [], cfg)
    expect(fs.map(f => f.key)).toEqual(['topic', 'method', 'population'])
    expect(fs.every(f => f.query === 'melanoma resistance')).toBe(true)
    expect(await ai.expandQueries('q', fs, cfg)).toEqual([])
    expect(await ai.judge({ question: 'q', facets: fs, seeds: [], paper: {} as any, features: {} as any }, cfg)).toBeNull()
    const steps: unknown[] = []
    expect(await ai.scout('q', [], fs, cfg, s => steps.push(s))).toEqual({ dois: [], openalexIds: [], webSources: [] })
    expect(steps).toEqual([])
  })
})
