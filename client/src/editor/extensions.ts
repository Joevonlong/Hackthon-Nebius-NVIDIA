// The editor extension set: Zettlr's parser, renderers and theme (ported in ./zettlr) plus our wikilink/front-matter layers.
import { EditorView, keymap, drawSelection } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { completionKeymap } from '@codemirror/autocomplete'
import type { Extension } from '@codemirror/state'
import { markdownParser } from './zettlr/parser/markdown-parser'
import { markdownSyntaxHighlighter } from './zettlr/theme/syntax'
import { editorTheme } from './zettlr/theme/editor'
import { themePaperTrail } from './zettlr/theme/themes/papertrail'
import { configField } from './zettlr/util/configuration'
import { renderHeadings } from './zettlr/renderers/render-headings'
import { renderEmphasis } from './zettlr/renderers/render-emphasis'
import { renderHorizontalRules } from './zettlr/renderers/render-hr'
import { renderTasks } from './zettlr/renderers/render-tasks'
import { renderBlockquotes } from './zettlr/renderers/render-blockquotes'
import { frontmatterBlock } from './frontmatter'
import { wikilinks, type WikilinkOptions } from './wikilinks'

export function editorExtensions (links: WikilinkOptions, onChange: (doc: string) => void): Extension[] {
  return [
    configField,
    history(),
    drawSelection(),
    keymap.of([...completionKeymap, ...defaultKeymap, ...historyKeymap, indentWithTab]),
    EditorView.lineWrapping,
    markdownParser(),
    markdownSyntaxHighlighter(),
    editorTheme,
    themePaperTrail,
    renderHeadings,
    renderEmphasis,
    renderHorizontalRules,
    renderTasks,
    renderBlockquotes,
    frontmatterBlock,
    wikilinks(links),
    EditorView.updateListener.of(u => { if (u.docChanged) onChange(u.state.doc.toString()) }),
  ]
}
