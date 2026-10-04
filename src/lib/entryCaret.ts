/** character offsets of an entry’s code without its surrounding whitespace */
export type EntryBounds = {
  /** right after the last non-whitespace character, the end of the last contentful line */
  end: number
  /** first non-whitespace character, right of the indentation of the first contentful line */
  start: number
}
/** selection expressed as character offsets; `active` is where the caret is */
export type CaretSelection = {
  active: number
  anchor: number
}
/** edge of an entry a reveal cycle starts with */
export type EntryEdge = 'end' | 'start'
/** caret placement within an entry */
export type EntryCaretStep = EntryEdge | 'entry'
/** position used to decide which entry edge is nearer; `y` is a vertical coordinate, `offset` breaks ties between edges on the same visual line */
export type EntryPoint = {
  offset?: number
  y: number
}
/** state of a running reveal cycle */
export type EntryCaretCycle = {
  bounds: EntryBounds
  /** edge the cycle started with */
  first: EntryEdge
  /** position within the cycle’s steps */
  index: number
  /** selection that was applied by this step */
  selection: CaretSelection
  step: EntryCaretStep
}
type NextEntryCaretOptions = {
  /** current single selection of the editor; leave undefined for multiple carets */
  current?: CaretSelection
  /** edge nearest to the user’s point of interest, used when a new cycle starts */
  nearest?: EntryEdge
  /** cycle returned by the previous reveal */
  previous?: EntryCaretCycle
}
const cycles: Record<EntryEdge, ReadonlyArray<EntryCaretStep>> = {
  end: ['end', 'start', 'entry'],
  start: ['start', 'end', 'entry'],
}
const isWhitespace = (character: string) => /\s/.test(character)
const isSameSelection = (a: CaretSelection, b: CaretSelection) => a.anchor === b.anchor && a.active === b.active
const isSameBounds = (a: EntryBounds, b: EntryBounds) => a.start === b.start && a.end === b.end

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
  if (from === to) {
    return undefined
  }
  return {
    start: from,
    end: to,
  }
}

/** selection for a cycle step; the whole-entry selection keeps the caret at the start */
export const getEntryCaretSelection = (bounds: EntryBounds, step: EntryCaretStep): CaretSelection => {
  if (step === 'entry') {
    return {
      anchor: bounds.end,
      active: bounds.start,
    }
  }
  return {
    anchor: bounds[step],
    active: bounds[step],
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

const createCycle = (bounds: EntryBounds, first: EntryEdge, index: number): EntryCaretCycle => {
  const steps = cycles[first]
  const normalizedIndex = index % steps.length
  const step = steps[normalizedIndex]
  return {
    bounds,
    first,
    index: normalizedIndex,
    step,
    selection: getEntryCaretSelection(bounds, step),
  }
}

/**
 * Repeated reveals of the same entry cycle through three states, starting with the edge nearest to the user’s point of interest:
 * - nearest edge is the end: end of the last contentful line → start of the first contentful line → whole entry selected → …
 * - nearest edge is the start: start of the first contentful line → end of the last contentful line → whole entry selected → …
 *
 * The whole-entry selection keeps the caret at the start. A cycle continues only while the selection is still the one applied by the previous step, so moving the caret, editing the entry or revealing another entry starts over. If a new cycle’s first step would not move the caret, it is skipped.
 */
export const getNextEntryCaret = (bounds: EntryBounds, {current, nearest = 'end', previous}: NextEntryCaretOptions = {}): EntryCaretCycle => {
  if (previous && current && isSameBounds(previous.bounds, bounds) && isSameSelection(previous.selection, current)) {
    return createCycle(bounds, previous.first, previous.index + 1)
  }
  const cycle = createCycle(bounds, nearest, 0)
  if (current && isSameSelection(cycle.selection, current)) {
    return createCycle(bounds, nearest, 1)
  }
  return cycle
}
