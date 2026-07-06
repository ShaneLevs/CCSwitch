import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { build as esbuildBuild } from 'esbuild'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function bundlePreloadPlugin() {
  return {
    name: 'bundle-preload',
    async closeBundle() {
      await esbuildBuild({
        entryPoints: [path.resolve(__dirname, 'public/preload/services.js')],
        bundle: true,
        platform: 'node',
        target: 'node18',
        outfile: path.resolve(__dirname, 'dist/preload/services.js'),
        format: 'cjs',
        allowOverwrite: true,
        logLevel: 'info',
      })
    }
  }
}

export default defineConfig({
  plugins: [
    vue(),
    bundlePreloadPlugin(),
    {
      name: 'remove-crossorigin',
      enforce: 'post',
      transformIndexHtml: {
        order: 'post',
        handler(html) {
          return html.replace(/ crossorigin/g, '')
        },
      },
    },
  ],
  base: './',
})
