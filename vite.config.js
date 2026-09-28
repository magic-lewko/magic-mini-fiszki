// Vite: src/ -> dist/. The app lives on GitHub Pages in the folder /magic-mini-fiszki/, so base points there.
// The service worker (dist/sw.js) is added by build.mjs after the build, because it needs the full list of files with hashes.

import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

export const BASE = '/magic-mini-fiszki/'

export default defineConfig({
  root: fileURLToPath(new URL('./src', import.meta.url)),
  base: BASE,
  publicDir: 'public',
  plugins: [svelte()],
  build: {
    outDir: fileURLToPath(new URL('./dist', import.meta.url)),
    emptyOutDir: true,
    // Safari on iOS 16.4+ (badge on the icon, the haptic switch) - no newer syntax than what works there.
    target: ['es2020', 'safari16'],
    assetsInlineLimit: 0,
  },
  server: {
    host: '127.0.0.1',
    port: 4300,
  },
})
