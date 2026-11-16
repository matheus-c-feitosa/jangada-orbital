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
  await expect(page.getByRole('heading', { level: 1, name: 'Ceará' })).toBeVisible()
  await page.getByRole('checkbox', { name: 'Compare Pará' }).check()
  await page.getByRole('tab', { name: /so far$/ }).click()
  await expect(page.getByRole('heading', { level: 2, name: 'Compared, per 1,000 km²' })).toBeVisible()
})

test('the map opens on fire recurrence and shows this year against normal with a legend', async ({ page }) => {
  await page.goto('./')
  await expect(page.getByLabel('Map legend')).toContainText(/Years with fire, \d{4}–\d{4}/, { timeout: 30_000 })
  await page.getByRole('radio', { name: 'This year vs normal' }).check()
  await expect(page.getByLabel('Map legend')).toContainText(/\d{4} so far vs \d{4}–\d{4}, same date/)
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
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Method' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'How the harmonized calendar is made' })).toBeVisible()
})

test('the Method page shows the yearly totals chart and its table', async ({ page }) => {
  await page.goto('./#why')
  const why = page.getByRole('region', { name: 'Yearly totals since 2012' })
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
  // The design's map needs no outside host (the basemap is opt-in); the drawing tools load once the map is idle.
  await expect(page.locator('.maplibregl-canvas')).toBeVisible()
  await page.getByRole('combobox', { name: 'Area' }).selectOption('drawn')
  await page.getByRole('button', { name: 'Rectangle' }).click()
  await expect(page.locator('[data-drawing-ready]')).toBeAttached({ timeout: 15_000 })
  const box = (await page.locator('.maplibregl-canvas').boundingBox())!
  const cx = box.x + box.width / 2
  const cy = box.y + box.height / 2
  await page.mouse.click(cx - 30, cy - 30)
  await page.mouse.move(cx + 30, cy + 30, { steps: 5 })
  await page.mouse.click(cx + 30, cy + 30)
  await expect(page.getByRole('heading', { level: 1, name: /^Drawn area/ })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText(/grid cells/)).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole('table', { name: /Fire detections per month/ })).toBeVisible()
  // the drawn outline is in the link: a reload (or a shared link) opens the same area
  await expect(page).toHaveURL(/\?a=p:-?\d/)
  const cells = await page.getByText(/grid cells/).innerText()
  await page.reload()
  await expect(page.getByRole('heading', { level: 1, name: /^Drawn area/ })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText(/grid cells/)).toHaveText(cells, { timeout: 30_000 })
})

test('the calendar names the busiest periods, shows the range of estimates and saves as an image', async ({ page }) => {
  await page.goto('./')
  const peaks = page.getByRole('region', { name: /^Busiest periods, 2001 to/ })
  await expect(peaks).toBeVisible({ timeout: 30_000 })
  await expect(peaks.getByText('Busiest year')).toBeVisible()
  await expect(peaks.getByText('Highest month')).toBeVisible()
  await expect(peaks.getByText('Usually busiest months')).toBeVisible()
  // converted months are estimates and carry their range; observed Aqua months do not
  const calendar = page.getByRole('table', { name: /Fire detections per month/ })
  await expect(calendar.getByRole('button', { name: /^Jan 2024: about .+, likely .+ to / })).toHaveCount(1)
  await expect(calendar.getByRole('button', { name: /^Jan 2010: \d/ })).toHaveCount(1)
  await expect(page.locator('p[aria-live="polite"]').first()).toContainText('≈')
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download image' }).click()
  expect((await download).suggestedFilename()).toMatch(/^jangada-orbital-calendar_brazil_2001-\d{4}\.png$/)
})

