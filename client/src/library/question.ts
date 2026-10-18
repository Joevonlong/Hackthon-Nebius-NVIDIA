// F-51 (R-3.2): the research question lives in Notes/Question.md as the first paragraph under the H1.
// readQuestion() finds that paragraph; writeQuestion() replaces it and keeps everything else (frontmatter, other sections).

interface Span { start: number; end: number } // line indexes [start, end) of the question paragraph (start === end: none yet)

function locate(lines: string[]): Span {
  let i = 0
  if (lines[0]?.trim() === '---') {
    const close = lines.findIndex((l, k) => k > 0 && l.trim() === '---')
    if (close > 0) i = close + 1
  }
  const h1 = lines.findIndex((l, k) => k >= i && /^#\s/.test(l))
  if (h1 >= 0) i = h1 + 1
  while (i < lines.length && !lines[i].trim()) i++
  if (i >= lines.length || /^#{1,6}\s/.test(lines[i])) return { start: i, end: i }
  let j = i
  while (j < lines.length && lines[j].trim() && !/^#{1,6}\s/.test(lines[j])) j++
  return { start: i, end: j }
}

export function readQuestion(content: string | undefined | null): string {
  if (!content) return ''
  const lines = content.split('\n')
  const s = locate(lines)
  return lines.slice(s.start, s.end).map(l => l.trim()).join(' ').trim()
}

export function writeQuestion(content: string, question: string): string {
  const q = question.trim().replace(/\s*\n\s*/g, ' ')
  const lines = content.split('\n')
  const s = locate(lines)
  if (s.start === s.end) {
    // no paragraph yet: insert it (with blank lines around) where the paragraph belongs
    const before = s.start > 0 && lines[s.start - 1]?.trim() ? [''] : []
    lines.splice(s.start, 0, ...before, q, '')
  } else lines.splice(s.start, s.end - s.start, q)
  return lines.join('\n')
}
