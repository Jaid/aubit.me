/** locates the part of a file an edit refers to */
export abstract class Needle {
  abstract readonly kind: 'line' | 'pattern' | 'text'
/** additional Markdown block shown below the sentence, if the needle is too large to be inlined */
  toMarkdownBlock(): string | undefined {
    return undefined
  }
/** Markdown phrase usable inside a sentence, for example “matches of `/userID/im`” */
  abstract toMarkdownPhrase(): string
/** short, plain representation like “/userID/im” or “line 42” */
  abstract toString(): string
}