test('a shared link reopens the area, the satellite and the years', async ({ page }) => {
  await page.goto('./?a=uf:PA&v=obs:NOAA-20&y=2010-2020')
  await expect(page.getByRole('heading', { level: 1, name: 'Pará' })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole('button', { name: 'Observed' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('combobox', { name: 'Satellite' })).toHaveValue('NOAA-20')
  await expect(page.getByRole('combobox', { name: 'From year', exact: true })).toHaveValue('2010')
  await expect(page.getByRole('combobox', { name: 'To year', exact: true })).toHaveValue('2020')
  await expect(page.getByRole('table', { name: /as observed by NOAA-20/ })).toBeAttached()
})

test('on desktop, a municipality is found without accents and picked with the keyboard alone', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('combobox', { name: 'Area' }).selectOption('muni', { timeout: 30_000 })
  const search = page.getByRole('combobox', { name: 'Municipality' })
  await search.fill('crato')
  await expect(page.getByRole('option', { name: 'Crato, CE' })).toBeVisible({ timeout: 30_000 })
  await search.fill('sao paulo')
  // the name itself comes first, before São Paulo das Missões and the others
  await expect(page.getByRole('listbox', { name: 'Municipality' }).getByRole('option').first()).toHaveText('São Paulo, SP')
  await search.press('ArrowDown')
  await expect(search).toHaveAttribute('aria-activedescendant', 'muni-opt-0')
  await search.press('Enter')
  await expect(page.getByRole('heading', { level: 1, name: 'São Paulo, SP' })).toBeVisible({ timeout: 30_000 })
  await expect(page).toHaveURL(/\?a=m:3550308$/)
})

test('a municipality with islands counts all its parts', async ({ page }) => {
  // Cajapió (MA): three parts; the largest one alone leaves out about a third of the area
  await page.goto('./?a=m:2102408')
  await expect(page.getByRole('heading', { level: 1, name: 'Cajapió, MA' })).toBeVisible({ timeout: 30_000 })
  const about = await page.getByText(/grid cells of about 11 km/).innerText({ timeout: 30_000 })
  const km2 = Number(about.match(/^([\d,]+) km²/)![1].replaceAll(',', ''))
  // the published outlines: about 528 km² for the three parts, about 350 for the largest one alone
  expect(km2).toBeGreaterThan(450)
})

test('a shared municipality link loads its outline', async ({ page }) => {
  await page.goto('./?a=m:2304400')
  await expect(page.getByRole('heading', { level: 1, name: 'Fortaleza, CE' })).toBeVisible({ timeout: 30_000 })
  await expect(page).toHaveURL(/\?a=m:2304400$/)
})

test('a tampered link falls back to Brazil without errors', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('./?a=uf:XX&v=obs:Landsat&y=1990-abc')
  await expect(page.getByRole('heading', { level: 1, name: 'Brazil' })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole('button', { name: 'Harmonized' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page).toHaveURL(/jangada-orbital\/?$|127\.0\.0\.1:\d+\/$/)
  expect(errors).toEqual([])
})

test('the view is in the URL and the share buttons send it', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.goto('./')
  await page.getByRole('combobox', { name: 'Area' }).selectOption('state', { timeout: 30_000 })
  await page.getByRole('combobox', { name: 'State', exact: true }).selectOption('CE')
  await expect(page.getByRole('heading', { level: 1, name: 'Ceará' })).toBeVisible()
  await expect(page).toHaveURL(/\?a=uf:CE$/)
  const whatsapp = page.getByRole('link', { name: /WhatsApp/ })
  const href = decodeURIComponent((await whatsapp.getAttribute('href'))!)
  // #5: area, this month, its ratio to the usual pace, unusual or not, then the link, under 300 characters
  expect(href).toMatch(/^https:\/\/wa\.me\/\?text=Ceará: [A-Z][a-z]{2} \d{4} so far: .+, \d+\.\d× the usual pace, (unusual|not above the usual range)/)
  expect(href).toContain('?a=uf:CE')
  expect(href.slice('https://wa.me/?text='.length).length).toBeLessThanOrEqual(300)
  await page.getByRole('button', { name: 'Copy link' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Link copied' })).toBeVisible()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/\?a=uf:CE$/)
})

test('the printed report holds the area, the calendar, the season and the sources on at most two A4 pages', async ({ page }) => {
  await page.goto('./')
  await expect(page.getByRole('button', { name: 'Download CSV' })).toBeEnabled({ timeout: 30_000 })
  // headless Chromium has no print dialog: the button's window.print() only fires beforeprint here
  await page.evaluate(() => { window.print = () => { window.dispatchEvent(new Event('beforeprint')) } })
  await page.getByRole('button', { name: 'Print report' }).click()
  await page.emulateMedia({ media: 'print' })
  const report = page.getByRole('article', { name: 'Fire report, Brazil' })
  await expect(report).toBeVisible()
  await expect(report.getByRole('table', { name: /Fire detections per month/ })).toBeVisible()
  await expect(report.getByRole('heading', { name: 'Fire-season rhythm' })).toBeVisible()
  await expect(report.getByText(/Source: NASA FIRMS/)).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await expect(page.getByRole('button', { name: 'Download CSV' })).toBeHidden()
  const pdf = await page.pdf({ format: 'A4', printBackground: true })
  expect((pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length).toBeLessThanOrEqual(2)
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')))
  await page.emulateMedia({ media: 'screen' })
  await expect(report).toHaveCount(0)
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
})

test('an area smaller than one grid cell uses the cell around it and says so', async ({ page }) => {
  await page.goto('./')
  await expect(page.getByRole('button', { name: 'Download CSV' })).toBeEnabled({ timeout: 30_000 })
  await page.getByRole('combobox', { name: 'Area' }).selectOption('drawn')
  // a 5 km circle on a cell corner near Crato (CE): the nearest 0.1° cell centres are about 7.9 km away
  await page.getByRole('textbox', { name: 'Latitude' }).fill('-7.20')
  await page.getByRole('textbox', { name: 'Longitude' }).fill('-39.40')
  await page.getByRole('textbox', { name: 'Radius in km' }).fill('5')
  await page.getByRole('button', { name: /Use lat, lon, radius/ }).click()
  await expect(page.getByRole('status').filter({ hasText: 'smaller than one 0.1° grid cell' })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText(/outside Brazil/)).toHaveCount(0)
  await expect(page.getByRole('table', { name: /Fire detections per month/ })).toBeVisible()
})

test('coming back from the Method page keeps the same map and the open tab', async ({ page }) => {
  await page.goto('./')
  await expect(page.locator('.maplibregl-canvas')).toBeVisible({ timeout: 30_000 })
  await page.getByRole('tab', { name: 'Season' }).click()
  await page.locator('.maplibregl-canvas').evaluate((c) => { (c as HTMLCanvasElement & { mark?: number }).mark = 42 })
  await page.getByRole('link', { name: 'Method', exact: true }).click()
  await expect(page.locator('.maplibregl-canvas')).toBeHidden()
  await page.getByRole('link', { name: 'Calendar', exact: true }).click()
  await expect(page.locator('.maplibregl-canvas')).toBeVisible()
  expect(await page.locator('.maplibregl-canvas').evaluate((c) => (c as HTMLCanvasElement & { mark?: number }).mark)).toBe(42)
  await expect(page.getByRole('tab', { name: 'Season' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.locator('.maplibregl-canvas')).toHaveCount(1)
})

test('drawing a polygon on the map loads that area', async ({ page }) => {
  await page.goto('./')
  await expect(page.getByRole('button', { name: 'Download CSV' })).toBeEnabled({ timeout: 30_000 })
  await expect(page.locator('.maplibregl-canvas')).toBeVisible()
  await page.getByRole('combobox', { name: 'Area' }).selectOption('drawn')
  await page.getByRole('button', { name: 'Polygon' }).click()
  await expect(page.locator('[data-drawing-ready]')).toBeAttached({ timeout: 15_000 })
  const box = (await page.locator('.maplibregl-canvas').boundingBox())!
  const cx = box.x + box.width / 2
  const cy = box.y + box.height / 2
  // three corners, then a click on the first one closes the polygon
  for (const [dx, dy] of [[-40, -30], [40, -30], [0, 40]]) await page.mouse.click(cx + dx, cy + dy)
  await page.mouse.click(cx - 40, cy - 30)
  await expect(page.getByRole('heading', { level: 1, name: /^Drawn area/ })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText(/grid cells/)).toBeVisible({ timeout: 30_000 })
})

test('the calendar is used with the keyboard alone', async ({ page }) => {
  await page.goto('./')
  const calendar = page.getByRole('table', { name: /Fire detections per month/ })
  await expect(calendar).toBeVisible({ timeout: 30_000 })
  // one tab stop: the selected month (the partial last month)
  const first = calendar.locator('button[tabindex="0"]')
  await expect(first).toHaveCount(1)
  await first.focus()
  await page.keyboard.press('Home')
  await expect(page.locator(':focus')).toHaveAttribute('aria-label', /^Jan \d{4}:/)
  await page.keyboard.press('ArrowUp')
  await page.keyboard.press('ArrowRight')
  await expect(page.locator(':focus')).toHaveAttribute('aria-label', /^Feb \d{4}:/)
  await page.keyboard.press('End')
  await expect(page.locator(':focus')).toHaveAttribute('aria-label', /^Dec \d{4}:/)
  // the readout follows the focused month
  const label = await page.locator(':focus').getAttribute('aria-label')
  await expect(page.locator('p[aria-live="polite"]').first()).toContainText(label!.slice(0, 8))
  await expect(calendar.locator('button[tabindex="0"]')).toHaveCount(1)
})

test('on a phone, the theme switches from the area sheet', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('./')
  await page.getByRole('button', { name: 'Map layers' }).click({ timeout: 30_000 })
  const sheet = page.getByRole('dialog', { name: 'Area and layers' })
  await sheet.getByRole('button', { name: 'Light' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await expect(sheet.getByRole('button', { name: 'Light' })).toHaveAttribute('aria-pressed', 'true')
  await sheet.getByRole('button', { name: 'Dark' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
})

test('on a phone, a municipality is found without typing its accents', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('./')
  await page.getByRole('button', { name: 'Map layers' }).click({ timeout: 30_000 })
  await page.getByRole('dialog', { name: 'Area and layers' }).getByRole('radio', { name: 'Municipality' }).click({ timeout: 30_000 })
  await page.getByRole('searchbox').fill('sao paulo')
  await expect(page.getByRole('button', { name: /^São Paulo, SP/ }).first()).toBeVisible()
})

test('on a phone, the area sheet picks a state and shows it on the map', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('./')
  await page.getByRole('button', { name: 'Area and layers' }).click()
  const sheet = page.getByRole('dialog', { name: 'Area and layers' })
  await expect(sheet).toBeVisible()
  await sheet.getByRole('radio', { name: 'State' }).click()
  const states = page.getByRole('dialog', { name: 'Choose a state' })
  await states.getByRole('radio', { name: /^Ceará/ }).check()
  await states.getByRole('button', { name: 'Show Ceará' }).click()
  await expect(states).toBeHidden()
  await expect(page.getByRole('heading', { level: 1, name: 'Ceará' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0)
})

test('on a phone, the observed values name their satellite', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('./')
  await page.getByRole('button', { name: 'Map layers' }).click({ timeout: 30_000 })
  const sheet = page.getByRole('dialog', { name: 'Area and layers' })
  await sheet.getByRole('button', { name: 'Observed' }).click()
  await sheet.getByRole('combobox', { name: 'Satellite' }).selectOption('NOAA-20')
  await expect(sheet.getByRole('combobox', { name: 'Satellite' })).toHaveValue('NOAA-20')
  await sheet.getByRole('button', { name: 'Harmonized' }).click()
  await expect(sheet.getByRole('combobox', { name: 'Satellite' })).toBeHidden()
})

test('on a phone, a biome is picked from its own list', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('./')
  await page.getByRole('button', { name: 'Map layers' }).click({ timeout: 30_000 })
  await page.getByRole('dialog', { name: 'Area and layers' }).getByRole('radio', { name: 'Biome' }).click()
  const biomes = page.getByRole('dialog', { name: 'Choose a biome' })
  await biomes.getByRole('radio', { name: /^Caatinga/ }).check()
  await biomes.getByRole('button', { name: 'Show Caatinga' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Caatinga' })).toBeVisible()
})

test('on a phone, the orange box is dragged by a corner and taken as the area', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('./')
  await expect(page.locator('.maplibregl-canvas')).toBeVisible({ timeout: 30_000 })
  await page.getByRole('button', { name: 'Map layers' }).click()
  await page.getByRole('dialog', { name: 'Area and layers' }).getByRole('radio', { name: 'Draw an area on the map' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Drag the corners of the orange box' })).toBeVisible()
  await expect(page.locator('[data-drawing-ready]')).toBeAttached({ timeout: 15_000 })
  // the box spans 30%–70% of the visible map; drag its lower-right corner further out
  const box = (await page.locator('.maplibregl-canvas').boundingBox())!
  const top = 80, bottom = box.height - 96 - 16
  const corner = { x: box.x + box.width * 0.7, y: box.y + top + (bottom - top) * 0.7 }
  await page.mouse.move(corner.x, corner.y)
  await page.mouse.down()
  await page.mouse.move(corner.x + 40, corner.y + 30, { steps: 6 })
  await page.mouse.up()
  await page.getByRole('button', { name: 'Use this area' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Drawn area' })).toBeVisible({ timeout: 30_000 })
})

test('the interface switches to Portuguese and remembers it', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('combobox', { name: 'Language' }).selectOption('pt')
  await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Calendário' })).toBeVisible()
  await expect(page.getByRole('tab', { name: /até agora$/ })).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('lang', 'pt-BR')
  await page.reload()
  await expect(page.getByRole('heading', { level: 1, name: 'Brasil' })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText(/até agora: [\d,]+ mil detecções/)).toBeVisible()
})

test('on a tablet, drawing closes the filters and the map shows how to draw and how to cancel', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 })
  await page.goto('./')
  await page.getByRole('button', { name: 'Area and layers' }).click({ timeout: 30_000 })
  const drawer = page.getByRole('dialog', { name: 'Area and layers' })
  await drawer.getByRole('combobox', { name: 'Area' }).selectOption('drawn')
  await drawer.getByRole('button', { name: 'Rectangle' }).click()
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
  const sheet = page.getByRole('dialog', { name: 'Area and layers' })
  await sheet.getByText('Or type a point and radius').click()
  await sheet.getByRole('button', { name: /Use lat, lon, radius/ }).click()
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
  await expect(page.getByRole('combobox', { name: 'Area' })).toBeVisible({ timeout: 30_000 })
  await page.getByRole('combobox', { name: 'Area' }).selectOption('biome')
  await page.getByRole('combobox', { name: 'Biome, IBGE limits' }).selectOption({ label: 'Pantanal' })
  await expect(page.getByRole('heading', { level: 1, name: 'Pantanal' })).toBeVisible()
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
