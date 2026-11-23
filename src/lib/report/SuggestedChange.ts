import type {SuggestedChangeData} from '#src/lib/aubitSchema.ts'
import type {Edit} from './edits/index.ts'

import {getFileLanguage} from '#src/lib/fileLanguage.ts'

import {createEdit} from './edits/index.ts'

export class SuggestedChange {
  readonly data: SuggestedChangeData
  readonly edits: ReadonlyArray<Edit>
  constructor(data: SuggestedChangeData) {
    this.data = data
    this.edits = (Array.isArray(data.edit) ? data.edit : [data.edit]).map(createEdit)
  }
  get file() {
    return this.data.file
  }
  get fileName() {
    return this.file.split('/').at(-1) ?? this.file
  }
  get folder() {
    const slashIndex = this.file.lastIndexOf('/')
    return slashIndex === -1 ? '' : this.file.slice(0, slashIndex + 1)
  }
  get language() {
    return getFileLanguage(this.file)
  }
}
