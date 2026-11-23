import type {EditAction} from '#src/lib/aubitSchema.ts'

/** rough visual meaning of an edit, used for coloring */
export type EditTone = 'additive' | 'destructive' | 'modifying' | 'neutral' | 'structural'
export abstract class Edit {
  abstract readonly action: EditAction
  abstract readonly tone: EditTone
  get verb() {
    return this.action === 'edit' ? 'replace' : this.action.replaceAll('_', ' ')
  }
  abstract toMarkdown(language: string): string
}
