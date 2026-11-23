import type {AubitData, DocumentData} from '#src/lib/aubitSchema.ts'
import type {EntrySource, SourceLocation} from './Finding.ts'

import {documentSchema} from 'aubit-schema'
import stringifyClank from 'stringify-clank'
import {isScalar, LineCounter, parseDocument, stringify, visit} from 'yaml'

import {assertInputSize, assertSafeData, maxFindings} from '#src/lib/limits.ts'

import {Report} from './Report.ts'
import {SourceMap} from './SourceMap.ts'

export type IssueSource = 'input' | 'schema' | 'yaml'
export type InputIssue = {
  location?: SourceLocation
  message: string
  path: ReadonlyArray<number | string>
  source: IssueSource
}

/** structured-cloneable data exchanged with the parser worker */
export type ParseSnapshot = {
  clank: string | null
  data?: DocumentData
  issues: ReadonlyArray<InputIssue>
  isYamlValid: boolean
  language: 'json' | 'yaml'
  locations: Map<string, Map<string, EntrySource | undefined>>
  raw: unknown
  text: string
}
export type ParseResult = Omit<ParseSnapshot, 'data' | 'locations'> & {
  collection: ReadonlyMap<string, Report>
  report?: Report
}

export function inputFailure(text: string, message: string): ParseSnapshot {
  return {
    text,
    language: 'yaml',
    isYamlValid: false,
    raw: undefined,
    clank: null,
    locations: new Map,
    issues: [{
      source: 'input',
      message,
      path: [],
    }],
  }
}

const formatPath = (path: ReadonlyArray<number | string>) => path.map(segment => (typeof segment === 'number' ? `[${segment}]` : `.${segment}`)).join('').replace(/^\./, '')
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const findingCount = (value: unknown) => (isRecord(value) && isRecord(value.entries) ? Object.keys(value.entries).length : 0)
const withVisibleEntries = (report: Record<string, unknown>) => {
  if (!isRecord(report.entries)) {
    return report
  }
  const entries = Object.entries(report.entries).flatMap<[string, unknown]>(([id, entry]) => {
    if (!isRecord(entry) || !Object.hasOwn(entry, 'visible')) {
      return [[id, entry]]
    }
    const {visible, ...fields} = entry
    return visible === false ? [] : [[id, fields]]
  })
  return {
    ...report,
    entries: Object.fromEntries(entries),
  }
}
/** Project only report entries, keeping raw values available even when schema validation fails. */
const clankData = (raw: unknown) => {
  if (!isRecord(raw)) {
    return raw
  }
  const root = withVisibleEntries(raw)
  if (!isRecord(raw.collection)) {
    return root
  }
  return {
    ...root,
    collection: Object.fromEntries(Object.entries(raw.collection).map(([id, report]) => [id, isRecord(report) ? withVisibleEntries(report) : report])),
  }
}

/** Capture raw data before schema defaults or domain normalization. */
export function parseSnapshot(text: string): ParseSnapshot {
  const result: ParseSnapshot = {
    text,
    language: 'yaml',
    isYamlValid: false,
    raw: undefined,
    clank: null,
    locations: new Map,
    issues: [],
  }
  try {
    assertInputSize(text)
    if (!text.trim()) {
      return inputFailure(text, 'Enter an Aubit document with an entries mapping, or choose New or Example.')
    }
    try {
      JSON.parse(text)
      result.language = 'json'
    } catch {}
    const lineCounter = new LineCounter
    const document = parseDocument(text, {
      lineCounter,
      prettyErrors: false,
      uniqueKeys: true,
      version: '1.2',
    })
    const problems = [...document.errors, ...document.warnings]
    if (problems.length) {
      result.issues = problems.slice(0, 100).map(error => {
        const [start, end] = error.pos
        const {line, col} = lineCounter.linePos(start)
        return {
          source: 'yaml',
          message: error.message.split('\n')[0],
          path: [],
          location: {
            start,
            end,
            line,
            column: col,
          },
        }
      })
      return result
    }
    visit(document, {Pair: (_key, pair) => {
      if (!isScalar(pair.key) || typeof pair.key.value !== 'string') {
        throw new Error('Mapping keys must be strings. Quote numeric finding IDs; complex YAML keys are not supported.')
      }
    }})
    const raw: unknown = document.toJS({maxAliasCount: 100})
    assertSafeData(raw)
    const clank = stringifyClank(clankData(raw) as Parameters<typeof stringifyClank>[0])
    Object.assign(result, {
      raw,
      clank,
      isYamlValid: true,
    })
    const collected = isRecord(raw) && isRecord(raw.collection) ? Object.values(raw.collection) : []
    if (collected.reduce<number>((sum, report) => sum + findingCount(report), findingCount(raw)) > maxFindings) {
      result.issues = [{
        source: 'input',
        message: 'Documents are limited to 5,000 findings across all reports. Split this document into smaller documents.',
        path: ['entries'],
      }]
      return result
    }
    const validation = documentSchema.safeParse(raw)
    const sourceMap = new SourceMap(document, lineCounter)
    if (!validation.success) {
      result.issues = validation.error.issues.slice(0, 100).map(issue => {
        const path = issue.path.map(segment => (typeof segment === 'number' ? segment : String(segment)))
        const locationPath = issue.code === 'unrecognized_keys' ? [...path, issue.keys[0]] : path
        return {
          source: 'schema',
          message: (path.length ? `${formatPath(path)}: ` : '') + issue.message,
          path,
          location: sourceMap.locate(locationPath),
        }
      })
      return result
    }
    result.data = validation.data
    const newline = text.includes('\r\n') ? '\r\n' : '\n'
    const indexReport = (key: string, report: AubitData) => {
      const prefix = key ? ['collection', key, 'entries'] : ['entries']
      result.locations.set(key, new Map(Object.keys(report.entries).map(id => [id, sourceMap.entry([...prefix, id], text, result.language === 'json', newline)])))
    }
    indexReport('', validation.data)
    for (const [key, report] of Object.entries(validation.data.collection ?? {})) {
      indexReport(key, report)
    }
    return result
  } catch (error) {
    return inputFailure(text, Error.isError(error) ? error.message : 'This document could not be processed safely.')
  }
}

export function materializeSnapshot(snapshot: ParseSnapshot): ParseResult {
  const {data, locations, ...result} = snapshot
  const build = (key: string, report: AubitData) => Report.fromData(report, id => locations.get(key)?.get(id))
  return {
    ...result,
    report: data ? build('', data) : undefined,
    collection: new Map(Object.entries(data?.collection ?? {}).map(([key, report]) => [key, build(key, report)])),
  }
}

export const parseInput = (text: string) => materializeSnapshot(parseSnapshot(text))

export function formatInput(raw: unknown, language: 'json' | 'yaml') {
  assertSafeData(raw)
  const text = language === 'json' ? `${JSON.stringify(raw, null, 2)}\n` : stringify(raw, {lineWidth: 0})
  assertInputSize(text)
  return text
}
