import {useSyncExternalStore} from 'react'

import {readStorage, writeStorage} from '#src/lib/inputStore.ts'

export type Theme = 'dark' | 'light'
export type ThemePreference = Theme | 'system'
const key = 'aubit.me:theme'
const eventName = 'aubit-theme-change'
const getSystemTheme = (): Theme => (globalThis.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark')
const stored = readStorage(key) ?? readStorage('aubit-viewer:theme')
let preference: ThemePreference = stored === 'dark' || stored === 'light' ? stored : 'system'
const apply = () => {
  if (typeof document === 'undefined') {
    return
  }
  const effective = preference === 'system' ? getSystemTheme() : preference
  document.documentElement.toggleAttribute('data-dark', preference === 'dark')
  document.documentElement.toggleAttribute('data-light', preference === 'light')
  document.documentElement.dataset.themePreference = preference
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', effective === 'dark' ? '#000000' : '#ffffff')
}
export function setTheme(value: ThemePreference | undefined) {
  preference = value ?? 'system'
  writeStorage(key, preference)
  apply()
  globalThis.dispatchEvent?.(new Event(eventName))
}
apply()
const subscribe = (callback: () => void) => {
  const media = globalThis.matchMedia?.('(prefers-color-scheme: light)')
  const update = () => {
    apply(); callback()
  }
  globalThis.addEventListener?.(eventName, update)
  media?.addEventListener('change', update)
  return () => {
    globalThis.removeEventListener?.(eventName, update); media?.removeEventListener('change', update)
  }
}
export const useTheme = () => useSyncExternalStore(subscribe, () => (preference === 'system' ? getSystemTheme() : preference), () => 'dark')
export const useThemePreference = () => useSyncExternalStore(subscribe, () => preference, () => 'system')
