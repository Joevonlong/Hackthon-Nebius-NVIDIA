// Owner: lane W2 (D-36). Seed file import: .bib / .ris / CSL JSON / .csv / .txt → paper ids; PDF → DOI from the first 2 pages.
// Ids use the resolver's input formats: DOI "10.x/…", "PMID:<n>", "arXiv:<id>", OpenAlex "W<n>".
import { extractPdfPages } from '../security/pdf-worker'
export type SeedFormat = 'bibtex' | 'ris' | 'csl-json' | 'csv' | 'text' | 'pdf'

const DOI_RE = /\b(10\.\d{4,9}\/[^\s"'<>\][(){}|,;]+)/gi
const ARXIV_RE = /(?:\barXiv\s*[:/]?\s*|arxiv\.org\/(?:abs|pdf)\/)(\d{4}\.\d{4,5})(?:v\d+)?/gi
const OPENALEX_RE = /(?:openalex\.org\/(?:works\/)?|\b)(W\d{6,12})\b/g
const PMID_LABELED_RE = /(?:\bPMID\s*[:=]?\s*\{?\s*|pubmed\.ncbi\.nlm\.nih\.gov\/)(\d{5,9})\b/gi

const cleanDoi = (d: string) => d.replace(/[.)\]}>*_]+$/, '').replace(/\}+$/, '')

/** Ids found in free text (DOIs, labelled PMIDs, arXiv ids, OpenAlex ids). */
export function idsInText(text: string, opts: { barePmids?: boolean } = {}): string[] {
  const out: string[] = []
  for (const m of text.matchAll(DOI_RE)) out.push(cleanDoi(m[1]))
  for (const m of text.matchAll(PMID_LABELED_RE)) out.push(`PMID:${m[1]}`)
  for (const m of text.matchAll(ARXIV_RE)) out.push(`arXiv:${m[1]}`)
  for (const m of text.matchAll(OPENALEX_RE)) out.push(m[1])
  if (opts.barePmids) for (const m of text.matchAll(/(?:^|[\s,;])(\d{6,9})(?=$|[\s,;])/gm)) out.push(`PMID:${m[1]}`)
  return out
}

