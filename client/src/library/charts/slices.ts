// CR-11 slice math for the score donut, value bars and the mini stacked bar. One slice per component in the fixed
// COMPONENT_KEYS order; a slice's size is the component's stored contribution (weight share after redistribution ×
// value), so the chart and the report-card text rows ("Adds +0.14", "18%") show the same numbers.
import type { ScoreComponent } from '@shared/library'
import { COMPONENT_KEYS, COMPONENT_META, f2, pct, weightShare, type ComponentKey } from '../score'

export interface Slice {
  key: ComponentKey
  value: number | null // null = not assessed
  share: number // effective weight share 0..1 (0 when not assessed)
  contribution: number // share × value, what this component adds to the total
  start: number // cumulative position 0..1 where the slice starts (clockwise from the top)
}
export interface Slices { slices: Slice[]; total: number; missed: number }

/** Colour of a component, from the CSS tokens in charts/tokens.css (light and dark). */
export const compColor = (k: ComponentKey) => `var(--c-${k})`

export function scoreSlices(components: ScoreComponent[]): Slices {
  const byKey = new Map(components.map(c => [c.key, c]))
  let at = 0
  const slices: Slice[] = []
  for (const key of COMPONENT_KEYS) {
    const c = byKey.get(key)
    if (!c) continue
    const contribution = c.value == null ? 0 : Math.max(0, c.contribution)
    slices.push({ key, value: c.value, share: weightShare(c, components), contribution, start: at })
    at += contribution
  }
  return { slices, total: at, missed: Math.max(0, 1 - at) }
}

/** Hover text, e.g. "Citations adds 0.14 (value 0.75 × share 18%)". */
export function sliceText(s: Slice): string {
  const name = COMPONENT_META[s.key].short
  if (s.value == null) return `${name} not assessed (its weight moved to the assessed components)`
  return `${name} adds ${f2(s.contribution)} (value ${f2(s.value)} × share ${pct(s.share)}%)`
}
/** Bar label, e.g. "0.75 · 18%". */
export const barLabel = (s: Slice) => s.value == null ? 'not assessed' : `${f2(s.value)} · ${pct(s.share)}%`
