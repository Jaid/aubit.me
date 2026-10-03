import {useSyncExternalStore} from 'react'

/** live result of a CSS media query */
export const useMediaQuery = (query: string) => {
  const subscribe = (callback: () => void) => {
    if (typeof globalThis.matchMedia !== 'function') {
      return () => {}
    }
    const media = globalThis.matchMedia(query)
    media.addEventListener('change', callback)
    return () => media.removeEventListener('change', callback)
  }
  return useSyncExternalStore(subscribe, () => globalThis.matchMedia?.(query).matches ?? false, () => false)
}
