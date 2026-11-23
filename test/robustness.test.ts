import {describe, expect, test} from 'bun:test'

import stringifyClank from 'stringify-clank'
import {parse, stringify} from 'yaml'

import {needsSyntaxOnlyEditor} from '#src/lib/editorSafety.ts'
import {assertSafeData, maxDepth, maxExpandedBytes, maxFindings, maxInputBytes} from '#src/lib/limits.ts'
import {reportToMarkdown} from '#src/lib/markdown/reportToMarkdown.ts'
import {formatInput, parseInput} from '#src/lib/report/parseInput.ts'

const documentFor = (edit?: unknown) => ({collection: {}, entries: {sample: {
  title: 'A valid sample finding',
  category: 'correctness',
  ...edit ? {suggestedChanges: [{
    file: 'src/a.ts',
    edit,
  }]} : {},
}}})
describe('untrusted document boundaries', () => {
  test.each([
    ['duplicate key', 'entries: {}\nentries: {}'],
    ['unknown tag', 'entries: !unknown {}'],
    ['multiple documents', 'entries: {}\n---\nentries: {}'],
    ['cyclic alias', 'entries: &cycle\n  child: *cycle'],
    ['non-finite value', 'value: .inf'],
    ['unsafe integer', 'value: 9007199254740993'],
    ['complex key', '? [a, b]\n: value'],
    ['numeric mapping key', '123: value'],
    ['empty text', '   \n'],
  ])('rejects %s without throwing', (_label, source) => {
    const result = parseInput(source)
    expect(result.report).toBeUndefined()
    expect(result.issues.length).toBeGreaterThan(0)
    expect(result.clank).toBeNull()
  })
  test('counts UTF-8 bytes rather than JavaScript code units', () => {
    const result = parseInput(`# ${'😀'.repeat(Math.ceil(maxInputBytes / 4))}`)
    expect(result.issues[0].message).toContain('input limit')
  })
  test('rejects excessive nesting', () => {
    const result = parseInput(`${'['.repeat(maxDepth + 1)}0${']'.repeat(maxDepth + 1)}`)
    expect(result.report).toBeUndefined()
    expect(result.issues[0].message).toContain('nesting')
  })
  test('bounds YAML alias amplification', () => {
    const source = 'a: &a [x,x,x,x,x,x,x,x,x,x]\nb: &b [*a,*a,*a,*a,*a,*a,*a,*a,*a,*a]\nc: &c [*b,*b,*b,*b,*b,*b,*b,*b,*b,*b]\nd: [*c,*c,*c,*c,*c,*c,*c,*c,*c,*c]'
    const result = parseInput(source)
    expect(result.clank).toBeNull()
    expect(result.issues.length).toBeGreaterThan(0)
  })
  test('bounds expanded string data even with shallow aliases', () => {
    const text = 'x'.repeat(Math.ceil(maxExpandedBytes / 8))
    expect(() => assertSafeData({
      a: text,
      b: text,
      c: text,
      d: text,
      e: text,
    })).toThrow('rendering budget')
  })
  test('limits the number of renderable findings', () => {
    const entries = Object.fromEntries(Array.from({length: maxFindings}, (_, i) => [`item_${i}`, {
      title: 'Another valid finding',
      category: 'misc',
    }]))
    const result = parseInput(JSON.stringify({
      entries: {root: entries.item_0},
      collection: {other: {entries}},
    }))
    expect(result.report).toBeUndefined()
    expect(result.isYamlValid).toBe(true)
    expect(result.issues[0].message).toContain('findings across all reports')
  })
})
describe('raw value fidelity', () => {
  test('Clank omits hidden entries and visibility fields across reports without changing the source', () => {
    const finding = {
      title: 'A visible finding',
      category: 'misc',
    }
    const hidden = {
      ...finding,
      visible: false,
    }
    const raw = {
      entries: {
        same: hidden,
        other: {
          ...finding,
          visible: true,
        },
        visible: finding,
      },
      collection: {
        review: {entries: {
          same: {
            ...finding,
            visible: true,
          },
          other: hidden,
        }},
        archived: {entries: {same: hidden}},
      },
    }
    const result = parseInput(stringify(raw))
    expect(result.issues).toEqual([])
    expect(result.clank).toBe(stringifyClank({
      entries: {
        other: finding,
        visible: finding,
      },
      collection: {
        review: {entries: {same: finding}},
        archived: {entries: {}},
      },
    }))
    expect(result.raw).toEqual(raw)
  })
  test('scalar fields and omitted defaults remain omitted in Clank', () => {
    const raw = documentFor({
      action: 'edit',
      needle: {regex: 'userID'},
      replacement: 'userId',
    })
    const result = parseInput(stringify(raw))
    expect(result.raw).toEqual(raw)
    expect(result.clank).not.toContain('priority')
    expect(result.clank).not.toContain('flags')
    expect(result.clank).toContain('category correctness')
    expect(result.report!.findings[0].priority.level).toBe(3)
  })
  test('valid YAML null is distinct from a parse failure', () => {
    const result = parseInput('null')
    expect(result.isYamlValid).toBe(true)
    expect(result.raw).toBeNull()
    expect(result.clank).toBe('null')
    expect(result.report).toBeUndefined()
  })
  test('schema-invalid input remains inspectable as current raw Clank', () => {
    const result = parseInput('entries:\n  sample:\n    priority: 7\n')
    expect(result.isYamlValid).toBe(true)
    expect(result.clank).toContain('priority 7')
    expect(result.report).toBeUndefined()
  })
  test('formatting does not apply defaults or normalize arrayable fields', () => {
    const raw = documentFor({
      action: 'append',
      content: 'value\n\n',
    })
    expect(JSON.parse(formatInput(raw, 'json'))).toEqual(raw)
    expect(parse(formatInput(raw, 'yaml'))).toEqual(raw)
  })
  test('quoted numeric IDs retain source order rather than JS property order', () => {
    const result = parseInput('collection: {}\nentries:\n  "20":\n    title: First in the source\n    category: misc\n  "3":\n    title: Second in the source\n    category: misc\n')
    expect(result.report!.findings.map(finding => finding.id)).toEqual(['20', '3'])
  })
})
describe('complete edit support and exports', () => {
  test.each([
    {action: 'delete'},
    {action: 'ensure'},
    {action: 'empty'},
    {
      action: 'rename',
      to: 'new.ts',
    },
    {
      action: 'move',
      to: 'src/new.ts',
    },
    {
      action: 'overwrite',
      content: 'replacement\n',
    },
    {
      action: 'append',
      content: 'tail\n',
    },
    {
      action: 'prepend',
      content: 'head\n',
    },
    {
      action: 'edit',
      needle: 'old',
      replacement: 'new',
    },
    {
      action: 'insert_before',
      needle: {line: 2},
      content: 'before',
    },
    {
      action: 'insert_after',
      needle: {
        regex: 'x',
        flags: ['i', 'm'],
      },
      content: 'after',
    },
    {
      action: 'erase',
      needle: 'remove',
    },
  ])('preserves $action in both the domain and machine-readable change data', edit => {
    const result = parseInput(JSON.stringify(documentFor(edit)))
    expect(result.issues).toEqual([])
    expect(result.report!.findings[0].changes[0].edits[0].action).toBe(edit.action)
    expect(reportToMarkdown(result.report!)).toContain(`action: ${edit.action}`)
  })
  test('literal prose cannot inject HTML or Markdown headings', () => {
    const raw = {collection: {}, entries: {hostile: {
      title: '<img src=x onerror=alert(1)>',
      description: '# injected\n<script>alert(1)</script>\n[link](javascript:alert(1))',
      category: 'security',
    }}}
    const md = reportToMarkdown(parseInput(JSON.stringify(raw)).report!)
    expect(md).not.toContain('<script>')
    expect(md).not.toMatch(/(?<!\\)<img/)
    expect(md).toContain(String.raw`\<script\>`)
    expect(md).toContain(String.raw`\# injected`)
  })
  test('embedded backticks, unusual filenames, and terminal newlines survive change data', () => {
    const raw = documentFor({
      action: 'overwrite',
      content: '```\n🧪\n```\n\n',
    })
    raw.entries.sample.suggestedChanges![0].file = 'src/odd`\nname.ts'
    const md = reportToMarkdown(parseInput(JSON.stringify(raw)).report!)
    const block = /^(`{3,})yaml\n([\s\S]*?)^\1$/m.exec(md)
    expect(parse(block![2])).toEqual(raw.entries.sample.suggestedChanges![0])
  })
})
describe('editor and source mapping', () => {
  test('only oversized input uses the syntax-only editor', () => {
    expect(needsSyntaxOnlyEditor('x'.repeat(maxInputBytes))).toBe(false)
    expect(needsSyntaxOnlyEditor('x'.repeat(maxInputBytes + 1))).toBe(true)
  })
  test('acyclic aliases remain valid in authoritative report parsing', () => {
    const result = parseInput('collection: {}\nentries:\n  one: &item\n    title: A shared valid finding\n    category: misc\n  two: *item\n')
    expect(result.issues).toEqual([])
    expect(result.report!.findings).toHaveLength(2)
    expect(result.report!.findings.every(finding => !finding.source?.visibilityEdit)).toBe(true)
  })
})
