import type {Category} from './Category.ts'
import type {Priority} from './Priority.ts'
import type {SuggestedChange} from './SuggestedChange.ts'

/** character offsets and 1-indexed line of a node in the YAML source */
export type SourceLocation = {
  column: number
  end: number
  line: number
  start: number
}
export type SourceEdit = {
  end: number
  start: number
  text: string
}
export type EntrySource = SourceLocation & {
  visibilityEdit?: SourceEdit
}
type FindingOptions = {
  categories: ReadonlyArray<Category>
  changes: ReadonlyArray<SuggestedChange>
  description?: string
  id: string
  priority: Priority
  source?: EntrySource
  title: string
  visible: boolean
}
export class Finding {
  readonly categories: ReadonlyArray<Category>
  readonly changes: ReadonlyArray<SuggestedChange>
  readonly description: string | undefined
  readonly id: string
  readonly priority: Priority
  readonly source: EntrySource | undefined
  readonly title: string
  readonly visible: boolean
  constructor(options: FindingOptions) {
    this.id = options.id
    this.title = options.title
    this.description = options.description
    this.priority = options.priority
    this.categories = options.categories
    this.changes = options.changes
    this.source = options.source
    this.visible = options.visible
  }
  get editCount() {
    return this.changes.reduce((sum, change) => sum + change.edits.length, 0)
  }
  get files() {
    return [...new Set(this.changes.map(change => change.file))]
  }
  get specificCategories() {
    return this.categories.filter(category => !this.categories.some(other => other !== category && other.isWithin(category)))
  }
  hasCategory(id: string) {
    return this.categories.some(category => category.isWithin(id))
  }
  matches(query: string) {
    const needle = query.trim().toLowerCase()
    if (!needle) {
      return true
    }
    const haystack = [this.id, this.title, this.description ?? '', this.priority.label, ...this.categories.map(category => category.id), ...this.files].join('\n').toLowerCase()
    return needle.split(/\s+/).every(term => haystack.includes(term))
  }
}
