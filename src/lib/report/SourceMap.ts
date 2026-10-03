import type {SourceLocation} from './Finding.ts'
import type {Document, LineCounter, Node as YamlNode} from 'yaml'

import {isMap, isPair, isScalar, isSeq} from 'yaml'

type Range = readonly [number, number, ...Array<number>]
const keyMatches = (key: unknown, segment: PropertyKey) => {
  const value = isScalar(key) ? key.value : key
  return String(value) === String(segment)
}
/** resolves YAML source positions for JSON paths */
export class SourceMap {
  readonly document: Document
  readonly lineCounter: LineCounter
  constructor(document: Document, lineCounter: LineCounter) {
    this.document = document
    this.lineCounter = lineCounter
  }
  /** finds the deepest node along the path; for map entries, the range spans from key to value */
  locate(path: ReadonlyArray<PropertyKey>): SourceLocation | undefined {
    let node: unknown = this.document.contents
    let range: Range | null | undefined = (node as YamlNode | null)?.range
    for (const segment of path) {
      if (isMap(node)) {
        const pair = node.items.find(item => keyMatches(item.key, segment))
        if (!pair) {
          break
        }
        const keyRange = (pair.key as YamlNode | null)?.range
        const valueRange = (pair.value as YamlNode | null)?.range
        range = keyRange && valueRange ? [keyRange[0], valueRange[1]] : keyRange ?? valueRange
        node = pair.value
        continue
      }
      if (isSeq(node) && typeof segment === 'number') {
        const item = node.items[segment]
        if (!item) {
          break
        }
        node = isPair(item) ? item.value : item
        range = (node as YamlNode | null)?.range
        continue
      }
      break
    }
    return this.toLocation(range)
  }
  toLocation(range: Range | null | undefined): SourceLocation | undefined {
    if (!range) {
      return undefined
    }
    const [start, valueEnd] = range
    const {line, col} = this.lineCounter.linePos(start)
    return {
      start,
      end: valueEnd,
      line,
      column: col,
    }
  }
}
