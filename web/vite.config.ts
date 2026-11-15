/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'node:url'

// base './' keeps every asset and data path relative, so the same build works on GitHub Pages
// (https://<user>.github.io/jangada-orbital/) and on any local static server.
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  // the map chunk is MapLibre (about 1 MB minified, 300 KB gzip); it loads next to the data, apart from the app
  build: { chunkSizeWarningLimit: 1200 },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
})
