import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium, expect } from '@playwright/test'
import { createServer } from 'vite'

const output = resolve('../output/distribution-alert-fix')
await mkdir(output, { recursive: true })
const vite = await createServer({ cacheDir: '../tmp/distribution-feedback-vite', server: { host: '127.0.0.1', port: 0, strictPort: false } })
await vite.listen()
let browser
const checks = []
try {
  browser = await chromium.launch({ headless: true, channel: 'chrome' })
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  page.setDefaultTimeout(10000)
  page.setDefaultNavigationTimeout(45000)
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.addInitScript(() => {
    sessionStorage.setItem('garantiyaid.accessToken', 'synthetic-layout-token')
    sessionStorage.setItem('garantiyaid.user', JSON.stringify({ userId: 'admin-1', role: 'SYSTEM_ADMIN', fullName: 'Synthetic Administrator', totpEnabled: true }))
  })
  const barangay = { barangayId: 'barangay-1', barangayName: 'Synthetic Barangay', city: 'Test City', isActive: true }
  const program = { programId: 'program-1', programName: 'Synthetic assistance', programCode: 'TEST-1', programType: 'CASH_ASSISTANCE', status: 'ACTIVE', grantAmount: '1500', budgetAmount: '150000' }
  const distribution = { distributionId: 'event-1', program, barangay, status: 'DRAFT' }
  let created = false
  await page.route('**/socket.io/**', route => route.abort())
  await page.routeWebSocket(/socket\.io/, () => {})
  await page.route('**/api/v1/**', async route => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1', '')
    let data = {}
    const pagination = { page: 1, totalPages: 1, total: 1 }
    if (path === '/programs') data = { programs: [program], pagination }
    else if (path === '/barangays') data = { barangays: [barangay] }
    else if (path === '/distributions' && route.request().method() === 'POST') {
      Object.assign(distribution, route.request().postDataJSON()); created = true
      return route.fulfill({ status: 201, json: { success: true, data: { distribution } } })
    } else if (path === '/distributions') data = { distributions: created ? [distribution] : [], pagination: { ...pagination, total: created ? 1 : 0 } }
    else if (path === '/distributions/event-1') data = { distribution }
    else if (path === '/distributions/event-1/slots') data = { slots: [], summary: { matchingSlotCount: 0, matchingCapacity: 0, sessionCount: 0 } }
    else if (path === '/distributions/event-1/allocations') data = { allocations: [], summary: { countsByStatus: {}, totalAmount: '0' }, pagination }
    else if (path === '/distributions/event-1/schedules') data = { schedules: [], summary: { countsByStatus: {}, matchingScheduleCount: 0 }, pagination }
    else if (path === '/distributions/event-1/eligible-enrollments') data = { enrollments: [], summary: { serviceAreas: [], unspecifiedServiceAreaCount: 0 }, pagination: { ...pagination, total: 0 } }
    else if (path === '/distributions/event-1/qr-eligible-schedules') data = { schedules: [], summary: { qrEligibleScheduleCount: 0 } }
    else if (path === '/distributions/event-1/qr-tokens') data = { qrTokens: [], summary: { matchingTokenCount: 0 } }
    else if (path === '/distributions/event-1/cancel') return route.fulfill({ status: 409, json: { error: { message: 'The event changed. Refresh the event before trying again.' } } })
    await route.fulfill({ json: { success: true, data } })
  })
  await page.goto(`http://127.0.0.1:${vite.httpServer.address().port}/distributions/manage`, { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: 'Create distribution', exact: true }).click()
  await page.locator('#distribution-program').selectOption(program.programId)
  await page.locator('#distribution-title').fill('Synthetic layout check')
  await page.locator('#distribution-date').fill(new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10))
  await page.locator('#distribution-barangay').selectOption(barangay.barangayId)
  await page.locator('#distribution-location').fill('Synthetic barangay hall')
  await page.getByLabel('Package or item name').fill('Family food pack')
  await page.getByRole('dialog').getByRole('button', { name: /Review/ }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Create draft event', exact: true }).click()
  const success = page.getByRole('status').filter({ hasText: 'Draft distribution event created.' })
  await expect(success).toBeVisible()
  assert.equal((await page.getByRole('navigation', { name: 'Distribution setup stages' }).locator('svg').first().boundingBox()).width, 16, 'CSS still controls smaller icons')
  assert.equal((await page.locator('.ga-staff-greeting svg').boundingBox()).width, 24, 'CSS still controls larger icons')
  async function inspect(alert, name) {
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 })
      await alert.scrollIntoViewIfNeeded()
      const metrics = await alert.evaluate(element => {
        const icon = element.querySelector('svg').getBoundingClientRect()
        const box = element.getBoundingClientRect()
        const copy = element.querySelector('p').getBoundingClientRect()
        return { iconWidth: icon.width, iconHeight: icon.height, height: box.height, textFits: copy.right <= box.right && copy.left >= box.left, pageFits: document.documentElement.scrollWidth <= innerWidth }
      })
      checks.push({ name, width, ...metrics })
      await page.screenshot({ path: resolve(output, `${name}-${width}.png`) })
      assert.ok(metrics.iconWidth <= 24 && metrics.iconHeight <= 24, `${name}: oversized icon ${JSON.stringify(metrics)}`)
      assert.ok(metrics.height <= 150 && metrics.textFits && metrics.pageFits, `${name}: overflowing message ${JSON.stringify(metrics)}`)
    }
  }
  await inspect(success, 'success')
  // Reproduce a missing sizing utility without replacing the page's actual SVGs.
  const removed = await page.evaluate(() => {
    let count = 0
    function visit(rules) {
      for (const rule of rules) {
        if (rule.selectorText === '.size-5') {
          rule.style.removeProperty('width'); rule.style.removeProperty('height'); count++
        }
        if (rule.cssRules) visit(rule.cssRules)
      }
    }
    for (const sheet of document.styleSheets) visit(sheet.cssRules)
    return count
  })
  assert.ok(removed > 0, 'Found the actual shared icon sizing utility')
  await inspect(success, 'fallback-success')
  await page.getByRole('button', { name: /Step 4/ }).click()
  await page.getByRole('button', { name: 'Cancel event', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel event', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click()
  const failure = page.getByRole('alert').filter({ hasText: 'The event changed.' })
  await expect(failure).toBeVisible()
  await inspect(failure, 'error')
  assert.deepEqual(errors, [])
  console.log('Distribution success and error feedback fit desktop and mobile.')
} finally {
  await writeFile(resolve(output, 'layout-checks.json'), JSON.stringify(checks, null, 2))
  await browser?.close()
  await vite.close()
}
