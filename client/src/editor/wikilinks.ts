// [[wikilink]] rendering, click-to-open and `[[` autocomplete. Uses the ZknLink nodes from Zettlr's zkn-link-parser.
import { syntaxTree } from '@codemirror/language'
import type { Range } from '@codemirror/state'
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view'
import { autocompletion, type Completion, type CompletionContext } from '@codemirror/autocomplete'
import { rangeInSelection } from './zettlr/util/range-in-selection'

export interface WikilinkOptions {
  exists: (target: string) => boolean
  open: (target: string) => void
  names: () => string[]
}

function build (view: EditorView, o: WikilinkOptions): DecorationSet {
  const out: Range<Decoration>[] = []
  const hide = Decoration.replace({})
  for (const { from, to } of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from, to,
      enter (node) {
        if (node.name !== 'ZknLink') return
        const content = node.node.getChild('ZknLinkContent')
        if (!content) return false
        const target = view.state.sliceDoc(content.from, content.to).trim()
        const ok = o.exists(target)
        out.push(Decoration.mark({
          class: 'cm-wikilink' + (ok ? '' : ' cm-wikilink-missing'),
          attributes: { 'data-target': target, title: (ok ? 'Open ' : 'Create ') + target + ' (Alt-click to edit)' }
        }).range(node.from, node.to))
        if (!rangeInSelection(view.state.selection, node.from, node.to, true)) {
          for (const m of node.node.getChildren('ZknLinkMark')) out.push(hide.range(m.from, m.to))
          const title = node.node.getChild('ZknLinkTitle')
          const pipe = node.node.getChild('ZknLinkPipe')
          if (title && pipe) out.push(hide.range(Math.min(content.from, pipe.from), Math.max(content.to, pipe.to)))
        }
        return false
      }
    })
  }
  return Decoration.set(out, true)
}

export function wikilinks (o: WikilinkOptions) {
  const plugin = ViewPlugin.fromClass(class {
    decorations: DecorationSet
    constructor (view: EditorView) { this.decorations = build(view, o) }
    update (u: ViewUpdate) { if (u.docChanged || u.viewportChanged || u.selectionSet) this.decorations = build(u.view, o) }
  }, { decorations: v => v.decorations })

  const click = EditorView.domEventHandlers({
    mousedown (e) {
      const el = (e.target as HTMLElement | null)?.closest?.('.cm-wikilink') as HTMLElement | null
      if (!el || e.altKey || e.button !== 0) return false
      e.preventDefault()
      o.open(el.dataset.target || '')
      return true
    }
  })

  const complete = autocompletion({
    activateOnTyping: true,
    override: [(ctx: CompletionContext) => {
      const m = ctx.matchBefore(/\[\[[^\]\n|]*/)
      if (!m) return null
      const options: Completion[] = o.names().map(label => ({
        label,
        type: 'text',
        apply: (view, c, from, to) => {
          const closed = view.state.sliceDoc(to, to + 2) === ']]'
          const insert = c.label + (closed ? '' : ']]')
          view.dispatch({ changes: { from, to, insert }, selection: { anchor: from + insert.length + (closed ? 2 : 0) } })
        }
      }))
      return { from: m.from + 2, options, validFor: /^[^\]\n|]*$/ }
    }]
  })
  return [plugin, click, complete]
}
