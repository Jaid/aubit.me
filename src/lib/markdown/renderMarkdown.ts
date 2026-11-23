import type {DiffPart} from '#src/lib/inlineDiff.ts'
import type {Tokens} from 'marked'

import DOMPurify from 'dompurify'
import {Marked} from 'marked'

import {inlineDiff} from '#src/lib/inlineDiff.ts'

import diffStyles from '#src/styles/diff.css?raw'

const escapeHtml = (text: string) => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
const diffKinds: Record<string, string> = {
  '+': 'add',
  '-': 'remove',
  '@': 'hunk',
}
const renderDiffLine = (line: string, parts?: ReadonlyArray<DiffPart>) => {
  const sign = line.charAt(0)
  const tag = sign === '-' ? 'del' : 'ins'
  const content = parts ? sign + parts.map(part => (part.changed ? `<${tag}>${escapeHtml(part.text)}</${tag}>` : escapeHtml(part.text))).join('') : escapeHtml(line)
  return `<span data-diff="${diffKinds[sign] ?? 'context'}">${content || ' '}</span>`
}
const renderDiff = (text: string) => {
  const lines = text.split('\n')
  const html: Array<string> = []
  for (let index = 0; index < lines.length;) {
    if (!lines[index].startsWith('-')) {
      html.push(renderDiffLine(lines[index++]))
      continue
    }
    const start = index
    while (lines[index]?.startsWith('-')) {
      index++
    }
    const middle = index
    while (lines[index]?.startsWith('+')) {
      index++
    }
    const contents = (from: number, to: number) => lines.slice(from, to).map(line => line.slice(1))
    const highlights = middle < index ? inlineDiff(contents(start, middle), contents(middle, index)) : undefined
    for (let i = start; i < index; i++) {
      html.push(renderDiffLine(lines[i], i < middle ? highlights?.removed[i - start] : highlights?.added[i - middle]))
    }
  }
  return html.join('')
}
const renderCode = ({text, lang}: Tokens.Code) => {
  const language = (lang ?? '').trim().split(/\s+/)[0] ?? ''
  const attribute = language ? ` data-language="${escapeHtml(language)}"` : ''
  if (language !== 'diff') {
    return `<pre${attribute}><code>${escapeHtml(text)}</code></pre>\n`
  }
  return `<pre${attribute}><code>${renderDiff(text)}</code></pre>\n`
}
const marked = new Marked({
  gfm: true,
  renderer: {
    code: renderCode,
    // Defense in depth: report-controlled raw HTML never enters the sanitizer as markup.
    html: ({text}) => escapeHtml(text),
    // Image URLs are never loaded, including tracking pixels and same-origin probes.
    image: ({text}) => `<span>${escapeHtml(text || '[image omitted]')}</span>`,
    link({href, tokens}) {
      const text = this.parser.parseInline(tokens)
      if (!/^https?:\/\//i.test(href)) {
        return text
      }
      return `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${text}</a>`
    },
  },
})
const sanitize = (html: string) => DOMPurify.sanitize(html, {
  ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'del', 'ins', 's', 'a', 'span', 'pre', 'code', 'blockquote', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'table', 'thead', 'tbody', 'tr', 'th', 'td'],
  ALLOWED_ATTR: ['href', 'target', 'rel', 'start', 'align', 'data-language', 'data-diff'],
  ALLOW_DATA_ATTR: false,
  ALLOW_ARIA_ATTR: false,
})
export const renderMarkdown = (markdown: string) => sanitize(marked.parse(markdown, {async: false}))

export function htmlDocument(markdown: string) {
  return `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><meta name="color-scheme" content="dark light"><title>Aubit report</title><style>body{max-width:980px;margin:2rem auto;padding:0 1rem;font:16px/1.65 system-ui,sans-serif}pre{padding:.8rem 1rem;border:1px solid #8885;border-radius:8px;overflow:auto}code{font-family:ui-monospace,monospace}table{border-collapse:collapse;width:100%}th,td{border:1px solid #8885;padding:.35rem .6rem;text-align:left}h2{margin-top:2rem}a{color:inherit}[data-diff]{display:block;white-space:break-spaces;overflow-wrap:anywhere}[data-diff=add]{color:light-dark(#176d35,#7dde98)}[data-diff=remove]{color:light-dark(#aa283b,#ff9aaa)}${diffStyles}@media print{body{font-size:11pt}pre,tr{break-inside:avoid}}</style></head><body>\n${renderMarkdown(markdown)}\n</body></html>\n`
}
