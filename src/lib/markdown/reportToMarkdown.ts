import type {Finding, Report} from '#src/lib/report/index.ts'

import {stringify} from 'yaml'

import {joinList, pluralize} from '#src/lib/format.ts'

import {codeBlock, escapeMarkdown, inlineCode, tableCell} from './syntax.ts'

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
const renderFinding = (finding: Finding) => {
  const categories = finding.specificCategories.map(category => category.label).join(', ')
  const parts = [`## ${finding.priority.emoji} ${escapeMarkdown(finding.title)}`, `**${finding.priority.label}** · ${inlineCode(finding.id)} · ${categories}`]
  if (finding.description?.trim()) {
    parts.push(escapeMarkdown(finding.description))
  }
  for (const change of finding.changes) {
    parts.push(`### ${inlineCode(change.file)}`)
    for (const edit of change.edits) {
      parts.push(edit.toMarkdown(change.language))
    }
    parts.push('Change data (YAML; preserves exact paths and content):', codeBlock(stringify(change.data, {lineWidth: 0}), 'yaml'))
  }
  return parts.join('\n\n')
}
export const reportToMarkdown = (report: Report) => {
  const parts = ['# Aubit report']
  if (report.isEmpty) {
    parts.push('No findings.')
    return `${parts.join('\n\n')}\n`
  }
  parts.push(renderSummary(report), 'Suggested edits are illustrative, not executable patches. This report includes all enabled findings, regardless of search or view filters.', renderOverview(report))
  for (const finding of report.sorted) {
    parts.push('---', renderFinding(finding))
  }
  return `${parts.join('\n\n')}\n`
}
