import {assertInputSize, inputByteLength, maxInputBytes, maxPermalinkCharacters} from './limits.ts'

export type PermalinkState = {
  tab?: string
  yaml?: string
}
const descriptor = '#data:j;gz;base64='
/** Compatible with Claude's original fragment links. Sharing is explicit and never sends report text to a server. */
export async function encodePermalinkFragment(state: PermalinkState) {
  if (typeof state.yaml !== 'string') {
    throw new TypeError('There is no report to share.')
  }
  assertInputSize(state.yaml)
  const envelope = JSON.stringify({
    version: 1,
    yaml: state.yaml,
    tab: state.tab,
  })
  const stream = new Blob([envelope]).stream().pipeThrough(new CompressionStream('gzip'))
  const bytes = await readBounded(stream, maxInputBytes + 100_000)
  const fragment = descriptor + bytes.toBase64({
    alphabet: 'base64url',
    omitPadding: true,
  })
  if (fragment.length > maxPermalinkCharacters) {
    throw new Error('This report is too large for a reliable share link. Download the input file instead.')
  }
  return fragment
}

export async function readPermalinkState(input: URL | string): Promise<PermalinkState> {
  if (String(input).length > maxPermalinkCharacters + 4096) {
    throw new Error('The shared URL exceeds the 64,000-character limit.')
  }
  const url = new URL(input)
  if (!url.hash.startsWith('#data:')) {
    // Read Grok-style links for migration, but never generate query-string report state.
    const yaml = url.searchParams.get('yaml')
    if (yaml === null) {
      return {}
    }
    assertInputSize(yaml)
    return {
      yaml,
      tab: url.searchParams.get('tab') ?? undefined,
    }
  }
  if (!url.hash.startsWith(descriptor)) {
    throw new Error('This shared-link format is not supported.')
  }
  const payload = url.hash.slice(descriptor.length)
  if (!/^[-0-9A-Z_a-z]+={0,2}$/.test(payload)) {
    throw new Error('The shared link contains invalid Base64URL data.')
  }
  let value: unknown
  try {
    const bytes = Uint8Array.fromBase64(payload, {alphabet: 'base64url'})
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))
    // JSON escaping may use six bytes per source character; decoded editor text is checked separately.
    const decoded = await readBounded(stream, maxInputBytes * 6 + 1024)
    value = JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(decoded))
  } catch (error) {
    throw new Error('The shared link is invalid or exceeds a safety limit.', {cause: error})
  }
  if (!value || typeof value !== 'object' || !('yaml' in value) || typeof value.yaml !== 'string') {
    throw new Error('The shared link does not contain report text.')
  }
  if ('version' in value && value.version !== 1) {
    throw new Error('This shared-link version is not supported.')
  }
  if (inputByteLength(value.yaml) > maxInputBytes) {
    throw new Error('The shared report exceeds the 2 MB input limit.')
  }
  return {
    yaml: value.yaml,
    tab: 'tab' in value && typeof value.tab === 'string' ? value.tab : undefined,
  }
}

export function consumePermalink() {
  const url = new URL(location.href)
  if (url.hash.startsWith('#data:')) {
    url.hash = ''
  }
  for (const key of ['yaml', 'tab', 'sort', 'query', 'priorities', 'families']) {
    url.searchParams.delete(key)
  }
  history.replaceState(null, '', url.pathname + url.search + url.hash)
}

export async function createShareUrl(state: PermalinkState, base = location.href) {
  const url = new URL(base)
  url.search = ''
  url.hash = await encodePermalinkFragment(state)
  return url.href
}

/** Read incrementally: a compressed link cannot allocate an unbounded decompressed buffer. */
async function readBounded(stream: ReadableStream<Uint8Array>, limit: number) {
  const reader = stream.getReader()
  const chunks: Array<Uint8Array> = []
  let length = 0
  try {
    while (true) {
      const {done, value} = await reader.read()
      if (done) {
        break
      }
      length += value.byteLength
      if (length > limit) {
        await reader.cancel()
        throw new Error('The shared report expands beyond the safe size limit.')
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  const bytes = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset); offset += chunk.length
  }
  return bytes
}
