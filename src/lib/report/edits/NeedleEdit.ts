import type {Needle} from '../needles/index.ts'
import type {EditContext, EditTone} from './base/Edit.ts'

import {codeBlock, diffBlock, inlineCode, isMultiline, trimFinalNewline} from '#src/lib/markdown/syntax.ts'

import {TextNeedle} from '../needles/index.ts'
import {Edit} from './base/Edit.ts'
const joinParagraphs = (...paragraphs: Array<string | undefined>) => paragraphs.filter(Boolean).join('\n\n')
/** operation that targets a located part of the file */
export abstract class NeedleEdit extends Edit {
  readonly needle: Needle
  constructor(needle: Needle) {
    super()
    this.needle = needle
  }
}
/** replaces the located part */
export class ReplaceEdit extends NeedleEdit {
  readonly action = 'edit'
  readonly replacement: string
  readonly tone: EditTone = 'modifying'
  constructor(needle: Needle, replacement: string) {
    super(needle)
    this.replacement = replacement
  }
  get replacementLines() {
    return trimFinalNewline(this.replacement).split('\n')
  }
  get verb() {
    return 'replace'
  }
  toMarkdown({language}: EditContext) {
    if (this.needle instanceof TextNeedle) {
      return `Replace:\n\n${diffBlock(this.needle.text, this.replacement)}`
    }
    const subject = `Replace ${this.needle.toMarkdownPhrase()}`
    if (this.replacement === '') {
      return `${subject} with an empty string.`
    }
    if (!isMultiline(this.replacement)) {
      return `${subject} with ${inlineCode(this.replacement)}.`
    }
    return joinParagraphs(`${subject} with:`, codeBlock(this.replacement, language))
  }
}
/** inserts content next to the located part */
export class InsertEdit extends NeedleEdit {
  readonly action: 'insert_after' | 'insert_before'
  readonly content: string
  readonly tone: EditTone = 'additive'
  constructor(action: 'insert_after' | 'insert_before', needle: Needle, content: string) {
    super(needle)
    this.action = action
    this.content = content
  }
  get lines() {
    return trimFinalNewline(this.content).split('\n')
  }
  get position() {
    return this.action === 'insert_before' ? 'before' : 'after'
  }
  toMarkdown({language}: EditContext) {
    const needleBlock = this.needle.toMarkdownBlock()
    const lead = `Insert ${this.position} ${this.needle.toMarkdownPhrase()}:`
    if (!needleBlock) {
      return joinParagraphs(lead, codeBlock(this.content, language))
    }
    return joinParagraphs(lead, needleBlock, 'Content:', codeBlock(this.content, language))
  }
}
/** removes the located part */
export class EraseEdit extends NeedleEdit {
  readonly action = 'erase'
  readonly tone: EditTone = 'destructive'
  toMarkdown() {
    if (this.needle instanceof TextNeedle) {
      return `Erase:\n\n${diffBlock(this.needle.text, undefined)}`
    }
    return `Erase ${this.needle.toMarkdownPhrase()}.`
  }
}
