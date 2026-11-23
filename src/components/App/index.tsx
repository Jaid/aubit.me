import type {InputEditorHandle} from '#component/InputEditor'
import type {OutputTab} from '#component/OutputPane'
import type {Finding, InputIssue} from '#src/lib/report/index.ts'
import type {DragEvent} from 'react'

import {documentJsonSchema} from 'aubit-schema'
import {useCallback, useEffect, useRef, useState} from 'react'
import {Group, Panel, Separator, useDefaultLayout} from 'react-resizable-panels'

import EditorHeader from '#component/EditorHeader'
import InputEditor from '#component/InputEditor'
import IssueList from '#component/IssueList'
import OutputPane, {outputTabs, readOutputTab} from '#component/OutputPane'
import {useDraft} from '#src/hooks/useDraft.ts'
import {useMediaQuery} from '#src/hooks/useMediaQuery.ts'
import {useReport} from '#src/hooks/useReport.ts'
import {downloadText} from '#src/lib/download.ts'
import {exampleYaml, layoutStorage, readTab, saveTab} from '#src/lib/inputStore.ts'
import {assertInputSize, inputByteLength, maxInputBytes} from '#src/lib/limits.ts'
import {readPermalinkState} from '#src/lib/permalink.ts'
import {formatInput} from '#src/lib/report/parseInput.ts'

import css from './style.module.sass'

