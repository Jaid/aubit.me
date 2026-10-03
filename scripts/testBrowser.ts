import {spawn} from 'node:child_process'
import {mkdir, readFile, writeFile} from 'node:fs/promises'
import {fileURLToPath} from 'node:url'

import {reportToMarkdown} from '#src/lib/markdown/reportToMarkdown.ts'
import {parseInput} from '#src/lib/report/parseInput.ts'

// Prepare pure-data expectations with Bun; dependencies may publish TypeScript sources.
const root = fileURLToPath(new URL('..', import.meta.url))
const example = await readFile(new URL('../src/data/example.yaml', import.meta.url), 'utf8')
const parsed = parseInput(example)
if (!parsed.report) {
  throw new Error('The bundled example is invalid.')
}
await mkdir(new URL('../out/test/browser/', import.meta.url), {recursive: true})
await writeFile(new URL('../out/test/browser/expected.json', import.meta.url), JSON.stringify({
  clank: parsed.clank,
  markdown: reportToMarkdown(parsed.report),
}, null, 2))
// Run Puppeteer under Node. Bun's advanced selector behavior is not a reliable browser-test oracle.
const runner = fileURLToPath(new URL('browserChecks.mjs', import.meta.url))
const child = spawn('node', [runner], {
  cwd: root,
  env: process.env,
  stdio: 'inherit',
})
child.on('error', error => {
  console.error('Could not start Node browser checks:', error.message); process.exitCode = 1
})
child.on('close', code => {
  process.exitCode = code ?? 1
})
