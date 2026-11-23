import {describe, expect, test} from 'bun:test'

import {maxInputBytes, maxPermalinkCharacters} from '#src/lib/limits.ts'
import {createShareUrl, encodePermalinkFragment, readPermalinkState} from '#src/lib/permalink.ts'

const read = (suffix: string) => readPermalinkState(new URL(suffix, 'https://aubit.me/'))
async function pack(value: unknown) {
  const blob = new Blob([JSON.stringify(value)])
  const response = new Response(blob.stream().pipeThrough(new CompressionStream('gzip')))
  const bytes = await response.bytes()
  return `#data:j;gz;base64=${bytes.toBase64({
    alphabet: 'base64url',
    omitPadding: true,
  })}`
}
describe('bounded share links', () => {
  test('round-trips exact Unicode source and the selected tab', async () => {
    const state = {
      yaml: '# notes 🧪\nentries: {}\n',
      tab: 'clank',
    }
    const url = new URL(await createShareUrl(state, 'https://aubit.me/subpath/?tracker=1'))
    expect(url.pathname).toBe('/subpath/')
    expect(url.search).toBe('')
    expect(await readPermalinkState(url)).toEqual(state)
  })
  test('a plain page URL does not replace the local draft', async () => {
    expect(await read('?yaml=not-a-share')).toBeUndefined()
    expect(await read('#help')).toBeUndefined()
  })
  test.each([
    '#data:yaml=entries',
    '#data:j;gz;base64=not!base64',
    '#data:j;gz;base64=YWJj',
  ])('rejects malformed or unsupported fragments: %s', async fragment => {
    await expect(read(fragment)).rejects.toThrow()
  })
  test('requires report text and a supported envelope version', async () => {
    await expect(read(await pack({
      version: 1,
      yaml: 42,
    }))).rejects.toThrow('report text')
    for (const version of [undefined, 2]) {
      await expect(read(await pack({
        version,
        yaml: 'entries: {}',
      }))).rejects.toThrow('version')
    }
  })
  test('rejects oversized source before compression', async () => {
    await expect(encodePermalinkFragment({yaml: 'x'.repeat(maxInputBytes + 1)})).rejects.toThrow('input limit')
  })
  test('rejects oversized decoded text even if it compresses very well', async () => {
    const fragment = await pack({
      version: 1,
      yaml: 'x'.repeat(maxInputBytes + 1),
    })
    await expect(read(fragment)).rejects.toThrow('input limit')
  })
  test('bounds decompression before accepting the envelope', async () => {
    const fragment = await pack({
      version: 1,
      yaml: 'x'.repeat(maxInputBytes * 7),
    })
    await expect(read(fragment)).rejects.toThrow('safety limit')
  })
  test('refuses impractically long share links instead of silently truncating', async () => {
    let seed = 0x12_34_56_78
    let yaml = ''
    for (let i = 0; i < 110_000; i++) {
      seed ^= seed << 13
      seed ^= seed >>> 17
      seed ^= seed << 5
      yaml += String.fromCodePoint(33 + (seed >>> 0) % 90)
    }
    await expect(encodePermalinkFragment({yaml})).rejects.toThrow('too large')
  })
  test('rejects excessive URL length before decoding', async () => {
    await expect(read(`#data:j;gz;base64=${'A'.repeat(maxPermalinkCharacters)}`)).rejects.toThrow('character limit')
  })
})
