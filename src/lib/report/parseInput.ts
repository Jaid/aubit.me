import type {AubitData} from '#src/lib/aubitSchema.ts'
import type {SourceLocation} from './Finding.ts'

import schema from 'aubit-schema'
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

/** Transferable worker result. No class instances or executable data cross the boundary. */
export type ParseSnapshot = {
  clank: string | null
  data?: AubitData
  issues: ReadonlyArray<InputIssue>
  isYamlValid: boolean
  language: 'json' | 'yaml'
  locations: Record<string, SourceLocation | undefined>
  raw: unknown
  text: string
}
export type ParseResult = Omit<ParseSnapshot, 'data' | 'locations'> & {report?: Report}

export function inputFailure(text: string, message: string): ParseSnapshot {
  return {
    text,
    language: 'yaml',
    isYamlValid: false,
    raw: undefined,
    clank: null,
    locations: {},
    issues: [{
      source: 'input',
      message,
      path: [],
    }],
  }
}

const formatPath = (path: ReadonlyArray<number | string>) => path.map(segment => (typeof segment === 'number' ? `[${segment}]` : `.${segment}`)).join('').replace(/^\./, '')

/** Never throws for user input. Raw data is captured BEFORE Zod defaults or domain normalization. */
export function parseSnapshot(text: string): ParseSnapshot {
  const result: ParseSnapshot = {
    text,
    language: 'yaml',
    isYamlValid: false,
    raw: undefined,
    clank: null,
    locations: {},
    issues: [],
  }
  try {
    assertInputSize(text)
    if (!text.trim()) {
      return inputFailure(text, 'Enter an Aubit report with an entries mapping, or choose New or Example.')
    }
    try {
      JSON.parse(text)
      result.language = 'json'
    } catch {
      // JSON is also valid YAML.
    }
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
    // Arrayable values and missing defaults stay exactly as parsed for Clank and formatting.
    const clank = stringifyClank(raw as Parameters<typeof stringifyClank>[0])
    Object.assign(result, {
      raw,
      clank,
      isYamlValid: true,
    })
    if (raw && typeof raw === 'object' && 'entries' in raw && raw.entries && typeof raw.entries === 'object' && Object.keys(raw.entries).length > maxFindings) {
      result.issues = [{
        source: 'input',
        message: 'Reports are limited to 5,000 findings. Split this report into smaller reports.',
        path: ['entries'],
      }]
      return result
    }
    const validation = schema.safeParse(raw)
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
    for (const id of Object.keys(validation.data.entries)) {
      result.locations[id] = sourceMap.locate(['entries', id])
    }
    return result
  } catch (error) {
    return inputFailure(text, Error.isError(error) ? error.message : 'This document could not be processed safely.')
  }
}

export function materializeSnapshot(snapshot: ParseSnapshot): ParseResult {
  const {data, locations, ...result} = snapshot
  return {
    ...result,
    report: data ? Report.fromData(data, id => locations[id]) : undefined,
  }
}

/** Synchronous entry for unit tests and non-UI use. The application uses a dedicated worker. */
export const parseInput = (text: string) => materializeSnapshot(parseSnapshot(text))

export function formatInput(raw: unknown, language: 'json' | 'yaml') {
  assertSafeData(raw)
  const text = language === 'json' ? `${JSON.stringify(raw, null, 2)}\n` : stringify(raw, {lineWidth: 0})
  assertInputSize(text)
  return text
}