const narrowScreen = matchMedia('(max-width: 720px)')
const saveLabels = {
  conflict: 'Another tab saved · autosave paused',
  saved: 'Saved locally',
  saving: 'Saving…',
  'too-large': 'Too large to save · download your text',
  unavailable: 'Local save unavailable · download your text',
}
export default function App() {
  const [ready, setReady] = useState(false)
  const [notice, setNotice] = useState('')
  const notify = useCallback((message: string) => setNotice(message), [])
  const draft = useDraft(ready, notify)
  const {text, current, replace} = draft
  const {result, lastValid, pending} = useReport(text)
  const [tab, setTab] = useState<OutputTab>(() => readOutputTab(readTab()) ?? 'render')
  const [cursorOffset, setCursorOffset] = useState<number>()
  const [dragging, setDragging] = useState(false)
  const editor = useRef<InputEditorHandle>(null)
  const help = useRef<HTMLDialogElement>(null)
  const linkSequence = useRef(0)
  const fileSequence = useRef(0)
  const isNarrow = useMediaQuery(narrowScreen)
  const orientation = isNarrow ? 'vertical' : 'horizontal'
  const layout = useDefaultLayout({
    id: `aubit.me:panes:${orientation}`,
    storage: layoutStorage,
    onlySaveAfterUserInteractions: true,
  })
  const changeTab = useCallback((next: OutputTab) => {
    setTab(next)
    saveTab(next)
  }, [])
  useEffect(() => {
    let disposed = false
    const openLink = async (initial: boolean) => {
      const id = ++linkSequence.current
      const before = current.current
      setReady(false)
      try {
        const url = new URL(location.href)
        const state = await readPermalinkState(url)
        if (disposed || id !== linkSequence.current) {
          return
        }
        if (state && location.href === url.href) {
          if (current.current !== before) {
            notify('The shared report was not applied because you edited this draft while it was opening.')
            return
          }
          const changed = replace(state.yaml, 'Shared report opened.', !initial)
          if (changed || state.yaml === current.current) {
            const sharedTab = readOutputTab(state.tab)
            if (sharedTab) {
              changeTab(sharedTab)
            }
            url.hash = ''
            history.replaceState(history.state, '', url)
          }
        }
      } catch (error) {
        if (!disposed) {
          notify(Error.isError(error) ? error.message : 'The shared report could not be opened. Your saved draft was kept.')
        }
      } finally {
        if (!disposed && id === linkSequence.current) {
          setReady(true)
        }
      }
    }
    openLink(true).catch(error => notify(String(error)))
    const changed = () => {
      if (location.hash.startsWith('#data:')) {
        openLink(false).catch(error => notify(String(error)))
      }
    }
    globalThis.addEventListener('hashchange', changed)
    return () => {
      disposed = true
      globalThis.removeEventListener('hashchange', changed)
    }
  }, [changeTab, current, notify, replace])
  useEffect(() => {
    if (!notice) {
      return
    }
    const timer = setTimeout(() => setNotice(''), 10_000)
    return () => clearTimeout(timer)
  }, [notice])
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.getModifierState('AltGraph') || help.current?.open) {
        return
      }
      const key = /^Digit([1-9])$/.exec(event.code)
      const next = key ? outputTabs[Number(key[1]) - 1] : undefined
      if (next) {
        event.preventDefault()
        changeTab(next)
      }
    }
    globalThis.addEventListener('keydown', onKey, {capture: true})
    return () => globalThis.removeEventListener('keydown', onKey, {capture: true})
  }, [changeTab])
  const shown = result.report ? result : lastValid
  const isStale = pending || !result.report
  const toggleVisibility = (finding: Finding) => {
    const edit = finding.source?.visibilityEdit
    if (edit && ready && !isStale && current.current === result.text) {
      const next = text.slice(0, edit.start) + edit.text + text.slice(edit.end)
      try {
        assertInputSize(next)
        // Monaco's change event updates the draft and preserves carets across the range edit.
        if (!editor.current?.applyEdit(text, edit)) {
          draft.update(next)
        }
      } catch (error) {
        notify(String(error))
      }
    }
  }
  const revealFinding = (finding: Finding) => {
    if (!isStale && finding.source) {
      editor.current?.revealEntry(finding.source.start, finding.source.end)
    }
  }
  const revealIssue = (issue: InputIssue) => {
    if (!pending && issue.location) {
      editor.current?.reveal(issue.location.start, Math.max(issue.location.end, issue.location.start + 1))
    }
  }
  const downloadInput = () => downloadText(text, `aubit-input.${result.language}`, result.language === 'json' ? 'application/json' : 'application/yaml')
  const importFile = (file: File) => {
    fileSequence.current++
    if (file.size > maxInputBytes) {
      notify('This file exceeds the 2 MB input limit. Your draft is unchanged.')
      return
    }
    const id = fileSequence.current
    file.text().then(next => {
      if (id === fileSequence.current) {
        replace(next, `Opened ${file.name}.`)
      }
    }).catch(error => notify(Error.isError(error) ? error.message : 'The file could not be opened. Your draft is unchanged.'))
  }
  const format = (language: 'json' | 'yaml') => {
    try {
      replace(formatInput(result.raw, language), `Formatted as ${language.toUpperCase()}. Comments and source formatting are not retained.`, false)
    } catch (error) {
      notify(Error.isError(error) ? error.message : 'Formatting failed. Your draft is unchanged.')
    }
  }
  const drop = (event: DragEvent<HTMLElement>) => {
    if (!event.dataTransfer.types.includes('Files')) {
      return
    }
    event.preventDefault()
    event.stopPropagation()
    setDragging(false)
    if (!ready) {
      return
    }
    if (event.dataTransfer.files.length !== 1) {
      notify('Drop exactly one YAML or JSON report at a time.')
      return
    }
    importFile(event.dataTransfer.files[0])
  }
  const bytes = inputByteLength(text)
  const saveLabel = saveLabels[draft.saveState]
  return <main
    className={css.workspace} data-app='aubit-viewer' onDragLeave={event => {
      if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) {
        setDragging(false)
      }
    }} onDragOver={event => {
      if (event.dataTransfer.types.includes('Files')) {
        event.preventDefault()
        event.dataTransfer.dropEffect = 'copy'
        setDragging(true)
      }
    }} onDropCapture={drop}
  >
    <Group
      id='workspace' className={css.container} defaultLayout={layout.defaultLayout} orientation={orientation} resizeTargetMinimumSize={{
        coarse: 24,
        fine: 10,
      }} onLayoutChanged={layout.onLayoutChanged}
    >
      <Panel id='input' className={css.panel} defaultSize='42%' minSize={isNarrow ? '24%' : '280px'}>
        <div className={css.pane}>
          <EditorHeader
            canFormat={!pending && result.isYamlValid} canUndo={draft.hasBackup && ready} issueCount={result.issues.length} language={result.language} pending={pending} ready={ready} onDownload={downloadInput} onExample={() => replace(exampleYaml, 'Example loaded.')} onFormat={format} onHelp={() => help.current?.showModal()} onNew={() => replace('entries: {}\n', 'New document created.')} onOpenFile={importFile} onUndo={draft.restore}
          />
          <div className={css.paneBody}><InputEditor disabled={!ready} issues={pending ? [] : result.issues} language={result.language} value={text} ref={editor} onChange={draft.update} onCursorOffsetChange={setCursorOffset} /></div>
          {!pending && ready && <IssueList issues={result.issues} onReveal={revealIssue} />}
          <footer className={css.inputFooter}><span data-save-state={draft.saveState}>{saveLabel}</span>{draft.saveState === 'conflict' && <button type='button' onClick={draft.resolveConflict}>Save this tab</button>}<span>{text.split('\n').length} lines · {bytes < 1000 ? `${bytes} B` : `${(bytes / 1000).toFixed(1)} kB`}</span></footer>
          {dragging && <div className={css.dropOverlay}>Drop one YAML or JSON report · up to 2 MB</div>}
        </div>
      </Panel>
      <Separator className={css.separator} aria-label='Resize input and output panes'><span /></Separator>
      <Panel id='output' className={css.panel} minSize={isNarrow ? '30%' : '320px'}>
        <OutputPane key={draft.replacementId} current={result} cursorOffset={cursorOffset} isStale={isStale} notify={notify} pending={pending} result={shown} tab={tab} text={text} onReveal={revealFinding} onTabChange={changeTab} onToggleVisibility={toggleVisibility} />
      </Panel>
    </Group>
    <div className={css.notice} aria-live='polite' hidden={!notice} role='status'><span>{notice}</span><button aria-label='Dismiss notification' type='button' onClick={() => setNotice('')}>×</button></div>
    <dialog className={css.help} aria-labelledby='help-title' ref={help}>
      <header><h2 id='help-title'>Aubit, at a glance</h2><button aria-label='Close help' autoFocus type='button' onClick={() => help.current?.close()}>×</button></header>
      <p>A local-first workspace for reviewing code-audit reports. The editor, validation, preview, and exports run in your browser. Suggested file changes and regular expressions are never applied or executed.</p>
      <h3>Document format</h3>
      <pre><code>{'entries:\n  meaningful_id:\n    title: A clear description of the issue\n    category: correctness\n    state: open\n    visible: true\ncollection:\n  second_review:\n    entries: {}'}</code></pre>
      <p>Only <code>entries</code> is required. Add <code>collection</code> to include other named reports. Entries can have an optional state (open, resolved or rejected), visibility and review comment.</p>
      <p>Priorities run from P0 (critical) to P4 (trivial); omitted priority defaults to P3. Categories and edits accept either one value or a nonempty array. JSON works too. Use Ctrl+Space for schema-aware completion.</p>
      <h3>What each export means</h3>
      <p>Render, Markdown and HTML show the selected report. Clank includes all reports. Prompt places review instructions before that same Clank output so you can copy both together. Turning off an entry in <strong>Edit</strong> sets <code>visible: false</code> and omits it from these outputs. Input downloads and shared links keep hidden entries. Search and grouping do not affect exports.</p>
      <p>Invalid input can leave the last valid visualization visible for context, but its exports and source navigation are disabled. Clank never substitutes stale data. Formatting reserializes parsed data, so comments are not retained.</p>
      <h3>Drafts, recovery, and sharing</h3>
      <p>Draft and theme preferences are stored locally and are not encrypted. Open, New, Example, and Format keep a recovery copy; use Undo replacement to restore it. Download important or sensitive work rather than relying on browser storage. Clearing site data removes stored drafts. If another tab writes a different draft, autosave pauses here until you explicitly choose Save this tab.</p>
      <p><strong>Sharing is explicit:</strong> a compressed link contains the complete editor text. Anyone with that link can read it. Generated links use the fragment, not a server-bound query. Incoming links are removed from the address bar after opening.</p>
      <h3>Limits and keyboard controls</h3>
      <p>Reports: 2 MB, 5,000 findings, 64 nesting levels, and bounded YAML alias expansion. Links: 64,000 characters. Large documents may need to be split. Parsing runs in a worker with a six-second safety budget.</p>
      <p>Drag the divider, or focus it and use arrow keys. The panes stack on narrow screens. Tab through controls; left/right arrows move between output tabs. Alt+1 through Alt+6 switch views (AltGr is ignored). Escape closes this dialog. Clipboard actions require HTTPS or localhost.</p>
      <button className={css.schemaButton} type='button' onClick={() => downloadText(`${JSON.stringify(documentJsonSchema, null, 2)}\n`, 'aubit.schema.json', 'application/json')}>Download JSON Schema</button>
    </dialog>
  </main>
}
