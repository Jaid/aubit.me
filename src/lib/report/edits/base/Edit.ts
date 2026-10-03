import type {EditAction} from '#src/lib/aubitSchema.ts'

/** rough visual meaning of an edit, used for coloring */
export type EditTone = 'additive' | 'destructive' | 'modifying' | 'neutral' | 'structural'
export type EditContext = {
  file: string
/** Markdown code fence language guessed from the file name */
  language: string
}
/** single suggested operation on a file */
export abstract class Edit {
  abstract readonly action: EditAction
  abstract readonly tone: EditTone
/** short human-readable label like “insert after” */
  get verb() {
    return this.action.replaceAll('_', ' ')
  }
/** Markdown paragraph(s) describing the operation */
  abstract toMarkdown(context: EditContext): string
}
