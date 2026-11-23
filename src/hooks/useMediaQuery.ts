import {useSyncExternalStore} from 'react'

export const useMediaQuery = (media: MediaQueryList) => {
  const subscribe = (callback: () => void) => {
    media.addEventListener('change', callback)
    return () => media.removeEventListener('change', callback)
  }
  return useSyncExternalStore(subscribe, () => media.matches)
}
