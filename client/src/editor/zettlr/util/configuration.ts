// Shim for Zettlr's editor configuration field (source/common/modules/markdown-editor/util/configuration.ts).
// The web app has no desktop config service, so we expose a StateField with the defaults the ported renderers read.
import { StateField } from '@codemirror/state'

export interface EditorConfiguration { previewModeShowSyntaxWhenCursorIsAdjacent: boolean }
export function getDefaultConfig (): EditorConfiguration { return { previewModeShowSyntaxWhenCursorIsAdjacent: true } }
export const configField = StateField.define<EditorConfiguration>({
  create: () => getDefaultConfig(),
  update: v => v
})
