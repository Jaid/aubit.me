/** Limits apply to file imports, drafts, parser workers, and shared links alike. */
export const maxInputBytes = 2_000_000
export const maxExpandedBytes = 8_000_000
export const maxDepth = 64
export const maxNodes = 100_000
export const maxFindings = 5000
export const maxPermalinkCharacters = 64_000
export const inputByteLength = (text: string) => (new TextEncoder).encode(text).byteLength

export function assertInputSize(text: string) {
  if (inputByteLength(text) > maxInputBytes) {
    throw new Error('This report exceeds the 2 MB input limit.')
  }
}

/** Validate a JSON-like tree without losing cycles, aliases, or unsafe numeric values. */
export function assertSafeData(raw: unknown) {
  const ancestors = new WeakSet<object>
  let budget = maxExpandedBytes
  let nodes = maxNodes
  function visit(value: unknown, depth: number) {
    if (depth > maxDepth) {
      throw new Error('Input nesting exceeds the 64-level limit.')
    }
    if (--nodes < 0) {
      throw new Error('The expanded document contains too many values.')
    }
    budget -= typeof value === 'string' ? value.length * 2 + 8 : 16
    if (budget < 0) {
      throw new Error('The expanded document exceeds the 8 MB rendering budget. Reduce YAML aliases or report size.')
    }
    if (typeof value === 'number' && (!Number.isFinite(value) || Number.isInteger(value) && !Number.isSafeInteger(value))) {
      throw new TypeError('Non-finite numbers and integers outside the safe JavaScript range are not supported. Quote exact large numbers as strings.')
    }
    if (value === null || typeof value !== 'object') {
      if (value !== null && !['boolean', 'number', 'string'].includes(typeof value)) {
        throw new Error('Only JSON-compatible YAML values are supported.')
      }
      return
    }
    if (ancestors.has(value)) {
      throw new Error('Recursive YAML aliases cannot be represented as an Aubit report or Clank.')
    }
    if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) {
      throw new Error('Only sequences, mappings, and JSON-compatible scalar values are supported.')
    }
    ancestors.add(value)
    for (const [key, child] of Object.entries(value)) {
      budget -= key.length * 2
      visit(child, depth + 1)
    }
    ancestors.delete(value)
  }
  visit(raw, 0)
}
