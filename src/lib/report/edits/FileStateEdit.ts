import type {EditTone} from './base/Edit.ts'

import {Edit} from './base/Edit.ts'

/** removes the file */
export class DeleteEdit extends Edit {
  readonly action = 'delete'
  readonly summary = 'remove the file'
  readonly tone: EditTone = 'destructive'
  toMarkdown() {
    return 'Delete the file.'
  }
}
/** creates the file if it does not exist yet */
export class EnsureEdit extends Edit {
  readonly action = 'ensure'
  readonly summary = 'create the file if missing'
  readonly tone: EditTone = 'neutral'
  toMarkdown() {
    return 'Ensure the file exists.'
  }
}
/** removes all contents of the file */
export class EmptyEdit extends Edit {
  readonly action = 'empty'
  readonly summary = 'remove all contents'
  readonly tone: EditTone = 'destructive'
  toMarkdown() {
    return 'Empty the file.'
  }
}
