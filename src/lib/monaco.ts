import type {EntryBounds, EntryCaret, EntryPoint} from './entryCaret.ts'
import type {MonacoEditorProps} from 'monacozen'

import {getEntryBounds, getNearestEntryEdge, getNextEntryCaret} from './entryCaret.ts'

export type MonacoEditor = Parameters<NonNullable<MonacoEditorProps['onMount']>>[0]
type MonacoModel = NonNullable<ReturnType<MonacoEditor['getModel']>>

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

/** character offset of the editor’s caret; undefined if there are multiple carets or text is selected */
export const getCaretOffset = (editor: MonacoEditor): number | undefined => {
  const model = editor.getModel()
  const selections = editor.getSelections()
  if (!model || selections?.length !== 1 || !selections[0].isEmpty()) {
    return
  }
  return model.getOffsetAt(selections[0].getPosition())
}
/** editors whose caret was placed by the user or by a reveal; before that, Monaco’s default caret at the document start is not a meaningful point of interest */
const placedCarets = new WeakSet<MonacoEditor>

/** starts treating the editor’s carets as user-placed once it gains text focus; returns a disposable */
export const trackCaretPlacement = (editor: MonacoEditor): {dispose: () => void} => {
  if (editor.hasTextFocus()) {
    placedCarets.add(editor)
  }
  return editor.onDidFocusEditorText(() => placedCarets.add(editor))
}

/** vertical position (in pixels from the top of the document, so wrapped lines count) and character offset of a model offset */
const getOffsetPoint = (editor: MonacoEditor, model: MonacoModel, offset: number): EntryPoint => {
  const position = model.getPositionAt(offset)
  return {
    y: editor.getTopForPosition(position.lineNumber, position.column),
    offset,
  }
}
/** center of all carets, or the center of the visible area of the editor if there are no placed carets */
const getReferencePoint = (editor: MonacoEditor, model: MonacoModel): EntryPoint => {
  const selections = placedCarets.has(editor) ? editor.getSelections() ?? [] : []
  const carets = selections.map(selection => getOffsetPoint(editor, model, model.getOffsetAt(selection.getPosition())))
  if (carets.length === 0) {
    return {y: editor.getScrollTop() + editor.getLayoutInfo().height / 2}
  }
  const ys = carets.map(caret => caret.y)
  const offsets = carets.map(caret => caret.offset!)
  return {
    y: (Math.min(...ys) + Math.max(...ys)) / 2,
    offset: (Math.min(...offsets) + Math.max(...offsets)) / 2,
  }
}
const getNearestEdge = (editor: MonacoEditor, model: MonacoModel, bounds: EntryBounds) => {
  return getNearestEntryEdge(getOffsetPoint(editor, model, bounds.start), getOffsetPoint(editor, model, bounds.end), getReferencePoint(editor, model))
}
/** last reveal per editor, so repeated reveals of the same entry can toggle between its edges */
const previousCarets = new WeakMap<MonacoEditor, EntryCaret>

/**
 * Places the caret at an edge of an entry’s source range. The first reveal jumps to whichever of the entry’s edges is nearest to the current caret (the center of all carets if there are multiple, the center of the visible area if no caret has been placed yet). Repeated reveals toggle between both edges. Nothing gets selected. Returns the trimmed entry range for highlighting, or undefined if there is nothing to reveal.
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
  const caret = getNextEntryCaret(bounds, {
    current: getCaretOffset(editor),
    previous: previousCarets.get(editor),
    nearest: getNearestEdge(editor, model, bounds),
  })
  previousCarets.set(editor, caret)
  placedCarets.add(editor)
  const position = model.getPositionAt(caret.offset)
  // setPosition() also collapses multiple carets and any selection into this single caret
  editor.setPosition(position)
  editor.revealPositionInCenterIfOutsideViewport(position, 0)
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
