import type {PreviewServer, ViteDevServer} from 'vite'

import type {AddressInfo} from 'node:net'
import {dirname, resolve} from 'node:path'

import {createServer, preview} from 'vite'

type Options = {
  preview?: boolean
  root?: string
}
/** Explicit source/production modes: never transform already-built worker JavaScript. */
export default class ViteSession implements AsyncDisposable {
  static formatAddress(address: AddressInfo) {
    const host = ['0.0.0.0', '::'].includes(address.address) ? '127.0.0.1' : (address.address.includes(':') ? '[' + address.address + ']' : address.address)
    return `http://${host}:${address.port}`
  }
  readonly options: Required<Options>
  server?: PreviewServer | ViteDevServer
  constructor(options: Options = {}) {
    this.options = {
      root: resolve(options.root ?? process.cwd()),
      preview: options.preview ?? false,
    }
  }
  get url() {
    const address = this.server?.httpServer?.address()
    if (!address) {
      throw new Error('ViteSession is not initialized.')
    }
    return typeof address === 'string' ? address : ViteSession.formatAddress(address)
  }
  async init() {
    if (this.server) {
      throw new Error('ViteSession is already initialized.')
    }
    if (this.options.preview) {
      this.server = await preview({
        configFile: false,
        root: dirname(this.options.root),
        build: {outDir: this.options.root},
        preview: {
          host: '127.0.0.1',
          port: 0,
        },
      })
    } else {
      const server = await createServer({
        root: this.options.root,
        server: {
          host: '127.0.0.1',
          port: 0,
        },
      })
      await server.listen()
      this.server = server
    }
  }
  async [Symbol.asyncDispose]() {
    await this.server?.close()
    this.server = undefined
  }
}
