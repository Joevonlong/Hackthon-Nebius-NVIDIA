// Owner: lane C. F-45 + CR-12 (decided 18:20): library node size AND blue fill follow the total score over the drawn nodes'
// min–max score, so the gradient is visible (lowest drawn → R_MIN px and lightest blue, highest → R_MAX px and darkest blue).
// One mapping t ∈ [0,1] drives both, so size and colour always agree. When every drawn score is equal (max − min < 0.01),
// all nodes take the middle size and colour.
export const R_MIN = 5
export const R_MAX = 18
export const FLAT_EPS = 0.01

export interface ScoreScale { min: number; max: number; flat: boolean; t: (total: number) => number; radius: (total: number) => number }

export const radiusAt = (t: number) => R_MIN + (R_MAX - R_MIN) * Math.max(0, Math.min(1, t))

export function scoreScale(totals: number[]): ScoreScale | null {
  if (!totals.length) return null
  const min = Math.min(...totals), max = Math.max(...totals)
  const flat = max - min < FLAT_EPS
  const t = (total: number) => flat ? 0.5 : Math.max(0, Math.min(1, (total - min) / (max - min)))
  return { min, max, flat, t, radius: total => radiusAt(t(total)) }
}
