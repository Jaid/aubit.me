import type {TabDefinition} from '#component/Tabs'
import type {Finding, ParseResult} from '#src/lib/report/index.ts'

import {useMemo, useState} from 'react'

import ActionButton from '#component/ActionButton'
import CodeView from '#component/CodeView'
import EntrySwitch from '#component/EntrySwitch'
import MarkdownPreview from '#component/MarkdownPreview'
import Tabs from '#component/Tabs'
import Visualization from '#component/Visualization'
import {copyText, downloadText} from '#src/lib/download.ts'
import {htmlDocument, renderMarkdown} from '#src/lib/markdown/renderMarkdown.ts'
import {reportToMarkdown} from '#src/lib/markdown/reportToMarkdown.ts'
import {createShareUrl} from '#src/lib/permalink.ts'
import {Report} from '#src/lib/report/Report.ts'

import css from './style.module.sass'

export const outputTabs = ['render', 'edit', 'markdown', 'preview', 'clank', 'prompt'] as const
export type OutputTab = typeof outputTabs[number]
export const readOutputTab = (value?: string): OutputTab | undefined => (value === 'visualization' ? 'render' : outputTabs.find(tab => tab === value))
const definitions: ReadonlyArray<TabDefinition<OutputTab>> = outputTabs.map(key => ({
  key,
  label: key[0].toUpperCase() + key.slice(1),
}))
type Props = {
  current: ParseResult
  cursorOffset?: number
  isStale: boolean
  notify: (message: string) => void
  onReveal: (finding: Finding) => void
  onTabChange: (tab: OutputTab) => void
  onToggleVisibility: (finding: Finding) => void
  pending: boolean
  result: ParseResult | undefined
  tab: OutputTab
  text: string
}

const promptInstructions = `An audit agent gave me a report. Please take a close look at the listed issues, evaluate their relevance, severity and impact and then for each one choose whether to apply the proposed changes (if any) or tackle the mentioned issues in a different way or entirely ignore them for now

For each issue you decide we should act on, you can already implement and commit the changes`

