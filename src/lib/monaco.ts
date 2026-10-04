import type {CaretSelection, EntryBounds, EntryCaretCycle, EntryPoint} from './entryCaret.ts'
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

/** current selection of the editor as character offsets; undefined if there is no selection or there are multiple carets */
export const getCaretSelection = (editor: MonacoEditor): CaretSelection | undefined => {
  const model = editor.getModel()
  const selections = editor.getSelections()
  if (!model || selections?.length !== 1) {
    return
  }
  const [selection] = selections
  return {
    anchor: model.getOffsetAt(selection.getSelectionStart()),
    active: model.getOffsetAt(selection.getPosition()),
  }
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
/** last reveal cycle per editor, so repeated reveals of the same entry can continue it */
const cycles = new WeakMap<MonacoEditor, EntryCaretCycle>

/**
 * Places the caret inside an entry’s source range. The first reveal jumps to whichever of the entry’s edges is nearest to the current caret (the center of all carets if there are multiple, the center of the visible area if no caret has been placed yet). Repeated reveals cycle to the other edge, then select the whole entry. Returns the trimmed entry range for highlighting, or undefined if there is nothing to reveal.
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
  const cycle = getNextEntryCaret(bounds, {
    current: getCaretSelection(editor),
    previous: cycles.get(editor),
    nearest: getNearestEdge(editor, model, bounds),
  })
  cycles.set(editor, cycle)
  placedCarets.add(editor)
  const anchor = model.getPositionAt(cycle.selection.anchor)
  const active = model.getPositionAt(cycle.selection.active)
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
