// Shared note helpers (captain-owned). Used by workspace (B) and discover/graph (C).
import type { Note } from './vault'

/** Targets of [[wikilinks]] in a note body, without alias part: [[Target|alias]] -> "Target". */
export function extractLinks(content: string): string[] {
  const out: string[] = []
  for (const m of content.matchAll(/\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]/g)) out.push(m[1].trim())
  return out
}

/** Resolves a wikilink target to a note by file name (without .md), title, or path. Case-insensitive. */
export function resolveLink(target: string, notes: Note[]): Note | undefined {
  const t = target.toLowerCase().replace(/\.md$/, '')
  return notes.find(n => n.path.toLowerCase().replace(/\.md$/, '').split('/').pop() === t)
    || notes.find(n => n.title.toLowerCase() === t)
    || notes.find(n => n.path.toLowerCase().replace(/\.md$/, '') === t)
}

/** Notes whose body links to `note`. */
export function backlinks(note: Note, notes: Note[]): Note[] {
  return notes.filter(n => n.path !== note.path && extractLinks(n.content).some(t => resolveLink(t, notes)?.path === note.path))
}

/** Minimal YAML front matter split: returns flat key -> raw string values and the body. */
export function parseFrontMatter(content: string): { data: Record<string, string>; body: string } {
  const m = content.match(/^---\n([\s\S]*?)\n---\n?/)
  if (!m) return { data: {}, body: content }
  const data: Record<string, string> = {}
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/)
    if (kv) data[kv[1]] = kv[2].replace(/^"(.*)"$/, '$1')
  }
  return { data, body: content.slice(m[0].length) }
}

/** File name used for a note: "Seeds/S1 Tirosh 2016.md" -> "S1 Tirosh 2016". */
export const noteName = (path: string) => path.split('/').pop()!.replace(/\.md$/, '')
