// PaperTrail editor theme in Zettlr's variable scheme (see berlin.ts). The values point at our design tokens
// (client/src/styles/tokens.css), so Brightfield / Fluorescence switch the editor without a reconfigure.
import { EditorView } from '@codemirror/view'
import { defaultVarsLight, type ThemeVars } from '../editor'

const vars: ThemeVars = {
  ...defaultVarsLight,
  '--zettlr-editor-primary-color': 'var(--seed)',
  '--zettlr-editor-secondary-color': 'var(--cand)',
  '--zettlr-editor-scroller-color': 'var(--fg)',
  '--zettlr-editor-scroller-bg': 'var(--surface)',
  '--zettlr-editor-selection-color': 'var(--seed-soft)',
  '--zettlr-editor-highlight-color': 'var(--cand-soft)',
  '--zettlr-editor-font': 'var(--font-body)',
  '--zettlr-editor-code-font': 'var(--font-mono)',
  '--zettlr-editor-font-size': '15px',
  '--zettlr-editor-line-height': '1.65',
  '--zettlr-editor-header-style': '600',
  '--zettlr-editor-citation-color': 'var(--muted)',
  '--zettlr-editor-citation-bg': 'var(--surface-2)',
  '--zettlr-editor-code-color': 'var(--muted)',
  '--zettlr-editor-code-bg': 'var(--surface-2)',
  '--zettlr-editor-escape-color': 'var(--muted)',
  '--zettlr-editor-accent-color': 'var(--muted)',
  '--zettlr-editor-accent-bg': 'var(--surface-2)',
  '--zettlr-editor-header-1-size': '1.75em',
  '--zettlr-editor-header-2-size': '1.35em',
  '--zettlr-editor-header-3-size': '1.15em',
  '--zettlr-editor-header-4-size': '1.05em',
  '--zettlr-editor-error-color': 'var(--crit)',
}

export const themePaperTrail = EditorView.theme({ '&': vars })
