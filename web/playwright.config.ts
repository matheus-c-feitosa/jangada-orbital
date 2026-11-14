import { defineConfig, devices } from '@playwright/test'

// End-to-end tests run against the BUILT static site (`vite preview`), or against PREVIEW_URL when set
// (for example the GitHub Pages address). There is no backend: the site reads public/data/ as static files.
export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  use: {
    baseURL: process.env.PREVIEW_URL ?? 'http://127.0.0.1:4173',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: process.env.PREVIEW_URL
    ? undefined
    : {
        command: 'npm run build && npm run preview -- --host 127.0.0.1 --port 4173 --strictPort',
        url: 'http://127.0.0.1:4173',
        reuseExistingServer: true,
        timeout: 180_000,
      },
})
