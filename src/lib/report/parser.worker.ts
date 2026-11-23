import {parseSnapshot} from './parseInput.ts'

globalThis.addEventListener('message', (event: MessageEvent<string>) => {
  globalThis.postMessage(parseSnapshot(event.data))
})
