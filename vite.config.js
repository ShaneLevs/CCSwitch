import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { build as esbuildBuild } from 'esbuild'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function bundlePreloadPlugin() {
  const buildPreload = async () => {
    const outDir = path.resolve(__dirname, 'dist/preload')
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true })
    await esbuildBuild({
      entryPoints: [path.resolve(__dirname, 'public/preload/services.js')],
      bundle: true,
      platform: 'node',
      target: 'node18',
      outfile: path.join(outDir, 'services.js'),
      format: 'cjs',
      allowOverwrite: true,
      logLevel: 'info',
    })
  }
  return {
    name: 'bundle-preload',
    async buildStart() { await buildPreload() },
    async closeBundle() { await buildPreload() },
    async configureServer(server) {
      await buildPreload()
      const watcher = server.watcher
      watcher.add(path.resolve(__dirname, 'public/preload/**'))
      watcher.on('change', async (file) => {
        if (file.includes('public\\preload\\') || file.includes('public/preload/')) {
          console.log('[preload] 文件变动，重新构建...')
          await buildPreload()
        }
      })
    },
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
