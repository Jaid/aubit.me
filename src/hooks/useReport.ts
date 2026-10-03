import type {ParseResult, ParseSnapshot} from '#src/lib/report/parseInput.ts'

import {useEffect, useRef, useState} from 'react'

import {inputFailure, materializeSnapshot} from '#src/lib/report/parseInput.ts'

/** Debounced, cancelable parsing. Slow or hostile documents cannot lock the editor thread. */
export function useReport(text: string) {
  const [result, setResult] = useState<ParseResult>(() => materializeSnapshot(inputFailure('', 'Preparing the report\u{2026}')))
  const [lastValid, setLastValid] = useState<ParseResult>()
  const sequence = useRef(0)
  const worker = useRef<Worker | null>(null)
  useEffect(() => {
    const id = ++sequence.current
    let disposed = false
    let watchdog: ReturnType<typeof setTimeout> | undefined
    const accept = (snapshot: ParseSnapshot) => {
      if (disposed || sequence.current !== id) {
        return
      }
      clearTimeout(watchdog)
      const parsed = materializeSnapshot(snapshot)
      setResult(parsed)
      if (parsed.report) {
        setLastValid(parsed)
      }
    }
    const timer = setTimeout(() => {
      try {
        const active = worker.current ??= new Worker(new URL('../lib/report/parser.worker.ts', import.meta.url), {
          type: 'module',
          name: 'aubit-parser',
        })
        active.onmessage = (event: MessageEvent<{
          id: number
          snapshot: ParseSnapshot
        }>) => {
          if (event.data.id === id) {
            accept(event.data.snapshot)
          }
        }
        active.onerror = event => {
          event.preventDefault()
          active.terminate()
          worker.current = null
          accept(inputFailure(text, 'The parser could not finish. Your text is safe; edit the document or reload to retry.'))
        }
        watchdog = setTimeout(() => {
          active.terminate()
          worker.current = null
          accept(inputFailure(text, 'Parsing exceeded the 6-second safety budget. Reduce the size or complexity of this report.'))
        }, 6000)
        active.postMessage({
          id,
          text,
        })
      } catch {
        accept(inputFailure(text, 'The parser worker could not start. Serve the production build over HTTP or HTTPS and reload. Your draft remains available to download.'))
      }
    }, 140)
    return () => {
      disposed = true; clearTimeout(timer); clearTimeout(watchdog)
    }
  }, [text])
  useEffect(() => () => {
    worker.current?.terminate(); worker.current = null
  }, [])
  const pending = result.text !== text
  return {
    result,
    lastValid,
    pending,
  }
}
