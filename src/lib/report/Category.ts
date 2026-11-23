import type {CategoryId} from '#src/lib/aubitSchema.ts'

import {categoryDefinitions} from '#src/lib/aubitSchema.ts'

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
export class Category {
  static readonly all: ReadonlyArray<Category> = categoryDefinitions.map(Category.fromDefinition)
  static get(id: CategoryId) {
    const category = Category.all.find(entry => entry.id === id)
    if (!category) {
      throw new RangeError(`Unknown category: ${id}`)
    }
    return category
  }
  private static fromDefinition({id, description}: typeof categoryDefinitions[number]) {
    return new Category(id, description)
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
  get label() {
    return this.segments.join(' › ')
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
  isWithin(other: Category | string) {
    const otherId = typeof other === 'string' ? other : other.id
    return this.id === otherId || this.id.startsWith(`${otherId}.`)
  }
  toString() {
    return this.label
  }
}
