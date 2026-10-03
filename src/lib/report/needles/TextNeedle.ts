import {codeBlock, inlineCode, isMultiline, trimFinalNewline} from '#src/lib/markdown/syntax.ts'

import {Needle} from './base/Needle.ts'

/** literal text that is searched for */
export class TextNeedle extends Needle {
  readonly kind = 'text'
  readonly text: string
  constructor(text: string) {
    super()
    this.text = text
  }
  get isMultiline() {
    return isMultiline(this.text)
  }
  get lines() {
    return trimFinalNewline(this.text).split('\n')
  }
  toMarkdownBlock() {
    if (!this.isMultiline) {
      return
    }
    return codeBlock(this.text)
  }
  toMarkdownPhrase() {
    if (this.isMultiline) {
      return 'the text below'
    }
    return inlineCode(this.text)
  }
  toString() {
    return this.text
  }
}
