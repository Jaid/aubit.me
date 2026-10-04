import {describe, expect, test} from 'bun:test'

import {getEntryBounds, getNextEntryCaret} from '#src/lib/entryCaret.ts'
import {getFileLanguage} from '#src/lib/fileLanguage.ts'
import {formatCount, joinList, pluralize} from '#src/lib/format.ts'
import {reportToMarkdown} from '#src/lib/markdown/reportToMarkdown.ts'
import {codeBlock, diffBlock, inlineCode, tableCell} from '#src/lib/markdown/syntax.ts'
import {encodePermalinkFragment, readPermalinkState} from '#src/lib/permalink.ts'
import {Category, createEdit, createNeedle, InsertEdit, LineNeedle, parseInput, PatternNeedle, Priority, RenameEdit, ReplaceEdit, TextNeedle} from '#src/lib/report/index.ts'

const exampleYaml = await Bun.file(new URL('../src/data/example.yaml', import.meta.url)).text()
const context = {
  file: 'src/a.ts',
  language: 'ts',
}
describe('parseInput', () => {
  test('parses the bundled example', () => {
    const result = parseInput(exampleYaml)
    expect(result.issues).toEqual([])
    expect(result.isYamlValid).toBe(true)
    const report = result.report!
    expect(report.findings.map(finding => finding.id)).toEqual(['exposed_env_file', 'inconsistent_user_naming', 'readme_spelling', 'missing_aria_label', 'redundant_hot_path_sort'])
    expect(report.sorted.map(finding => finding.priority.level)).toEqual([0, 1, 2, 2, 3])
    expect(report.editCount).toBe(8)
    expect(report.files).toHaveLength(7)
  })
  test('keeps raw input untouched by schema defaults', () => {
    const result = parseInput('entries:\n  abc:\n    title: Missing priority here\n    category: misc\n')
    expect(result.raw).toEqual({entries: {abc: {
      title: 'Missing priority here',
      category: 'misc',
    }}})
    expect(result.report!.findings[0].priority.level).toBe(3)
  })
  test('reports YAML syntax errors with locations', () => {
    const result = parseInput('entries:\n  a: [1, 2\n')
    expect(result.isYamlValid).toBe(false)
    expect(result.report).toBeUndefined()
    expect(result.issues[0].source).toBe('yaml')
    expect(result.issues[0].location?.line).toBeGreaterThan(0)
  })
  test('reports schema issues located at the offending node', () => {
    const text = 'entries:\n  ok_id:\n    title: A good enough title\n    category: nonsense\n'
    const result = parseInput(text)
    expect(result.isYamlValid).toBe(true)
    expect(result.report).toBeUndefined()
    const issue = result.issues.find(entry => entry.path.at(-1) === 'category')!
    expect(issue.source).toBe('schema')
    expect(issue.location?.line).toBe(4)
    expect(text.slice(issue.location!.start, issue.location!.end)).toBe('category: nonsense')
  })
  test('locates unrecognized keys', () => {
    const result = parseInput('entries:\n  ok_id:\n    title: A good enough title\n    category: misc\n    extra: 1\n')
    const issue = result.issues[0]
    expect(issue.message).toContain('extra')
    expect(issue.location?.line).toBe(5)
  })
  test('rejects invalid IDs and short titles', () => {
    expect(parseInput('entries:\n  _bad:\n    title: A good enough title\n    category: misc\n').report).toBeUndefined()
    expect(parseInput('entries:\n  good:\n    title: short\n    category: misc\n').report).toBeUndefined()
  })
  test('rejects duplicate keys', () => {
    const result = parseInput('entries:\n  a:\n    title: A good enough title\n    category: misc\n  a:\n    title: A good enough title\n    category: misc\n')
    expect(result.isYamlValid).toBe(false)
  })
  test('handles empty and non-object input', () => {
    expect(parseInput('').report).toBeUndefined()
    expect(parseInput('- 1').issues[0].source).toBe('schema')
    expect(parseInput('entries: {}').report!.isEmpty).toBe(true)
  })
  test('accepts JSON', () => {
    const result = parseInput(JSON.stringify({entries: {json_entry: {
      title: 'Written as plain JSON',
      category: ['hygiene'],
      priority: 4,
    }}}))
    expect(result.report!.findings[0].priority.name).toBe('trivial')
  })
})
describe('Report', () => {
  const report = parseInput(exampleYaml).report!
  test('maps source locations to findings', () => {
    const finding = report.getFinding('readme_spelling')!
    expect(finding.source?.line).toBe(41)
    expect(report.getFindingAtOffset(finding.source!.start + 5)).toBe(finding)
    expect(report.getFindingAtOffset(0)).toBeUndefined()
  })
  test('counts priorities and categories', () => {
    expect(report.priorityCounts.map(entry => entry.count)).toEqual([1, 1, 2, 1, 0])
    const security = report.rootCategoryCounts.find(entry => entry.category.id === 'security')
    expect(security?.count).toBe(1)
  })
  test('groups edits by file', () => {
    const touches = report.fileTouches
    expect([...touches.keys()]).toEqual(report.files)
    expect(touches.get('src/lib/lookup.ts')).toHaveLength(2)
  })
  test('filters findings by text', () => {
    const finding = report.getFinding('exposed_env_file')!
    expect(finding.matches('env production')).toBe(true)
    expect(finding.matches('security.leak')).toBe(true)
    expect(finding.matches('typo')).toBe(false)
    expect(finding.matches('  ')).toBe(true)
  })
  test('drops categories implied by more specific ones', () => {
    const finding = report.getFinding('exposed_env_file')!
    expect(finding.specificCategories.map(category => category.id)).toEqual(['security.leak'])
    expect(finding.hasCategory('security')).toBe(true)
  })
})
const collapsed = (offset: number) => ({
  anchor: offset,
  active: offset,
})
describe('entry caret cycling', () => {
  const report = parseInput(exampleYaml).report!
  const finding = report.getFinding('readme_spelling')!
  const bounds = getEntryBounds(exampleYaml, finding.source!.start, finding.source!.end)!
  test('trims the entry to its first and last contentful lines', () => {
    expect(exampleYaml.slice(bounds.start).startsWith('readme_spelling:')).toBe(true)
    expect(exampleYaml.slice(0, bounds.end).endsWith('replacement: "## Installation"')).toBe(true)
    expect(exampleYaml[bounds.end]).toBe('\n')
  })
  test('ignores trailing whitespace, blank lines and indentation', () => {
    const text = '  \n    key: value  \n    other: 1   \n\n\n  next:'
    const trimmed = getEntryBounds(text, 0, text.length - 7)!
    expect(text.slice(trimmed.start, trimmed.end)).toBe('key: value  \n    other: 1')
    expect(getEntryBounds(' \n\t ', 0, 4)).toBeUndefined()
  })
  test('works for entries that share a line, like compact JSON', () => {
    const text = '{"entries": {"a": {"title": "A good enough title", "category": "misc"}, "b": {"title": "Another valid title", "category": "misc"}}}'
    const source = parseInput(text).report!.getFinding('a')!.source!
    const trimmed = getEntryBounds(text, source.start, source.end)!
    expect(text.slice(trimmed.start, trimmed.end)).toBe('"a": {"title": "A good enough title", "category": "misc"}')
  })
  test('cycles end → start → whole selection → end', () => {
    const first = getNextEntryCaret(bounds, collapsed(0))
    expect(first).toEqual(collapsed(bounds.end))
    const second = getNextEntryCaret(bounds, first)
    expect(second).toEqual(collapsed(bounds.start))
    const third = getNextEntryCaret(bounds, second)
    expect(third).toEqual({
      anchor: bounds.end,
      active: bounds.start,
    })
    expect(getNextEntryCaret(bounds, third)).toEqual(collapsed(bounds.end))
  })
  test('starts over from any other selection', () => {
    expect(getNextEntryCaret(bounds)).toEqual(collapsed(bounds.end))
    expect(getNextEntryCaret(bounds, collapsed(bounds.start + 3))).toEqual(collapsed(bounds.end))
    expect(getNextEntryCaret(bounds, {
      anchor: bounds.start,
      active: bounds.end,
    })).toEqual(collapsed(bounds.end))
    expect(getNextEntryCaret(bounds, {
      anchor: bounds.end - 1,
      active: bounds.start,
    })).toEqual(collapsed(bounds.end))
  })
})
describe('Priority and Category', () => {
  test('derive names from the schema', () => {
    expect(Priority.get(0).label).toBe('P0 – critical')
    expect(Priority.all).toHaveLength(5)
    expect(Category.get('language.dialect').description).toContain('British')
    expect(Category.get('consistency.naming').root.id).toBe('consistency')
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
    expect((pattern as PatternNeedle).isValid).toBe(true)
    expect(new PatternNeedle('(', 'v').isValid).toBe(false)
  })
  test('renders edit Markdown', () => {
    expect(createEdit({action: 'delete'}).toMarkdown(context)).toBe('Delete the file.')
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
    expect(replace.toMarkdown(context)).toBe('Replace:\n\n```diff\n-foo\n+bar\n```')
    expect(createEdit({
      action: 'edit',
      needle: {line: 3},
      replacement: 'x',
    }).toMarkdown(context)).toBe('Replace line 3 with `x`.')
    const insert = createEdit({
      action: 'insert_before',
      needle: {
        regex: '^import',
        flags: 'm',
      },
      content: '// header\n',
    })
    expect(insert).toBeInstanceOf(InsertEdit)
    expect(insert.toMarkdown(context)).toBe('Insert before matches of `/^import/m`:\n\n```ts\n// header\n```')
    expect(createEdit({
      action: 'append',
      content: '',
    }).toMarkdown(context)).toBe('Append nothing.')
    expect(createEdit({
      action: 'erase',
      needle: 'a\nb',
    }).toMarkdown(context)).toBe('Erase:\n\n```diff\n-a\n-b\n```')
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
  test('renders the example report', () => {
    const markdown = reportToMarkdown(parseInput(exampleYaml).report!)
    expect(markdown.startsWith('# Aubit report\n')).toBe(true)
    expect(markdown).toContain('**5 findings** (1 critical, 1 high, 2 moderate and 1 low) with 8 suggested edits across 7 files.')
    expect(markdown).toContain('| 🔴 P0 | `exposed_env_file` | Sensitive environment file is tracked | security › leak | 2 |')
    expect(markdown).toContain('Replace matches of `/userID/im` with `userId`.')
    expect(markdown).toContain('```gitignore\n.env.production\n```')
    expect(markdown.indexOf('exposed_env_file')).toBeLessThan(markdown.indexOf('readme_spelling'))
    expect(markdown.endsWith('\n')).toBe(true)
  })
  test('renders empty reports', () => {
    expect(reportToMarkdown(parseInput('entries: {}').report!)).toBe('# Aubit report\n\nNo findings.\n')
  })
  test('escapes pipes in table titles', () => {
    const markdown = reportToMarkdown(parseInput('entries:\n  pipe:\n    title: a | b | c title\n    category: misc\n').report!)
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
  test('round-trips permalinks', async () => {
    const fragment = await encodePermalinkFragment({
      yaml: exampleYaml,
      tab: 'clank',
    })
    expect(fragment.startsWith('#data:j;gz;base64=')).toBe(true)
    expect(await readPermalinkState(`https://example.com/${fragment}`)).toEqual({
      yaml: exampleYaml,
      tab: 'clank',
    })
    expect(await readPermalinkState('https://example.com/')).toEqual({})
  })
})
