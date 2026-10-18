// Deterministic quote verification: is the judge's quote really in the abstract? (spec §2.1 `verified`)

export interface QuoteMatch {
  verified: boolean
  start: number // offsets into the ORIGINAL text
  end: number
  text: string // the original substring (verbatim from the abstract)
  method: 'exact' | 'fuzzy' | 'none'
}

const QUOTE_CHARS = /[‘’‚‛′`´]/g
const DQUOTE_CHARS = /[“”„‟″«»]/g
const DASH_CHARS = /[‐‑‒–—―−﹘﹣－]/g
const WS = /[\s  -​  　]/

function normChar(c: string): string {
  let s = c.normalize('NFKC')
  s = s.replace(QUOTE_CHARS, "'").replace(DQUOTE_CHARS, '"').replace(DASH_CHARS, '-')
  return s.toLowerCase()
}

/** Normalized string + map from each normalized char index to its original char index. */
export function normalizeWithMap(text: string): { norm: string; map: number[] } {
  let norm = ''
  const map: number[] = []
  let lastWasSpace = true // also trims leading whitespace
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (WS.test(ch)) {
      if (!lastWasSpace) { norm += ' '; map.push(i); lastWasSpace = true }
      continue
    }
    const n = normChar(ch)
    for (const c of n) { norm += c; map.push(i) }
    lastWasSpace = false
  }
  if (norm.endsWith(' ')) { norm = norm.slice(0, -1); map.pop() }
  return { norm, map }
}

export const normalizeText = (s: string) => normalizeWithMap(s).norm

/** Strip wrapping quotes, ellipses and trailing punctuation the model tends to add. */
function cleanQuote(q: string): string {
  return q.trim()
    .replace(/^["'“”‘’«»]+|["'“”‘’«»]+$/g, '')
    .replace(/^(\.\.\.|…)\s*|\s*(\.\.\.|…)$/g, '')
    .trim()
}

/** Semi-global edit distance (Sellers): best approximate occurrence of `p` inside `t`. */
function approxFind(p: string, t: string): { dist: number; start: number; end: number } {
  const m = p.length, n = t.length
  let prevD = new Int32Array(n + 1) // row 0: free start anywhere
  let prevS = new Int32Array(n + 1)
  for (let j = 0; j <= n; j++) prevS[j] = j
  for (let i = 1; i <= m; i++) {
    const curD = new Int32Array(n + 1)
    const curS = new Int32Array(n + 1)
    curD[0] = i; curS[0] = 0
    const pc = p.charCodeAt(i - 1)
    for (let j = 1; j <= n; j++) {
      const diag = prevD[j - 1] + (pc === t.charCodeAt(j - 1) ? 0 : 1)
      const up = prevD[j] + 1
      const left = curD[j - 1] + 1
      if (diag <= up && diag <= left) { curD[j] = diag; curS[j] = prevS[j - 1] }
      else if (up <= left) { curD[j] = up; curS[j] = prevS[j] }
      else { curD[j] = left; curS[j] = curS[j - 1] }
    }
    prevD = curD; prevS = curS
  }
  let best = Infinity, bestJ = 0
  for (let j = 0; j <= n; j++) if (prevD[j] < best) { best = prevD[j]; bestJ = j }
  return { dist: best, start: prevS[bestJ], end: bestJ }
}

const NONE: QuoteMatch = { verified: false, start: -1, end: -1, text: '', method: 'none' }

/**
 * Exact match after normalizing whitespace, quotes, dashes and case → offsets into the original.
 * Otherwise accept a contiguous approximate match with ≥ 90% similarity (edit distance ≤ 10% of the quote).
 */
export function verifyQuote(quote: string | null | undefined, abstract: string | null | undefined, minSimilarity = 0.9): QuoteMatch {
  if (!quote || !abstract) return NONE
  const q = normalizeText(cleanQuote(quote))
  if (q.length < 12) return NONE // too short to count as evidence
  const { norm, map } = normalizeWithMap(abstract)
  const toOrig = (s: number, e: number): QuoteMatch | null => {
    if (e <= s) return null
    const start = map[s], end = map[e - 1] + 1
    return { verified: true, start, end, text: abstract.slice(start, end), method: 'exact' }
  }
  const idx = norm.indexOf(q)
  if (idx >= 0) return toOrig(idx, idx + q.length) ?? NONE
  // also try without a trailing period the abstract may not have at that position
  const q2 = q.replace(/[.;,:]+$/, '')
  if (q2.length >= 12) {
    const i2 = norm.indexOf(q2)
    if (i2 >= 0) return toOrig(i2, i2 + q2.length) ?? NONE
  }
  if (q.length > 600 || norm.length > 20000) return NONE
  const { dist, start, end } = approxFind(q, norm)
  if (1 - dist / q.length >= minSimilarity) {
    // trim a partial leading/trailing space from the alignment
    let s = start, e = end
    while (s < e && norm[s] === ' ') s++
    while (e > s && norm[e - 1] === ' ') e--
    const m = toOrig(s, e)
    if (m) return { ...m, method: 'fuzzy' }
  }
  return NONE
}
