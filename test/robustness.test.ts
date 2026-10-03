import {describe, expect, test} from 'bun:test'

import {parse, stringify} from 'yaml'

import {needsSyntaxOnlyEditor} from '#src/lib/editorSafety.ts'
import {assertSafeData, maxInputBytes} from '#src/lib/limits.ts'
import {reportToMarkdown} from '#src/lib/markdown/reportToMarkdown.ts'
import {inlineCode} from '#src/lib/markdown/syntax.ts'
import {formatInput, materializeSnapshot, parseInput, parseSnapshot} from '#src/lib/report/parseInput.ts'

const documentFor = (edit?: unknown) => ({entries: {sample: {
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
    expect(() => parseInput(source)).not.toThrow()
    const result = parseInput(source)
    expect(result.report).toBeUndefined()
    expect(result.issues.length).toBeGreaterThan(0)
    expect(result.clank).toBeNull()
  })
  test('counts UTF-8 bytes rather than JavaScript code units', () => {
    const result = parseInput(`# ${'😀'.repeat(500_001)}`)
    expect(result.issues[0].message).toContain('2 MB')
  })
  test('rejects an oversized ASCII document', () => {
    expect(parseInput('x'.repeat(maxInputBytes + 1)).issues[0].message).toContain('2 MB')
  })
  test('rejects excessive nesting', () => {
    const result = parseInput(`${'['.repeat(70)}0${']'.repeat(70)}`)
    expect(result.report).toBeUndefined()
    expect(result.issues[0].message).toContain('64-level')
  })
  test('bounds YAML alias amplification', () => {
    const source = 'a: &a [x,x,x,x,x,x,x,x,x,x]\nb: &b [*a,*a,*a,*a,*a,*a,*a,*a,*a,*a]\nc: &c [*b,*b,*b,*b,*b,*b,*b,*b,*b,*b]\nd: [*c,*c,*c,*c,*c,*c,*c,*c,*c,*c]'
    const result = parseInput(source)
    expect(result.clank).toBeNull()
    expect(result.issues.length).toBeGreaterThan(0)
  })
  test('bounds expanded string data even with shallow aliases', () => {
    const text = 'x'.repeat(1_000_000)
    expect(() => assertSafeData({
      a: text,
      b: text,
      c: text,
      d: text,
      e: text,
    })).toThrow('rendering budget')
  })
  test('limits the number of renderable findings', () => {
    const entries = Object.fromEntries(Array.from({length: 5001}, (_, i) => [`item_${i}`, {
      title: 'Another valid finding',
      category: 'misc',
    }]))
    const result = parseInput(JSON.stringify({entries}))
    expect(result.report).toBeUndefined()
    expect(result.isYamlValid).toBe(true)
    expect(result.issues[0].message).toContain('5,000')
  })
})
describe('raw value fidelity', () => {
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
    const result = parseInput('entries:\n  "20":\n    title: First in the source\n    category: misc\n  "3":\n    title: Second in the source\n    category: misc\n')
    expect(result.report!.findings.map(finding => finding.id)).toEqual(['20', '3'])
  })
  test('worker snapshots rebuild real domain instances', () => {
    const snapshot = structuredClone(parseSnapshot(JSON.stringify(documentFor())))
    const result = materializeSnapshot(snapshot)
    expect(result.report!.findings[0].priority.label).toBe('P3 – low')
    expect(result.report!.getFinding('sample')!.hasCategory('correctness')).toBe(true)
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
    const raw = {entries: {hostile: {
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
      content: '```\nvalue\n```\n\n',
    })
    raw.entries.sample.suggestedChanges![0].file = 'src/odd`\nname.ts'
    const md = reportToMarkdown(parseInput(JSON.stringify(raw)).report!)
    expect(md).toContain('Change data (YAML; preserves exact paths and content):')
    expect(md).toContain('````')
    expect(inlineCode('one\ntwo')).toBe('`one two`')
  })
  test('deterministic corpus round-trips Unicode and punctuation', () => {
    const fragments = ['alpha', '"quoted"', '`ticks`', '<img src=x>', '🧪', String.raw`\path`, '\n\n', 'a\tb', '# heading', '&entity;']
    for (let i = 0; i < 150; i++) {
      const content = `${fragments[i % fragments.length] + fragments[Math.floor(i / fragments.length) % fragments.length]}\n`
      const raw = documentFor({
        action: 'append',
        content,
      })
      const result = parseInput(JSON.stringify(raw))
      expect(result.raw).toEqual(raw)
      expect(result.issues).toEqual([])
      expect(parse(formatInput(result.raw, 'yaml'))).toEqual(raw)
    }
  })
})
describe('upstream editor guard', () => {
  test('released Monacozen carries the recursive-alias guard without a local patch', async () => {
    const packageJson = await Bun.file('node_modules/monacozen/package.json').json() as {version: string}
    expect(packageJson.version).toBe('0.5.1')
    expect(await Bun.file('patches/monacozen@0.4.0.patch').exists()).toBe(false)
    const workerGlob = new Bun.Glob('node_modules/monacozen/assets/yaml.worker-*.js')
    let guardedWorker = false
    for await (const workerFile of workerGlob.scan('.')) {
      if ((await Bun.file(workerFile).text()).includes('recursive-alias')) {
        guardedWorker = true
        break
      }
    }
    expect(guardedWorker).toBe(true)
  })
  test('acyclic aliases keep schema-aware editor mode', () => {
    expect(needsSyntaxOnlyEditor('base: &item\n  value: 1\ncopy: *item\n')).toBe(false)
  })
  test('recursive aliases remain in schema-aware editor mode with Monacozen 0.5.1', () => {
    expect(needsSyntaxOnlyEditor('entries: &loop\n  child: *loop\n')).toBe(false)
  })
  test('oversized input still uses the resource-bounded syntax-only editor', () => {
    expect(needsSyntaxOnlyEditor('x'.repeat(maxInputBytes + 1))).toBe(true)
  })
  test('acyclic aliases remain valid in authoritative report parsing', () => {
    const result = parseInput('entries:\n  one: &item\n    title: A shared valid finding\n    category: misc\n  two: *item\n')
    expect(result.issues).toEqual([])
    expect(result.report!.findings).toHaveLength(2)
  })
})
