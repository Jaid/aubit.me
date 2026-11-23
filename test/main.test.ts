import type {EntryCaret, EntryEdge} from '#src/lib/entryCaret.ts'

import {describe, expect, test} from 'bun:test'

import {getEntryBounds, getNearestEntryEdge, getNextEntryCaret} from '#src/lib/entryCaret.ts'
import {getFileLanguage} from '#src/lib/fileLanguage.ts'
import {formatCount, joinList, pluralize} from '#src/lib/format.ts'
import {reportToMarkdown} from '#src/lib/markdown/reportToMarkdown.ts'
import {codeBlock, diffBlock, inlineCode, tableCell} from '#src/lib/markdown/syntax.ts'
import {Category, createEdit, createNeedle, InsertEdit, LineNeedle, parseInput, PatternNeedle, Priority, RenameEdit, ReplaceEdit, TextNeedle} from '#src/lib/report/index.ts'

const source = `entries:
  typo:
    title: Correct a spelling error
    category: language.spelling
  secret:
    title: Remove production credentials
    priority: 0
    category: [security, security.leak]
    suggestedChanges:
      - file: .env.production
        edit: {action: delete}
      - file: .gitignore
        edit: {action: append, content: .env.production}
`
const report = parseInput(source).report!
describe('parseInput', () => {
  test('reports YAML syntax errors with locations', () => {
    const result = parseInput('entries:\n  a: [1, 2\n')
    expect(result.isYamlValid).toBe(false)
    expect(result.report).toBeUndefined()
    expect(result.issues[0].source).toBe('yaml')
    expect(result.issues[0].location?.line).toBeGreaterThan(0)
  })
  test('reports schema issues located at the offending node', () => {
    const text = 'entries:\n  ok_id:\n    title: A good enough title\n    category: nonsense\ncollection: {}\n'
    const result = parseInput(text)
    expect(result.isYamlValid).toBe(true)
    expect(result.report).toBeUndefined()
    const issue = result.issues.find(entry => entry.path.at(-1) === 'category')!
    expect(issue.source).toBe('schema')
    expect(issue.location?.line).toBe(4)
    expect(text.slice(issue.location!.start, issue.location!.end)).toBe('category: nonsense')
  })
  test('locates unrecognized keys', () => {
    const result = parseInput('entries:\n  ok_id:\n    title: A good enough title\n    category: misc\n    extra: 1\ncollection: {}\n')
    const issue = result.issues[0]
    expect(issue.message).toContain('extra')
    expect(issue.location?.line).toBe(5)
  })
  test('rejects invalid IDs and short titles', () => {
    expect(parseInput('collection: {}\nentries:\n  _bad:\n    title: A good enough title\n    category: misc\n').report).toBeUndefined()
    expect(parseInput('collection: {}\nentries:\n  good:\n    title: short\n    category: misc\n').report).toBeUndefined()
  })
  test('handles empty and non-object input', () => {
    expect(parseInput('- 1').issues[0].source).toBe('schema')
    expect(parseInput('entries: {}').report!.isEmpty).toBe(true)
    expect(parseInput('entries: {}\ncollection: null').report).toBeUndefined()
    expect(parseInput('collection: {}').report).toBeUndefined()
    expect(parseInput('entries: {}\ncollection: {}').report!.isEmpty).toBe(true)
  })
  test('accepts JSON', () => {
    const result = parseInput(JSON.stringify({collection: {}, entries: {json_entry: {
      title: 'Written as plain JSON',
      category: ['hygiene'],
      priority: 4,
    }}}))
    expect(result.report!.findings[0].priority.name).toBe('trivial')
  })
})
describe('Report', () => {
  test('maps source locations to findings', () => {
    const finding = report.findings[0]
    expect(source.slice(finding.source!.start).startsWith(`${finding.id}:`)).toBe(true)
    expect(report.getFindingAtOffset(finding.source!.start + 5)).toBe(finding)
    expect(report.getFindingAtOffset(0)).toBeUndefined()
  })
  test('counts priorities and categories', () => {
    expect(report.priorityCounts.map(entry => entry.count)).toEqual([1, 0, 0, 1, 0])
    const security = report.rootCategoryCounts.find(entry => entry.category.id === 'security')
    expect(security?.count).toBe(1)
  })
  test('filters findings by text', () => {
    const finding = report.findings[1]
    expect(finding.matches('env production')).toBe(true)
    expect(finding.matches('security.leak')).toBe(true)
    expect(finding.matches('typo')).toBe(false)
    expect(finding.matches('  ')).toBe(true)
  })
  test('drops categories implied by more specific ones', () => {
    const finding = report.findings[1]
    expect(finding.specificCategories.map(category => category.id)).toEqual(['security.leak'])
    expect(finding.hasCategory('security')).toBe(true)
  })
})
const opposite = (edge: EntryEdge): EntryEdge => (edge === 'end' ? 'start' : 'end')
describe('entry caret toggling', () => {
  const bounds = {
    start: 30,
    end: 80,
  }
  test('ignores trailing whitespace, blank lines and indentation', () => {
    const text = '  \n    key: value  \n    other: 1   \n\n\n  next:'
    const trimmed = getEntryBounds(text, 0, text.length - 7)!
    expect(text.slice(trimmed.start, trimmed.end)).toBe('key: value  \n    other: 1')
    expect(getEntryBounds(' \n\t ', 0, 4)).toBeUndefined()
    expect(getEntryBounds(text, text.length + 1, text.length + 2)).toBeUndefined()
  })
  test('works for entries that share a line, like compact JSON', () => {
    const text = '{"collection": {}, "entries": {"a": {"title": "A good enough title", "category": "misc"}, "b": {"title": "Another valid title", "category": "misc"}}}'
    const entry = parseInput(text).report!.findings[0].source!
    const trimmed = getEntryBounds(text, entry.start, entry.end)!
    expect(text.slice(trimmed.start, trimmed.end)).toBe('"a": {"title": "A good enough title", "category": "misc"}')
  })
  test.each(['start', 'end'] as const)('alternates from the nearest edge (%s) while the caret stays put', nearest => {
    let previous: EntryCaret | undefined
    for (const edge of [nearest, opposite(nearest), nearest]) {
      previous = getNextEntryCaret(bounds, {
        current: previous?.offset,
        previous,
        nearest: previous ? opposite(nearest) : nearest,
      })
      expect(previous.edge).toBe(edge)
      expect(previous.offset).toBe(bounds[edge])
    }
  })
  test('starts over from any other caret, a selection or multiple carets', () => {
    const previous = getNextEntryCaret(bounds)
    expect(getNextEntryCaret(bounds, {
      current: bounds.start + 3,
      previous,
    }).offset).toBe(bounds.end)
    // a selection or multiple carets are reported as no single caret
    expect(getNextEntryCaret(bounds, {previous}).offset).toBe(bounds.end)
    expect(getNextEntryCaret(bounds, {
      previous,
      nearest: 'start',
    }).offset).toBe(bounds.start)
  })
  test('starts over when another entry is revealed', () => {
    const other = {
      start: bounds.start - 20,
      end: bounds.start - 2,
    }
    const previous = getNextEntryCaret(other)
    expect(previous.offset).toBe(other.end)
    const next = getNextEntryCaret(bounds, {
      current: previous.offset,
      previous,
      nearest: 'start',
    })
    expect(next.edge).toBe('start')
    expect(next.offset).toBe(bounds.start)
  })
  test('uses the other edge if the nearest one would not move the caret', () => {
    expect(getNextEntryCaret(bounds, {current: bounds.end}).offset).toBe(bounds.start)
    expect(getNextEntryCaret(bounds, {
      current: bounds.start,
      nearest: 'start',
    }).offset).toBe(bounds.end)
  })
  test('picks the nearest entry edge', () => {
    const start = {
      y: 100,
      offset: 50,
    }
    const end = {
      y: 300,
      offset: 400,
    }
    expect(getNearestEntryEdge(start, end, {y: 0})).toBe('start')
    expect(getNearestEntryEdge(start, end, {y: 199})).toBe('start')
    expect(getNearestEntryEdge(start, end, {y: 201})).toBe('end')
    expect(getNearestEntryEdge(start, end, {y: 5000})).toBe('end')
    expect(getNearestEntryEdge(start, end, {
      y: 200,
      offset: 60,
    })).toBe('start')
    expect(getNearestEntryEdge(start, end, {y: 200})).toBe('end')
    // single-line entries are decided by character offsets
    const lineStart = {
      y: 100,
      offset: 10,
    }
    const lineEnd = {
      y: 100,
      offset: 80,
    }
    expect(getNearestEntryEdge(lineStart, lineEnd, {
      y: 100,
      offset: 30,
    })).toBe('start')
    expect(getNearestEntryEdge(lineStart, lineEnd, {
      y: 100,
      offset: 70,
    })).toBe('end')
    expect(getNearestEntryEdge(lineStart, lineEnd, {y: 400})).toBe('end')
  })
})
describe('Priority and Category', () => {
  test('derive names from the schema', () => {
    expect(Priority.get(0).label).toBe('P0 – critical')
    expect(Priority.all).toHaveLength(5)
    expect(Category.get('consistency.naming').label).toBe('consistency › naming')
    expect(Category.get('consistency.naming').isWithin('consistency')).toBe(true)
    expect(Category.get('consistency').isWithin('consistency.naming')).toBe(false)
  })
})
describe('needles and edits', () => {
  test('creates needle classes', () => {
    expect(createNeedle('abc')).toBeInstanceOf(TextNeedle)
    expect(createNeedle({line: 4})).toBeInstanceOf(LineNeedle)
    const pattern = createNeedle({
      regex: 'a+',
      flags: ['i', 'm', 'i'],
    })
    expect(pattern).toBeInstanceOf(PatternNeedle)
    expect(pattern.toString()).toBe('/a+/im')
  })
  test('renders edit Markdown', () => {
    expect(createEdit({action: 'delete'}).toMarkdown('ts')).toBe('Delete the file.')
    const rename = createEdit({
      action: 'rename',
      to: 'b.ts',
    })
    expect(rename).toBeInstanceOf(RenameEdit)
    expect((rename as RenameEdit).resolveTarget('src/a.ts')).toBe('src/b.ts')
    expect((rename as RenameEdit).resolveTarget('a.ts')).toBe('b.ts')
    const replace = createEdit({
      action: 'edit',
      needle: 'foo',
      replacement: 'bar',
    })
    expect(replace).toBeInstanceOf(ReplaceEdit)
    expect(replace.toMarkdown('ts')).toBe('Replace:\n\n```diff\n-foo\n+bar\n```')
    expect(createEdit({
      action: 'edit',
      needle: {line: 3},
      replacement: 'x',
    }).toMarkdown('ts')).toBe('Replace line 3 with `x`.')
    const insert = createEdit({
      action: 'insert_before',
      needle: {
        regex: '^import',
        flags: 'm',
      },
      content: '// header\n',
    })
    expect(insert).toBeInstanceOf(InsertEdit)
    expect(insert.toMarkdown('ts')).toBe('Insert before matches of `/^import/m`:\n\n```ts\n// header\n```')
    expect(createEdit({
      action: 'append',
      content: '',
    }).toMarkdown('ts')).toBe('Append nothing.')
    expect(createEdit({
      action: 'erase',
      needle: 'a\nb',
    }).toMarkdown('ts')).toBe('Erase:\n\n```diff\n-a\n-b\n```')
  })
})
describe('Markdown', () => {
  test('escapes code spans and fences', () => {
    expect(inlineCode('a`b')).toBe('``a`b``')
    expect(inlineCode('`a')).toBe('`` `a ``')
    expect(codeBlock('```\nx\n```', 'md')).toBe('````md\n```\nx\n```\n````')
    expect(diffBlock('a\n', 'b')).toBe('```diff\n-a\n+b\n```')
    expect(tableCell('a|b\nc')).toBe(String.raw`a\|b c`)
  })
  test('summarizes findings and puts the most urgent first', () => {
    const markdown = reportToMarkdown(report)
    expect(markdown).toContain('**2 findings** (1 critical and 1 low) with 2 suggested edits across 2 files.')
    expect(markdown).toContain('`secret` | Remove production credentials | security › leak | 2 |')
    expect(markdown).toContain('```gitignore\n.env.production\n```')
    expect(markdown.indexOf('`secret`')).toBeLessThan(markdown.indexOf('`typo`'))
  })
  test('renders empty reports', () => {
    expect(reportToMarkdown(parseInput('entries: {}\ncollection: {}').report!)).toBe('# Aubit report\n\nNo findings.\n')
  })
  test('escapes pipes in table titles', () => {
    const markdown = reportToMarkdown(parseInput('collection: {}\nentries:\n  pipe:\n    title: a | b | c title\n    category: misc\n').report!)
    expect(markdown).toContain(String.raw`a \| b \| c title`)
  })
})
describe('helpers', () => {
  test('formats counts', () => {
    expect(formatCount(4096)).toBe('4096')
    expect(formatCount(65_536)).toBe('65\u{202F}536')
    expect(pluralize(1, 'file')).toBe('1 file')
    expect(pluralize(2, 'file')).toBe('2 files')
    expect(joinList(['a', 'b', 'c'])).toBe('a, b and c')
    expect(joinList(['a'])).toBe('a')
  })
  test('guesses file languages', () => {
    expect(getFileLanguage('src/a.tsx')).toBe('tsx')
    expect(getFileLanguage('.env.production')).toBe('dotenv')
    expect(getFileLanguage('Dockerfile')).toBe('dockerfile')
    expect(getFileLanguage('README.md')).toBe('markdown')
    expect(getFileLanguage('LICENSE')).toBe('')
  })
})
