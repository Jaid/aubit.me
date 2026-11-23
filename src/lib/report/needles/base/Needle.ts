export abstract class Needle {
  abstract readonly kind: 'line' | 'pattern' | 'text'
  /** additional Markdown block for needles too large to inline */
  toMarkdownBlock(): string | undefined {
    return undefined
  }
  /** phrase usable inside a sentence, for example “matches of `/userID/im`” */
  abstract toMarkdownPhrase(): string
  abstract toString(): string
}
