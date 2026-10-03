import type {MonacoEditorProps} from 'monacozen'

export type MonacoEditor = Parameters<NonNullable<MonacoEditorProps['onMount']>>[0]

/** selects and reveals a source range in the editor */
export const revealRange = (editor: MonacoEditor, start: number, end: number, {focus = true} = {}) => {
  const model = editor.getModel()
  if (!model) {
    return
  }
  const from = model.getPositionAt(start)
  const to = model.getPositionAt(end)
  const selection = {
    startLineNumber: from.lineNumber,
    startColumn: from.column,
    endLineNumber: to.lineNumber,
    endColumn: to.column,
  }
  editor.setSelection(selection)
  editor.revealRangeInCenterIfOutsideViewport(selection, 0)
  if (focus) {
    editor.focus()
  }
}

export {type MonacoApi} from 'monacozen'
