import type {KeyboardEvent, ReactNode} from 'react'

import {getNavigationIndex} from '#src/lib/getNavigationIndex.ts'

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
export default <Key extends string>({tabs, activeKey, onChange, idPrefix, label}: Props<Key>) => {
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = tabs.findIndex(tab => tab.key === activeKey)
    const nextIndex = getNavigationIndex(event.key, index, tabs.length)
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
