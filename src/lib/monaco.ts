import type {CaretSelection} from './entryCaret.ts'
import type {MonacoEditorProps} from 'monacozen'

import {getEntryBounds, getNextEntryCaret} from './entryCaret.ts'

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

/** current selection of the editor as character offsets */
export const getCaretSelection = (editor: MonacoEditor): CaretSelection | undefined => {
  const model = editor.getModel()
  const selection = editor.getSelection()
  if (!model || !selection) {
    return
  }
  return {
    anchor: model.getOffsetAt(selection.getSelectionStart()),
    active: model.getOffsetAt(selection.getPosition()),
  }
}

/**
 * Places the caret inside an entry’s source range, cycling through end of the last contentful line → start of the first contentful line → whole entry selected on repeated calls. Returns the trimmed entry range for highlighting, or undefined if there is nothing to reveal.
 */
export const revealEntry = (editor: MonacoEditor, start: number, end: number, {focus = true} = {}) => {
  const model = editor.getModel()
  if (!model) {
    return
  }
  const bounds = getEntryBounds(model.getValue(), start, end)
  if (!bounds) {
    return
  }
  const next = getNextEntryCaret(bounds, getCaretSelection(editor))
  const anchor = model.getPositionAt(next.anchor)
  const active = model.getPositionAt(next.active)
  editor.setSelection({
    selectionStartLineNumber: anchor.lineNumber,
    selectionStartColumn: anchor.column,
    positionLineNumber: active.lineNumber,
    positionColumn: active.column,
  })
  editor.revealPositionInCenterIfOutsideViewport(active, 0)
  if (focus) {
    editor.focus()
  }
  const from = model.getPositionAt(bounds.start)
  const to = model.getPositionAt(bounds.end)
  return {
    startLineNumber: from.lineNumber,
    startColumn: from.column,
    endLineNumber: to.lineNumber,
    endColumn: to.column,
  }
}

export {type MonacoApi} from 'monacozen'
