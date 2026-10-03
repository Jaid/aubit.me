import type {Edit, EditTone, Needle, SuggestedChange} from '#src/lib/report/index.ts'
import type {CSSProperties, ReactNode} from 'react'

import {ContentEdit, DeleteEdit, EmptyEdit, EnsureEdit, EraseEdit, InsertEdit, PathEdit, ReplaceEdit, TextNeedle} from '#src/lib/report/index.ts'

import css from './style.module.sass'

type LineKind = 'add' | 'context' | 'plain' | 'remove'
const gutters: Record<LineKind, string> = {
  add: '+',
  remove: '−',
  context: '·',
  plain: ' ',
}
const toneHues: Record<EditTone, string> = {
  additive: 'var(--positive)',
  destructive: 'var(--negative)',
  modifying: 'var(--caution)',
  structural: 'var(--accent)',
  neutral: 'var(--muted)',
}
const splitLines = (text: string) => text.replace(/\r?\n$/, '').split('\n')
const Lines = ({lines, kind}: {
  kind: LineKind
  lines: ReadonlyArray<string>
}) => {
  return <>{lines.slice(0, 200).map((line, index) => <span key={index} className={css.line} data-kind={kind}>
    <span className={css.gutter} aria-hidden>{gutters[kind]}</span>
    <span className={css.text}>{line || '\u{200B}'}</span>
  </span>)}{lines.length > 200 && <span className={css.omitted}>Preview limited to 200 lines. {lines.length - 200} more lines are retained in the complete exports.</span>}</>
}
const Code = ({children}: {children: ReactNode}) => {
  return <pre className={css.code}><code>{children}</code></pre>
}
const NeedleTag = ({needle}: {needle: Needle}) => {
  if (needle instanceof TextNeedle && needle.isMultiline) {
    return null
  }
  return <code className={css.needle} data-kind={needle.kind}>{needle.toString()}</code>
}
const FileStateSummary = ({edit}: {edit: DeleteEdit | EmptyEdit | EnsureEdit}) => {
  return <span className={css.summary}>{edit.summary}</span>
}
type EditParts = {
  block?: ReactNode
  inline?: ReactNode
}
const getEditParts = (edit: Edit, change: SuggestedChange): EditParts => {
  if (edit instanceof DeleteEdit || edit instanceof EnsureEdit || edit instanceof EmptyEdit) {
    return {inline: <FileStateSummary edit={edit} />}
  }
  if (edit instanceof PathEdit) {
    return {inline: <span className={css.summary}>
      <code className={css.path}>{change.file}</code>
      <span className={css.arrow}>→</span>
      <code className={css.path}>{edit.resolveTarget(change.file)}</code>
    </span>}
  }
  if (edit instanceof ContentEdit) {
    const kind = edit.tone === 'additive' ? 'add' : 'plain'
    return {
      inline: edit.content === '' ? <span className={css.summary}>nothing</span> : null,
      block: edit.content === '' ? null : <Code><Lines kind={kind} lines={edit.lines} /></Code>,
    }
  }
  if (edit instanceof ReplaceEdit) {
    if (edit.needle instanceof TextNeedle) {
      return {block: <Code>
        <Lines kind='remove' lines={edit.needle.lines} />
        <Lines kind='add' lines={edit.replacementLines} />
      </Code>}
    }
    return {
      inline: <span className={css.summary}><NeedleTag needle={edit.needle} /></span>,
      block: <Code><Lines kind='add' lines={edit.replacementLines} /></Code>,
    }
  }
  if (edit instanceof InsertEdit) {
    const multilineNeedle = edit.needle instanceof TextNeedle && edit.needle.isMultiline ? edit.needle : undefined
    const isBefore = edit.position === 'before'
    const anchor = multilineNeedle ? <Lines kind='context' lines={multilineNeedle.lines} /> : null
    return {inline: <span className={css.summary}><NeedleTag needle={edit.needle} /></span>, block: <Code>
      {!isBefore && anchor}
      <Lines kind='add' lines={edit.lines} />
      {isBefore && anchor}
    </Code>}
  }
  if (edit instanceof EraseEdit) {
    if (edit.needle instanceof TextNeedle && edit.needle.isMultiline) {
      return {block: <Code><Lines kind='remove' lines={splitLines(edit.needle.text)} /></Code>}
    }
    return {inline: <span className={css.summary}><NeedleTag needle={edit.needle} /></span>}
  }
  return {}
}
type Props = {
  change: SuggestedChange
  edit: Edit
}
/** visual representation of a single edit */
export default ({edit, change}: Props) => {
  const {inline, block} = getEditParts(edit, change)
  return <div className={css.edit} data-action={edit.action} data-tone={edit.tone} style={{'--tone': toneHues[edit.tone]} as CSSProperties}>
    <div className={css.head}>
      <span className={css.verb}>{edit.verb}</span>
      {inline}
    </div>
    {block}
  </div>
}
