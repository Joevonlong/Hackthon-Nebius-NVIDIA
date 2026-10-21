import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import * as Vue from 'vue'
import * as SSR from 'vue/server-renderer'
import { compileTemplate, parse } from 'vue/compiler-sfc'

// vitest.config.ts has no .vue plugin, so compile the template of the real KnownPapers.vue to an SSR render function here.
function loadKnownPapers() {
  const file = new URL('./KnownPapers.vue', import.meta.url)
  const { descriptor } = parse(readFileSync(file, 'utf8'), { filename: 'KnownPapers.vue' })
  const out = compileTemplate({ source: descriptor.template!.content, filename: 'KnownPapers.vue', id: 'known-papers', ssr: true })
  if (out.errors.length) throw new Error(String(out.errors[0]))
  const mods: Record<string, unknown> = { vue: Vue, 'vue/server-renderer': SSR }
  const body = out.code
    .replace(/import \{([^}]*)\} from ["']([^"']+)["']/g, (_m, names: string, mod: string) => `const {${names.replace(/ as /g, ': ')}} = __mods["${mod}"]`)
    .replace('export function ssrRender', 'function ssrRender') + '\nreturn ssrRender'
  const ssrRender = new Function('__mods', body)(mods)
  return { props: ['knownPapers', 'notesKnown', 'notesAsKnown'], ssrRender }
}
const render = (props: { knownPapers: string[]; notesKnown: number; notesAsKnown: boolean }) => SSR.renderToString(Vue.createSSRApp(loadKnownPapers(), props))

describe('KnownPapers section', () => {
  it('shows the chips AND the notice when notes name papers', async () => {
    const html = await render({ knownPapers: ['10.1234/a', 'pmid:1234567'], notesKnown: 2, notesAsKnown: true })
    expect(html).toContain('10.1234/a')
    expect(html).toContain('pmid:1234567')
    expect(html).toContain('2 papers from your notes will be treated as known')
    expect(html).not.toContain('None:')
  })
  it('shows the chips without a notice when no paper comes from notes', async () => {
    const html = await render({ knownPapers: ['10.1234/a'], notesKnown: 0, notesAsKnown: true })
    expect(html).toContain('10.1234/a')
    expect(html).not.toContain('from your notes')
  })
  it('shows "None" and no chips when nothing is known, with the notice for the toggle state', async () => {
    const html = await render({ knownPapers: [], notesKnown: 1, notesAsKnown: false })
    expect(html).toContain('None:')
    expect(html).not.toContain('class="chips')
    expect(html).toContain('1 paper from your notes will be left out of the known papers')
  })
})
