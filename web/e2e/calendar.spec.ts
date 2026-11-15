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

test('on a tablet, drawing closes the filters and the map shows how to draw and how to cancel', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 })
  await page.goto('./')
  await page.getByRole('button', { name: 'Area and layers' }).click({ timeout: 30_000 })
  await page.getByRole('dialog', { name: 'Area and layers' }).getByRole('button', { name: 'Rectangle' }).click()
  await expect(page.getByRole('dialog', { name: 'Area and layers' })).toBeHidden()
  const hint = page.getByRole('status').filter({ hasText: 'Tap two opposite corners on the map.' })
  await expect(hint).toBeVisible()
  await hint.getByRole('button', { name: 'Cancel' }).click()
  await expect(hint).toBeHidden()
  await expect(page.getByRole('button', { name: 'Area and layers' })).toBeVisible()
})

test('on a phone, an area that fails to load says so instead of loading forever', async ({ page }) => {
  await page.route('**/data/tiles/**', (route) => route.abort())
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('./')
  await page.getByRole('button', { name: 'Area and layers' }).first().click({ timeout: 30_000 })
  await page.getByRole('dialog', { name: 'Area and layers' }).getByRole('button', { name: /Use lat, lon, radius/ }).click()
  await expect(page.getByRole('alert').filter({ hasText: 'Could not load this area' })).toBeVisible()
  await page.getByRole('button', { name: 'Fire calendar' }).click()
  await expect(page.getByRole('alert').filter({ hasText: 'Could not load this area' })).toBeVisible()
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

test('a biome is an area and the new map layers show their legends', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('combobox', { name: 'Area' }).click({ timeout: 30_000 })
  await page.getByRole('option', { name: 'Pantanal' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Pantanal (biome)' })).toBeVisible()
  await expect(page.getByRole('table', { name: /Fire detections per month/ })).toBeVisible()
  await page.getByRole('radio', { name: /Fire recurrence/ }).check()
  await expect(page.getByLabel('Map legend')).toContainText(/Years with fire, \d{4}–\d{4}/)
  await page.getByRole('radio', { name: /Detections, last 7 days/ }).check()
  await expect(page.getByLabel('Map legend')).toContainText('Detections, last 7 days')
})

test('biomes and municipalities can be ranked, and a municipality loads as an area', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('tab', { name: 'Ranking' }).click()
  await page.getByRole('group', { name: 'Rank' }).getByRole('button', { name: 'Biomes' }).click()
  await expect(page.getByRole('table', { name: /^Biomes by/ }).getByRole('row')).toHaveCount(7, { timeout: 30_000 })
  await page.getByRole('group', { name: 'Rank' }).getByRole('button', { name: 'Municipalities' }).click()
  const first = page.getByRole('table', { name: /^Municipalities by/ }).getByRole('button', { name: /^Select / }).first()
  const name = (await first.getAttribute('aria-label'))!.replace(/^Select /, '').replace(/ as the area$/, '')
  await first.click()
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible({ timeout: 30_000 })
})

test('municipalities with fewer than 20 detections do not lead the density ranking', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('tab', { name: 'Ranking' }).click()
  await page.getByRole('group', { name: 'Rank' }).getByRole('button', { name: 'Municipalities' }).click({ timeout: 30_000 })
  await page.getByRole('group', { name: 'Sort by' }).getByRole('button', { name: 'Per 1,000 km²' }).click()
  const first = page.getByRole('table', { name: /^Municipalities by/ }).getByRole('row').nth(1)
  const soFar = Number((await first.innerText()).match(/([\d,]+) so far/)![1].replaceAll(',', ''))
  expect(soFar).toBeGreaterThanOrEqual(20)
  await expect(page.getByText(/Fewer than 20 detections so far is a small sample/)).toBeVisible()
})

test('climate context marks El Niño and La Niña years, and the Season tab shows fire intensity', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('checkbox', { name: /Climate context/ }).check({ timeout: 30_000 })
  await expect(page.getByRole('rowheader', { name: /^2015.*El Niño year/ })).toBeVisible()
  // a year with both phases shows both, in order: El Niño early in 2010, La Niña from mid-year
  await expect(page.getByRole('rowheader', { name: /^2010.*El Niño, then La Niña year/ })).toBeVisible()
  // the marks fit in the year column instead of sliding under January
  const overflowing = await page.getByRole('table', { name: /Fire detections per month/ }).evaluate((t) =>
    [...t.querySelectorAll('tbody th[scope="row"]')].filter((th) => [...th.querySelectorAll('span[title] > span:not(.sr-only)')]
      .some((mark) => mark.getBoundingClientRect().right > th.getBoundingClientRect().right + 0.5)).length)
  expect(overflowing).toBe(0)
  await page.getByRole('tab', { name: 'Season' }).click()
  await expect(page.getByRole('heading', { level: 2, name: 'Fire intensity and night fires' })).toBeVisible()
})

test('the Method page shows the overpass drift and the validation scatter', async ({ page }) => {
  await page.goto('./#method')
  await expect(page.getByRole('heading', { level: 2, name: 'Aqua and Terra drifted off their usual hour' })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole('img', { name: /Predicted against observed Aqua detections/ })).toBeVisible()
  await expect(page.getByRole('img', { name: /Monthly ratio of NOAA-20/ })).toBeVisible()
})
