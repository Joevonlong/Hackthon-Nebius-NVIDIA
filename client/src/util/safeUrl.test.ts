import { describe, expect, it } from 'vitest'
import { safeUrl } from './safeUrl'

describe('safeUrl', () => {
  it('rejects script-capable and non-web schemes', () => {
    for (const u of ['javascript:alert(1)', ' JaVaScRiPt:alert(1)', 'data:text/html,x', 'vbscript:x', 'file:///etc/hosts', '//evil.test/x', 'not a url', '', '  ']) expect(safeUrl(u)).toBeNull()
    expect(safeUrl(null)).toBeNull()
    expect(safeUrl(undefined)).toBeNull()
  })
  it('allows http and https', () => {
    expect(safeUrl('https://openalex.org/W1')).toBe('https://openalex.org/W1')
    expect(safeUrl(' http://example.org/a?b=1 ')).toBe('http://example.org/a?b=1')
  })
})
