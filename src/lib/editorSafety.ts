import type {MonacoApi} from './monaco.ts'

import {inputByteLength, maxInputBytes} from './limits.ts'

export const safeYamlLanguage = 'aubit-yaml-syntax'

/** Oversized source bypasses Monaco's YAML service to avoid expensive background processing. */
export function needsSyntaxOnlyEditor(text: string) {
  return inputByteLength(text) > maxInputBytes
}

/** A bounded, syntax-only fallback for oversized documents; authoritative validation still runs in our worker. */
export function registerSafeYamlLanguage(monaco: MonacoApi) {
  if (monaco.languages.getLanguages().some(language => language.id === safeYamlLanguage)) {
    return
  }
  monaco.languages.register({id: safeYamlLanguage})
  monaco.languages.setMonarchTokensProvider(safeYamlLanguage, {
    defaultToken: '',
    tokenizer: {
      root: [
        [/#.*$/, 'comment'],
        [/"(?:[^"\\]|\\.)*"|'(?:[^']|'')*'/, 'string'],
        [/[&*][^\s,[\]{}]+/, 'type'],
        [/[\w\-.]+(?=\s*:)/, 'tag'],
        [/\b(?:false|null|true)\b/, 'keyword'],
        [/-?\b\d+(?:\.\d+)?\b/, 'number'],
        [/[,:>[\]{|}]/, 'delimiter'],
      ],
    },
  })
}
