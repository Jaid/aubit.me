import type {PriorityLevel} from '#src/lib/schema/aubit.schema.ts'

import {prioritySchema} from '#src/lib/schema/aubit.schema.ts'

type PriorityAppearance = {
  chroma: number
  emoji: string
  hue: number
}
const appearances: Record<PriorityLevel, PriorityAppearance> = {
  0: {
    emoji: '🔴',
    hue: 25,
    chroma: 0.2,
  },
  1: {
    emoji: '🟠',
    hue: 55,
    chroma: 0.17,
  },
  2: {
    emoji: '🟡',
    hue: 90,
    chroma: 0.15,
  },
  3: {
    emoji: '🔵',
    hue: 250,
    chroma: 0.13,
  },
  4: {
    emoji: '⚪',
    hue: 250,
    chroma: 0.01,
  },
}
/** severity level of a finding, P0 (critical) to P4 (trivial) */
export class Priority {
  static readonly all: ReadonlyArray<Priority> = prioritySchema.options.map(option => {
    const level = option.value
    const name = option.description?.split(' – ').at(-1) ?? `level ${level}`
    return new Priority(level, name)
  })
  static get(level: PriorityLevel) {
    const priority = Priority.all.find(entry => entry.level === level)
    if (!priority) {
      throw new RangeError(`Unknown priority level: ${level}`)
    }
    return priority
  }
  readonly level: PriorityLevel
  readonly name: string
  constructor(level: PriorityLevel, name: string) {
    this.level = level
    this.name = name
  }
  get appearance() {
    return appearances[this.level]
  }
  get chroma() {
    return this.appearance.chroma
  }
  get code() {
    return `P${this.level}`
  }
  get emoji() {
    return this.appearance.emoji
  }
  get hue() {
    return this.appearance.hue
  }
/** for example “P0 – critical” */
  get label() {
    return `${this.code} – ${this.name}`
  }
  toString() {
    return this.label
  }
}
