import type {AubitData, CategoryId} from '#src/lib/schema/aubit.schema.ts'
import type {Edit} from './edits/index.ts'
import type {SourceLocation} from './Finding.ts'

import {Category} from './Category.ts'
import {createEdit} from './edits/index.ts'
import {Finding} from './Finding.ts'
import {Priority} from './Priority.ts'
import {SuggestedChange} from './SuggestedChange.ts'

export type FileTouch = {
  change: SuggestedChange
  edit: Edit
  finding: Finding
}
/** returns the source location of a finding by its ID */
export type FindingLocator = (id: string) => SourceLocation | undefined
const toArray = <Value>(value: ReadonlyArray<Value> | Value): Array<Value> => (Array.isArray(value) ? [...value as ReadonlyArray<Value>] : [value as Value])
/** validated Aubit report with derived statistics */
export class Report {
  static fromData(data: AubitData, locate?: FindingLocator) {
    const findings = Object.entries(data.entries).toSorted(([left], [right]) => {
      const a = locate?.(left)?.start
      const b = locate?.(right)?.start
      return a === undefined || b === undefined ? 0 : a - b
    }).map(([id, item], index) => {
      const categoryIds = [...new Set(toArray<CategoryId>(item.category))]
      return new Finding({
        id,
        index,
        title: item.title,
        description: item.description,
        priority: Priority.get(item.priority),
        categories: categoryIds.map(categoryId => Category.get(categoryId)),
        changes: (item.suggestedChanges ?? []).map(change => new SuggestedChange(change.file, toArray(change.edit).map(createEdit))),
        source: locate?.(id),
      })
    })
    return new Report(findings, data)
  }
  readonly data: AubitData | undefined
  readonly findings: ReadonlyArray<Finding>
  constructor(findings: ReadonlyArray<Finding>, data?: AubitData) {
    this.findings = findings
    this.data = data
  }
/** number of findings per category (including subcategories) as used in the report */
  get categoryCounts() {
    return Category.all.map(category => ({
      category,
      count: this.findings.filter(finding => finding.categories.includes(category)).length,
    })).filter(entry => entry.count > 0)
  }
  get editCount() {
    return this.findings.reduce((sum, finding) => sum + finding.editCount, 0)
  }
  get files() {
    return [...new Set(this.findings.flatMap(finding => finding.files))].toSorted((a, b) => a.localeCompare(b))
  }
/** every edit grouped by the file it touches, sorted by path */
  get fileTouches() {
    const touches = new Map<string, Array<FileTouch>>
    for (const finding of this.sorted) {
      for (const change of finding.changes) {
        for (const edit of change.edits) {
          const list = touches.get(change.file) ?? []
          list.push({
            finding,
            change,
            edit,
          })
          touches.set(change.file, list)
        }
      }
    }
    return new Map([...touches].toSorted(([a], [b]) => a.localeCompare(b)))
  }
  get isEmpty() {
    return this.findings.length === 0
  }
/** number of findings per priority, including empty levels */
  get priorityCounts() {
    return Priority.all.map(priority => ({
      priority,
      count: this.findings.filter(finding => finding.priority === priority).length,
    }))
  }
/** number of findings per root category, most frequent first, without empty categories */
  get rootCategoryCounts() {
    return Category.roots.map(category => ({
      category,
      count: this.findings.filter(finding => finding.hasCategory(category.id)).length,
    })).filter(entry => entry.count > 0).toSorted((a, b) => b.count - a.count)
  }
/** most severe first, input order within the same priority */
  get sorted() {
    return this.findings.toSorted((a, b) => a.priority.level - b.priority.level || a.index - b.index)
  }
/** highest priority present in the report */
  get worstPriority() {
    return this.sorted[0]?.priority
  }
  getFinding(id: string) {
    return this.findings.find(finding => finding.id === id)
  }
/** finding whose source range contains the given character offset */
  getFindingAtOffset(offset: number) {
    return this.findings.find(finding => finding.source && finding.source.start <= offset && offset <= finding.source.end)
  }
}
