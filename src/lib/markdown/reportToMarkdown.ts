import type {Finding, Report} from '#src/lib/report/index.ts'

import {stringify} from 'yaml'

import {joinList, pluralize} from '#src/lib/format.ts'

import {codeBlock, escapeMarkdown, inlineCode, tableCell} from './syntax.ts'

export type ReportMarkdownOptions = {
  title?: string
}
const renderSummary = (report: Report) => {
  const priorities = report.priorityCounts.filter(entry => entry.count > 0).map(({priority, count}) => `${count} ${priority.name}`)
  const findings = pluralize(report.findings.length, 'finding')
  const edits = pluralize(report.editCount, 'suggested edit')
  const files = pluralize(report.files.length, 'file')
  return `**${findings}** (${joinList(priorities)}) with ${edits} across ${files}.`
}
const renderOverview = (report: Report) => {
  const rows = report.sorted.map(finding => {
    const categories = finding.specificCategories.map(category => category.label).join(', ')
    return `| ${finding.priority.emoji} ${finding.priority.code} | ${inlineCode(finding.id)} | ${tableCell(finding.title)} | ${tableCell(categories)} | ${finding.editCount} |`
  })
  return ['| Priority | ID | Finding | Categories | Edits |', '| --- | --- | --- | --- | ---: |', ...rows].join('\n')
}
const renderFinding = (finding: Finding, report: Report) => {
  const categories = finding.specificCategories.map(category => category.label).join(', ')
  const parts = [`## ${finding.priority.emoji} ${escapeMarkdown(finding.title)}`, `**${finding.priority.label}** · ${inlineCode(finding.id)} · ${categories}`]
  if (finding.description?.trim()) {
    parts.push(escapeMarkdown(finding.description))
  }
  for (const [index, change] of finding.changes.entries()) {
    parts.push(`### ${inlineCode(change.file)}`)
    for (const edit of change.edits) {
      parts.push(edit.toMarkdown(change.context))
    }
    const exact = report.data?.entries[finding.id]?.suggestedChanges?.[index]
    if (exact) {
      parts.push('Change data (YAML; preserves exact paths and content):', codeBlock(stringify(exact, {lineWidth: 0}), 'yaml'))
    }
  }
  return parts.join('\n\n')
}
/** renders a complete, self-contained Markdown document for the report */
export const reportToMarkdown = (report: Report, {title = 'Aubit report'}: ReportMarkdownOptions = {}) => {
  const parts = [`# ${title}`]
  if (report.isEmpty) {
    parts.push('No findings.')
    return `${parts.join('\n\n')}\n`
  }
  parts.push(renderSummary(report), 'Suggested edits are illustrative, not executable patches. Exports include all findings; view filters do not change this report.', renderOverview(report))
  for (const finding of report.sorted) {
    parts.push('---', renderFinding(finding, report))
  }
  return `${parts.join('\n\n')}\n`
}
