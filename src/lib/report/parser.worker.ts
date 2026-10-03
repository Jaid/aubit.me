import {parseSnapshot} from './parseInput.ts'

globalThis.onmessage = (event: MessageEvent<{
  id: number
  text: string
}>) => {
  const {id, text} = event.data
  globalThis.postMessage({
    id,
    snapshot: parseSnapshot(text),
  })
}
