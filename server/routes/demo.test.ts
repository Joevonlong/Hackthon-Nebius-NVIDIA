import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules() })

async function status(path: string) {
  vi.resetModules()
  const { demo } = await import('./demo')
  return (await demo.request(path)).status
}

describe('playground aliases (D-08)', () => {
  it('serve /library/demo-melanoma only with DEMO=1; /demo/library is always there', async () => {
    vi.stubEnv('DEMO', '')
    expect(await status('/library/demo-melanoma')).toBe(404)
    expect(await status('/demo/library')).toBe(200)
    vi.stubEnv('DEMO', '1')
    expect(await status('/library/demo-melanoma')).toBe(200)
  })
})
