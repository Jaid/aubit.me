import {diffArrays} from 'diff'

export type DiffPart = {
  changed: boolean
  text: string
}
export type HighlightedLines = Array<Array<DiffPart>>

const segmenter = new Intl.Segmenter(undefined, {granularity: 'grapheme'})
const graphemes = (text: string) => Array.from(segmenter.segment(text), part => part.segment)
const append = (lines: HighlightedLines, value: string, changed: boolean) => {
  for (const [index, text] of value.split('\n').entries()) {
    if (index) {
      lines.push([])
    }
    if (text) {
      lines.at(-1)!.push({
        changed,
        text,
      })
    }
  }
}

/** Compare a literal replacement across line breaks. Keep whole-line rendering for oversized or highly dissimilar edits. */
export function inlineDiff(before: ReadonlyArray<string>, after: ReadonlyArray<string>) {
  if (before.length > 200 || after.length > 200 || [...before, ...after].reduce((sum, line) => sum + line.length, 0) > 16_384) {
    return
  }
  const changes = diffArrays(graphemes(before.join('\n')), graphemes(after.join('\n')), {maxEditLength: 128})
  if (!changes) {
    return
  }
  const removed: HighlightedLines = [[]]
  const added: HighlightedLines = [[]]
  for (const change of changes) {
    const text = change.value.join('')
    if (!change.added) {
      append(removed, text, change.removed)
    }
    if (!change.removed) {
      append(added, text, change.added)
    }
  }
  return {
    removed,
    added,
  }
}
