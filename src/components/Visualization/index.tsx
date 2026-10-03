import type {Category, Finding, PriorityLevel, Report} from '#src/lib/report/index.ts'
import type {CSSProperties} from 'react'

import clsx from 'clsx'
import {useEffect, useState} from 'react'

import EditView from '#component/EditView'
import FindingCard from '#component/FindingCard'
import Markdown from '#component/Markdown'
import {formatCount, pluralize} from '#src/lib/format.ts'
import {Category as CategoryClass, Priority} from '#src/lib/report/index.ts'

import css from './style.module.sass'

export type GroupMode = 'category' | 'file' | 'priority'
type Props = {
  activeFindingId?: string
  onReveal?: (finding: Finding) => void
  report: Report
}
const groupModes: ReadonlyArray<{
  id: GroupMode
  label: string
}> = [{
  id: 'priority',
  label: 'Priority',
}, {
  id: 'category',
  label: 'Category',
}, {
  id: 'file',
  label: 'File',
}]
const toneStyle = (hue: number, chroma: number) => ({
  '--hue': hue,
  '--chroma': chroma,
}) as CSSProperties
const PriorityBar = ({report, selected, onToggle}: {
  onToggle: (level: PriorityLevel) => void
  report: Report
  selected: ReadonlySet<PriorityLevel>
}) => {
  const counts = report.priorityCounts
  return <div className={css.priorityBar} aria-label='Filter by priority' role='group'>
    <div className={css.track}>
      {counts.filter(entry => entry.count > 0).map(({priority, count}) => <span
        key={priority.level} className={css.segment} data-dimmed={selected.size > 0 && !selected.has(priority.level) || undefined} style={{
          ...toneStyle(priority.hue, priority.chroma),
          flexGrow: count,
        }} title={`${priority.label}: ${pluralize(count, 'finding')}`}
      />)}
    </div>
    <div className={css.legend}>
      {counts.map(({priority, count}) => <button key={priority.level} className={css.legendItem} aria-pressed={selected.has(priority.level)} data-empty={count === 0 || undefined} disabled={count === 0} style={toneStyle(priority.hue, priority.chroma)} title={`Filter by ${priority.label}`} type='button' onClick={() => onToggle(priority.level)}>
        <span className={css.dot} />
        <span className={css.legendCode}>{priority.code}</span>
        <span className={css.legendName}>{priority.name}</span>
        <span className={css.legendCount}>{formatCount(count)}</span>
      </button>)}
    </div>
  </div>
}
type Group = {
  chroma: number
  findings: ReadonlyArray<Finding>
  hue: number
  key: string
  title: string
}
const groupFindings = (findings: ReadonlyArray<Finding>, mode: 'category' | 'priority'): Array<Group> => {
  if (mode === 'priority') {
    return Priority.all.map(priority => ({
      key: priority.code,
      title: `${priority.code} · ${priority.name}`,
      hue: priority.hue,
      chroma: priority.chroma,
      findings: findings.filter(finding => finding.priority === priority),
    })).filter(group => group.findings.length > 0)
  }
  return CategoryClass.roots.map(category => ({
    key: category.id,
    title: category.label,
    hue: category.hue,
    chroma: category.chroma,
    findings: findings.filter(finding => finding.hasCategory(category.id)),
  })).filter(group => group.findings.length > 0).toSorted((a, b) => b.findings.length - a.findings.length)
}
const FileGroups = ({findings, onReveal, activeFindingId}: {
  activeFindingId?: string
  findings: ReadonlyArray<Finding>
  onReveal?: (finding: Finding) => void
}) => {
  const files = new Map<string, Array<{
    change: Finding['changes'][number]
    finding: Finding
  }>>
  for (const finding of findings) {
    for (const change of finding.changes) {
      const list = files.get(change.file) ?? []
      list.push({
        finding,
        change,
      })
      files.set(change.file, list)
    }
  }
  const sortedFiles = [...files].toSorted(([a], [b]) => a.localeCompare(b))
  const withoutChanges = findings.filter(finding => finding.changes.length === 0)
  return <>
    {sortedFiles.map(([file, touches]) => <section key={file} className={css.group}>
      <h2 className={css.groupTitle}>
        <code className={css.fileTitle}>{file}</code>
        <span className={css.groupCount}>{pluralize(touches.reduce((sum, touch) => sum + touch.change.edits.length, 0), 'edit')}</span>
      </h2>
      <div className={css.fileTouches}>
        {touches.map(({finding, change}, index) => <div key={`${finding.id}:${index}`} className={css.fileTouch} data-active={finding.id === activeFindingId || undefined} style={toneStyle(finding.priority.hue, finding.priority.chroma)}>
          <button className={css.touchFinding} title='Reveal in editor' type='button' onClick={() => onReveal?.(finding)}>
            <span className={css.touchBadge}>{finding.priority.code}</span>
            <Markdown inline source={finding.title} />
          </button>
          <div className={css.touchEdits}>
            {change.edits.map((edit, editIndex) => <EditView key={editIndex} change={change} edit={edit} />)}
          </div>
        </div>)}
      </div>
    </section>)}
    {withoutChanges.length > 0 && <section className={css.group}>
      <h2 className={css.groupTitle}>
        <span>No suggested changes</span>
        <span className={css.groupCount}>{pluralize(withoutChanges.length, 'finding')}</span>
      </h2>
      <div className={css.cards}>
        {withoutChanges.map(finding => <FindingCard key={finding.id} finding={finding} isActive={finding.id === activeFindingId} onReveal={onReveal} />)}
      </div>
    </section>}
  </>
}
/** interactive dashboard for a report */
export default ({report, activeFindingId, onReveal}: Props) => {
  const [query, setQuery] = useState('')
  const [priorityFilter, setPriorityFilter] = useState<ReadonlySet<PriorityLevel>>(() => new Set)
  const [categoryFilter, setCategoryFilter] = useState<string | undefined>()
  const [groupMode, setGroupMode] = useState<GroupMode>('priority')
  const [visibleLimit, setVisibleLimit] = useState(100)
  const togglePriority = (level: PriorityLevel) => {
    const next = new Set(priorityFilter)
    if (next.has(level)) {
      next.delete(level)
    } else {
      next.add(level)
    }
    setPriorityFilter(next)
    setVisibleLimit(100)
  }
  const selectCategory = (category: Category | string) => {
    const id = typeof category === 'string' ? category : category.id
    setCategoryFilter(current => (current === id ? undefined : id))
    setVisibleLimit(100)
  }
  const isFiltered = Boolean(query.trim()) || priorityFilter.size > 0 || categoryFilter !== undefined
  const resetFilters = () => {
    setQuery('')
    setVisibleLimit(100)
    setPriorityFilter(new Set)
    setCategoryFilter(undefined)
  }
  const findings = report.sorted.filter(finding => (priorityFilter.size === 0 || priorityFilter.has(finding.priority.level)) && (categoryFilter === undefined || finding.hasCategory(categoryFilter)) && finding.matches(query))
  const visibleFindings = findings.slice(0, visibleLimit)
  useEffect(() => {
    if (!activeFindingId) {
      return
    }
    const index = findings.findIndex(finding => finding.id === activeFindingId)
    if (index >= visibleLimit) {
      setVisibleLimit(Math.ceil((index + 1) / 100) * 100)
    }
  }, [activeFindingId, findings, visibleLimit])
  const categoryFilterLabel = categoryFilter ? CategoryClass.all.find(category => category.id === categoryFilter)?.label : undefined
  const worst = report.worstPriority
  if (report.isEmpty) {
    return <div className={css.empty}>
      <div className={css.emptyIcon} aria-hidden>✓</div>
      <div className={css.emptyTitle}>No findings</div>
      <div className={css.emptyText}>Add entries below <code>entries:</code> in the editor to see them here.</div>
    </div>
  }
  return <div className={css.container}>
    <section className={css.summary}>
      <div className={css.headline} style={worst ? toneStyle(worst.hue, worst.chroma) : undefined}>
        <span className={css.total}>{formatCount(report.findings.length)}</span>
        <span className={css.totalLabel}>
          <span className={css.totalNoun}>{report.findings.length === 1 ? 'finding' : 'findings'}</span>
          <span className={css.totalDetail}>{pluralize(report.editCount, 'edit')} · {pluralize(report.files.length, 'file')}</span>
        </span>
      </div>
      <PriorityBar report={report} selected={priorityFilter} onToggle={togglePriority} />
      <div className={css.categories} aria-label='Filter by category' role='group'>
        {report.rootCategoryCounts.map(({category, count}) => <button key={category.id} className={css.categoryChip} aria-pressed={categoryFilter === category.id} style={toneStyle(category.hue, category.chroma)} title={category.description ?? `Filter by ${category.label}`} type='button' onClick={() => selectCategory(category)}>
          {category.label}
          <span className={css.chipCount}>{formatCount(count)}</span>
        </button>)}
      </div>
    </section>
    <div className={css.toolbar}>
      <input
        className={css.search} aria-label='Search findings' placeholder='Search findings…' type='search' value={query} onChange={event => {
          setQuery(event.target.value); setVisibleLimit(100)
        }}
      />
      <div
        className={css.segmented} aria-label='Group by' role='radiogroup' onKeyDown={event => {
          const index = groupModes.findIndex(mode => mode.id === groupMode)
          const next = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? (index + 1) % groupModes.length : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? (index + groupModes.length - 1) % groupModes.length : event.key === 'Home' ? 0 : event.key === 'End' ? groupModes.length - 1 : -1
          if (next < 0) {
            return
          }
          event.preventDefault()
          setGroupMode(groupModes[next].id)
          event.currentTarget.querySelectorAll<HTMLButtonElement>('button')[next]?.focus()
        }}
      >
        {groupModes.map(mode => <button key={mode.id} className={clsx(css.segmentButton)} aria-checked={groupMode === mode.id} role='radio' tabIndex={groupMode === mode.id ? 0 : -1} type='button' onClick={() => setGroupMode(mode.id)}>{mode.label}</button>)}
      </div>
    </div>
    {isFiltered && <div className={css.filterNote}>
      <span>Showing {formatCount(findings.length)} of {pluralize(report.findings.length, 'finding')}{categoryFilterLabel ? ` in ${categoryFilterLabel}` : ''}</span>
      <button className={css.reset} type='button' onClick={resetFilters}>Reset filters</button>
    </div>}
    {findings.length === 0 && <div className={css.noMatches}>No findings match the current filters.</div>}
    {groupMode === 'file' ? <FileGroups activeFindingId={activeFindingId} findings={visibleFindings} onReveal={onReveal} /> : groupFindings(visibleFindings, groupMode).map(group => <section key={group.key} className={css.group}>
      <h2 className={css.groupTitle} style={toneStyle(group.hue, group.chroma)}>
        <span className={css.groupDot} />
        <span>{group.title}</span>
        <span className={css.groupCount}>{formatCount(group.findings.length)}</span>
      </h2>
      <div className={css.cards}>
        {group.findings.map(finding => <FindingCard key={finding.id} finding={finding} isActive={finding.id === activeFindingId} onCategorySelect={selectCategory} onReveal={onReveal} />)}
      </div>
    </section>)}
    {findings.length > visibleFindings.length && <div className={css.more}>
      <span>Displaying {visibleFindings.length} of {findings.length} matching findings. Exports always include the complete report.</span>
      <button type='button' onClick={() => setVisibleLimit(limit => limit + 100)}>Load 100 more findings</button>
    </div>}
  </div>
}
