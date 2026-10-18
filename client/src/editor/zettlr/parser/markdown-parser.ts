// Lean port of Zettlr's markdown-parser.ts (source/common/modules/markdown-editor/parser/markdown-parser.ts).
// Keeps the Zettlr AST nodes our renderers need (front matter, [[wikilinks]], #tags, ==highlights==);
// drops nested code languages, citations, math and Pandoc tables to keep the web bundle small.
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { customTags } from '../util/custom-tags'
import { frontmatterParser } from './frontmatter-parser'
import { zknLinkParser } from './zkn-link-parser'
import { zknTagParser } from './zkn-tag-parser'
import { highlightParser } from './highlight-parser'

export function markdownParser () {
  return markdown({
    base: markdownLanguage,
    addKeymap: true,
    extensions: {
      parseBlock: [frontmatterParser],
      parseInline: [zknLinkParser(), zknTagParser, highlightParser],
      defineNodes: [
        { name: 'YAMLFrontmatter', block: true, style: { 'YAMLFrontmatter/...': customTags.YAMLFrontmatter } },
        { name: 'YAMLFrontmatterStart', style: customTags.YAMLFrontmatterStart },
        { name: 'YAMLFrontmatterEnd', style: customTags.YAMLFrontmatterEnd },
        { name: 'HighlightMark', style: customTags.HighlightMark },
        { name: 'HighlightContent', style: { 'HighlightContent/...': customTags.HighlightContent } },
        { name: 'ZknLink', style: { 'ZknLink/...': customTags.ZknLink } },
        { name: 'ZknLinkMark', style: customTags.ZknLinkMark },
        { name: 'ZknLinkContent', style: customTags.ZknLinkContent },
        { name: 'ZknLinkTitle', style: customTags.ZknLinkTitle },
        { name: 'ZknLinkPipe', style: customTags.ZknLinkPipe },
        { name: 'ZknTag', style: { 'ZknTag/...': customTags.ZknTag } },
        { name: 'ZknTagMark', style: customTags.ZknTagMark },
      ]
    }
  })
}
