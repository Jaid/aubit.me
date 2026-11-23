import {inlineCode} from '#src/lib/markdown/syntax.ts'

import {Needle} from './base/Needle.ts'

export class PatternNeedle extends Needle {
  readonly flags: ReadonlyArray<string>
  readonly kind = 'pattern'
  readonly regex: string
  constructor(regex: string, flags: ReadonlyArray<string> | string = 'v') {
    super()
    this.regex = regex
    this.flags = [...new Set(typeof flags === 'string' ? [flags] : flags)]
  }
  toMarkdownPhrase() {
    return `matches of ${inlineCode(this.toString())}`
  }
  toString() {
    return `/${this.regex}/${this.flags.join('')}`
  }
}
