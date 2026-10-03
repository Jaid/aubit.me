import {useRef} from 'react'

import ThemeToggle from '#component/ThemeToggle'

import css from './style.module.sass'

type Props = {
  canFormat: boolean
  canUndo: boolean
  issueCount: number
  language: 'json' | 'yaml'
  onDownload: () => void
  onExample: () => void
  onFormat: (language: 'json' | 'yaml') => void
  onHelp: () => void
  onNew: () => void
  onOpenFile: (file: File) => void
  onUndo: () => void
  pending: boolean
  ready: boolean
}

export default function EditorHeader(props: Props) {
  const file = useRef<HTMLInputElement>(null)
  const {pending, issueCount, ready} = props
  const status = !ready ? 'opening' : pending ? 'checking' : issueCount ? 'invalid' : 'valid'
  return <>
    <header className={css.header}>
      <div className={css.brand}>
        <img className={css.logo} alt='' src={`${import.meta.env.BASE_URL}icon.svg`} />
        <h1 className={css.title}>Aubit Viewer</h1>
        <span className={css.status} data-input-status data-state={status}>{status}</span>
      </div>
      <div className={css.actions}>
        <button className={css.action} aria-label='Report format and help' title='Report format, limits, and privacy' type='button' onClick={props.onHelp}>?</button>
        <ThemeToggle />
      </div>
    </header>
    <div className={css.toolbar}>
      <span className={css.filename}>report.{props.language}</span>
      <div className={css.actions}>
        <button className={css.action} disabled={!ready} title='Open a YAML or JSON file' type='button' onClick={() => file.current?.click()}>Open</button>
        <input
          className={css.fileInput} accept='.yaml,.yml,.json,text/plain,application/json,application/yaml' aria-label='Open report file' data-report-file type='file' ref={file} onChange={event => {
            const selected = event.currentTarget.files?.[0]; event.currentTarget.value = ''; if (selected) {
              props.onOpenFile(selected)
            }
          }}
        />
        <button className={css.action} disabled={!ready} type='button' onClick={props.onExample}>Example</button>
        <button className={css.action} disabled={!ready} type='button' onClick={props.onNew}>New</button>
        <select className={css.format} aria-label='Format input' disabled={!props.canFormat} value='' onChange={event => props.onFormat(event.target.value as 'json' | 'yaml')}>
          <option disabled value=''>Format</option><option value='yaml'>As YAML</option><option value='json'>As JSON</option>
        </select>
        <button className={css.action} aria-label='Undo replacement' disabled={!props.canUndo} title='Restore the draft from before the last open, new, example, or format action' type='button' onClick={props.onUndo}>↶</button>
        <button className={css.action} aria-label='Download input' title='Download the exact original source text' type='button' onClick={props.onDownload}>↓</button>
      </div>
    </div>
  </>
}
