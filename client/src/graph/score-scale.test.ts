import { describe, expect, it } from 'vitest'
import { R_MAX, R_MIN, radiusAt, scoreScale } from './score-scale'

describe('scoreScale (F-45 / CR-12)', () => {
  it('maps the drawn min–max score to the full size and colour range', () => {
    const s = scoreScale([0.82, 0.9, 0.97])!
    expect(s.flat).toBe(false)
    expect(s.t(0.82)).toBe(0)
    expect(s.t(0.97)).toBe(1)
    expect(s.radius(0.82)).toBe(R_MIN)
    expect(s.radius(0.97)).toBe(R_MAX)
    expect(s.radius(0.9)).toBeCloseTo(radiusAt(s.t(0.9)))
    expect(s.t(0.5)).toBe(0) // clamped
  })
  it('falls back to the middle size and colour when all drawn scores are equal', () => {
    const s = scoreScale([0.8, 0.805])!
    expect(s.flat).toBe(true)
    expect(s.t(0.8)).toBe(0.5)
    expect(s.radius(0.805)).toBe((R_MIN + R_MAX) / 2)
  })
  it('returns null with no drawn nodes', () => { expect(scoreScale([])).toBeNull() })
})
