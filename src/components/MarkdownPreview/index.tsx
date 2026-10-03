import {renderMarkdown} from '#src/lib/markdown/renderMarkdown.ts'

import css from './style.module.sass'

type Props = {
  markdown: string
}
/** Markdown output rendered as sanitized HTML */
export default ({markdown}: Props) => {
  const html = renderMarkdown(markdown)
  return <div className={css.scroller}>
    <article className={css.article} dangerouslySetInnerHTML={{__html: html}} data-markdown-preview />
  </div>
}
