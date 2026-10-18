// Lane U2. Tiny, safe markdown → HTML for chat replies: everything is escaped first, then a small subset is
// re-introduced (paragraphs, bullet / numbered lists, headings, **bold**, *italic*, `code`, http(s) links) plus
// paper citations [#rank Title] → <a class="cite" data-rank="rank">, which the panel turns into "open paper".

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

export function inline(text: string): string {
  let s = esc(text)
  const codes: string[] = []
  s = s.replace(/`([^`\n]+)`/g, (_m, c) => { codes.push(c); return `\u0000${codes.length - 1}\u0000` })
  s = s.replace(/\[#(\d{1,4})(?:\s+([^\]\n]{1,240}))?\]/g, (_m, n, t) => `<a href="#" class="cite" data-rank="${n}" title="Open paper #${n}">#${n}${t ? ' ' + t.trim() : ''}</a>`)
  // bare "#12" (not already a link) → rank-only paper link
  s = s.replace(/(^|[\s(,;])#(\d{1,4})(?=[\s),.;:]|$)/g, (_m, pre, n) => `${pre}<a href="#" class="cite" data-rank="${n}" title="Open paper #${n}">#${n}</a>`)
  s = s.replace(/\[([^\]\n]{1,200})\]\((https?:\/\/[^\s)]+)\)/g, (_m, t, u) => `<a href="${u}" target="_blank" rel="noopener noreferrer">${t}</a>`)
  s = s.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>').replace(/(^|[^*\w])\*([^*\n]+)\*(?!\w)/g, '$1<em>$2</em>')
  s = s.replace(/\u0000(\d+)\u0000/g, (_m, i) => `<code>${codes[Number(i)]}</code>`)
  return s
}

export function renderMarkdown(md: string): string {
  const out: string[] = []
  let list: 'ul' | 'ol' | null = null
  let para: string[] = []
  const flushPara = () => { if (para.length) { out.push(`<p>${para.map(inline).join('<br>')}</p>`); para = [] } }
  const closeList = () => { if (list) { out.push(`</${list}>`); list = null } }
  for (const raw of md.replace(/\r/g, '').split('\n')) {
    const line = raw.trimEnd()
    const ul = line.match(/^\s*[-*•]\s+(.*)$/)
    const ol = line.match(/^\s*\d{1,3}[.)]\s+(.*)$/)
    const h = line.match(/^\s*#{1,6}\s+(.*)$/)
    if (ul || ol) {
      flushPara()
      const kind = ul ? 'ul' : 'ol'
      if (list !== kind) { closeList(); out.push(`<${kind}>`); list = kind }
      out.push(`<li>${inline((ul ?? ol)![1])}</li>`)
    } else if (h) { flushPara(); closeList(); out.push(`<p class="h">${inline(h[1])}</p>`) }
    else if (!line.trim()) { flushPara(); closeList() }
    else { closeList(); para.push(line) }
  }
  flushPara(); closeList()
  return out.join('')
}
