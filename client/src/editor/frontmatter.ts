// Shows the YAML front matter (Zettlr's YAMLFrontmatter node) as a muted monospace block with highlighted keys.
import { syntaxTree } from '@codemirror/language'
import type { Range } from '@codemirror/state'
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view'

function build (view: EditorView): DecorationSet {
  const out: Range<Decoration>[] = []
  const fm = syntaxTree(view.state).topNode.firstChild
  if (!fm || fm.name !== 'YAMLFrontmatter') return Decoration.none
  const doc = view.state.doc
  const first = doc.lineAt(fm.from).number
  const last = doc.lineAt(fm.to).number
  for (let n = first; n <= last; n++) {
    const line = doc.line(n)
    const cls = 'cm-fm-line' + (n === first ? ' cm-fm-first' : '') + (n === last ? ' cm-fm-last' : '')
    out.push(Decoration.line({ class: cls }).range(line.from))
    const kv = /^([A-Za-z0-9_-]+):/.exec(line.text)
    if (kv && n !== first && n !== last) out.push(Decoration.mark({ class: 'cm-fm-key' }).range(line.from, line.from + kv[1].length + 1))
  }
  return Decoration.set(out, true)
}

export const frontmatterBlock = ViewPlugin.fromClass(class {
  decorations: DecorationSet
  constructor (view: EditorView) { this.decorations = build(view) }
  update (u: ViewUpdate) { if (u.docChanged || u.viewportChanged) this.decorations = build(u.view) }
}, { decorations: v => v.decorations })
