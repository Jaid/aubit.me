import type {CategoryId} from '#src/lib/schema/aubit.schema.ts'

import {categorySchema} from '#src/lib/schema/aubit.schema.ts'

const rootHues: Record<string, number> = {
  correctness: 300,
  consistency: 195,
  security: 25,
  resilience: 150,
  hygiene: 120,
  performance: 65,
  accessibility: 230,
  language: 340,
  documentation: 270,
  misc: 0,
}
/** hierarchical finding category like “security.leak” */
export class Category {
  static readonly all: ReadonlyArray<Category> = categorySchema.options.map(option => new Category(option.value, option.description))
  static get(id: CategoryId) {
    const category = Category.all.find(entry => entry.id === id)
    if (!category) {
      throw new RangeError(`Unknown category: ${id}`)
    }
    return category
  }
  readonly description: string | undefined
  readonly id: CategoryId
  constructor(id: CategoryId, description?: string) {
    this.id = id
    this.description = description
  }
  get chroma() {
    return this.rootId === 'misc' ? 0.01 : 0.13
  }
  get hue() {
    return rootHues[this.rootId] ?? 0
  }
  get isRoot() {
    return this.segments.length === 1
  }
  /** for example “security › leak” */
  get label() {
    return this.segments.join(' › ')
  }
  get leafName() {
    return this.segments.at(-1)!
  }
  get root() {
    return Category.get(this.rootId as CategoryId)
  }
  get rootId() {
    return this.segments[0]
  }
  static get roots() {
    return Category.all.filter(category => category.isRoot)
  }
  get segments() {
    return this.id.split('.')
  }
/** whether this category equals the given one or is nested below it */
  isWithin(other: Category | string) {
    const otherId = typeof other === 'string' ? other : other.id
    return this.id === otherId || this.id.startsWith(`${otherId}.`)
  }
  toString() {
    return this.label
  }
}