function bibtex(text: string): string[] {
  const out: string[] = []
  // Linear time (#35): a value is at most 1000 chars of non-brace text or one-level {groups}, whitespace runs are at most 200, and the
  // alternatives start with different characters, so no start position rescans more than a bounded window.
  for (const m of text.matchAll(/\b(doi|pmid|eprint|arxiv|url)[ \t\r\n]{0,200}=[ \t\r\n]{0,200}[{"][ \t\r\n]{0,200}((?:[^{}"]|\{[^{}]{0,200}\}){1,1000})[}"]/gi)) {
    const k = m[1].toLowerCase(); const v = m[2].trim()
    if (k === 'doi') out.push(cleanDoi(v.replace(/^https?:\/\/(dx\.)?doi\.org\//i, '')))
    else if (k === 'pmid' && /^\d{5,9}$/.test(v)) out.push(`PMID:${v}`)
    else if ((k === 'eprint' || k === 'arxiv') && /^\d{4}\.\d{4,5}/.test(v)) out.push(`arXiv:${v.replace(/v\d+$/, '')}`)
    else out.push(...idsInText(v))
  }
  return out.length ? out : idsInText(text)
}

function ris(text: string): string[] {
  const out: string[] = []
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^([A-Z][A-Z0-9])\s{1,2}-\s?(.*)$/); if (!m) continue
    const [, tag, v] = m
    if (tag === 'DO') out.push(...idsInText(v).filter(x => x.startsWith('10.')))
    else if ((tag === 'AN' || tag === 'C2' || tag === 'M1') && /^\d{5,9}$/.test(v.trim())) out.push(`PMID:${v.trim()}`)
    else if (tag === 'UR' || tag === 'L1' || tag === 'L2' || tag === 'N1') out.push(...idsInText(v))
  }
  return out.length ? out : idsInText(text)
}

function cslJson(text: string): string[] {
  let data: unknown
  try { data = JSON.parse(text) } catch { return idsInText(text) }
  const items = Array.isArray(data) ? data : (data as { items?: unknown[] })?.items ?? [data]
  const out: string[] = []
  for (const it of items as Record<string, unknown>[]) {
    if (!it || typeof it !== 'object') continue
    const doi = it.DOI ?? it.doi; const pmid = it.PMID ?? it.pmid; const url = it.URL ?? it.url
    if (typeof doi === 'string') out.push(cleanDoi(doi.replace(/^https?:\/\/(dx\.)?doi\.org\//i, '')))
    else if (typeof pmid === 'string' || typeof pmid === 'number') out.push(`PMID:${pmid}`)
    else if (typeof url === 'string') out.push(...idsInText(url))
  }
  return out.length ? out : idsInText(text)
}

/** Splits one CSV line (quotes respected). */
function csvCells(line: string, sep: string): string[] {
  const cells: string[] = []; let cur = ''; let q = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (q) { if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++ } else if (ch === '"') q = false; else cur += ch }
    else if (ch === '"') q = true
    else if (ch === sep) { cells.push(cur.trim()); cur = '' }
    else cur += ch
  }
  cells.push(cur.trim())
  return cells
}

function csv(text: string): string[] {
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  if (!lines.length) return []
  const sep = (lines[0].match(/;/g)?.length ?? 0) > (lines[0].match(/,/g)?.length ?? 0) ? ';' : lines[0].includes('\t') ? '\t' : ','
  const head = csvCells(lines[0], sep).map(h => h.toLowerCase())
  const col = (names: string[]) => head.findIndex(h => names.includes(h))
  const doiCol = col(['doi', 'dois', 'doi_url']); const pmidCol = col(['pmid', 'pubmed', 'pubmed id', 'pubmed_id'])
  const out: string[] = []
  if (doiCol >= 0 || pmidCol >= 0) {
    for (const line of lines.slice(1)) {
      const cells = csvCells(line, sep)
      const d = doiCol >= 0 ? idsInText(cells[doiCol] ?? '').find(x => x.startsWith('10.')) : undefined
      const p = pmidCol >= 0 ? (cells[pmidCol] ?? '').match(/\d{5,9}/)?.[0] : undefined
      if (d) out.push(d); else if (p) out.push(`PMID:${p}`)
    }
    return out
  }
  // no id column: any id-looking cell
  for (const line of lines) for (const c of csvCells(line, sep)) out.push(...idsInText(c, { barePmids: /^\d{6,9}$/.test(c) }))
  return out
}

export function detectFormat(fileName: string, text: string): SeedFormat {
  const ext = fileName.toLowerCase().split('.').pop() ?? ''
  if (ext === 'pdf') return 'pdf'
  if (ext === 'bib' || ext === 'bibtex' || /^\s*@\w+\s*\{/m.test(text)) return 'bibtex'
  if (ext === 'ris' || ext === 'nbib' || /^TY\s{1,2}-/m.test(text)) return 'ris'
  if (ext === 'json' || /^\s*[[{]/.test(text)) return 'csl-json'
  if (ext === 'csv' || ext === 'tsv') return 'csv'
  return 'text'
}

/** Parses a text seed file into unique ids (max 50, the resolver's limit), in file order. */
export function parseSeedText(fileName: string, text: string): { format: SeedFormat; ids: string[] } {
  const format = detectFormat(fileName, text)
  const raw = format === 'bibtex' ? bibtex(text) : format === 'ris' ? ris(text) : format === 'csl-json' ? cslJson(text) : format === 'csv' ? csv(text) : idsInText(text, { barePmids: true })
  return { format, ids: dedupe(raw).slice(0, 50) }
}

export function dedupe(ids: string[]): string[] {
  const seen = new Set<string>(); const out: string[] = []
  for (const id of ids) { const k = id.toLowerCase(); if (!seen.has(k)) { seen.add(k); out.push(id) } }
  return out
}

/** PDF: text of the first 2 pages (unpdf), then the first DOI / arXiv id found. */
export async function parseSeedPdf(bytes: Uint8Array): Promise<{ format: 'pdf'; ids: string[]; text: number }> {
  const pages = (await extractPdfPages(bytes, { maxPages: 2 })).join('\n') // worker thread with a deadline (#12)
  const ids = idsInText(pages.replace(/\s*\n\s*/g, ' ')).filter(x => x.startsWith('10.') || x.startsWith('arXiv:'))
  return { format: 'pdf', ids: dedupe(ids).slice(0, 1), text: pages.length }
}
