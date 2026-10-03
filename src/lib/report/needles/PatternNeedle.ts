import {inlineCode} from '#src/lib/markdown/syntax.ts'

import {Needle} from './base/Needle.ts'

/** ECMAScript regular expression that is searched for */
export class PatternNeedle extends Needle {
  readonly flags: ReadonlyArray<string>
  readonly kind = 'pattern'
  readonly regex: string
  constructor(regex: string, flags: ReadonlyArray<string> | string = 'v') {
    super()
    this.regex = regex
    this.flags = [...new Set(typeof flags === 'string' ? [flags] : flags)]
  }
  get flagString() {
    return this.flags.join('')
  }
  get isValid() {
    return this.compile() !== undefined
  }
  /** compiles the pattern; returns undefined if the browser rejects it */
  compile() {
    try {
      return new RegExp(this.regex, this.flagString)
    } catch {}
  }
  toMarkdownPhrase() {
    return `matches of ${inlineCode(this.toString())}`
  }
  toString() {
    return `/${this.regex}/${this.flagString}`
  }
}