export default function OutputPane({result, current, pending, isStale, text, tab, cursorOffset, onTabChange, onReveal, onToggleVisibility, notify}: Props) {
  const [selected, setSelected] = useState('')
  const reportKey = result?.collection.has(selected) ? selected : ''
  const report = reportKey ? result?.collection.get(reportKey) : result?.report
  const activeFindingId = !isStale && cursorOffset !== undefined ? report?.getFindingAtOffset(cursorOffset)?.id : undefined
  const enabledReport = useMemo(() => (report?.findings.some(finding => !finding.visible) ? new Report(report.findings.filter(finding => finding.visible), report.data) : report), [report])
  const markdown = useMemo(() => (enabledReport ? reportToMarkdown(enabledReport) : ''), [enabledReport])
  const shown = tab === 'edit' ? report : enabledReport
  const entrySwitch = (finding: Finding) => <EntrySwitch id={finding.id} disabled={isStale && !pending || !finding.source?.visibilityEdit} enabled={finding.visible} pending={pending} title={finding.source?.visibilityEdit ? undefined : 'Edit this entry’s visibility directly in the source.'} onToggle={() => onToggleVisibility(finding)} />
  // Unlike stale visual context, Clank ALWAYS describes the current parsed document.
  const clank = !pending ? current.clank : null
  const documentTab = tab === 'clank' || tab === 'prompt'
  const documentText = tab === 'prompt' && clank !== null ? `${promptInstructions}\n\n${clank}` : clank
  const documentFile = tab === 'prompt' ? 'aubit-prompt.txt' : 'aubit-input.clank'
  const canExport = documentTab ? documentText !== null : Boolean(report && !isStale && !pending)
  const copy = () => copyText(documentTab ? documentText ?? '' : (tab === 'preview' ? renderMarkdown(markdown) : markdown))
  const download = () => {
    if (documentTab) {
      if (documentText !== null) {
        downloadText(documentText, documentFile)
      }
    } else if (tab === 'preview') {
      downloadText(htmlDocument(markdown), 'aubit-report.html', 'text/html')
    } else {
      downloadText(markdown, 'aubit-report.md', 'text/markdown')
    }
  }
  const {format, extension} = {
    prompt: {format: 'Prompt', extension: '.txt'},
    clank: {format: 'Clank', extension: '.clank'},
    preview: {format: 'HTML', extension: '.html'},
    markdown: {format: 'Markdown', extension: '.md'},
  }[tab === 'render' || tab === 'edit' ? 'markdown' : tab]
  return <section className={css.pane} aria-label='Report output'>
    <header className={css.header}>
      <Tabs activeKey={tab} idPrefix='output' label='Output format' tabs={definitions} onChange={onTabChange} />
      <div className={css.actions}>
        <span className={css.spinner} aria-label='Updating report' data-loading={pending || undefined} role='progressbar' title='Updating report…' />
        <ActionButton aria-label={`Copy ${format}`} disabled={!canExport} doneLabel='Copied' icon='⧉' title={`Copy ${format}${canExport ? '' : ' — waiting for valid current input'}`} onClick={copy} onError={notify}>Copy{tab === 'preview' ? ' HTML' : ''}</ActionButton>
        <ActionButton aria-label={`Download ${format}`} disabled={!canExport} icon='↓' title={`Download ${format}`} onClick={download} onError={notify}>{extension}</ActionButton>
        <ActionButton
          aria-label='Share report' disabled={!text.trim()} doneLabel='Link copied' icon='↗' title='Copy a link containing the entire editor text. Anyone with the link can read it.' onClick={async () => {
            const url = await createShareUrl({
              yaml: text,
              tab,
            })
            await copyText(url)
            notify('Link copied. It contains the entire report; anyone with the link can read it.')
          }} onError={notify}
        >Share</ActionButton>
      </div>
    </header>
    {!documentTab && result && result.collection.size > 0 && <label className={css.reportPicker}>Report <select value={reportKey} onChange={event => setSelected(event.target.value)}><option value=''>Document entries</option>{Array.from(result.collection.keys(), key => <option key={key} value={key}>{key}</option>)}</select></label>}
    {report && !pending && isStale && !documentTab && <div className={css.stale} role='status'>Showing the last valid report. Exports and source navigation are paused until the current input is valid.</div>}
    <div id='output-panel' className={css.body} aria-busy={pending} aria-labelledby={`output-tab-${tab}`} role='tabpanel' tabIndex={0}>
      <div className={css.scroller} hidden={tab !== 'render' && tab !== 'edit'}>
        {shown ? <Visualization activeFindingId={activeFindingId} allDisabled={enabledReport?.isEmpty && !report?.isEmpty} renderTitleAction={tab === 'edit' ? entrySwitch : undefined} report={shown} onReveal={!isStale && !pending ? onReveal : undefined} /> : <div className={css.placeholder}>{pending ? 'Preparing the report…' : 'Fix the input to see the report.'}</div>}
      </div>
      {tab === 'markdown' && (report ? <CodeView label='Markdown output' language='markdown' path='file:///aubit-report.md' value={markdown} /> : <div className={css.placeholder}>No valid report yet.</div>)}
      {tab === 'preview' && (report ? <MarkdownPreview markdown={markdown} /> : <div className={css.placeholder}>No valid report yet.</div>)}
      {documentTab && (documentText !== null ? <CodeView label={`${format} output`} language={tab === 'prompt' ? 'plaintext' : 'clank'} path={`file:///${documentFile}`} value={documentText} /> : <div className={css.placeholder}>{pending ? 'Parsing the current input…' : 'The current input cannot be safely represented as Clank. Fix the input; no stale data is shown here.'}</div>)}
    </div>
    <footer className={css.footer}>{documentTab ? 'All reports · hidden entries omitted · no added defaults' : `${enabledReport?.findings.length ?? 0} of ${report?.findings.length ?? 0} findings enabled · filters don’t affect exports`}<span>Read, don’t execute</span></footer>
  </section>
}
