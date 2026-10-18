import { describe, expect, it } from 'vitest'
import { lastName, splitName } from './names'
import { lastName as noteLastName, litNoteName } from '../discover/literatureNote'

describe('Q2-8: author surnames', () => {
  it('takes the surname from every author format the sources send', () => {
    expect(lastName('Yan M')).toBe('Yan')
    expect(lastName('Smith JA')).toBe('Smith')
    expect(lastName('J. A. Smith')).toBe('Smith')
    expect(lastName('van der Berg, A.')).toBe('van der Berg')
    expect(lastName('Itay Tirosh')).toBe('Tirosh')
    expect(lastName('Sade-Feldman M')).toBe('Sade-Feldman')
    expect(lastName('A. van der Berg')).toBe('van der Berg')
    expect(lastName('van der Berg A')).toBe('van der Berg')
    expect(lastName('Smith')).toBe('Smith')
    expect(lastName('')).toBe('')
    expect(lastName(undefined)).toBe('')
  })
  it('splits family and given names', () => {
    expect(splitName('Yan M')).toEqual({ family: 'Yan', given: 'M' })
    expect(splitName('J. A. Smith')).toEqual({ family: 'Smith', given: 'J. A.' })
    expect(splitName('van der Berg, A.')).toEqual({ family: 'van der Berg', given: 'A.' })
  })
  it('is the helper the note names, graph labels and result tiles use', () => {
    expect(noteLastName('Yan M')).toBe('Yan')
    expect(litNoteName({ authors: ['Yan M'], year: 2021, title: 'Single-cell atlas of melanoma' } as never)).toBe('Yan 2021 Single-cell atlas of melanoma')
  })
})
