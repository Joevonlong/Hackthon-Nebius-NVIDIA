// Bibliography + vault export: BibTeX, CSL JSON and a store-only Markdown .zip (no dependency).
import type { Note } from '../stores/vault'
import { parseFrontMatter } from '../stores/vault-utils'

export interface BibEntry { key: string; path: string; kind: Note['kind']; authors: string[]; year: string; title: string; venue: string; doi: string; paperId: string }

function list(raw = ''): string[] {
  const bracket = /^\[.*\]$/.test(raw.trim())
  const s = raw.trim().replace(/^\[|\]$/g, '')
  if (!s) return []
  const sep = s.includes(';') ? ';' : / and /.test(s) ? ' and ' : bracket ? ',' : null
  return (sep ? s.split(sep) : [s]).map(x => x.trim().replace(/^["']|["']$/g, '')).filter(Boolean)
}
const clean = (v = '') => v.trim().replace(/^["']|["']$/g, '').replace(/^—$/, '')

export function bibliography(notes: Note[]): BibEntry[] {
  const used = new Set<string>()
  return notes.filter(n => n.kind === 'lit' || n.kind === 'seed').map(n => {
    const d = parseFrontMatter(n.content).data
    const named = list(d.authors || d.author)
    const authors = named.length ? named : d.first_author ? [clean(d.first_author)] : []
    const year = clean(d.year)
    const title = clean(d.title) || n.title
    const a0 = authors[0] || 'anon'
    const family = a0.includes(',') ? a0.split(',')[0] : a0.trim().split(/\s+/).pop()!
    const last = family.toLowerCase().normalize('NFD').replace(/[^a-z]/g, '') || 'anon'
    const word = title.toLowerCase().normalize('NFD').replace(/[^a-z ]/g, '').split(' ').find(w => w.length > 3) || 'paper'
    let key = `${last}${year}${word}`; let k = 1
    while (used.has(key)) key = `${last}${year}${word}${String.fromCharCode(97 + k++)}`
    used.add(key)
    return { key, path: n.path, kind: n.kind, authors, year, title, venue: clean(d.venue || d.journal), doi: clean(d.doi), paperId: clean(d.paper_id || d.id) || n.paperId || '' }
  }).sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'seed' ? -1 : 1) || a.title.localeCompare(b.title))
}

const tex = (s: string) => s.replace(/[{}]/g, '').replace(/([&%$#_])/g, '\\$1')

export function toBibTeX(entries: BibEntry[]): string {
  return entries.map(e => {
    const f: [string, string][] = [['title', `{${tex(e.title)}}`]]
    if (e.authors.length) f.push(['author', tex(e.authors.join(' and '))])
    if (e.venue) f.push(['journal', tex(e.venue)])
    if (e.year) f.push(['year', e.year])
    if (e.doi) f.push(['doi', e.doi])
    return `@article{${e.key},\n${f.map(([k, v]) => `  ${k} = {${v}}`).join(',\n')}\n}`
  }).join('\n\n') + '\n'
}

export function toCslJson(entries: BibEntry[]): string {
  return JSON.stringify(entries.map(e => ({
    id: e.key,
    type: 'article-journal',
    title: e.title,
    author: e.authors.map(a => {
      if (a.includes(',')) { const [family, given] = a.split(',').map(x => x.trim()); return { family, given } }
      const parts = a.split(' '); return parts.length > 1 ? { family: parts.pop()!, given: parts.join(' ') } : { literal: a }
    }),
    ...(e.year ? { issued: { 'date-parts': [[Number(e.year) || e.year]] } } : {}),
    ...(e.venue ? { 'container-title': e.venue } : {}),
    ...(e.doi ? { DOI: e.doi } : {}),
  })), null, 2) + '\n'
}

// ---- store-only zip -------------------------------------------------------
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0 } return t })()
function crc32(b: Uint8Array) { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0 }

export function zip(files: { name: string; content: string }[]): Blob {
  const enc = new TextEncoder()
  const parts: Uint8Array[] = []; const central: Uint8Array[] = []
  let offset = 0
  const now = new Date()
  const time = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)
  const date = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()
  for (const f of files) {
    const name = enc.encode(f.name); const data = enc.encode(f.content); const crc = crc32(data)
    const h = new DataView(new ArrayBuffer(30))
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true)
    h.setUint16(10, time, true); h.setUint16(12, date, true); h.setUint32(14, crc, true)
    h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, name.length, true); h.setUint16(28, 0, true)
    parts.push(new Uint8Array(h.buffer), name, data)
    const c = new DataView(new ArrayBuffer(46))
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true)
    c.setUint16(12, time, true); c.setUint16(14, date, true); c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true)
    c.setUint16(28, name.length, true); c.setUint32(42, offset, true)
    central.push(new Uint8Array(c.buffer), name)
    offset += 30 + name.length + data.length
  }
  const size = central.reduce((s, p) => s + p.length, 0)
  const e = new DataView(new ArrayBuffer(22))
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true)
  e.setUint32(12, size, true); e.setUint32(16, offset, true)
  return new Blob([...parts, ...central, new Uint8Array(e.buffer)] as BlobPart[], { type: 'application/zip' })
}

export function download(name: string, data: Blob | string, type = 'text/plain') {
  const blob = typeof data === 'string' ? new Blob([data], { type }) : data
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob); a.download = name
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

export const exportBibTeX = (notes: Note[]) => download('papertrail.bib', toBibTeX(bibliography(notes)), 'application/x-bibtex')
export const exportCslJson = (notes: Note[]) => download('papertrail.csl.json', toCslJson(bibliography(notes)), 'application/json')
export const exportMarkdownZip = (notes: Note[]) => download('papertrail-vault.zip', zip(notes.map(n => ({ name: n.path, content: n.content }))))
