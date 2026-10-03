import type {EditTone} from './base/Edit.ts'

import {inlineCode} from '#src/lib/markdown/syntax.ts'

import {Edit} from './base/Edit.ts'

/** changes the location of a file or folder */
export abstract class PathEdit extends Edit {
  readonly to: string
  readonly tone: EditTone = 'structural'
  constructor(to: string) {
    super()
    this.to = to
  }
/** resulting path after the operation */
  abstract resolveTarget(file: string): string
}
/** keeps the folder and changes the name */
export class RenameEdit extends PathEdit {
  readonly action = 'rename'
  resolveTarget(file: string) {
    const slashIndex = file.lastIndexOf('/')
    if (slashIndex === -1) {
      return this.to
    }
    return `${file.slice(0, slashIndex + 1)}${this.to}`
  }
  toMarkdown() {
    return `Rename to ${inlineCode(this.to)}.`
  }
}
/** moves to an entirely new path */
export class MoveEdit extends PathEdit {
  readonly action = 'move'
  resolveTarget() {
    return this.to
  }
  toMarkdown() {
    return `Move to ${inlineCode(this.to)}.`
  }
}
