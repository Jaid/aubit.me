import type {UserConfig} from 'vite'

import babelPlugin from '@rolldown/plugin-babel'
import reactPlugin, {reactCompilerPreset} from '@vitejs/plugin-react'
import postcssAutoprefixer from 'autoprefixer'
import browserslist from 'browserslist'
import postcssNormalize from 'postcss-normalize'
import {defineConfig} from 'vite'

// Desktop and Android Chrome can be on different stable majors. Rolldown accepts one target per engine.
const chromiumMajor = Math.min(...browserslist().map(target => Number.parseInt(target.split(' ')[1], 10)))
const csp = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; frame-src 'none'; base-uri 'self'; form-action 'none'"

export default defineConfig(({mode}) => ({
  base: './',
  plugins: [
    reactPlugin(),
    babelPlugin({presets: [reactCompilerPreset()]}),
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
    target: `chrome${chromiumMajor}`,
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
