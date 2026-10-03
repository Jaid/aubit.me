import {afterEach, describe, expect, mock, test} from 'bun:test'

import {cleanup, fireEvent, render, screen} from '@testing-library/react'
import {createElement} from 'react'

import {parseInput} from '#src/lib/report/parseInput.ts'

import testSassModulesPlugin from './lib/sassModulesPlugin.ts'

Bun.plugin(testSassModulesPlugin)
// Unit tests isolate UI state from Monaco. Production browser tests exercise the REAL editor/workers.
mock.module('monacozen', () => ({default: (props: {
  'aria-label'?: string
  readOnly?: boolean
  value?: string
}) => createElement('textarea', {
  'aria-label': props['aria-label'],
  value: props.value,
  readOnly: true,
})}))
const example = await Bun.file(new URL('../src/data/example.yaml', import.meta.url)).text()
const exampleResult = parseInput(example)
const report = exampleResult.report!
async function component(name: string, props: Record<string, unknown> = {}) {
  const imported = await import(`#src/components/${name}/index.tsx`)
  return render(createElement(imported.default, props))
}
afterEach(() => {
  cleanup(); globalThis.history.replaceState(null, '', '/')
})
describe('isolated component behavior', () => {
  test('filters findings by priority, text, and reset', async () => {
    const {container} = await component('Visualization', {report})
    expect(container.querySelectorAll('article[data-finding]')).toHaveLength(5)
    fireEvent.click(screen.getByTitle('Filter by P2 – moderate'))
    expect(container.querySelectorAll('article[data-finding]')).toHaveLength(2)
    fireEvent.click(screen.getByText('Reset filters'))
    fireEvent.change(screen.getByLabelText('Search findings'), {target: {value: 'typo'}})
    expect(container.querySelectorAll('article[data-finding]')).toHaveLength(1)
    expect(container.querySelector('article')?.getAttribute('data-finding')).toBe('readme_spelling')
  })
  test('category filters include dotted subcategories', async () => {
    const {container} = await component('Visualization', {report})
    fireEvent.click(screen.getByTitle('Filter by security'))
    expect(container.querySelectorAll('article[data-finding]')).toHaveLength(1)
    expect(container.querySelector('article')?.getAttribute('data-finding')).toBe('exposed_env_file')
  })
  test('grouping by file includes every affected path', async () => {
    const {container} = await component('Visualization', {report})
    fireEvent.click(screen.getByRole('radio', {name: 'File'}))
    expect([...container.querySelectorAll('h2 code')].map(node => node.textContent)).toEqual(report.files)
  })
  test('grouping has keyboard navigation and a single tab stop', async () => {
    await component('Visualization', {report})
    const priority = screen.getByRole('radio', {name: 'Priority'})
    priority.focus()
    fireEvent.keyDown(priority, {key: 'ArrowRight'})
    expect(screen.getByRole('radio', {name: 'Category'}).getAttribute('aria-checked')).toBe('true')
    expect(screen.getByRole('radio', {name: 'Category'}).tabIndex).toBe(0)
    expect(priority.tabIndex).toBe(-1)
  })
  test('progressively renders large reports while preserving full totals', async () => {
    const entries = Object.fromEntries(Array.from({length: 205}, (_, i) => [`finding_${i}`, {
      title: `Finding number ${i}`,
      category: 'misc',
    }]))
    const large = parseInput(JSON.stringify({entries})).report!
    const {container} = await component('Visualization', {report: large})
    expect(container.querySelectorAll('article[data-finding]')).toHaveLength(100)
    fireEvent.click(screen.getByText('Load 100 more findings'))
    expect(container.querySelectorAll('article[data-finding]')).toHaveLength(200)
    fireEvent.click(screen.getByText('Load 100 more findings'))
    expect(container.querySelectorAll('article[data-finding]')).toHaveLength(205)
    expect(large.findings).toHaveLength(205)
  })
  test('empty reports have an intentional empty state', async () => {
    const {container} = await component('Visualization', {report: parseInput('entries: {}').report})
    expect(container.textContent).toContain('No findings')
  })
  test('finding source navigation uses the original YAML line', async () => {
    const revealed: Array<string> = []
    await component('FindingCard', {
      finding: report.getFinding('readme_spelling'),
      onReveal: (finding: {id: string}) => revealed.push(finding.id),
    })
    fireEvent.click(screen.getByTitle('Reveal in editor (line 41)'))
    expect(revealed).toEqual(['readme_spelling'])
    expect(screen.getByText('## Installation')).toBeDefined()
  })
  test('long issue lists expand without discarding diagnostics', async () => {
    const result = parseInput('entries:\n  a:\n    title: x\n    category: nope\n    foo: 1\n  b:\n    title: y\n    category: nope\n')
    const {container} = await component('IssueList', {
      issues: result.issues,
      onReveal: () => {},
    })
    expect(container.querySelectorAll('li')).toHaveLength(3)
    fireEvent.click(screen.getByText(/^Show \d+ more$/))
    expect(container.querySelectorAll('li')).toHaveLength(result.issues.length)
  })
  test('current valid report enables complete Markdown exports', async () => {
    await component('OutputPane', {
      result: exampleResult,
      current: exampleResult,
      pending: false,
      isStale: false,
      text: example,
      tab: 'visualization',
      onTabChange: () => {},
      onReveal: () => {},
      notify: () => {},
    })
    expect((screen.getByRole('button', {name: 'Download Markdown'}) as HTMLButtonElement).disabled).toBe(false)
  })
  test('stale reports remain visible but cannot be exported as current', async () => {
    const invalid = parseInput('entries: [')
    const {container} = await component('OutputPane', {
      result: exampleResult,
      current: invalid,
      pending: false,
      isStale: true,
      text: 'entries: [',
      tab: 'visualization',
      onTabChange: () => {},
      onReveal: () => {},
      notify: () => {},
    })
    expect(container.textContent).toContain('Showing the last valid report')
    expect((screen.getByRole('button', {name: 'Download Markdown'}) as HTMLButtonElement).disabled).toBe(true)
    expect(container.querySelectorAll('article[data-finding]')).toHaveLength(5)
  })
  test('Clank never displays a previous valid document for invalid current syntax', async () => {
    const invalid = parseInput('entries: [')
    const {container} = await component('OutputPane', {
      result: exampleResult,
      current: invalid,
      pending: false,
      isStale: true,
      text: 'entries: [',
      tab: 'clank',
      onTabChange: () => {},
      onReveal: () => {},
      notify: () => {},
    })
    expect(container.textContent).toContain('no stale data is shown here')
    expect((screen.getByRole('button', {name: 'Copy Clank'}) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.queryByLabelText('Clank output')).toBeNull()
  })
  test('schema-invalid but safely parsed Clank remains exportable', async () => {
    const invalid = parseInput('entries:\n  sample:\n    priority: 7')
    await component('OutputPane', {
      result: exampleResult,
      current: invalid,
      pending: false,
      isStale: true,
      text: invalid.text,
      tab: 'clank',
      onTabChange: () => {},
      onReveal: () => {},
      notify: () => {},
    })
    expect((screen.getByRole('button', {name: 'Copy Clank'}) as HTMLButtonElement).disabled).toBe(false)
    expect((screen.getByLabelText('Clank output') as HTMLTextAreaElement).value).toContain('priority 7')
  })
  test('editor toolbar labels destructive and recovery actions explicitly', async () => {
    let language = ''
    await component('EditorHeader', {
      issueCount: 0,
      pending: false,
      ready: true,
      language: 'yaml',
      canFormat: true,
      canUndo: true,
      onOpenFile: () => {},
      onExample: () => {},
      onNew: () => {},
      onUndo: () => {},
      onDownload: () => {},
      onHelp: () => {},
      onFormat: (value: string) => {
        language = value
      },
    })
    fireEvent.change(screen.getByLabelText('Format input'), {target: {value: 'json'}})
    expect(language).toBe('json')
    expect(screen.getByRole('button', {name: 'Undo replacement'})).toBeDefined()
    expect(screen.getByRole('button', {name: 'Download input'})).toBeDefined()
  })
})
