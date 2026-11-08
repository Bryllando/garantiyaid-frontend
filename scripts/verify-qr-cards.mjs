import assert from 'node:assert/strict'
import { mkdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium, expect } from '@playwright/test'
import { createServer } from 'vite'

// Synthetic credentials only. Never use live tokens in screenshots or PDF fixtures.
const output = resolve('../output/qr-cards')
await mkdir(output, { recursive: true })
const vite = await createServer({ cacheDir: '../tmp/qr-cards-vite', server: { host: '127.0.0.1', port: 0 } })
await vite.listen()
let browser
try {
  browser = await chromium.launch({ headless: true, channel: 'chrome' })
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  page.setDefaultTimeout(10000)
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.addInitScript(() => {
    sessionStorage.setItem('garantiyaid.accessToken', 'synthetic-qr-layout')
    sessionStorage.setItem('garantiyaid.user', JSON.stringify({ userId: 'test-admin', role: 'SYSTEM_ADMIN', fullName: 'Test Administrator' }))
    window.printCalls = 0
    window.print = () => { if (window.failPrint) throw new Error('Print unavailable'); window.printCalls++ }
    Object.defineProperty(navigator.clipboard, 'writeText', { value: async text => {
      if (window.failCopy) throw new Error('Clipboard unavailable')
      window.copiedTokens = text
    } })
    const decode = Image.prototype.decode
    Image.prototype.decode = async function () {
      if (window.failPdf) throw new Error('Synthetic PDF image failure')
      if (window.holdPdf) await new Promise(resolve => { window.releasePdf = () => { window.holdPdf = false; resolve() } })
      return decode.call(this)
    }
  })
  const pagination = { page: 1, totalPages: 1, total: 0 }
  const program = { programId: 'program-1', programName: 'Synthetic assistance', programCode: 'TEST-ONLY', status: 'ACTIVE', grantAmount: '1000' }
  const barangay = { barangayId: 'barangay-1', barangayName: 'Synthetic Barangay', city: 'Test City' }
  const event = { distributionId: 'event-1', title: 'Synthetic community distribution', status: 'OPEN', program, barangay, distributionDate: '2099-11-11', startTime: '08:00', endTime: '12:00', location: 'Synthetic Barangay Hall', verificationRequirement: 'QR', deliveryMode: 'PHYSICAL_GOODS', packageName: 'Food pack', packageUnit: 'pack', packageQuantity: 1 }
  let tokens = [], issued = false
  await page.route('**/socket.io/**', route => route.abort())
  await page.routeWebSocket(/socket\.io/, () => {})
  await page.route('**/api/v1/**', async route => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1', '')
    let data
    if (route.request().method() !== 'GET') {
      assert.equal(path, '/distributions/event-1/qr-tokens/generate')
      issued = true
      return route.fulfill({ status: 201, json: { data: { qrTokens: tokens, summary: { generatedTokenCount: tokens.length, rawTokensReturnedOnce: true } } } })
    }
    if (path === '/health') data = { timestamp: new Date().toISOString() }
    else if (path === '/staff-notifications') data = { notifications: [], unreadCount: 0 }
    else if (path === '/programs') data = { programs: [program], pagination }
    else if (path === '/barangays') data = { barangays: [barangay] }
    else if (path === '/distributions') data = { distributions: [event], pagination: { ...pagination, total: 1 } }
    else if (path === '/distributions/event-1') data = { distribution: event }
    else if (path.endsWith('/slots')) data = { slots: [], summary: { matchingSlotCount: 0, matchingCapacity: 0, sessionCount: 0 }, pagination }
    else if (path.endsWith('/allocations')) data = { allocations: [], summary: { countsByStatus: {}, totalAmount: '0' }, pagination }
    else if (path.endsWith('/schedules')) data = { schedules: [], summary: { countsByStatus: {}, matchingScheduleCount: 0 }, pagination }
    else if (path.endsWith('/qr-eligible-schedules')) data = { schedules: [], summary: { qrEligibleScheduleCount: issued ? 0 : tokens.length } }
    else if (path.endsWith('/qr-tokens')) data = { qrTokens: [], summary: { matchingTokenCount: issued ? tokens.length : 0 } }
    else if (path.endsWith('/eligible-enrollments')) data = { enrollments: [], summary: { serviceAreas: [], unspecifiedServiceAreaCount: 0 }, pagination }
    else if (path.endsWith('/claims')) data = { claims: [], summary: { countsByStatus: {} }, pagination }
    else if (path.endsWith('/claim-disputes')) data = { disputes: [], summary: { countsByStatus: {} }, pagination }
    else if (path.endsWith('/reconciliation')) return route.fulfill({ status: 503, json: { error: { message: 'Synthetic unrelated review unavailable' } } })
    else if (path === '/notifications/summary') data = { total: 0, byStatus: {} }
    else throw new Error(`Unhandled fixture: ${path}`)
    await route.fulfill({ json: { data } })
  })
  const dialog = page.getByRole('dialog', { name: 'Save beneficiary QR cards' })
  const done = () => dialog.getByRole('button', { name: 'Done', exact: true })
  async function open(count, long = false, formulaName = false, unicodeName = false) {
    issued = false
    event.title = long ? 'Synthetic distribution '.repeat(9).slice(0, 200) : 'Synthetic community distribution'
    event.location = long ? 'Synthetic community venue '.repeat(11).slice(0, 255) : 'Synthetic Barangay Hall'
    tokens = Array.from({ length: count }, (_, index) => ({
      qrTokenId: `synthetic-qr-${index}`, beneficiaryId: `person-${index}`,
      beneficiary: { firstName: long ? `Synthetic${index} ${'Longname '.repeat(10)}` : `Synthetic${index}`, middleName: long ? 'Middlename '.repeat(9) : 'Test', lastName: long ? 'Familyname '.repeat(9) : 'Recipient' },
      token: `gya1_qr_SYNTHETIC_ONLY_${index}_${'xZ4'.repeat(10)}`, expiresAt: '2099-11-11T04:40:00Z',
    }))
    if (formulaName) tokens[0].beneficiary.firstName = '=Synthetic "Quoted", Name'
    if (unicodeName) Object.assign(tokens[0].beneficiary, { firstName: 'Jos\u00e9', middleName: '\u674e', lastName: 'Dela Pe\u00f1a' })
    await page.goto(`http://127.0.0.1:${vite.httpServer.address().port}/distributions/manage?event=event-1&stage=launch`)
    await page.getByRole('button', { name: 'Generate remaining QR credentials' }).click()
    await expect(dialog).toBeVisible()
    await expect(dialog.locator('.ga-qr-card')).toHaveCount(count)
    await expect(dialog.getByRole('button', { name: 'Download PDF', exact: true })).toBeFocused()
    await expect(done()).toBeDisabled()
  }
  async function printPdf(name) {
    const viewport = page.viewportSize()
    await page.setViewportSize({ width: 794, height: 1123 })
    await page.emulateMedia({ media: 'print' })
    assert.equal(await page.locator('dialog[aria-labelledby="qr-credentials-title"]').evaluate(element => getComputedStyle(element).display), 'none', 'Modal and dashboard must not enter the print layout')
    assert.equal(await page.locator('[data-qr-print-root]').evaluate(element => getComputedStyle(element).display), 'block')
    const metrics = await page.locator('[data-qr-print-root] .ga-qr-card').evaluateAll(cards => cards.map(card => {
      const svg = card.querySelector('.ga-qr-card-code svg')
      return { fits: card.scrollWidth <= card.clientWidth, qrWidth: svg.getBoundingClientRect().width, border: getComputedStyle(card).borderStyle }
    }))
    assert.ok(metrics.every(card => card.fits && card.qrWidth >= 143 && card.border === 'solid'), JSON.stringify(metrics))
    await page.pdf({ path: resolve(output, `${name}.pdf`), preferCSSPageSize: true, printBackground: false, displayHeaderFooter: false })
    await page.emulateMedia({ media: 'screen' })
    await page.setViewportSize(viewport)
  }
  async function backupOptions() {
    const options = dialog.locator('details')
    if ((await options.getAttribute('open')) === null) await options.locator('summary').click()
  }
  async function downloadPdf(name, hold = false) {
    const download = page.waitForEvent('download')
    if (hold) {
      await page.evaluate(() => { window.holdPdf = true })
      await dialog.getByRole('button', { name: 'Download PDF', exact: true }).evaluate(button => { button.click(); button.click() })
      await expect(dialog.getByRole('button', { name: 'Preparing PDF...' })).toBeDisabled()
      await expect(dialog.getByRole('button', { name: 'Print QR cards' })).toBeDisabled()
      await page.keyboard.press('Escape')
      await expect(dialog).toBeVisible()
      await expect.poll(() => page.evaluate(() => typeof window.releasePdf)).toBe('function')
      await page.evaluate(() => window.releasePdf())
    } else await dialog.getByRole('button', { name: 'Download PDF', exact: true }).click()
    const file = await download
    assert.equal(file.suggestedFilename(), 'garantiyaid-qr-cards.pdf')
    await file.saveAs(resolve(output, `${name}-download.pdf`))
    const bytes = await readFile(await file.path())
    assert.equal(bytes.subarray(0, 4).toString(), '%PDF')
    assert.ok(bytes.length < 500000, 'Compact QR-card PDFs should remain small without reducing the QR size')
    await expect(done()).toBeEnabled()
    console.log(`${name}: downloaded PDF ${Math.round(bytes.length / 1024)} KB`)
  }

  await open(1)
  await page.keyboard.press('Escape')
  await expect(dialog).toBeVisible()
  await expect(done()).toBeDisabled()
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 })
    const fits = await dialog.evaluate(element => element.scrollWidth <= element.clientWidth && element.getBoundingClientRect().right <= innerWidth)
    assert.ok(fits, `QR dialog must fit ${width}px`)
    assert.ok((await dialog.locator('.ga-qr-card-code svg').boundingBox()).width >= 200, 'On-screen QR is enlarged independently of its printed size')
    await expect(dialog.getByRole('button', { name: 'Download PDF', exact: true })).toBeInViewport()
    await expect(dialog.getByRole('button', { name: 'Print QR cards' })).toBeInViewport()
    assert.ok((await dialog.getByRole('button', { name: 'Print QR cards' }).boundingBox()).height <= 56, 'Mobile print action must remain compact and readable')
    await page.screenshot({ path: resolve(output, `single-${width}.png`) })
  }
  await page.evaluate(() => { window.failPrint = true })
  await dialog.getByRole('button', { name: 'Print QR cards' }).click()
  await expect(done()).toBeDisabled()
  await expect(dialog.getByRole('checkbox')).toHaveCount(0)
  await page.evaluate(() => { window.failPrint = false })
  await dialog.getByRole('button', { name: 'Print QR cards' }).click()
  assert.equal(await page.evaluate(() => window.printCalls), 1)
  await expect(done()).toBeDisabled()
  await expect(dialog.getByRole('checkbox')).not.toBeChecked()
  await printPdf('single')
  await page.evaluate(() => { window.failPdf = true })
  await dialog.getByRole('button', { name: 'Download PDF', exact: true }).click()
  await expect(dialog.getByRole('alert')).toContainText('PDF could not be downloaded')
  await expect(done()).toBeDisabled()
  await page.evaluate(() => { window.failPdf = false })
  await downloadPdf('single', true)
  await dialog.getByRole('checkbox').check()
  await done().click()
  await expect(dialog).toHaveCount(0)
  await expect(page.locator('[data-qr-print-root]')).toHaveCount(0)

  for (const count of [5, 9]) {
    await open(count)
    await page.setViewportSize({ width: 1440, height: 1000 })
    await page.screenshot({ path: resolve(output, `batch-${count}.png`) })
    // Printing from a scrolled modal still includes the entire batch.
    await dialog.locator('.ga-qr-card').last().scrollIntoViewIfNeeded()
    await printPdf(`batch-${count}`)
    await backupOptions()
    await page.evaluate(() => { window.failCopy = true })
    await dialog.getByRole('button', { name: 'Copy tokens', exact: true }).click()
    await expect(done()).toBeDisabled()
    await page.evaluate(() => { window.failCopy = false })
    await downloadPdf(`batch-${count}`)
    await dialog.getByRole('button', { name: 'Copy tokens', exact: true }).click()
    await expect(done()).toBeEnabled()
    assert.equal(await page.evaluate(() => window.copiedTokens.split('\n').length), count)
    await done().click()
  }
  await open(5, true)
  await printPdf('long-details')
  await downloadPdf('long-details')
  await page.setViewportSize({ width: 320, height: 900 })
  await page.screenshot({ path: resolve(output, 'long-details-320.png') })
  const download = page.waitForEvent('download')
  await backupOptions()
  await dialog.getByRole('button', { name: 'Save CSV', exact: true }).click()
  const csv = await download
  assert.equal(csv.suggestedFilename(), 'garantiyaid-qr-tokens.csv')
  await expect(done()).toBeEnabled()
  await done().click()
  await expect(page.locator('[data-qr-print-root]')).toHaveCount(0)
  await open(1, false, true)
  const safeDownload = page.waitForEvent('download')
  await backupOptions()
  await dialog.getByRole('button', { name: 'Save CSV', exact: true }).click()
  const csvText = await readFile(await (await safeDownload).path(), 'utf8')
  assert.ok(csvText.includes('"\'=Synthetic ""Quoted"", Name Test Recipient"'), 'CSV names must escape quotes and prevent spreadsheet formulas')
  assert.ok(csvText.includes(tokens[0].token), 'Export preserves the exact credential')
  await done().click()
  await open(1, false, false, true)
  await downloadPdf('unicode-name')
  await done().click()
  assert.deepEqual(errors, [])
  console.log('Enlarged previews, compact direct PDF downloads, Unicode names, print isolation, errors, double-click protection, backups and cleanup passed. Nine synthetic PDFs written for page and QR verification.')
} finally {
  await browser?.close()
  await vite.close()
}
