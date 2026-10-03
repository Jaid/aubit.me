import type {MonacoApi, MonacoEditor} from '#src/lib/monaco.ts'
import type {InputIssue} from '#src/lib/report/index.ts'
import type {Ref} from 'react'

import {jsonSchema} from 'aubit-schema'
import Monacozen from 'monacozen'
import {useEffect, useImperativeHandle, useRef} from 'react'

import EditorBoundary from '#component/EditorBoundary'
import {useTheme} from '#src/hooks/useTheme.ts'
import {needsSyntaxOnlyEditor, registerSafeYamlLanguage, safeYamlLanguage} from '#src/lib/editorSafety.ts'
import {revealRange} from '#src/lib/monaco.ts'

import css from './style.module.sass'

export type InputEditorHandle = {reveal: (start: number, end: number) => void}
type Props = {
  disabled?: boolean
  issues: ReadonlyArray<InputIssue>
  language: 'json' | 'yaml'
  onChange: (value: string) => void
  onCursorOffsetChange?: (offset: number) => void
  ref?: Ref<InputEditorHandle>
  value: string
}

export default function InputEditor({value, language, disabled, issues, onChange, onCursorOffsetChange, ref}: Props) {
  const theme = useTheme()
  const syntaxOnly = needsSyntaxOnlyEditor(value)
  const editorLanguage = syntaxOnly ? safeYamlLanguage : language
  const editorRef = useRef<MonacoEditor | null>(null)
  const monacoRef = useRef<MonacoApi | null>(null)
  const disposables = useRef<Array<{dispose: () => void}>>([])
  const cursorCallbackRef = useRef(onCursorOffsetChange)
  useEffect(() => {
    cursorCallbackRef.current = onCursorOffsetChange
  }, [onCursorOffsetChange])
  useEffect(() => () => {
    for (const disposable of disposables.current) {
      disposable.dispose()
    } editorRef.current = null
  }, [])
  useImperativeHandle(ref, () => ({reveal: (start, end) => {
    if (editorRef.current) {
      revealRange(editorRef.current, start, end)
    }
  }}), [])
  const applyMarkers = () => {
    const editor = editorRef.current
    const monaco = monacoRef.current
    const model = editor?.getModel()
    if (!monaco || !model) {
      return
    }
    const markers = issues.filter(issue => (syntaxOnly || issue.source !== 'schema') && issue.location).map(issue => {
      const location = issue.location!
      const start = model.getPositionAt(location.start)
      const end = model.getPositionAt(Math.max(location.end, location.start + 1))
      return {
        severity: monaco.MarkerSeverity.Error,
        message: issue.message,
        startLineNumber: start.lineNumber,
        startColumn: start.column,
        endLineNumber: end.lineNumber,
        endColumn: end.column,
      }
    })
    monaco.editor.setModelMarkers(model, 'aubit-input', markers)
  }
  useEffect(applyMarkers, [issues, syntaxOnly])
  const handleMount = (editor: MonacoEditor, monaco: MonacoApi) => {
    for (const disposable of disposables.current) {
      disposable.dispose()
    }
    editorRef.current = editor
    monacoRef.current = monaco
    disposables.current = [editor.onDidChangeCursorPosition(event => {
      const offset = editor.getModel()?.getOffsetAt(event.position)
      if (offset !== undefined) {
        cursorCallbackRef.current?.(offset)
      }
    })]
    applyMarkers()
  }
  const handleChange = (next: string | undefined) => {
    const text = next ?? ''
    const model = editorRef.current?.getModel()
    // Switch before the YAML service starts expensive work on an oversized document.
    if (model && monacoRef.current && needsSyntaxOnlyEditor(text)) {
      monacoRef.current.editor.setModelLanguage(model, safeYamlLanguage)
    }
    onChange(text)
  }
  return <div
    className={css.container} data-input-editor onPasteCapture={event => {
    // Clipboard contents are available before Monaco updates its model or schedules language-service validation.
      if (needsSyntaxOnlyEditor(event.clipboardData.getData('text'))) {
        const model = editorRef.current?.getModel()
        if (model && monacoRef.current) {
          monacoRef.current.editor.setModelLanguage(model, safeYamlLanguage)
        }
      }
    }}
  >
    <EditorBoundary fallback={<div className={css.fallback}><p role='alert'>Monaco could not load. Your draft is available in this plain-text editor.</p><textarea aria-label='Aubit report input' readOnly={disabled} spellCheck={false} value={value} onChange={event => onChange(event.target.value)} /></div>}>
      <Monacozen
        key={syntaxOnly ? 'syntax-only' : 'schema-aware'} aria-label='Aubit report input' beforeMount={registerSafeYamlLanguage} dark={theme === 'dark'} language={editorLanguage} loading={<div className={css.loading}>Loading editor…</div>} monaco={{
          padding: {
            top: 10,
            bottom: 10,
          },
          wordWrap: 'on',
          tabSize: 2,
          scrollBeyondLastLine: false,
        }} path='file:///aubit-input' readOnly={disabled} schema={syntaxOnly ? undefined : jsonSchema} value={value} onChange={handleChange} onMount={handleMount}
      />
    </EditorBoundary>
    {syntaxOnly && <div className={css.serviceNote}>Syntax-only editor for oversized input. Bounded report validation remains active.</div>}
  </div>
}
