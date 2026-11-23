/** character offsets of an entry’s code without its surrounding whitespace */
export type EntryBounds = {
  /** right after the last non-whitespace character, the end of the last contentful line */
  end: number
  /** first non-whitespace character, right of the indentation of the first contentful line */
  start: number
}
export type EntryEdge = 'end' | 'start'
/** position used to decide which entry edge is nearer; `y` is a vertical coordinate, `offset` breaks ties between edges on the same visual line */
export type EntryPoint = {
  offset?: number
  y: number
}
export type EntryCaret = {
  bounds: EntryBounds
  edge: EntryEdge
  offset: number
}
type NextEntryCaretOptions = {
  /** offset of the editor’s caret if there is exactly one caret without a selection; leave undefined otherwise */
  current?: number
  /** edge nearest to the user’s point of interest, used when the toggle starts over */
  nearest?: EntryEdge
  previous?: EntryCaret
}
const isWhitespace = (character: string) => /\s/.test(character)
const isSameBounds = (a: EntryBounds, b: EntryBounds) => a.start === b.start && a.end === b.end
const getOppositeEdge = (edge: EntryEdge): EntryEdge => (edge === 'end' ? 'start' : 'end')
const createCaret = (bounds: EntryBounds, edge: EntryEdge): EntryCaret => ({
  bounds,
  edge,
  offset: bounds[edge],
})

/** trims whitespace from a source range, so the bounds start and end on contentful lines; returns undefined for a blank range */
export const getEntryBounds = (text: string, start: number, end: number): EntryBounds | undefined => {
  let from = Math.max(0, start)
  let to = Math.min(text.length, end)
  while (from < to && isWhitespace(text[from])) {
    from++
  }
  while (to > from && isWhitespace(text[to - 1])) {
    to--
  }
  if (from >= to) {
    return undefined
  }
  return {
    start: from,
    end: to,
  }
}

/**
 * Picks the entry edge closer to a reference point, like the caret or the center of the visible area.
 *
 * Vertical distance decides first. If both edges are equally far away, for example because the entry fits on one line, character offsets decide. A remaining tie prefers the end.
 */
export const getNearestEntryEdge = (start: EntryPoint, end: EntryPoint, reference: EntryPoint): EntryEdge => {
  const startDistance = Math.abs(reference.y - start.y)
  const endDistance = Math.abs(reference.y - end.y)
  if (startDistance !== endDistance) {
    return startDistance < endDistance ? 'start' : 'end'
  }
  if (reference.offset !== undefined && start.offset !== undefined && end.offset !== undefined) {
    return Math.abs(reference.offset - start.offset) < Math.abs(reference.offset - end.offset) ? 'start' : 'end'
  }
  return 'end'
}

/** Continue toggling only while the caret is still where the previous reveal left it. */
export const getNextEntryCaret = (bounds: EntryBounds, {current, nearest = 'end', previous}: NextEntryCaretOptions = {}): EntryCaret => {
  if (previous && current === previous.offset && isSameBounds(previous.bounds, bounds)) {
    return createCaret(bounds, getOppositeEdge(previous.edge))
  }
  if (current === bounds[nearest]) {
    return createCaret(bounds, getOppositeEdge(nearest))
  }
  return createCaret(bounds, nearest)
}
