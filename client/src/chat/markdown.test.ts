import { describe, expect, it } from 'vitest'
import { renderMarkdown } from './markdown'

describe('chat markdown', () => {
  it('escapes HTML and renders the safe subset', () => {
    const html = renderMarkdown('Hi <script>x</script> **bold** *it* `a<b`\n\n- one\n- two\n\n1. first')
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
    expect(html).toContain('<strong>bold</strong>')
    expect(html).toContain('<em>it</em>')
    expect(html).toContain('<code>a&lt;b</code>')
    expect(html).toContain('<ul><li>one</li><li>two</li></ul>')
    expect(html).toContain('<ol><li>first</li></ol>')
  })
  it('turns [#rank Title] into paper links and keeps only http(s) links', () => {
    const html = renderMarkdown('See [#3 CD8+ T cell states] and [x](javascript:alert(1)) and [doc](https://example.org/a)')
    expect(html).toContain('<a href="#" class="cite" data-rank="3" title="Open paper #3">#3 CD8+ T cell states</a>')
    expect(html).not.toContain('href="javascript')
    expect(html).toContain('href="https://example.org/a"')
    expect(renderMarkdown('Why is #3 above #4?')).toContain('data-rank="3"')
  })
})
