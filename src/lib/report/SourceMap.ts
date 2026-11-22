import type {EntrySource, SourceLocation} from './Finding.ts'
import type {Document, LineCounter, Pair, YAMLMap, Node as YamlNode} from 'yaml'

import {isMap, isPair, isScalar, isSeq} from 'yaml'

type Range = readonly [number, number, ...Array<number>]
/** resolves YAML source positions for JSON paths */
export class SourceMap {
  readonly document: Document
  readonly lineCounter: LineCounter
  readonly #pairs = new WeakMap<YAMLMap, Map<string, Pair>>
  constructor(document: Document, lineCounter: LineCounter) {
    this.document = document
    this.lineCounter = lineCounter
  }
  entry(path: ReadonlyArray<string>, text: string, json: boolean, newline: string): EntrySource | undefined {
    const {node, range, shared} = this.lookup(path)
    const location = this.toLocation(range)
    // An anchor may be referenced by other entries. Never change them as a side effect.
    if (!location || shared || !isMap(node) || node.anchor || !node.range) {
      return location
    }
    const visible = node.get('visible', true)
    if (isScalar(visible) && visible.range && !visible.anchor && typeof visible.value === 'boolean') {
      return {
        ...location,
        visibilityEdit: {
          start: visible.range[0],
          end: visible.range[1],
          text: String(!visible.value),
        },
      }
    }
    if (visible !== undefined) {
      return location
    }
    const start = node.range[0] + (node.flow ? 1 : 0)
    const indent = node.flow ? '' : text.slice(start - this.lineCounter.linePos(start).col + 1, start)
    if (!/^ *$/.test(indent)) {
      return location
    }
    const insert = node.flow ? `${json ? '"visible"' : 'visible'}: false, ` : `visible: false${newline}${indent}`
    return {
      ...location,
      visibilityEdit: {
        start,
        end: start,
        text: insert,
      },
    }
  }
  locate(path: ReadonlyArray<PropertyKey>): SourceLocation | undefined {
    return this.toLocation(this.lookup(path).range)
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
  /** finds the deepest node along the path; for map entries, the range spans from key to value */
  private lookup(path: ReadonlyArray<PropertyKey>) {
    let node: unknown = this.document.contents
    let range: Range | null | undefined = (node as YamlNode | null)?.range
    let shared = false
    for (const segment of path) {
      if (isMap(node)) {
        shared ||= Boolean(node.anchor)
        let pairs = this.#pairs.get(node)
        if (!pairs) {
          pairs = new Map(node.items.map(pair => [String(isScalar(pair.key) ? pair.key.value : pair.key), pair]))
          this.#pairs.set(node, pairs)
        }
        const pair = pairs.get(String(segment))
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
    return {
      node,
      range,
      shared,
    }
  }
}
