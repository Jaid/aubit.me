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
const isWhitespace = (character: string) => /\s/.test(character)

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

/**
 * Repeated reveals of the same entry cycle through three states:
 * 1. caret at the end of the last contentful line
 * 2. caret at the start of the first contentful line
 * 3. whole entry selected, caret at the start
 *
 * The state is derived from the current selection, so any other caret position starts the cycle over.
 */
export const getNextEntryCaret = (bounds: EntryBounds, current?: CaretSelection): CaretSelection => {
  const isCollapsed = current !== undefined && current.anchor === current.active
  if (isCollapsed && current.active === bounds.end) {
    return {
      anchor: bounds.start,
      active: bounds.start,
    }
  }
  if (isCollapsed && current.active === bounds.start) {
    return {
      anchor: bounds.end,
      active: bounds.start,
    }
  }
  return {
    anchor: bounds.end,
    active: bounds.end,
  }
}
