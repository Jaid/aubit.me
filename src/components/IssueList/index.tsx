import type {InputIssue} from '#src/lib/report/index.ts'

import {useState} from 'react'

import {pluralize} from '#src/lib/format.ts'

import css from './style.module.sass'

type Props = {
  issues: ReadonlyArray<InputIssue>
  onReveal: (issue: InputIssue) => void
}
const collapsedLimit = 3
/** list of YAML and schema problems below the editor */
export default ({issues, onReveal}: Props) => {
  const [isExpanded, setIsExpanded] = useState(false)
  if (issues.length === 0) {
    return null
  }
  const source = issues[0].source === 'yaml' ? 'YAML syntax' : issues[0]!.source === 'schema' ? 'schema' : 'input'
  const visible = isExpanded ? issues : issues.slice(0, collapsedLimit)
  const hiddenCount = issues.length - visible.length
  return <div className={css.container} data-issue-list role='alert'>
    <div className={css.header}>
      <span className={css.icon} aria-hidden>!</span>
      <span>{pluralize(issues.length, `${source} problem`)} – current report exports are paused</span>
    </div>
    <ul className={css.list}>
      {visible.map((issue, index) => <li key={index}>
        <button className={css.issue} disabled={!issue.location} type='button' onClick={() => onReveal(issue)}>
          {issue.location && <span className={css.position}>{issue.location.line}:{issue.location.column}</span>}
          <span className={css.message}>{issue.message}</span>
        </button>
      </li>)}
    </ul>
    {(hiddenCount > 0 || isExpanded && issues.length > collapsedLimit) && <button className={css.more} type='button' onClick={() => setIsExpanded(!isExpanded)}>{isExpanded ? 'Show less' : `Show ${hiddenCount} more`}</button>}
  </div>
}
