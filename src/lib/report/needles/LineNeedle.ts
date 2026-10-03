import {Needle} from './base/Needle.ts'

/** 1-indexed line number */
export class LineNeedle extends Needle {
  readonly kind = 'line'
  readonly line: number
  constructor(line: number) {
    super()
    this.line = line
  }
  toMarkdownPhrase() {
    return `line ${this.line}`
  }
  toString() {
    return `line ${this.line}`
  }
}
