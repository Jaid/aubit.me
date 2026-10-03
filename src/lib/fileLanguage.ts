const byExtension: Record<string, string> = {
  ts: 'ts',
  mts: 'ts',
  cts: 'ts',
  tsx: 'tsx',
  js: 'js',
  mjs: 'js',
  cjs: 'js',
  jsx: 'jsx',
  json: 'json',
  jsonc: 'jsonc',
  json5: 'json5',
  yaml: 'yaml',
  yml: 'yaml',
  toml: 'toml',
  md: 'markdown',
  mdx: 'mdx',
  html: 'html',
  htm: 'html',
  css: 'css',
  scss: 'scss',
  sass: 'sass',
  less: 'less',
  py: 'python',
  rb: 'ruby',
  rs: 'rust',
  go: 'go',
  java: 'java',
  kt: 'kotlin',
  swift: 'swift',
  c: 'c',
  h: 'c',
  cpp: 'cpp',
  hpp: 'cpp',
  cs: 'csharp',
  php: 'php',
  sh: 'sh',
  bash: 'bash',
  zsh: 'zsh',
  fish: 'fish',
  ps1: 'powershell',
  sql: 'sql',
  xml: 'xml',
  svg: 'xml',
  vue: 'vue',
  svelte: 'svelte',
  lua: 'lua',
  dockerfile: 'dockerfile',
  ini: 'ini',
  graphql: 'graphql',
  gql: 'graphql',
  proto: 'protobuf',
}
const byName: Record<string, string> = {
  dockerfile: 'dockerfile',
  makefile: 'makefile',
  '.gitignore': 'gitignore',
  '.dockerignore': 'gitignore',
  '.npmignore': 'gitignore',
  '.gitattributes': 'gitattributes',
  '.editorconfig': 'ini',
  '.npmrc': 'ini',
}
/** guesses a Markdown code fence language from a file path; returns an empty string if unknown */
export const getFileLanguage = (file: string) => {
  const name = file.split(/[/\\]/).at(-1)?.toLowerCase() ?? ''
  if (byName[name]) {
    return byName[name]
  }
  if (name === '.env' || name.startsWith('.env.')) {
    return 'dotenv'
  }
  const extension = name.includes('.') ? name.split('.').at(-1)! : ''
  return byExtension[extension] ?? ''
}
