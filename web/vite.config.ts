/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base './' keeps every asset and data path relative, so the same build works on GitHub Pages
// (https://<user>.github.io/jangada-orbital/) and on any local static server.
export default defineConfig({
  base: './',
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
})
