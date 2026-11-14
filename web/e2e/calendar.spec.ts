import { test, expect } from '@playwright/test'

// Only the site itself may answer. The basemap (tiles.openfreemap.org) and any other outside host are
// blocked, so these tests pass offline and prove the calendar depends on nothing but our static files.
test.beforeEach(async ({ page, baseURL }) => {
  const own = new URL(baseURL!).origin
  await page.route('**/*', (route) =>
    new URL(route.request().url()).origin === own ? route.continue() : route.abort(),
  )
})

test('the calendar for Brazil loads from the static data files', async ({ page }) => {
  await page.goto('./')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(page.getByText('Loading fire history…')).toBeHidden({ timeout: 30_000 })
  const calendar = page.locator('table.cal')
  await expect(calendar).toBeVisible()
  await expect(calendar.getByRole('rowheader', { name: /^2001/ })).toBeVisible()
  await expect(calendar.getByRole('columnheader')).toHaveCount(12)
})

test('the CSV download holds the monthly series', async ({ page }) => {
  await page.goto('./')
  const button = page.getByRole('button', { name: 'Download CSV' })
  await expect(button).toBeEnabled({ timeout: 30_000 })
  const [download] = await Promise.all([page.waitForEvent('download'), button.click()])
  expect(download.suggestedFilename()).toMatch(/\.csv$/)
  const text = await (await download.createReadStream()).toArray()
  const lines = Buffer.concat(text).toString('utf-8').trim().split(/\r?\n/)
  expect(lines.length).toBeGreaterThan(12)
})

test('the Method page opens from the navigation', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Method' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'How the harmonized calendar is made' })).toBeVisible()
})
