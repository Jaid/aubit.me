import type {ElementType} from 'react'

import {renderInlineMarkdown, renderMarkdown} from '#src/lib/markdown/renderMarkdown.ts'
import {escapeMarkdown} from '#src/lib/markdown/syntax.ts'

type Props = {
  as?: ElementType
  className?: string
  inline?: boolean
  source: string
}
/** Report prose is literal data. The full generated report is rendered by MarkdownPreview. */
export default function Markdown({source, inline = false, className, as}: Props) {
  const Element = as ?? (inline ? 'span' : 'div')
  const literal = escapeMarkdown(source)
  const html = inline ? renderInlineMarkdown(literal) : renderMarkdown(literal)
  return <Element className={className} dangerouslySetInnerHTML={{__html: html}} />
}
