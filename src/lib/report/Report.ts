import type {AubitData} from '#src/lib/aubitSchema.ts'
import type {EntrySource} from './Finding.ts'

import {Category} from './Category.ts'
import {Finding} from './Finding.ts'
import {Priority} from './Priority.ts'
import {SuggestedChange} from './SuggestedChange.ts'

type FindingLocator = (id: string) => EntrySource | undefined
export class Report {
  static fromData(data: AubitData, locate: FindingLocator) {
    const findings = Object.entries(data.entries).toSorted(([left], [right]) => {
      const a = locate(left)?.start
      const b = locate(right)?.start
      return a === undefined || b === undefined ? 0 : a - b
    }).map(([id, item]) => {
      const categoryIds = new Set(Array.isArray(item.category) ? item.category : [item.category])
      return new Finding({
        id,
        title: item.title,
        visible: item.visible !== false,
        description: item.description,
        priority: Priority.get(item.priority),
        categories: Array.from(categoryIds, Category.get),
        changes: (item.suggestedChanges ?? []).map(change => new SuggestedChange(change)),
        source: locate(id),
      })
    })
    return new Report(findings)
  }
  readonly findings: ReadonlyArray<Finding>
  readonly sorted: ReadonlyArray<Finding>
  constructor(findings: ReadonlyArray<Finding>) {
    this.findings = findings
    this.sorted = findings.toSorted((a, b) => a.priority.level - b.priority.level)
  }
  get editCount() {
    return this.findings.reduce((sum, finding) => sum + finding.editCount, 0)
  }
  get files() {
    return [...new Set(this.findings.flatMap(finding => finding.files))].toSorted((a, b) => a.localeCompare(b))
  }
  get isEmpty() {
    return this.findings.length === 0
  }
  get priorityCounts() {
    return Priority.all.map(priority => ({
      priority,
      count: this.findings.filter(finding => finding.priority === priority).length,
    }))
  }
  get rootCategoryCounts() {
    return Category.roots.map(category => ({
      category,
      count: this.findings.filter(finding => finding.hasCategory(category.id)).length,
    })).filter(entry => entry.count > 0).toSorted((a, b) => b.count - a.count)
  }
  getFindingAtOffset(offset: number) {
    return this.findings.find(finding => finding.source && finding.source.start <= offset && offset <= finding.source.end)
  }
}
