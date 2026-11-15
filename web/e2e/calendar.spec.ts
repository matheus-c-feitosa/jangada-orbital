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
  await expect(page.getByRole('heading', { level: 2, name: 'Total per year' })).toBeVisible()
  await expect(page.getByText(/detections per 1,000 km²/)).toBeVisible()
  // the other views are tabs of the data column (new UI, spec 002)
  await page.getByRole('tab', { name: /so far$/ }).click()
  await expect(page.getByRole('heading', { level: 2, name: /so far$/ })).toBeVisible()
  await page.getByRole('tab', { name: 'Season' }).click()
  await expect(page.getByRole('heading', { level: 2, name: 'Fire-season rhythm' })).toBeVisible()
})

test('yearly totals show the conversion range in a table for screen readers', async ({ page }) => {
  await page.goto('./')
  const table = page.getByRole('table', { name: /Total detections per year/, includeHidden: true })
  await expect(table.getByRole('rowheader', { name: '2024', includeHidden: true })).toHaveCount(1, { timeout: 30_000 })
  await expect(table.getByRole('row', { name: /2024.*converted from VIIRS/, includeHidden: true })).toHaveCount(1)
  await expect(table.getByRole('row', { name: /2010.*observed by Aqua MODIS/, includeHidden: true })).toHaveCount(1)
})

test('the ranking lists the states and a row selects the area', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('tab', { name: 'Ranking' }).click()
  const table = page.getByRole('table', { name: /^States by/ })
  await expect(table.getByRole('row')).toHaveCount(11, { timeout: 30_000 })
  await page.getByRole('button', { name: 'Show all 27' }).click()
  await expect(table.getByRole('row')).toHaveCount(28)
  await page.getByRole('button', { name: 'Per 1,000 km²' }).click()
  await table.getByRole('button', { name: 'Select Ceará as the area' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Ceará, Brazil' })).toBeVisible()
  await page.getByRole('checkbox', { name: 'Compare Pará' }).check()
  await page.getByRole('tab', { name: /so far$/ }).click()
  await expect(page.getByRole('heading', { level: 2, name: 'Compared, per 1,000 km²' })).toBeVisible()
})

test('the map shows this year against normal with a legend', async ({ page }) => {
  await page.goto('./')
  await expect(page.getByLabel('Map legend')).toContainText('This year so far vs the same date in past years', { timeout: 30_000 })
  await page.getByRole('radio', { name: 'No data layer' }).check()
  await expect(page.getByLabel('Map legend')).toBeHidden()
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

test('"Why these numbers?" opens the harmonization chart and its table', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('link', { name: 'Why these numbers?' }).click({ timeout: 30_000 })
  const why = page.getByRole('region', { name: 'Why these numbers?' })
  await expect(why.getByRole('img', { name: /Yearly fire detections in Brazil/ })).toBeVisible()
  await expect(why.getByText(/VIIRS counts about \d+× more hotspots than Aqua/)).toBeVisible()
  await why.getByText('Show the numbers').click()
  const table = why.getByRole('table', { name: /Yearly fire detections in Brazil/ })
  await expect(table.getByRole('rowheader', { name: '2012' })).toBeVisible()
  await expect(table.getByRole('columnheader')).toHaveCount(4)
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
  await page.getByRole('button', { name: 'Area and layers' }).click()
  const sheet = page.getByRole('dialog', { name: 'Area and layers' })
  await expect(sheet).toBeVisible()
  await sheet.getByRole('combobox', { name: 'Area' }).click()
  await page.getByRole('option', { name: 'Ceará' }).click()
  await expect(sheet).toBeHidden()
  await expect(page.getByRole('heading', { level: 1, name: 'Ceará, Brazil' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0)
})

test('on a phone, the data drawer opens the calendar and every tab fits the width', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('./')
  await page.getByRole('button', { name: 'Fire calendar' }).click({ timeout: 30_000 })
  await expect(page.getByRole('table', { name: /Fire detections per month/ })).toBeVisible()
  for (const name of ['Calendar', /^\d{4}$/, 'Season', 'Ranking']) {
    await page.getByRole('tab', { name }).click()
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0)
  }
  await page.getByRole('button', { name: 'Back to the map' }).click()
  await expect(page.getByRole('button', { name: 'Fire calendar' })).toBeVisible()
})
