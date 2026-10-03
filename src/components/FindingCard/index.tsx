import type {Category, Finding} from '#src/lib/report/index.ts'
import type {CSSProperties, MouseEvent} from 'react'

import {useEffect, useRef} from 'react'

import ChangeView from '#component/ChangeView'
import Markdown from '#component/Markdown'

import css from './style.module.sass'

type Props = {
  finding: Finding
  isActive?: boolean
  onCategorySelect?: (category: Category) => void
  onReveal?: (finding: Finding) => void
}
const hasTextSelection = () => {
  const selection = globalThis.getSelection?.()
  return Boolean(selection && !selection.isCollapsed)
}
/** one finding with its metadata and suggested changes */
export default ({finding, isActive = false, onReveal, onCategorySelect}: Props) => {
  const ref = useRef<HTMLElement>(null)
  useEffect(() => {
    if (isActive) {
      ref.current?.scrollIntoView?.({
        block: 'nearest',
        behavior: 'smooth',
      })
    }
  }, [isActive])
  const style = {
    '--hue': finding.priority.hue,
    '--chroma': finding.priority.chroma,
  } as CSSProperties
  const handleClick = (event: MouseEvent) => {
    if (!onReveal || hasTextSelection()) {
      return
    }
    if ((event.target as HTMLElement).closest('button,a')) {
      return
    }
    onReveal(finding)
  }
  return <article className={css.card} data-active={isActive || undefined} data-finding={finding.id} data-priority={finding.priority.level} style={style} ref={ref} onClick={handleClick}>
    <header className={css.header}>
      <span className={css.badge} title={finding.priority.label}>{finding.priority.code}</span>
      <Markdown className={css.title} as='h3' inline source={finding.title} />
    </header>
    <div className={css.meta}>
      <button className={css.id} title={finding.source ? `Reveal in editor (line ${finding.source.line})` : 'Reveal in editor'} type='button' onClick={() => onReveal?.(finding)}>
        {finding.id}
        {finding.source && <span className={css.line}>:{finding.source.line}</span>}
      </button>
      {finding.specificCategories.map(category => {
        const chipStyle = {
          '--hue': category.hue,
          '--chroma': category.chroma,
        } as CSSProperties
        return <button key={category.id} className={css.category} style={chipStyle} title={category.description ?? `Filter by ${category.label}`} type='button' onClick={() => onCategorySelect?.(category)}>
          {category.segments.map((segment, index) => <span key={segment} className={index === 0 && !category.isRoot ? css.categoryRoot : undefined}>{segment}</span>)}
        </button>
      })}
    </div>
    {finding.description && <Markdown className={css.description} source={finding.description} />}
    {finding.changes.length > 0 && <div className={css.changes}>
      {finding.changes.map((change, index) => <ChangeView key={`${index}:${change.file}`} change={change} />)}
    </div>}
  </article>
}
