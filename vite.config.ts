import type {UserConfig} from 'vite'

import babelPlugin from '@rolldown/plugin-babel'
import reactPlugin, {reactCompilerPreset} from '@vitejs/plugin-react'
import postcssAutoprefixer from 'autoprefixer'
import postcssNormalize from 'postcss-normalize'
import {defineConfig} from 'vite'
import mediaMixinsPlugin from 'vite-plugin-media-mixins'

const getSchemeMixin = (scheme: 'dark' | 'light') => {
  const opposite = scheme === 'dark' ? 'light' : 'dark'
  return {body: [`:root[data-${scheme}] & {`, '  @content;', '}', `@media (prefers-color-scheme: ${scheme}) {`, `  :root:not([data-${opposite}]) & {`, '    @content;', '}', '}']}
}
const csp = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; frame-src 'none'; base-uri 'self'; form-action 'none'"

export default defineConfig(({mode}) => ({
  base: './',
  plugins: [
    reactPlugin(),
    babelPlugin({presets: [reactCompilerPreset()]}),
    mediaMixinsPlugin({additionalMixins: {
      light: getSchemeMixin('light'),
      dark: getSchemeMixin('dark'),
    }}),
    {
      name: 'aubit-production-policy',
      transformIndexHtml: {
        order: 'post',
        handler: () => (mode === 'production' ? [{
          tag: 'meta',
          attrs: {
            'http-equiv': 'Content-Security-Policy',
            content: csp,
          },
          injectTo: 'head-prepend',
        }] : []),
      },
    },
  ],
  css: {postcss: {plugins: [postcssNormalize() as unknown as import('postcss').Plugin, postcssAutoprefixer()]}},
  build: {
    target: 'chrome154',
    outDir: mode === 'development' ? 'out/build/development' : 'dist',
    minify: 'oxc',
    reportCompressedSize: false,
    // Monacozen's editor/language/worker chunks intentionally exceed the default threshold.
    chunkSizeWarningLimit: 5000,
    rolldownOptions: {output: {codeSplitting: {groups: [{
      name: 'react',
      test: /[/\\]node_modules[/\\]react(-dom)?[/\\]/,
      priority: 2,
    }]}}},
  },
} satisfies UserConfig))
