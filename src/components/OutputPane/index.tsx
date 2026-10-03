import type {TabDefinition} from '#component/Tabs'
import type {Finding, ParseResult} from '#src/lib/report/index.ts'

import {useMemo} from 'react'

import ActionButton from '#component/ActionButton'
import CodeView from '#component/CodeView'
import MarkdownPreview from '#component/MarkdownPreview'
import Tabs from '#component/Tabs'
import Visualization from '#component/Visualization'
import {copyText, downloadText} from '#src/lib/download.ts'
import {htmlDocument, renderMarkdown} from '#src/lib/markdown/renderMarkdown.ts'
import {reportToMarkdown} from '#src/lib/markdown/reportToMarkdown.ts'
import {createShareUrl} from '#src/lib/permalink.ts'

import css from './style.module.sass'

export const outputTabs = ['visualization', 'markdown', 'preview', 'clank'] as const
export type OutputTab = typeof outputTabs[number]
export const isOutputTab = (value: unknown): value is OutputTab => outputTabs.includes(value as OutputTab)
const definitions: ReadonlyArray<TabDefinition<OutputTab>> = outputTabs.map(key => ({
  key,
  label: key === 'visualization' ? 'Visualization' : key === 'markdown' ? 'Markdown' : key === 'preview' ? 'Preview' : 'Clank',
}))
type Props = {
  activeFindingId?: string
  current: ParseResult
  isStale: boolean
  notify: (message: string) => void
  onReveal: (finding: Finding) => void
  onTabChange: (tab: OutputTab) => void
  pending: boolean
  result: ParseResult | undefined
  tab: OutputTab
  text: string
}

export default function OutputPane({result, current, pending, isStale, text, tab, activeFindingId, onTabChange, onReveal, notify}: Props) {
  const report = result?.report
  const markdown = useMemo(() => (report ? reportToMarkdown(report) : ''), [report])
  // Unlike stale visual context, Clank ALWAYS describes the current parsed document.
  const clank = !pending ? current.clank : null
  const canExport = tab === 'clank' ? clank !== null : Boolean(report && !isStale && !pending)
  const copy = () => copyText(tab === 'clank' ? clank ?? '' : tab === 'preview' ? renderMarkdown(markdown) : markdown)
  const download = () => {
    if (tab === 'clank') {
      downloadText(clank ?? '', 'aubit-input.clank')
    } else if (tab === 'preview') {
      downloadText(htmlDocument(markdown), 'aubit-report.html', 'text/html')
    } else {
      downloadText(markdown, 'aubit-report.md', 'text/markdown')
    }
  }
  const format = tab === 'clank' ? 'Clank' : tab === 'preview' ? 'HTML' : 'Markdown'
  return <section className={css.pane} aria-label='Report output'>
    <header className={css.header}>
      <Tabs activeKey={tab} idPrefix='output' label='Output format' tabs={definitions} onChange={onTabChange} />
      <div className={css.actions}>
        <ActionButton aria-label={`Copy ${format}`} disabled={!canExport} doneLabel='Copied' icon='⧉' title={`Copy ${format}${canExport ? '' : ' — waiting for valid current input'}`} onClick={copy} onError={notify}>Copy{tab === 'preview' ? ' HTML' : ''}</ActionButton>
        <ActionButton aria-label={`Download ${format}`} disabled={!canExport} icon='↓' title={`Download ${format}`} onClick={download} onError={notify}>{tab === 'clank' ? '.clank' : tab === 'preview' ? '.html' : '.md'}</ActionButton>
        <ActionButton
          aria-label='Share report' disabled={!text.trim()} doneLabel='Link copied' icon='↗' title='Copy a link containing the entire editor text. Anyone with the link can read it.' onClick={async () => {
            const url = await createShareUrl({
              yaml: text,
              tab,
            }); await copyText(url); notify('Link copied. It contains the entire report; anyone with the link can read it.')
          }} onError={notify}
        >Share</ActionButton>
      </div>
    </header>
    {report && (pending || isStale) && tab !== 'clank' && <div className={css.stale} role='status'>{pending ? 'Updating report…' : 'Showing the last valid report.'} Exports and source navigation are paused until the current input is valid.</div>}
    <div id='output-panel' className={css.body} aria-labelledby={`output-tab-${tab}`} role='tabpanel' tabIndex={0}>
      <div className={css.scroller} hidden={tab !== 'visualization'}>
        {report ? <Visualization activeFindingId={activeFindingId} report={report} onReveal={!isStale && !pending ? onReveal : undefined} /> : <div className={css.placeholder}>{pending ? 'Preparing the report…' : 'Fix the input to see the report.'}</div>}
      </div>
      {tab === 'markdown' && (report ? <CodeView label='Markdown output' language='markdown' path='file:///aubit-report.md' value={markdown} /> : <div className={css.placeholder}>No valid report yet.</div>)}
      {tab === 'preview' && (report ? <MarkdownPreview markdown={markdown} /> : <div className={css.placeholder}>No valid report yet.</div>)}
      {tab === 'clank' && (clank !== null ? <CodeView label='Clank output' language='clank' path='file:///aubit-input.clank' value={clank} /> : <div className={css.placeholder}>{pending ? 'Parsing the current input…' : 'The current input cannot be safely represented as Clank. Fix the input; no stale data is shown here.'}</div>)}
    </div>
    <footer className={css.footer}>{tab === 'clank' ? 'Original parsed data · no added defaults or normalization' : 'All findings exported · filters affect visualization only'}<span>Read, don’t execute</span></footer>
  </section>
}
