import type {EditContext, EditTone} from './base/Edit.ts'

import {codeBlock, trimFinalNewline} from '#src/lib/markdown/syntax.ts'

import {Edit} from './base/Edit.ts'

/** writes literal content to the file */
export abstract class ContentEdit extends Edit {
  readonly content: string
  abstract readonly lead: string
  constructor(content: string) {
    super()
    this.content = content
  }
  get lines() {
    return trimFinalNewline(this.content).split('\n')
  }
  toMarkdown({language}: EditContext) {
    if (this.content === '') {
      return `${this.lead.replace(/:$/, '')} nothing.`
    }
    return `${this.lead}\n\n${codeBlock(this.content, language)}`
  }
}
export class OverwriteEdit extends ContentEdit {
  readonly action = 'overwrite'
  readonly lead = 'Overwrite the file with:'
  readonly tone: EditTone = 'modifying'
}
export class AppendEdit extends ContentEdit {
  readonly action = 'append'
  readonly lead = 'Append:'
  readonly tone: EditTone = 'additive'
}
export class PrependEdit extends ContentEdit {
  readonly action = 'prepend'
  readonly lead = 'Prepend:'
  readonly tone: EditTone = 'additive'
}
