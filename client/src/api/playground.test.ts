import { afterEach, describe, expect, it, vi } from 'vitest'
import { isDemo, normalizePlayground } from './index'

afterEach(() => vi.unstubAllGlobals())

function fakeBrowser(pathname: string, search = '', hash = '') {
  const loc = { pathname, search, hash }
  const history = { replaceState: vi.fn((_s: unknown, _t: string, url: string) => { const u = new URL(url, 'http://x'); loc.pathname = u.pathname; loc.search = u.search }) }
  vi.stubGlobal('location', loc)
  vi.stubGlobal('history', history)
  return history
}

describe('playground (D-08)', () => {
  it('is off on the normal product URL', () => {
    const h = fakeBrowser('/')
    normalizePlayground()
    expect(h.replaceState).not.toHaveBeenCalled()
    expect(isDemo()).toBe(false)
  })

  it('/playground turns the one demo flag on', () => {
    const h = fakeBrowser('/playground')
    normalizePlayground()
    expect(h.replaceState).toHaveBeenCalledWith(null, '', '/?demo=1')
    expect(isDemo()).toBe(true)
  })

  it('?demo=1 keeps working', () => {
    fakeBrowser('/', '?demo=1')
    expect(isDemo()).toBe(true)
  })
})
