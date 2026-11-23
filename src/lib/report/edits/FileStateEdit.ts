import type {EditTone} from './base/Edit.ts'

import {Edit} from './base/Edit.ts'

export class DeleteEdit extends Edit {
  readonly action = 'delete'
  readonly summary = 'remove the file'
  readonly tone: EditTone = 'destructive'
  toMarkdown() {
    return 'Delete the file.'
  }
}
export class EnsureEdit extends Edit {
  readonly action = 'ensure'
  readonly summary = 'create the file if missing'
  readonly tone: EditTone = 'neutral'
  toMarkdown() {
    return 'Ensure the file exists.'
  }
}
export class EmptyEdit extends Edit {
  readonly action = 'empty'
  readonly summary = 'remove all contents'
  readonly tone: EditTone = 'destructive'
  toMarkdown() {
    return 'Empty the file.'
  }
}
