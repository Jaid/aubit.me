import type {Edit, EditContext} from './edits/index.ts'

import {getFileLanguage} from '#src/lib/fileLanguage.ts'

/** list of edits targeting one file */
export class SuggestedChange {
  readonly edits: ReadonlyArray<Edit>
  readonly file: string
  constructor(file: string, edits: ReadonlyArray<Edit>) {
    this.file = file
    this.edits = edits
  }
  get context(): EditContext {
    return {
      file: this.file,
      language: this.language,
    }
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
