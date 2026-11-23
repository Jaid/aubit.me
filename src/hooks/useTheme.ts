import {useSyncExternalStore} from 'react'

import {readStorage, writeStorage} from '#src/lib/inputStore.ts'

export type Theme = 'dark' | 'light'
export type ThemePreference = Theme | 'system'
const key = 'aubit.me:theme'
const eventName = 'aubit-theme-change'
const media = matchMedia('(prefers-color-scheme: light)')
const getSystemTheme = (): Theme => (media.matches ? 'light' : 'dark')
const stored = readStorage(key)
let preference: ThemePreference = stored === 'dark' || stored === 'light' ? stored : 'system'
const apply = () => {
  const effective = preference === 'system' ? getSystemTheme() : preference
  document.documentElement.toggleAttribute('data-dark', preference === 'dark')
  document.documentElement.toggleAttribute('data-light', preference === 'light')
  document.documentElement.dataset.themePreference = preference
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', effective === 'dark' ? '#000000' : '#ffffff')
}
export function setTheme(value: ThemePreference) {
  preference = value
  writeStorage(key, preference)
  globalThis.dispatchEvent(new Event(eventName))
}
apply()
media.addEventListener('change', apply)
globalThis.addEventListener(eventName, apply)
const subscribe = (callback: () => void) => {
  globalThis.addEventListener(eventName, callback)
  media.addEventListener('change', callback)
  return () => {
    globalThis.removeEventListener(eventName, callback)
    media.removeEventListener('change', callback)
  }
}
export const useTheme = () => useSyncExternalStore(subscribe, () => (preference === 'system' ? getSystemTheme() : preference))
export const useThemePreference = () => useSyncExternalStore(subscribe, () => preference)
