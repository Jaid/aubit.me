import {describe, expect, test} from 'bun:test'

import {createShareUrl, encodePermalinkFragment, readPermalinkState} from '#src/lib/permalink.ts'

async function pack(value: unknown) {
  const stream = new Blob([JSON.stringify(value)]).stream().pipeThrough(new CompressionStream('gzip'))
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer())
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
    const fragment = await encodePermalinkFragment(state)
    expect(await readPermalinkState(`https://aubit.me/${fragment}`)).toEqual(state)
  })
  test('accepts original Claude links without a version field', async () => {
    const state = {
      yaml: 'entries: {}\n',
      tab: 'preview',
    }
    expect(await readPermalinkState(`https://aubit.me/${await pack(state)}`)).toEqual(state)
  })
  test('accepts Grok query links for migration', async () => {
    const yaml = 'entries: {}\n'
    expect(await readPermalinkState(`https://aubit.me/?yaml=${encodeURIComponent(yaml)}`)).toEqual({
      yaml,
      tab: undefined,
    })
  })
  test('generated links contain no report text in the query', async () => {
    const url = new URL(await createShareUrl({
      yaml: 'entries: {}',
      tab: 'preview',
    }, 'https://aubit.me/subpath/?yaml=old&tracker=1'))
    expect(url.pathname).toBe('/subpath/')
    expect(url.search).toBe('')
    expect(url.hash.startsWith('#data:j;gz;base64=')).toBe(true)
  })
  test('a plain page URL does not replace the local draft', async () => {
    expect(await readPermalinkState('https://aubit.me/')).toEqual({})
    expect(await readPermalinkState('https://aubit.me/#help')).toEqual({})
  })
  test.each([
    '#data:yaml=entries',
    '#data:j;gz;base64=not!base64',
    '#data:j;gz;base64=YWJj',
  ])('rejects malformed or unsupported fragments: %s', async fragment => {
    await expect(readPermalinkState(`https://aubit.me/${fragment}`)).rejects.toThrow()
  })
  test('rejects unexpected envelopes and future versions', async () => {
    await expect(readPermalinkState(`https://aubit.me/${await pack({
      version: 1,
      yaml: 42,
    })}`)).rejects.toThrow('report text')
    await expect(readPermalinkState(`https://aubit.me/${await pack({
      version: 2,
      yaml: 'entries: {}',
    })}`)).rejects.toThrow('version')
  })
  test('rejects oversized source before compression', async () => {
    await expect(encodePermalinkFragment({yaml: 'x'.repeat(2_000_001)})).rejects.toThrow('2 MB')
  })
  test('rejects oversized decoded text even if it compresses very well', async () => {
    const fragment = await pack({
      version: 1,
      yaml: 'x'.repeat(2_000_001),
    })
    await expect(readPermalinkState(`https://aubit.me/${fragment}`)).rejects.toThrow('2 MB')
  })
  test('bounds decompression before accepting the envelope', async () => {
    const fragment = await pack({
      version: 1,
      yaml: 'x'.repeat(12_010_000),
    })
    await expect(readPermalinkState(`https://aubit.me/${fragment}`)).rejects.toThrow('safety limit')
  })
  test('refuses impractically long share links instead of silently truncating', async () => {
    let seed = 0x12_34_56_78
    let yaml = ''
    for (let i = 0; i < 110_000; i++) {
      seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5
      yaml += String.fromCharCode(33 + (seed >>> 0) % 90)
    }
    await expect(encodePermalinkFragment({yaml})).rejects.toThrow('too large')
  })
  test('rejects excessive URL length before decoding', async () => {
    await expect(readPermalinkState(`https://aubit.me/#data:j;gz;base64=${'A'.repeat(70_000)}`)).rejects.toThrow('64,000')
  })
})
