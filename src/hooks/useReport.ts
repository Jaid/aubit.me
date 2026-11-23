import type {ParseResult, ParseSnapshot} from '#src/lib/report/parseInput.ts'

import {useEffect, useRef, useState} from 'react'

import {inputFailure, materializeSnapshot} from '#src/lib/report/parseInput.ts'

export function useReport(text: string) {
  const [result, setResult] = useState<ParseResult>(() => materializeSnapshot(inputFailure('', 'Preparing the report\u{2026}')))
  const [lastValid, setLastValid] = useState<ParseResult>()
  const worker = useRef<Worker | null>(null)
  useEffect(() => {
    const listeners = new AbortController
    let running = false
    let watchdog: ReturnType<typeof setTimeout> | undefined
    const stopWorker = () => {
      worker.current?.terminate()
      worker.current = null
    }
    const accept = (snapshot: ParseSnapshot) => {
      running = false
      listeners.abort()
      clearTimeout(watchdog)
      const parsed = materializeSnapshot(snapshot)
      setResult(parsed)
      if (parsed.report) {
        setLastValid(parsed)
      }
    }
    const timer = setTimeout(() => {
      try {
        worker.current ??= new Worker(new URL('../lib/report/parser.worker.ts', import.meta.url), {
          type: 'module',
          name: 'aubit-parser',
        })
        const {signal} = listeners
        worker.current.addEventListener('message', (event: MessageEvent<ParseSnapshot>) => accept(event.data), {signal})
        worker.current.addEventListener('error', event => {
          event.preventDefault()
          stopWorker()
          accept(inputFailure(text, 'The parser could not finish. Your text is safe; edit the document or reload to retry.'))
        }, {signal})
        watchdog = setTimeout(() => {
          stopWorker()
          accept(inputFailure(text, 'Parsing exceeded the 6-second safety budget. Reduce the size or complexity of this report.'))
        }, 6000)
        running = true
        worker.current.postMessage(text)
      } catch {
        stopWorker()
        accept(inputFailure(text, 'The parser worker could not start. Serve the production build over HTTP or HTTPS and reload. Your draft remains available to download.'))
      }
    }, 140)
    return () => {
      listeners.abort()
      clearTimeout(timer)
      clearTimeout(watchdog)
      // Reuse idle workers, but never queue a new draft behind an obsolete parse.
      if (running) {
        stopWorker()
      }
    }
  }, [text])
  useEffect(() => () => {
    worker.current?.terminate()
    worker.current = null
  }, [])
  const pending = result.text !== text
  return {
    result,
    lastValid,
    pending,
  }
}
