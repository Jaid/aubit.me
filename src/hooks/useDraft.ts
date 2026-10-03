import {useCallback, useEffect, useRef, useState} from 'react'

import {backupKey, draftKey, exampleYaml, readDraft, readStorage, saveText, writeStorage} from '#src/lib/inputStore.ts'
import {assertInputSize} from '#src/lib/limits.ts'

export function useDraft(ready: boolean, notify: (message: string) => void) {
  const [text, setText] = useState(readDraft)
  const [backup, setBackup] = useState(() => readStorage(backupKey))
  const [saveState, setSaveState] = useState('saving')
  const current = useRef(text)
  const conflicted = useRef(false)
  const update = useCallback((next: string) => {
    current.current = next
    setText(next)
  }, [])
  const checkpoint = useCallback((previous: string) => {
    setBackup(previous)
    try {
      assertInputSize(previous)
      writeStorage(backupKey, previous)
    } catch { /* In-memory recovery remains available when persistence is unavailable. */ }
  }, [])
  const replace = useCallback((next: string, label: string, confirm = true) => {
    assertInputSize(next)
    const previous = current.current
    if (previous === next) {
      return false
    }
    if (confirm && previous.trim() && previous !== exampleYaml && !globalThis.confirm('Replace the current draft? A recovery copy will remain available with Undo replacement.')) {
      return false
    }
    checkpoint(previous)
    update(next)
    notify(`${label} Undo replacement keeps your previous draft available.`)
    return true
  }, [checkpoint, notify, update])
  const restore = useCallback(() => {
    if (backup === undefined) {
      return
    }
    const previous = current.current
    update(backup)
    checkpoint(previous)
    notify('Previous draft restored.')
  }, [backup, checkpoint, notify, update])
  const resolveConflict = useCallback(() => {
    if (!globalThis.confirm('Save this tab over the draft from another tab? That other draft will become your recovery copy.')) {
      return
    }
    const other = readStorage(draftKey)
    if (other !== undefined && other !== current.current) {
      checkpoint(other)
    }
    try {
      assertInputSize(current.current)
      conflicted.current = false
      setSaveState(saveText(current.current) ? 'saved' : 'unavailable')
      notify('This tab is now the saved draft. The other draft is available with Undo replacement.')
    } catch (error) {
      setSaveState('too-large')
      notify(Error.isError(error) ? error.message : 'The draft could not be saved.')
    }
  }, [checkpoint, notify])
  useEffect(() => {
    if (!ready || conflicted.current) {
      return
    }
    setSaveState('saving')
    const timer = setTimeout(() => {
      if (conflicted.current) {
        return
      }
      try {
        assertInputSize(text)
        setSaveState(saveText(text) ? 'saved' : 'unavailable')
      } catch {
        setSaveState('too-large')
      }
    }, 350)
    return () => clearTimeout(timer)
  }, [text, ready])
  useEffect(() => {
    const flush = () => {
      if (!ready || conflicted.current) {
        return
      }
      try {
        assertInputSize(current.current)
        saveText(current.current)
      } catch { /* Keep the previous on-disk draft. */ }
    }
    const storage = (event: StorageEvent) => {
      if (event.key === draftKey && event.newValue !== current.current) {
        conflicted.current = true
        setSaveState('conflict')
        notify('Another tab changed the saved draft. Autosave is paused here. Download your copy, reload, or choose Save this tab.')
      }
    }
    const hide = () => {
      if (document.visibilityState === 'hidden') {
        flush()
      }
    }
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', hide)
    globalThis.addEventListener('storage', storage)
    return () => {
      window.removeEventListener('pagehide', flush)
      document.removeEventListener('visibilitychange', hide)
      globalThis.removeEventListener('storage', storage)
    }
  }, [notify, ready])
  return {
    text,
    current,
    update,
    replace,
    restore,
    resolveConflict,
    hasBackup: backup !== undefined,
    saveState,
  }
}
