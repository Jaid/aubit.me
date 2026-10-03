import exampleYaml from '#src/data/example.yaml?raw'

export const draftKey = 'aubit.me:input'
export const backupKey = 'aubit.me:backup'
const tabKey = 'aubit.me:tab'

export function readStorage(key: string) {
  try {
    return globalThis.localStorage?.getItem(key) ?? undefined
  } catch {

  }
}
export function writeStorage(key: string, value: string) {
  try {
    if (!globalThis.localStorage) {
      return false
    }
    globalThis.localStorage.setItem(key, value)
    return true
  } catch {
    return false
  }
}
export function readDraft() {
  return readStorage(draftKey) ?? readStorage('aubit-viewer:input') ?? exampleYaml
}
export function readTab() {
  return readStorage(tabKey) ?? readStorage('aubit-viewer:tab')
}
export const saveText = (text: string) => writeStorage(draftKey, text)
export const saveTab = (tab: string) => writeStorage(tabKey, tab)

/** Panel persistence must not throw when browser storage is blocked. */
export const layoutStorage = {
  getItem: (key: string) => readStorage(key) ?? null,
  setItem: (key: string, value: string) => {
    writeStorage(key, value)
  },
}

export {default as exampleYaml} from '#src/data/example.yaml?raw'
