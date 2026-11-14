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
  await expect(page.getByRole('heading', { level: 2, name: /so far$/ })).toBeVisible()
  await expect(page.getByRole('heading', { level: 2, name: 'Fire-season rhythm' })).toBeVisible()
  await expect(page.getByText(/detections per 1,000 km²/)).toBeVisible()
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

test('the Method page and its tables do not scroll sideways on a 360 px phone', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 })
  await page.goto('./#method')
  await expect(page.getByRole('heading', { level: 1, name: 'How the harmonized calendar is made' })).toBeVisible()
  await expect(page.getByRole('table', { name: '' }).first()).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0)
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
  await expect(page.getByText(/grid cells?/)).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole('table', { name: /Fire detections per month/ })).toBeVisible()
})

test('the busiest year and months are named above the calendar', async ({ page }) => {
  await page.goto('./')
  const peaks = page.getByRole('region', { name: /Busiest periods/ })
  await expect(peaks).toBeVisible({ timeout: 30_000 })
  await expect(peaks.getByText('Busiest year')).toBeVisible()
  await expect(peaks.getByText('Highest month')).toBeVisible()
  await expect(peaks.getByText('Usually busiest months')).toBeVisible()
})

test('a point in the open sea says there is no data instead of "no fires"', async ({ page }) => {
  await page.goto('./')
  await page.getByLabel('Latitude').fill('-25')
  await page.getByLabel('Longitude').fill('-30')
  await page.getByRole('button', { name: /Use lat, lon, radius/ }).click()
  await expect(page.getByText(/outside Brazil, so there is no fire data/)).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole('table', { name: /Fire detections per month/ })).toHaveCount(0)
})

test('a circle smaller than one grid cell still gets a calendar, marked approximate', async ({ page }) => {
  await page.goto('./')
  await page.getByLabel('Latitude').fill('-3.1')
  await page.getByLabel('Longitude').fill('-60')
  await page.getByLabel('Radius in km').fill('5')
  await page.getByRole('button', { name: /Use lat, lon, radius/ }).click()
  await expect(page.getByText(/1 grid cell \(area smaller than one cell: approximate\)/)).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole('table', { name: /Fire detections per month/ })).toBeVisible()
})

test('the skip link is the first tab stop and moves focus to the main content', async ({ page }) => {
  await page.goto('./')
  await expect(page.getByText('Loading fire history…')).toBeHidden({ timeout: 30_000 })
  await page.keyboard.press('Tab')
  const skip = page.getByRole('link', { name: 'Skip to main content' })
  await expect(skip).toBeFocused()
  await expect(skip).toBeInViewport()
  await page.keyboard.press('Enter')
  await expect(page.locator('#main')).toBeFocused()
  expect(new URL(page.url()).hash).toBe('') // the hash also selects the page, so the skip link must not touch it
})

test('Download image saves the calendar as a PNG', async ({ page }) => {
  await page.goto('./')
  const button = page.getByRole('button', { name: 'Download image' })
  await expect(button).toBeEnabled({ timeout: 30_000 })
  const [download] = await Promise.all([page.waitForEvent('download'), button.click()])
  expect(download.suggestedFilename()).toBe('jangada-orbital-calendar_brazil_2001-2026.png')
  const bytes = Buffer.concat(await (await download.createReadStream()).toArray())
  expect([...bytes.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) // PNG signature
  expect(bytes.length).toBeGreaterThan(20_000) // a drawn 880 px calendar, not an empty canvas
})

test('the FIRMS help gives the bounding box and dates for the raw hotspots', async ({ page }) => {
  await page.goto('./')
  await page.getByText('Need the individual hotspots?').click()
  await expect(page.getByText(/bounding box \(west, south, east, north\)/)).toBeVisible()
  await expect(page.getByRole('link', { name: 'NASA FIRMS' })).toHaveAttribute('href', 'https://firms.modaps.eosdis.nasa.gov/download/')
})

test('on desktop the map is large enough to draw on', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('./')
  const box = (await page.locator('.maplibregl-canvas').boundingBox())!
  expect(box.height).toBeGreaterThanOrEqual(440)
  expect(box.width).toBeGreaterThanOrEqual(340)
})

test('on a phone the view controls and the CSV are on the page, not inside the area sheet', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('./')
  await expect(page.getByRole('button', { name: 'Download CSV' })).toBeEnabled({ timeout: 30_000 })
  await expect(page.getByRole('button', { name: 'Download image' })).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0) // the sheet is closed
  await page.getByRole('radio', { name: 'Observed' }).click()
  await expect(page.getByRole('table', { name: /as delivered by Aqua/ })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0)
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
