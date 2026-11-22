import {diffArrays} from 'diff'

export type DiffPart = {
  changed: boolean
  text: string
}
export type HighlightedLines = Array<Array<DiffPart>>

const maxLines = 200
const words = new Intl.Segmenter('en', {granularity: 'word'})
const graphemes = new Intl.Segmenter('en', {granularity: 'grapheme'})
const chars = (text: string) => Array.from(graphemes.segment(text), part => part.segment)
const tokenize = (text: string) => {
  const segments = [...words.segment(text)]
  return {
    text: text.trim(),
    tokens: segments.map(part => part.segment),
    words: new Set(segments.filter(part => part.isWordLike).map(part => part.segment)),
  }
}
type Line = ReturnType<typeof tokenize>

const commonEdges = <T extends ReadonlyArray<string> | string>(a: T, b: T) => {
  const limit = Math.min(a.length, b.length)
  let prefix = 0
  let suffix = 0
  while (prefix < limit && a[prefix] === b[prefix]) {
    prefix++
  }
  while (suffix < limit - prefix && a[a.length - 1 - suffix] === b[b.length - 1 - suffix]) {
    suffix++
  }
  return {
    prefix,
    suffix,
  }
}
const similarity = (a: Line, b: Line) => {
  // Exact lines anchor the alignment, even when several neighbors look similar.
  if (a.text === b.text) {
    return maxLines + 1
  }
  const {prefix, suffix} = commonEdges(a.text, b.text)
  let sharedWords = 0
  for (const word of a.words) {
    if (b.words.has(word)) {
      sharedWords += word.length
    }
  }
  const score = 2 * Math.max(sharedWords, prefix + suffix) / (a.text.length + b.text.length)
  return score >= 1 / 3 ? score : 0
}
/** Choose the most similar ordered line pairs, allowing whole lines to be inserted or deleted. */
function *pairLines(before: Array<Line>, after: Array<Line>) {
  const stride = after.length + 1
  const scores = new Float64Array((before.length + 1) * stride)
  const paired = new Uint8Array(scores.length)
  for (let i = before.length - 1; i >= 0; i--) {
    for (let j = after.length - 1; j >= 0; j--) {
      const k = i * stride + j
      const skip = Math.max(scores[k + stride], scores[k + 1])
      const match = similarity(before[i], after[j])
      const take = match + scores[k + stride + 1]
      if (match && take >= skip) {
        scores[k] = take
        paired[k] = 1
      } else {
        scores[k] = skip
      }
    }
  }
  for (let i = 0, j = 0; i < before.length && j < after.length;) {
    const k = i * stride + j
    if (paired[k]) {
      yield [i++, j++] as const
    } else if (scores[k + stride] >= scores[k + 1]) {
      i++
    } else {
      j++
    }
  }
}
const plain = (text: string): DiffPart => ({
  text,
  changed: false,
})
const changed = (text: string): DiffPart => ({
  text,
  changed: true,
})
const refineWord = (before: string, after: string) => {
  const oldChars = chars(before)
  const newChars = chars(after)
  const {prefix, suffix} = commonEdges(oldChars, newChars)
  if (2 * (prefix + suffix) < Math.max(oldChars.length, newChars.length)) {
    return
  }
  const parts = (word: Array<string>) => {
    const end = word.length - suffix
    return [plain(word.slice(0, prefix).join('')), changed(word.slice(prefix, end).join('')), plain(word.slice(end).join(''))].filter(part => part.text)
  }
  return {
    removed: parts(oldChars),
    added: parts(newChars),
  }
}
/** Keep rewritten expressions together, but pinpoint small edits within an otherwise similar word. */
const compareLine = (a: Line, b: Line) => {
  const changes = diffArrays(a.tokens, b.tokens, {maxEditLength: 128})
  if (!changes) {
    return
  }
  const removed: Array<DiffPart> = []
  const added: Array<DiffPart> = []
  const oldTokens: Array<string> = []
  const newTokens: Array<string> = []
  const flush = () => {
    const word = oldTokens.length === 1 && newTokens.length === 1 ? refineWord(oldTokens[0], newTokens[0]) : undefined
    if (oldTokens.length) {
      removed.push(...word?.removed ?? [changed(oldTokens.join(''))])
    }
    if (newTokens.length) {
      added.push(...word?.added ?? [changed(newTokens.join(''))])
    }
    oldTokens.length = 0
    newTokens.length = 0
  }
  for (const [i, change] of changes.entries()) {
    const tokens = change.value
    if (!change.added && !change.removed && (i === 0 || i === changes.length - 1 || tokens.some(token => a.words.has(token)))) {
      flush()
      const context = plain(tokens.join(''))
      removed.push(context)
      added.push(context)
    } else {
      // A matching dot, parenthesis or space inside a rewrite is not a useful anchor on its own.
      if (!change.added) {
        oldTokens.push(...tokens)
      }
      if (!change.removed) {
        newTokens.push(...tokens)
      }
    }
  }
  flush()
  return {
    removed,
    added,
  }
}

export function inlineDiff(before: ReadonlyArray<string>, after: ReadonlyArray<string>) {
  if (before.length > maxLines || after.length > maxLines || [...before, ...after].reduce((sum, line) => sum + line.length, 0) > 16_384) {
    return
  }
  const oldLines = before.map(tokenize)
  const newLines = after.map(tokenize)
  const removed = before.map(line => [plain(line)])
  const added = after.map(line => [plain(line)])
  for (const [i, j] of pairLines(oldLines, newLines)) {
    if (before[i] === after[j]) {
      continue
    }
    const pair = compareLine(oldLines[i], newLines[j])
    if (!pair) {
      continue
    }
    removed[i] = pair.removed
    added[j] = pair.added
  }
  return {
    removed,
    added,
  }
}
