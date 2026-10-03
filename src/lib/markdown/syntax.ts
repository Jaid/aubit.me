const longestRun = (text: string, character: string) => {
  let longest = 0
  let current = 0
  for (const char of text) {
    if (char === character) {
      current++
      longest = Math.max(longest, current)
    } else {
      current = 0
    }
  }
  return longest
}
/** removes exactly one trailing line break, which YAML block scalars usually add */
export const trimFinalNewline = (text: string) => text.replace(/\r?\n$/, '')
/** wraps text in a code span that survives backticks inside the text */
export const inlineCode = (value: string) => {
  const text = value.replaceAll(/[\n\r]/g, ' ')
  const fence = '`'.repeat(longestRun(text, '`') + 1)
  const padding = text.startsWith('`') || text.endsWith('`') || /^ .* $/.test(text) ? ' ' : ''
  return `${fence}${padding}${text}${padding}${fence}`
}
/** wraps text in a fenced code block that survives backtick fences inside the text */
export const codeBlock = (text: string, language = '') => {
  const fence = '`'.repeat(Math.max(3, longestRun(text, '`') + 1))
  return `${fence}${language}\n${trimFinalNewline(text)}\n${fence}`
}
/** renders a unified diff block from removed and added text */
export const diffBlock = (removed: string | undefined, added: string | undefined) => {
  const lines: Array<string> = []
  if (removed !== undefined) {
    for (const line of trimFinalNewline(removed).split('\n')) {
      lines.push(`-${line}`)
    }
  }
  if (added !== undefined) {
    for (const line of trimFinalNewline(added).split('\n')) {
      lines.push(`+${line}`)
    }
  }
  return codeBlock(lines.join('\n'), 'diff')
}
/** escapes characters that would otherwise be interpreted as inline Markdown or HTML */
export const escapeMarkdown = (text: string) => text.replaceAll(/[!#()*+\-.<>[\\\]_\x60{|}~]/g, String.raw`\$&`)
/** escapes pipes and line breaks so the text fits into a single GFM table cell */
export const tableCell = (text: string) => escapeMarkdown(text).replaceAll(/\r?\n/g, ' ')
export const isMultiline = (text: string) => trimFinalNewline(text).includes('\n')
