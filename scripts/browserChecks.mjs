import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import {existsSync} from 'node:fs'
import {resolve, join} from 'node:path'
import {execFileSync} from 'node:child_process'
import puppeteer from 'puppeteer-core'
import ViteSession from '../packages/vite-session/src/ViteSession.ts'

const output = resolve('out/test/browser')
await fs.mkdir(output, {recursive: true})
const example = await fs.readFile('src/data/example.yaml', 'utf8')
const expected = JSON.parse(await fs.readFile(join(output, 'expected.json'), 'utf8'))
const expectedMarkdown = expected.markdown
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
  for (const command of ['google-chrome', 'chromium', 'chrome']) {
    try { const path = execFileSync(process.platform === 'win32' ? 'where' : 'which', [command], {encoding: 'utf8'}).trim().split(/\r?\n/)[0]; if (existsSync(path)) return path } catch {}
  }
  throw new Error('Chrome was not found. Set BROWSER_PATH to a current Chromium executable before running browser checks.')
}
const browser = await puppeteer.launch({executablePath: findBrowser(), headless: true, protocolTimeout: 30_000, args: ['--no-sandbox', '--disable-setuid-sandbox']})
let server
try {
  server = new ViteSession({root: 'dist', preview: true})
  await server.init()
  const origin = server.url
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
  async function paste({page, context}, text, status = 'valid') {
    const editor = await page.waitForSelector('#input .monaco-editor [role=textbox]')
    assert.equal(await editor.evaluate(node => node.getAttribute('aria-roledescription')), 'editor')
    await context.overridePermissions(origin, ['clipboard-read', 'clipboard-sanitized-write'])
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
    await context.overridePermissions(origin, ['clipboard-read', 'clipboard-sanitized-write'])
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

  await check('real Monaco, correct summary numbers, and four output views', async ({page}) => {
    assert.equal(await page.title(), 'Aubit Viewer')
    assert.equal((await page.$$('#output article[data-finding]')).length, 5)
    assert.equal((await page.$$('[role=tab]')).length, 4)
    const text = await page.$eval('#output', node => node.textContent)
    for (const value of ['5', '8 edits', '7 files', 'P0', 'P4']) assert.ok(text.includes(value), value)
    assert.equal((await page.$$('#input .monaco-editor')).length, 1)
    for (const mode of ['markdown', 'preview', 'clank', 'visualization']) await tab(page, mode)
    await fs.writeFile(join(output, 'render.html'), await page.content())
  })

  await check('filtering and grouping remain local to visualization and survive tab changes', async ({page, context}) => {
    await page.type('input[aria-label="Search findings"]', 'credentials')
    await page.waitForFunction(() => document.querySelectorAll('#output article[data-finding]').length === 1)
    await tab(page, 'preview')
    assert.equal((await page.$$('#output [data-markdown-preview] h2')).length, 5)
    await tab(page, 'visualization')
    assert.equal(await page.$eval('input[aria-label="Search findings"]', node => node.value), 'credentials')
    assert.equal((await page.$$('#output article[data-finding]')).length, 1)
    assert.equal(await copied({page, context}, 'Copy Markdown'), expectedMarkdown)
    await click(page, 'button[title="Filter by P2 – moderate"]')
    assert.equal((await page.$$('#output article[data-finding]')).length, 0)
    const reset = await page.$$('button')
    for (const element of reset) if (await element.evaluate(node => node.textContent === 'Reset filters')) { await element.click(); break }
    await click(page, 'button[role=radio][aria-checked=true]')
    await page.keyboard.press('End')
    assert.equal(await page.$eval('button[role=radio][aria-checked=true]', node => node.textContent), 'File')
  })

  await check('source-linked finding navigation selects the correct real editor range', async ({page}) => {
    await click(page, 'button[title="Reveal in editor (line 41)"]')
    await page.waitForFunction(() => document.activeElement?.getAttribute('aria-roledescription') === 'editor')
    assert.ok((await page.$$('#input .selected-text')).length > 0)
    await page.waitForSelector('article[data-finding=readme_spelling][data-active]')
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
    assert.deepEqual(structure, {headings: 5, scripts: 0, title: 'Aubit report', rows: 5})
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
    await tab(state.page, 'clank')
    assert.equal(await state.page.$eval('button[aria-label="Copy Clank"]', node => node.disabled), true)
    assert.ok((await state.page.$eval('#output', node => node.textContent)).includes('no stale data is shown here'))
    await paste(state, '{"entries":{"simple":{"priority":7}}}', 'invalid')
    assert.ok((await copied(state, 'Copy Clank')).includes('priority 7'))
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
    await state.page.evaluate(() => {
      const transfer = new DataTransfer()
      transfer.items.add(new File(['x'.repeat(2_000_001)], 'oversized.yaml'))
      document.querySelector('main').dispatchEvent(new DragEvent('drop', {dataTransfer: transfer, bubbles: true}))
    })
    await state.page.waitForFunction(() => document.body.textContent.includes('file exceeds the 2 MB'))
    assert.equal((await downloaded(state, 'Download input')).text, example)
    assert.equal((await state.page.$$('article[data-finding]')).length, 5)
  })

  await check('drag/drop and New preserve a recovery checkpoint', async state => {
    await state.page.evaluate(text => {
      const transfer = new DataTransfer()
      transfer.items.add(new File([text], 'dropped.json'))
      document.querySelector('main').dispatchEvent(new DragEvent('drop', {dataTransfer: transfer, bubbles: true}))
    }, simple)
    await state.page.waitForSelector('article[data-finding=simple]')
    const buttons = await state.page.$$('#input button')
    for (const element of buttons) if (await element.evaluate(node => node.textContent === 'New')) { await element.click(); break }
    await state.page.waitForFunction(() => localStorage.getItem('aubit.me:input') === 'entries: {}\n')
    await state.page.waitForFunction(() => document.querySelector('#output')?.textContent.includes('No findings'))
    await click(state.page, 'button[aria-label="Undo replacement"]')
    await state.page.waitForSelector('article[data-finding=simple]')
  })

  await check('hostile prose and edit strings never create executable HTML or external assets', async state => {
    const raw = JSON.stringify({entries: {hostile: {title: '<img src=x onerror=alert(1)>', category: 'security', description: '<svg onload="window.__executed=1"></svg>\n<script>window.__executed=1</script>\n[bad](javascript:alert(1))\n![tracker](https://invalid.example/track.png)', suggestedChanges: [{file: '<img onerror=x>.tsx', edit: {action: 'overwrite', content: '</code><script>window.__executed=1</script>\n```\n'}}]}}})
    await paste(state, raw)
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
    assert.equal((await page.$$('article[data-finding]')).length, 5)
    await tab(page, 'preview')
    assert.equal((await page.$$('[data-markdown-preview] h2')).length, 5)
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
      for (const mode of ['visualization', 'markdown', 'preview', 'clank']) {
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
    await tab(page, 'visualization')
    assert.equal((await page.$$('article[data-finding]')).length, 5)
  })

  await check('theme selection, keyboard tabs, help focus, and Escape dismissal', async ({page}) => {
    await click(page, 'button[aria-label="Theme: system"]')
    assert.equal(await page.$eval('html', node => node.hasAttribute('data-dark')), true)
    await click(page, 'button[aria-label="Theme: dark"]')
    assert.equal(await page.$eval('html', node => node.hasAttribute('data-light')), true)
    await click(page, 'button[aria-label="Theme: light"]')
    assert.equal(await page.$eval('html', node => node.dataset.themePreference), 'system')
    await click(page, '#output-tab-visualization')
    await page.keyboard.press('ArrowRight')
    assert.equal(await page.$eval('#output-tab-markdown', node => node.getAttribute('aria-selected')), 'true')
    await click(page, 'button[aria-label="Report format and help"]')
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
    await paste(state, JSON.stringify({entries}))
    assert.equal((await state.page.$$('article[data-finding]')).length, 100)
    const all = await copied(state, 'Copy Markdown')
    assert.ok(all.includes('finding_204'))
    const buttons = await state.page.$$('button')
    for (const button of buttons) if (await button.evaluate(node => node.textContent === 'Load 100 more findings')) { await button.click(); break }
    assert.equal((await state.page.$$('article[data-finding]')).length, 200)
  })

  await check('responsive dark/light screenshots of the final production UI', async ({page}) => {
    for (const [name, width, height] of [['desktop', 1440, 1000], ['tile', 432, 600], ['mobile', 360, 800]]) {
      for (const scheme of ['dark', 'light']) {
        await page.setViewport({width, height})
        await page.emulateMediaFeatures([{name: 'prefers-color-scheme', value: scheme}])
        await tab(page, 'visualization')
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
  await server?.[Symbol.asyncDispose]()
}
