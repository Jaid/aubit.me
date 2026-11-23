import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import {existsSync} from 'node:fs'
import {resolve, join} from 'node:path'
import puppeteer from 'puppeteer-core'
import {preview} from 'vite'
import {reportToMarkdown} from '#src/lib/markdown/reportToMarkdown.ts'
import {maxInputBytes} from '#src/lib/limits.ts'
import {parseInput} from '#src/lib/report/parseInput.ts'

const output = resolve('out/test/browser')
await fs.mkdir(output, {recursive: true})
const example = await fs.readFile('src/data/example.yaml', 'utf8')
const expected = parseInput(example)
assert.deepEqual(expected.issues, [], 'Bundled example must be a valid Aubit document')
const expectedMarkdown = reportToMarkdown(expected.report)
const exampleCount = expected.report.findings.length
const checks = []
let serial = 0
let failed = false
const started = performance.now()

function findBrowser() {
  const paths = [process.env.BROWSER_PATH, process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser']
  for (const path of paths) if (path && existsSync(path)) return path
  const binary = ['google-chrome', 'chromium', 'chrome'].map(command => Bun.which(command)).find(Boolean)
  if (binary) return binary
  throw new Error('Chrome was not found. Set BROWSER_PATH to a current Chromium executable before running browser checks.')
}
const browser = await puppeteer.launch({executablePath: findBrowser(), headless: true, protocolTimeout: 30_000, args: ['--no-sandbox', '--disable-setuid-sandbox']})
let server
try {
  server = await preview({configFile: false, build: {outDir: 'dist'}, preview: {host: '127.0.0.1', port: 0}})
  const origin = new URL(server.resolvedUrls.local[0]).origin
  const version = await browser.version()
  console.log('Production browser checks:', version, origin)

  async function check(name, run, options = {}) {
    if (process.env.TEST_FILTER && !name.includes(process.env.TEST_FILTER)) return
    const index = ++serial
    const context = await browser.createBrowserContext()
    const page = await context.newPage()
    const errors = []
    const consoleErrors = []
    const externalRequests = []
    const t0 = performance.now()
    page.on('pageerror', error => errors.push(String(error)))
    page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()) })
    page.on('request', request => { if (/^https?:/.test(request.url()) && !request.url().startsWith(origin + '/')) externalRequests.push(request.url()) })
    page.on('dialog', dialog => void dialog.accept())
    page.setDefaultTimeout(15_000)
    await page.setViewport({width: 1440, height: 1000})
    await page.emulateMediaFeatures([{name: 'prefers-color-scheme', value: 'dark'}])
    try {
      if (options.before) await options.before(page, context)
      await page.goto(origin + '/' + (options.suffix ?? ''), {waitUntil: 'networkidle0'})
      await page.waitForSelector('[data-input-status]:not([data-state=opening]):not([data-state=checking])')
      await page.waitForSelector('#input .monaco-editor [role=textbox]')
      await run({page, context, origin})
      assert.deepEqual(errors, [], 'Uncaught browser errors')
      assert.deepEqual(consoleErrors, [], 'Browser console errors')
      assert.deepEqual(externalRequests, [], 'Unexpected outbound requests')
      checks.push({name, status: 'pass', milliseconds: Math.round(performance.now() - t0)})
      console.log('PASS', name)
    } catch (error) {
      failed = true
      checks.push({name, status: 'fail', milliseconds: Math.round(performance.now() - t0), error: String(error), pageErrors: errors, consoleErrors, externalRequests})
      await page.screenshot({path: join(output, 'failure-' + index + '.png')}).catch(() => {})
      await fs.writeFile(join(output, 'failure-' + index + '.html'), await page.content()).catch(() => {})
      console.error('FAIL', name, String(error).slice(0, 1800))
    } finally { await context.close(); await fs.writeFile(join(output, 'progress.json'), JSON.stringify({checks}, null, 2)) }
  }

  async function click(page, selector, expectedText) {
    await page.bringToFront()
    const element = await page.waitForSelector(selector, {visible: true})
    if (expectedText) assert.equal(await element.evaluate(node => node.textContent.trim()), expectedText)
    await element.click()
  }
  async function tab(page, name) {
    await click(page, '#output-tab-' + name)
    await page.waitForFunction(id => document.getElementById(id)?.getAttribute('aria-selected') === 'true', {}, 'output-tab-' + name)
  }
  async function clickButton(page, pattern) {
    const button = await page.waitForFunction(source => [...document.querySelectorAll('button')].find(node => new RegExp(source).test(node.textContent)), {}, pattern.source)
    await button.asElement().click()
  }
  function grantClipboard(context) {
    return context.setPermission(origin,
      {permission: {name: 'clipboard-read'}, state: 'granted'},
      {permission: {name: 'clipboard-write', allowWithoutSanitization: false}, state: 'granted'})
  }
  async function paste({page, context}, text, status = 'valid') {
    const editor = await page.waitForSelector('#input .monaco-editor [role=textbox]')
    assert.equal(await editor.evaluate(node => node.getAttribute('aria-roledescription')), 'editor')
    await grantClipboard(context)
    await page.evaluate(value => navigator.clipboard.writeText(value), text)
    await editor.focus()
    const modifier = process.platform === 'darwin' ? 'Meta' : 'Control'
    await page.keyboard.down(modifier); await page.keyboard.press('KeyA'); await page.keyboard.press('KeyV'); await page.keyboard.up(modifier)
    await page.waitForFunction(value => localStorage.getItem('aubit.me:input') === value, {}, text)
    await page.waitForSelector('[data-input-status][data-state=' + status + ']')
  }
  async function downloaded({page, context}, label) {
    const directory = join(output, 'downloads')
    await fs.mkdir(directory, {recursive: true})
    const cdp = await browser.target().createCDPSession()
    try {
      await cdp.send('Browser.setDownloadBehavior', {behavior: 'allowAndName', downloadPath: directory, browserContextId: context.id, eventsEnabled: true})
      const begun = new Promise(resolve => cdp.once('Browser.downloadWillBegin', resolve))
      const finished = new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Download did not complete')), 15_000)
        cdp.on('Browser.downloadProgress', event => {
          if (event.state === 'completed') { clearTimeout(timer); resolve(event.guid) }
          if (event.state === 'canceled') { clearTimeout(timer); reject(new Error('Download canceled')) }
        })
      })
      await click(page, 'button[aria-label="' + label + '"]')
      const [begin, guid] = await Promise.all([begun, finished])
      assert.equal(guid, begin.guid)
      const bytes = await fs.readFile(join(directory, guid), 'utf8')
      await fs.writeFile(join(directory, begin.suggestedFilename), bytes)
      return {name: begin.suggestedFilename, text: bytes}
    } finally { await cdp.detach() }
  }
  async function copied({page, context}, label) {
    await grantClipboard(context)
    await click(page, 'button[aria-label="' + label + '"]')
    await page.waitForFunction(() => !document.querySelector('button[data-state=busy]'))
    // The Windows clipboard normalizes line endings. Downloads are still checked byte-for-byte.
    return (await page.evaluate(() => navigator.clipboard.readText())).replaceAll('\r\n', '\n')
  }
  async function importText(page, text, name = 'imported.yaml') {
    await page.evaluate(({text, name}) => {
      const input = document.querySelector('[data-report-file]')
      const transfer = new DataTransfer()
      transfer.items.add(new File([text], name, {type: 'text/plain'}))
      input.files = transfer.files
      input.dispatchEvent(new Event('change', {bubbles: true}))
    }, {text, name})
    await page.waitForFunction(value => localStorage.getItem('aubit.me:input') === value, {}, text)
  }
  const simple = JSON.stringify({entries: {simple: {title: 'A newly imported finding', category: 'hygiene'}}})

  await check('real Monaco, correct summary numbers, and six output views', async ({page}) => {
    assert.equal(await page.title(), 'Aubit Viewer')
    assert.equal((await page.$$('#output article[data-finding]')).length, exampleCount)
    assert.deepEqual(await page.$$eval('[role=tab]', tabs => tabs.map(tab => tab.textContent)), ['Render', 'Edit', 'Markdown', 'Preview', 'Clank', 'Prompt'])
    const text = await page.$eval('#output', node => node.textContent)
    for (const value of [`${expected.report.editCount} edits`, `${expected.report.files.length} files`]) assert.ok(text.includes(value), value)
    assert.equal((await page.$$('#input .monaco-editor')).length, 1)
    for (const mode of ['edit', 'markdown', 'preview', 'clank', 'prompt', 'render']) await tab(page, mode)
    await fs.writeFile(join(output, 'render.html'), await page.content())
  })

  await check('Edit switches control rendered findings and exports across groupings', async state => {
    const {page} = state
    const control = '[role=switch][aria-label="Include readme_spelling in report"]'
    await tab(page, 'edit')
    await (await page.waitForSelector(control)).focus()
    await page.keyboard.press('Space')
    await page.waitForSelector(control + '[aria-checked=false]')
    assert.equal(await page.$eval(control, node => node.getAttribute('aria-checked')), 'false')
    assert.equal(await page.$eval(control, node => node === document.activeElement), true)
    await tab(page, 'render')
    assert.equal(await page.$('article[data-finding=readme_spelling]'), null)
    assert.equal((await page.$$('article[data-finding]')).length, exampleCount - 1)
    assert.ok(!(await copied(state, 'Copy Markdown')).includes('`readme_spelling`'))
    await tab(page, 'preview')
    assert.equal((await page.$$('[data-markdown-preview] h2')).length, exampleCount - 1)
    await tab(page, 'clank')
    const clank = await copied(state, 'Copy Clank')
    assert.ok(!clank.includes('readme_spelling'))
    assert.ok(clank.includes('exposed_env_file'))
    assert.equal((await downloaded(state, 'Download Clank')).text, clank)
    await tab(page, 'prompt')
    const prompt = await copied(state, 'Copy Prompt')
    assert.ok(prompt.endsWith('\n\n' + clank) && prompt.slice(0, -clank.length).trim().length > 0)
    assert.deepEqual(await downloaded(state, 'Download Prompt'), {name: 'aubit-prompt.txt', text: prompt})
    await tab(page, 'edit')
    await click(page, 'button[role=radio]:last-child', 'File')
    assert.equal(await page.$eval(control, node => node.getAttribute('aria-checked')), 'false')
    await click(page, control)
    await page.waitForSelector(control + '[aria-checked=true]')
    assert.equal(await copied(state, 'Copy Markdown'), expectedMarkdown)
    assert.equal((await downloaded(state, 'Download input')).text, example.replace('readme_spelling:\n', 'readme_spelling:\n    visible: true\n'))
    await tab(page, 'clank')
    assert.equal(await copied(state, 'Copy Clank'), expected.clank)
  })

  await check('toggling a finding keeps the editor caret and both panes in place', async ({page}) => {
    await tab(page, 'edit')
    const editor = await page.waitForSelector('#input .monaco-editor [role=textbox]')
    await editor.focus()
    const shortcut = async key => {
      const modifier = process.platform === 'darwin' ? 'Meta' : 'Control'
      await page.keyboard.down(modifier); await page.keyboard.press(key); await page.keyboard.up(modifier)
    }
    await shortcut('Home')
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('End')
    await page.waitForSelector('article[data-finding=item_0][data-active]')
    const control = '[role=switch][aria-label="Include item_20 in report"]'
    await page.$eval(control, node => node.scrollIntoView({block: 'center', behavior: 'instant'}))
    const position = () => page.evaluate(() => ({
      output: document.querySelector('#output-panel > div').scrollTop,
      firstSourceLine: document.querySelector('#input .view-line').textContent,
    }))
    const before = await position()
    assert.ok(before.output > 0)
    await click(page, control)
    await page.waitForSelector(control + '[aria-checked=false]')
    await page.waitForFunction(() => localStorage.getItem('aubit.me:input').includes('visible: false'))
    assert.deepEqual(await position(), before)
    assert.equal(await page.$eval(control, node => document.activeElement === node), true)
    assert.equal(await page.$eval('article[data-active]', node => node.dataset.finding), 'item_0')
    await editor.focus()
    await shortcut('KeyZ')
    await page.waitForSelector(control + '[aria-checked=true]')
  }, {before: page => page.evaluateOnNewDocument(text => localStorage.setItem('aubit.me:input', text),
    'entries:\n' + Array.from({length: 50}, (_, index) => `  item_${index}:\n    title: Finding number ${index}\n    category: misc`).join('\n'))})

  await check('collection selection scopes edits and exports to the selected report', async state => {
    const {page} = state
    const root = {entries: {same: {title: 'Document finding', category: 'hygiene'}}}
    const nested = {entries: {same: {title: 'Collected finding', category: 'correctness', visible: false, comment: 'Follow up'}}}
    const doc = {...root, collection: {audit: nested}}
    await paste(state, JSON.stringify(doc))
    await page.select('#output select', 'audit')
    assert.ok((await copied(state, 'Copy Markdown')).includes('No findings.'))
    await tab(page, 'edit')
    const control = '[role=switch][aria-label="Include same in report"]'
    await click(page, control)
    await page.waitForSelector(control + '[aria-checked=true]')
    const md = await copied(state, 'Copy Markdown')
    assert.ok(md.includes('Collected finding') && !md.includes('Document finding'))
    const source = (await downloaded(state, 'Download input')).text
    assert.equal(source, JSON.stringify(doc).replace('"visible":false', '"visible":true'))
    await page.waitForFunction(value => localStorage.getItem('aubit.me:input') === value, {}, source)
    await page.reload({waitUntil: 'networkidle0'})
    await page.select('#output select', 'audit')
    await page.waitForSelector(control + '[aria-checked=true]')
  })

  await check('filtering and grouping remain local to Render and Edit and survive tab changes', async ({page, context}) => {
    await page.type('input[aria-label="Search findings"]', 'credentials')
    await page.waitForFunction(() => document.querySelectorAll('#output article[data-finding]').length === 1)
    await tab(page, 'preview')
    assert.equal((await page.$$('#output [data-markdown-preview] h2')).length, exampleCount)
    await tab(page, 'render')
    assert.equal(await page.$eval('input[aria-label="Search findings"]', node => node.value), 'credentials')
    assert.equal((await page.$$('#output article[data-finding]')).length, 1)
    assert.equal(await copied({page, context}, 'Copy Markdown'), expectedMarkdown)
    await click(page, 'button[title="Filter by P2 – moderate"]')
    assert.equal((await page.$$('#output article[data-finding]')).length, 0)
    await clickButton(page, /^Reset filters$/)
    await click(page, 'button[title="Filter by security"]')
    assert.ok(await page.$('article[data-finding=exposed_env_file]'))
    await clickButton(page, /^Reset filters$/)
    await click(page, 'button[role=radio][aria-checked=true]')
    await page.keyboard.press('End')
    assert.equal(await page.$eval('button[role=radio][aria-checked=true]', node => node.textContent), 'File')
    assert.deepEqual(await page.$$eval('[role=radio][tabindex="0"]', nodes => nodes.map(node => node.textContent)), ['File'])
    assert.deepEqual(await page.$$eval('#output h2 code', nodes => nodes.map(node => node.textContent)), expected.report.files)
  })

  const firstEntry = '  first:\n    category: misc\n    title: First navigable finding'
  const secondEntry = '  second:\n    category: misc\n    title: Second navigable finding'
  // Keep the initial viewport between the entries. A second occurrence of “entries” below both lets Ctrl+D place carets on opposite sides.
  const navigationSource = 'entries:\n' + firstEntry + '\n'.repeat(70) + secondEntry + '\n# entries\n'
  await check('source-linked finding navigation toggles the real editor caret between the entry edges, starting with the nearest one', async ({page}) => {
    // Typing a marker reveals the exact caret in the saved draft; undo restores text and caret for the next step.
    const modifier = process.platform === 'darwin' ? 'Meta' : 'Control'
    const marker = '§'
    const bounds = entry => ({start: navigationSource.indexOf(entry.trimStart()), end: navigationSource.indexOf(entry) + entry.length})
    const first = bounds(firstEntry)
    const second = bounds(secondEntry)
    const caretAt = offset => navigationSource.slice(0, offset) + marker + navigationSource.slice(offset)
    const startFirst = bounds => [caretAt(bounds.start), caretAt(bounds.end), caretAt(bounds.start)]
    const endFirst = bounds => [caretAt(bounds.end), caretAt(bounds.start), caretAt(bounds.end)]
    const firstButton = '[data-finding=first] button[title^="Reveal in editor"]'
    const secondButton = '[data-finding=second] button[title^="Reveal in editor"]'
    const shortcut = async key => {
      await page.keyboard.down(modifier); await page.keyboard.press(key); await page.keyboard.up(modifier)
    }
    const cycle = async (button, steps) => {
      for (const expectation of steps) {
        await click(page, button)
        await page.waitForFunction(() => document.activeElement?.getAttribute('aria-roledescription') === 'editor')
        await page.waitForSelector('#input .monaco-editor .view-overlays [class*=flash]')
        assert.equal((await page.$$('#input .selected-text')).length, 0, 'revealing never selects text')
        await page.keyboard.sendCharacter(marker)
        await page.waitForFunction(value => localStorage.getItem('aubit.me:input') === value, {}, expectation)
        await shortcut('KeyZ')
        await page.waitForFunction(value => localStorage.getItem('aubit.me:input') === value && document.querySelector('[data-input-status]')?.getAttribute('data-state') === 'valid', {}, navigationSource)
      }
    }
    await cycle(secondButton, startFirst(second))
    await page.waitForSelector('article[data-finding=second][data-active]')
    await page.reload({waitUntil: 'networkidle0'})
    await page.waitForSelector('[data-input-status][data-state=valid]')
    await page.waitForSelector('#input .monaco-editor [role=textbox]')
    await cycle(firstButton, endFirst(first))
    await shortcut('End')
    await cycle(secondButton, endFirst(second))
    await shortcut('Home')
    await cycle(secondButton, startFirst(second))
    await shortcut('Home')
    await shortcut('KeyD')
    await shortcut('KeyD')
    await page.waitForFunction(() => document.querySelectorAll('#input .cursors-layer > .cursor').length === 2)
    await cycle(firstButton, endFirst(first))
    assert.equal(await page.$$eval('#input .cursors-layer > .cursor', nodes => nodes.length), 1)
    await page.waitForFunction(() => !document.querySelector('#input .monaco-editor .view-overlays [class*=flash]'))
  }, {before: page => page.evaluateOnNewDocument(text => localStorage.setItem('aubit.me:input', text), navigationSource)})

  await check('literal replacements highlight only changed graphemes in cards, preview and HTML', async state => {
    const edit = {action: 'edit', needle: 'listed them on 2026-11-01\nold 👩‍💻 <em>', replacement: 'listed them on 2026-11-22\nold 👨‍💻 <em>'}
    await paste(state, JSON.stringify({entries: {dates: {title: 'Update listing date', category: 'misc', suggestedChanges: [{file: 'notes.txt', edit}]}}}))
    const changes = element => [...element.querySelectorAll('del,ins')].map(node => [node.localName, node.textContent])
    const expected = [['del', '01'], ['del', '👩‍💻'], ['ins', '22'], ['ins', '👨‍💻']]
    for (const mode of ['render', 'edit', 'preview']) {
      await tab(state.page, mode)
      const selector = mode === 'preview' ? 'pre[data-language=diff]' : 'article[data-finding=dates] pre'
      assert.deepEqual(await state.page.$eval(selector, changes), expected)
      assert.equal(await state.page.$(selector + ' em'), null)
    }
    const html = await downloaded(state, 'Download HTML')
    assert.ok(html.text.includes('listed them on 2026-11-<del>01</del>'))
    assert.ok(html.text.includes('listed them on 2026-11-<ins>22</ins>'))
  })

  await check('a removed setup line stays separate from a rewritten condition', async state => {
    const setup = "  const url = new URL(input, 'http://localhost/')"
    const oldCondition = "  if (url.searchParams.has('audio')) {"
    const newCondition = "  if (!Object.hasOwn(readPermalink(input), 'audio')) {"
    const edit = {action: 'edit', needle: setup + '\n' + oldCondition, replacement: newCondition}
    await paste(state, JSON.stringify({entries: {audio: {title: 'Update audio condition', category: 'misc', suggestedChanges: [{file: 'audio.ts', edit}]}}}))
    const rows = await state.page.$$eval('[data-finding=audio] pre [data-kind]', nodes => nodes.map(node => ({
      text: node.lastElementChild.textContent,
      highlights: [...node.querySelectorAll('ins,del')].map(mark => mark.textContent),
      decoration: getComputedStyle(node.querySelector('ins,del') ?? node.lastElementChild).textDecorationLine,
    })))
    assert.deepEqual(rows, [
      {text: setup, highlights: [], decoration: 'none'},
      {text: oldCondition, highlights: ['url.searchParams.has('], decoration: 'none'},
      {text: newCondition, highlights: ['!Object.hasOwn(readPermalink(input), '], decoration: 'none'},
    ])
  })

  await check('exact source, Markdown, Clank, and complete HTML downloads', async state => {
    const input = await downloaded(state, 'Download input')
    assert.equal(input.text, example)
    assert.equal(input.name, 'aubit-input.yaml')
    const md = await downloaded(state, 'Download Markdown')
    assert.equal(md.text, expectedMarkdown)
    await tab(state.page, 'clank')
    assert.equal(await copied(state, 'Copy Clank'), expected.clank)
    const clank = await downloaded(state, 'Download Clank')
    assert.equal(clank.text, expected.clank)
    await tab(state.page, 'preview')
    const html = await downloaded(state, 'Download HTML')
    assert.ok(html.text.startsWith('<!doctype html>'))
    assert.ok(html.text.includes('Content-Security-Policy'))
    const structure = await state.page.evaluate(source => {
      const doc = new DOMParser().parseFromString(source, 'text/html')
      return {headings: doc.querySelectorAll('h2').length, scripts: doc.querySelectorAll('script,img,iframe,[onerror]').length, title: doc.title, rows: doc.querySelectorAll('table tbody tr').length}
    }, html.text)
    assert.deepEqual(structure, {headings: exampleCount, scripts: 0, title: 'Aubit report', rows: exampleCount})
  })

  await check('editing preserves raw scalar/default fidelity and persists through reload', async state => {
    await paste(state, simple)
    assert.equal((await state.page.$$('article[data-finding]')).length, 1)
    await tab(state.page, 'clank')
    const clank = await copied(state, 'Copy Clank')
    assert.ok(clank.includes('category hygiene'))
    assert.ok(!clank.includes('priority'))
    await state.page.reload({waitUntil: 'networkidle0'})
    await state.page.waitForSelector('[data-input-status][data-state=valid]')
    assert.equal(await state.page.$eval('#output-tab-clank', node => node.getAttribute('aria-selected')), 'true')
    assert.equal(await copied(state, 'Copy Clank'), clank)
  })

  await check('invalid current text disables stale exports; Clank never substitutes stale data', async state => {
    await paste(state, simple)
    await paste(state, 'entries: [', 'invalid')
    assert.equal((await state.page.$$('article[data-finding]')).length, 1)
    assert.equal(await state.page.$eval('button[aria-label="Download Markdown"]', node => node.disabled), true)
    await tab(state.page, 'edit')
    assert.equal(await state.page.$eval('[role=switch]', node => node.disabled), true)
    await tab(state.page, 'clank')
    assert.equal(await state.page.$eval('button[aria-label="Copy Clank"]', node => node.disabled), true)
    assert.ok((await state.page.$eval('#output', node => node.textContent)).includes('no stale data is shown here'))
    await paste(state, JSON.stringify({entries: {simple: {priority: 7, category: 'unknown', extra: true}, more: {}}}), 'invalid')
    assert.ok((await copied(state, 'Copy Clank')).includes('priority 7'))
    const collapsed = (await state.page.$$('[data-issue-list] li')).length
    await click(state.page, '[data-issue-list] > button')
    assert.ok((await state.page.$$('[data-issue-list] li')).length > collapsed)
    await click(state.page, '[data-issue-list] li button:not(:disabled)')
    await state.page.waitForSelector('#input .selected-text')
    await paste(state, simple)
  })

  await check('file import, raw formatting, and persistent Undo replacement', async state => {
    const raw = '# retain this comment\nentries:\n  uploaded:\n    title: A report imported from a file\n    category: misc\n'
    await importText(state.page, raw)
    await state.page.waitForSelector('article[data-finding=uploaded]')
    await state.page.select('select[aria-label="Format input"]', 'json')
    await state.page.waitForFunction(() => localStorage.getItem('aubit.me:input')?.startsWith('{'))
    const json = JSON.parse(await state.page.evaluate(() => localStorage.getItem('aubit.me:input')))
    assert.equal(json.entries.uploaded.category, 'misc')
    assert.equal(json.entries.uploaded.priority, undefined)
    await click(state.page, 'button[aria-label="Undo replacement"]')
    await state.page.waitForFunction(value => localStorage.getItem('aubit.me:input') === value, {}, raw)
    assert.equal((await downloaded(state, 'Download input')).text, raw)
    await state.page.reload({waitUntil: 'networkidle0'})
    await state.page.waitForSelector('[data-input-status][data-state=valid]')
    assert.equal(await state.page.$eval('button[aria-label="Undo replacement"]', node => node.disabled), false)
  })

  await check('oversized imports leave the current draft untouched', async state => {
    await state.page.evaluate(limit => {
      const transfer = new DataTransfer()
      transfer.items.add(new File(['x'.repeat(limit + 1)], 'oversized.yaml'))
      document.querySelector('main').dispatchEvent(new DragEvent('drop', {dataTransfer: transfer, bubbles: true}))
    }, maxInputBytes)
    await state.page.waitForFunction(() => document.body.textContent.includes('file exceeds the 2 MB'))
    assert.equal((await downloaded(state, 'Download input')).text, example)
    assert.equal((await state.page.$$('article[data-finding]')).length, exampleCount)
  })

  await check('drag/drop and New preserve a recovery checkpoint', async state => {
    await state.page.evaluate(text => {
      const transfer = new DataTransfer()
      transfer.items.add(new File([text], 'dropped.json'))
      document.querySelector('main').dispatchEvent(new DragEvent('drop', {dataTransfer: transfer, bubbles: true}))
    }, simple)
    await state.page.waitForSelector('article[data-finding=simple]')
    await clickButton(state.page, /^New$/)
    await state.page.waitForFunction(() => localStorage.getItem('aubit.me:input') === 'entries: {}\n')
    await state.page.waitForFunction(() => document.querySelector('#output')?.textContent.includes('No findings'))
    await click(state.page, 'button[aria-label="Undo replacement"]')
    await state.page.waitForSelector('article[data-finding=simple]')
  })

  await check('hostile prose and edit strings never create executable HTML or external assets', async state => {
    const raw = JSON.stringify({collection: {}, entries: {hostile: {title: '<img src=x onerror=alert(1)>', category: 'security', description: '<svg onload="window.__executed=1"></svg>\n<script>window.__executed=1</script>\n[bad](javascript:alert(1))\n![tracker](https://invalid.example/track.png)', suggestedChanges: [{file: '<img onerror=x>.tsx', edit: {action: 'overwrite', content: '</code><script>window.__executed=1</script>\n```\n'}}]}}})
    await paste(state, raw)
    assert.equal(await state.page.$eval('[data-finding=hostile] h3', node => node.textContent), '<img src=x onerror=alert(1)>')
    await tab(state.page, 'preview')
    const safety = await state.page.$eval('[data-markdown-preview]', node => ({bad: node.querySelectorAll('script,img,svg,iframe,[onerror],[onload],a[href^="javascript:"]').length, text: node.textContent}))
    assert.equal(safety.bad, 0)
    assert.ok(safety.text.includes('<img src=x onerror=alert(1)>'))
    assert.equal(await state.page.evaluate(() => window.__executed), undefined)
  })

  await check('cyclic YAML and parser failures recover without replacing the saved source', async state => {
    await paste(state, 'entries: &loop\n  child: *loop', 'invalid')
    assert.ok((await state.page.$eval('[data-issue-list]', node => node.textContent)).includes('Recursive'))
    assert.equal(await state.page.evaluate(() => document.body.textContent.includes('Syntax-only editor')), false)
    await paste(state, simple)
    await state.page.waitForSelector('article[data-finding=simple]')
  })

  await check('compressed sharing round-trips input and tab without a server-bound query', async state => {
    await paste(state, simple)
    await tab(state.page, 'clank')
    const link = await copied(state, 'Share report')
    const parsed = new URL(link)
    assert.equal(parsed.search, '')
    assert.ok(parsed.hash.startsWith('#data:j;gz;base64='))
    await state.page.goto(link, {waitUntil: 'networkidle0'})
    await state.page.waitForSelector('[data-input-status][data-state=valid]')
    await state.page.waitForFunction(() => location.hash === '')
    assert.equal(await state.page.evaluate(() => localStorage.getItem('aubit.me:input')), simple)
    assert.equal(await state.page.$eval('#output-tab-clank', node => node.getAttribute('aria-selected')), 'true')
  })

  await check('malformed shared link keeps the local draft and explains the error', async state => {
    assert.equal(await state.page.evaluate(() => localStorage.getItem('aubit.me:input')), simple)
    assert.ok((await state.page.$eval('[role=status]', node => node.textContent)).length > 0)
    assert.equal((await state.page.$$('article[data-finding=simple]')).length, 1)
  }, {suffix: '#data:j;gz;base64=broken', before: async page => { await page.evaluateOnNewDocument(text => localStorage.setItem('aubit.me:input', text), simple) }})

  await check('unavailable browser storage does not crash the workspace', async ({page}) => {
    await page.waitForSelector('[data-save-state=unavailable]')
    assert.equal((await page.$$('article[data-finding]')).length, exampleCount)
    await tab(page, 'preview')
    assert.equal((await page.$$('[data-markdown-preview] h2')).length, exampleCount)
  }, {before: async page => { await page.evaluateOnNewDocument(() => { Storage.prototype.setItem = () => { throw new DOMException('blocked', 'QuotaExceededError') }; Storage.prototype.getItem = () => { throw new DOMException('blocked', 'SecurityError') } }) }})

  await check('clipboard rejection yields an actionable download fallback', async ({page}) => {
    await click(page, 'button[aria-label="Copy Markdown"]')
    await page.waitForFunction(() => document.body.textContent.includes('Clipboard access is unavailable'))
    assert.equal(await page.$eval('button[aria-label="Download Markdown"]', node => node.disabled), false)
  }, {before: async page => { await page.evaluateOnNewDocument(() => { Object.defineProperty(navigator, 'clipboard', {value: {writeText: async () => { throw new DOMException('denied', 'NotAllowedError') }}}) }) }})

  await check('desktop divider supports mouse and keyboard resizing', async ({page}) => {
    const before = await page.$eval('#input', node => node.getBoundingClientRect().width)
    const separator = await page.$('[role=separator]')
    const box = await separator.boundingBox()
    await page.mouse.move(box.x + box.width / 2, box.y + 250)
    await page.mouse.down(); await page.mouse.move(box.x + 100, box.y + 250, {steps: 10}); await page.mouse.up()
    const after = await page.$eval('#input', node => node.getBoundingClientRect().width)
    assert.ok(after > before + 60)
    await separator.focus(); await page.keyboard.press('ArrowLeft')
    assert.ok(await page.$eval('#input', node => node.getBoundingClientRect().width) < after)
  })

  await check('narrow layouts keep all tabs/actions reachable and resize vertically', async ({page}) => {
    for (const [width, height] of [[360, 800], [432, 600], [720, 800]]) {
      await page.setViewport({width, height})
      await page.waitForSelector('[role=separator][aria-orientation=horizontal]')
      for (const mode of ['render', 'edit', 'markdown', 'preview', 'clank', 'prompt']) {
        await tab(page, mode)
        const metrics = await page.evaluate(() => ({width: innerWidth, scroll: document.documentElement.scrollWidth, tabs: [...document.querySelectorAll('[role=tab]')].map(node => { const r = node.getBoundingClientRect(); return {left: r.left, right: r.right, top: r.top, bottom: r.bottom} })}))
        assert.equal(metrics.scroll, width)
        for (const rect of metrics.tabs) { assert.ok(rect.left >= 0 && rect.right <= width + 1); assert.ok(rect.top >= 0 && rect.bottom <= height) }
        const action = await page.$('button[aria-label="Share report"]')
        const bounds = await action.boundingBox()
        assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width + 1)
      }
    }
    await page.setViewport({width: 360, height: 800})
    const before = await page.$eval('#input', node => node.getBoundingClientRect().height)
    const separator = await page.$('[role=separator]')
    const box = await separator.boundingBox()
    await page.mouse.move(180, box.y + box.height / 2); await page.mouse.down(); await page.mouse.move(180, box.y + 50, {steps: 10}); await page.mouse.up()
    assert.ok(await page.$eval('#input', node => node.getBoundingClientRect().height) > before + 25)
    await page.setViewport({width: 1440, height: 1000})
    await page.waitForSelector('[role=separator][aria-orientation=vertical]')
    await tab(page, 'render')
    assert.equal((await page.$$('article[data-finding]')).length, exampleCount)
  })

  await check('theme selection, keyboard tabs, help focus, and Escape dismissal', async ({page}) => {
    await click(page, 'button[aria-label="Theme: system"]')
    assert.equal(await page.$eval('html', node => node.hasAttribute('data-dark')), true)
    await click(page, 'button[aria-label="Theme: dark"]')
    assert.equal(await page.$eval('html', node => node.hasAttribute('data-light')), true)
    await click(page, 'button[aria-label="Theme: light"]')
    assert.equal(await page.$eval('html', node => node.dataset.themePreference), 'system')
    await click(page, '#output-tab-render')
    await page.keyboard.press('ArrowRight')
    assert.equal(await page.$eval('#output-tab-edit', node => node.getAttribute('aria-selected')), 'true')
    await click(page, 'button[aria-label="Document format and help"]')
    assert.equal(await page.$eval('dialog', node => node.open), true)
    await page.keyboard.press('Escape')
    assert.equal(await page.$eval('dialog', node => node.open), false)
  })


  await check('cross-tab conflicts pause autosave until explicitly resolved', async state => {
    const other = await state.context.newPage()
    try {
      await other.goto(origin + '/icon.svg')
      await other.evaluate(text => localStorage.setItem('aubit.me:input', text), simple)
      await state.page.bringToFront()
      await state.page.waitForSelector('[data-save-state=conflict]')
      await state.page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide')))
      assert.equal(await state.page.evaluate(() => localStorage.getItem('aubit.me:input')), simple)
      const button = await state.page.waitForSelector('[data-save-state=conflict] + button')
      assert.equal(await button.evaluate(node => node.textContent), 'Save this tab')
      await button.click()
      await state.page.waitForSelector('[data-save-state=saved]')
      assert.equal(await state.page.evaluate(() => localStorage.getItem('aubit.me:input')), example)
      assert.equal(await state.page.evaluate(() => localStorage.getItem('aubit.me:backup')), simple)
    } finally { await other.close() }
  })

  await check('large reports render progressively without changing export completeness', async state => {
    const entries = Object.fromEntries(Array.from({length: 205}, (_, index) => ['finding_' + index, {title: 'Finding number ' + index, category: 'misc'}]))
    await paste(state, JSON.stringify({entries, collection: {}}))
    const count = () => state.page.$$eval('article[data-finding]', nodes => nodes.length)
    const initial = await count()
    assert.ok(initial > 0 && initial < Object.keys(entries).length)
    const all = await copied(state, 'Copy Markdown')
    assert.ok(all.includes('finding_204'))
    while (await count() < Object.keys(entries).length) {
      const before = await count()
      await clickButton(state.page, /^Load \d+ more findings$/)
      assert.ok(await count() > before)
    }
    assert.equal(await count(), Object.keys(entries).length)
  })

  await check('responsive dark/light screenshots of the final production UI', async ({page}) => {
    for (const [name, width, height] of [['desktop', 1440, 1000], ['tile', 432, 600], ['mobile', 360, 800]]) {
      for (const scheme of ['dark', 'light']) {
        await page.setViewport({width, height})
        await page.emulateMediaFeatures([{name: 'prefers-color-scheme', value: scheme}])
        await tab(page, 'render')
        await page.evaluate(() => document.fonts.ready)
        await new Promise(resolve => setTimeout(resolve, 200))
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width)
        await page.screenshot({path: join(output, name + '-' + scheme + '.png')})
      }
    }
  })

  await fs.writeFile(join(output, 'results.json'), JSON.stringify({browser: version, date: new Date().toISOString(), durationMs: Math.round(performance.now() - started), passed: checks.filter(c => c.status === 'pass').length, failed: checks.filter(c => c.status === 'fail').length, checks}, null, 2) + '\n')
  console.log(checks.filter(c => c.status === 'pass').length + '/' + checks.length + ' browser checks passed.')
  if (failed) process.exitCode = 1
} finally {
  await browser.close()
  await server?.close()
}
