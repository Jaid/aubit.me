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
  index: number
  priority: Priority
  source?: EntrySource
  title: string
  visible: boolean
}
/** one entry of an Aubit report */
export class Finding {
  readonly categories: ReadonlyArray<Category>
  readonly changes: ReadonlyArray<SuggestedChange>
  readonly description: string | undefined
  readonly id: string
  /** position in the input document */
  readonly index: number
  readonly priority: Priority
  readonly source: EntrySource | undefined
  readonly title: string
  readonly visible: boolean
  constructor(options: FindingOptions) {
    this.id = options.id
    this.index = options.index
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
/** categories without the ones implied by a more specific category in the same finding */
  get specificCategories() {
    return this.categories.filter(category => !this.categories.some(other => other !== category && other.isWithin(category)))
  }
  hasCategory(id: string) {
    return this.categories.some(category => category.isWithin(id))
  }
/** case-insensitive full-text match against the most relevant fields */
  matches(query: string) {
    const needle = query.trim().toLowerCase()
    if (!needle) {
      return true
    }
    const haystack = [this.id, this.title, this.description ?? '', this.priority.label, ...this.categories.map(category => category.id), ...this.files].join('\n').toLowerCase()
    return needle.split(/\s+/).every(term => haystack.includes(term))
  }
}
