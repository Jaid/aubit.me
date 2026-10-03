import type {KeyboardEvent, ReactNode} from 'react'

import css from './style.module.sass'

export type TabDefinition<Key extends string> = {
  key: Key
  label: ReactNode
  title?: string
}
type Props<Key extends string> = {
  activeKey: Key
  idPrefix: string
  label: string
  onChange: (key: Key) => void
  tabs: ReadonlyArray<TabDefinition<Key>>
}
/** accessible tab strip following the WAI-ARIA tabs pattern */
export default <Key extends string>({tabs, activeKey, onChange, idPrefix, label}: Props<Key>) => {
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = tabs.findIndex(tab => tab.key === activeKey)
    const offsets: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
    }
    let nextIndex: number | undefined
    if (event.key in offsets) {
      nextIndex = (index + offsets[event.key] + tabs.length) % tabs.length
    } else if (event.key === 'Home') {
      nextIndex = 0
    } else if (event.key === 'End') {
      nextIndex = tabs.length - 1
    }
    if (nextIndex === undefined) {
      return
    }
    event.preventDefault()
    const next = tabs[nextIndex]
    onChange(next.key)
    event.currentTarget.querySelector<HTMLButtonElement>(`#${idPrefix}-tab-${next.key}`)?.focus()
  }
  return <div className={css.tabs} aria-label={label} role='tablist' onKeyDown={handleKeyDown}>
    {tabs.map(tab => {
      const isActive = tab.key === activeKey
      return <button key={tab.key} id={`${idPrefix}-tab-${tab.key}`} className={css.tab} aria-controls={`${idPrefix}-panel`} aria-selected={isActive} role='tab' tabIndex={isActive ? 0 : -1} title={tab.title} type='button' onClick={() => onChange(tab.key)}>
        {tab.label}
      </button>
    })}
  </div>
}
