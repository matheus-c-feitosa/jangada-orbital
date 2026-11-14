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
  // By role, not by CSS class: the markup is styled with Tailwind utilities.
  const calendar = page.getByRole('table', { name: /Fire detections per month/ })
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

test('drawing a rectangle on the map loads that area', async ({ page }) => {
  await page.goto('./')
  await expect(page.getByRole('button', { name: 'Download CSV' })).toBeEnabled({ timeout: 30_000 })
  // Outside hosts are blocked, so the map falls back to the offline style (~8 s) before drawing is ready.
  await expect(page.locator('.maplibregl-canvas')).toBeVisible()
  await page.waitForTimeout(9_000)
  await page.getByRole('button', { name: 'Rectangle' }).click()
  const box = (await page.locator('.maplibregl-canvas').boundingBox())!
  const cx = box.x + box.width / 2
  const cy = box.y + box.height / 2
  await page.mouse.click(cx - 30, cy - 30)
  await page.mouse.move(cx + 30, cy + 30, { steps: 5 })
  await page.mouse.click(cx + 30, cy + 30)
  await expect(page.getByRole('heading', { level: 1, name: /^Drawn area/ })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText(/grid cells/)).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole('table', { name: /Fire detections per month/ })).toBeVisible()
})

test('on a phone, the area sheet picks a state and closes', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('./')
  await page.getByRole('button', { name: 'Choose area' }).click()
  const sheet = page.getByRole('dialog', { name: 'Area and view' })
  await expect(sheet).toBeVisible()
  await sheet.getByRole('combobox', { name: 'Area' }).click()
  await page.getByRole('option', { name: 'Ceará' }).click()
  await expect(sheet).toBeHidden()
  await expect(page.getByRole('heading', { level: 1, name: 'Ceará, Brazil' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0)
})
