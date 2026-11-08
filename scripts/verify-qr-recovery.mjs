import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { chromium, expect } from '@playwright/test'
import { createServer } from 'vite'

// Synthetic API fixtures only; no existing event, credential, or claim is changed.
await mkdir('../output/qr-recovery', { recursive: true })
const vite = await createServer({ cacheDir: '../tmp/qr-recovery-vite', server: { host: '127.0.0.1', port: 0 } })
await vite.listen()
let browser
try {
  browser = await chromium.launch({ headless: true, channel: 'chrome' })
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  page.setDefaultTimeout(10000)
  await page.clock.install()
  await page.addInitScript(() => {
    sessionStorage.setItem('garantiyaid.accessToken', 'synthetic-recovery-token')
    sessionStorage.setItem('garantiyaid.user', JSON.stringify({ userId: 'admin-1', fullName: 'Test Administrator', role: 'SYSTEM_ADMIN' }))
  })
  const errors = [], reads = [], writes = []
  page.on('pageerror', error => errors.push(error.message))
  const program = { programId: 'program-1', programName: 'Synthetic assistance', programCode: 'TEST-ONLY', status: 'ACTIVE' }
  const barangay = { barangayId: 'barangay-1', barangayName: 'Synthetic Barangay' }
  const event = { distributionId: 'event-1', title: 'Synthetic distribution', status: 'OPEN', program, barangay, verificationRequirement: 'QR', deliveryMode: 'PHYSICAL_GOODS', packageQuantity: 1, packageName: 'Food pack', packageUnit: 'pack', distributionDate: '2099-11-11', startTime: '08:00', endTime: '12:00', location: 'Synthetic Barangay Hall' }
  const person = { firstName: 'Synthetic', lastName: 'Recipient' }
  const token = { qrTokenId: 'qr-1', beneficiaryId: 'person-1', beneficiary: person, qrStatus: 'ACTIVE', expiresAt: '2099-11-11T04:00:00Z' }
  const used = { ...token, qrTokenId: 'qr-used', qrStatus: 'USED', beneficiary: { firstName: 'Used', lastName: 'Credential' } }
  let mode = 'limited', delay = false, release, failRefresh = false
  const pagination = { page: 1, totalPages: 1, total: 2 }
  await page.route('**/socket.io/**', route => route.abort())
  await page.routeWebSocket(/socket\.io/, () => {})
  await page.route('**/api/v1/**', async route => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1', '')
    if (route.request().method() !== 'GET') {
      writes.push(path)
      assert.equal(path, '/distributions/event-1/qr-tokens/qr-1/reissue')
      if (mode === 'limited') return route.fulfill({ status: 429, headers: { 'Retry-After': '2' }, json: { error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests. Try again in 2 seconds.', scope: 'garantiyaid-api', retryAfterSeconds: 2 } } })
      if (mode === 'ended') return route.fulfill({ status: 409, json: { error: { code: 'DISTRIBUTION_QR_EXPIRY_PASSED', message: "QR tokens cannot be reissued after the beneficiary's service session ends." } } })
      if (delay) await new Promise(resolve => { release = resolve })
      failRefresh = true
      return route.fulfill({ json: { data: { qrToken: { ...token, token: 'gya1_qr_SYNTHETIC_REPLACEMENT_ONLY' }, rawTokenReturnedOnce: true } } })
    }
    reads.push(path)
    let data
    if (path === '/health') data = { timestamp: new Date().toISOString() }
    else if (path === '/staff-notifications') data = { notifications: [], unreadCount: 0 }
    else if (path === '/programs') data = { programs: [program], pagination }
    else if (path === '/barangays') data = { barangays: [barangay] }
    else if (path === '/distributions') data = { distributions: [event], pagination }
    else if (path === '/distributions/event-1') {
      if (failRefresh) return route.fulfill({ status: 429, json: { error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Refresh temporarily limited.', scope: 'garantiyaid-api', retryAfterSeconds: 2 } } })
      data = { distribution: event }
    }
    else if (path.endsWith('/slots')) data = { slots: [], summary: { matchingSlotCount: 0, matchingCapacity: 0, sessionCount: 0 } }
    else if (path.endsWith('/allocations')) data = { allocations: [], summary: { countsByStatus: {}, totalAmount: '0' } }
    else if (path.endsWith('/schedules')) data = { schedules: [], summary: { countsByStatus: {}, matchingScheduleCount: 0 }, pagination }
    else if (path.endsWith('/qr-tokens')) data = { qrTokens: [token, used], summary: { matchingTokenCount: 2 }, pagination }
    else if (path.endsWith('/qr-eligible-schedules')) data = { schedules: [], summary: { qrEligibleScheduleCount: 0 } }
    else if (path.endsWith('/claims')) data = { claims: [], summary: { countsByStatus: {} }, pagination }
    else if (path.endsWith('/claim-disputes')) data = { disputes: [], summary: { countsByStatus: {} }, pagination }
    else if (path.endsWith('/reconciliation')) return route.fulfill({ status: 503, json: { error: { message: 'Synthetic unrelated review unavailable' } } })
    else if (path === '/notifications/summary') data = { total: 0, byStatus: {} }
    else throw new Error(`Unexpected fixture: ${path}`)
    await route.fulfill({ json: { data } })
  })
  await page.goto(`http://127.0.0.1:${vite.httpServer.address().port}/distributions/manage?event=event-1&stage=launch`)
  const panel = page.getByRole('region', { name: 'Beneficiary QR cards', exact: true })
  await expect(panel).toBeVisible()
  await expect(panel.getByRole('button', { name: 'Generate remaining QR credentials' })).toBeDisabled()
  await expect(panel.getByText('Synthetic Recipient', { exact: true })).toBeVisible()
  await expect(panel.getByRole('button', { name: 'Replace lost QR' })).toHaveCount(1)
  await expect(panel).toContainText('Used · cannot be replaced')
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 })
    await panel.scrollIntoViewIfNeeded()
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true)
    await page.screenshot({ path: `../output/qr-recovery/issued-${width}.png` })
  }
  await page.setViewportSize({ width: 1440, height: 1000 })
  await panel.getByRole('button', { name: 'Replace lost QR' }).click()
  const confirm = page.getByRole('dialog', { name: 'Replace QR for Synthetic Recipient?' })
  await expect(confirm).toContainText('previous card will stop working')
  await confirm.getByRole('button', { name: 'Cancel', exact: true }).click()
  assert.equal(writes.length, 0, 'Opening or cancelling replacement never rotates a QR')
  await panel.getByRole('button', { name: 'Replace lost QR' }).click()
  await confirm.getByRole('button', { name: 'Create replacement QR' }).click()
  await expect(confirm.getByRole('alert')).toContainText('Too many requests')
  await expect(confirm.getByRole('button', { name: 'Create replacement QR' })).toBeDisabled()
  const before = reads.length
  const cooldown = await page.evaluate(async () => {
    try { await (await import('/src/auth/staffAuth.js')).requestPrograms('synthetic-recovery-token') }
    catch (error) { return { status: error.status, seconds: error.retryAfterSeconds } }
  })
  assert.equal(cooldown.status, 429)
  assert.equal(reads.length, before, 'The client prevents extra polling during the server cooldown')
  await page.clock.fastForward(2100)
  await expect(confirm.getByRole('button', { name: 'Create replacement QR' })).toBeEnabled()
  mode = 'ended'
  await confirm.getByRole('button', { name: 'Create replacement QR' }).click()
  await expect(confirm.getByRole('alert')).toContainText('service session ends')
  mode = 'success'; delay = true
  await confirm.getByRole('button', { name: 'Create replacement QR' }).evaluate(button => { button.click(); button.click() })
  await expect.poll(() => writes.length).toBe(3)
  await expect(confirm.getByRole('button', { name: 'Saving...' })).toBeDisabled()
  release()
  const card = page.getByRole('dialog', { name: 'Save beneficiary QR cards' })
  await expect(card).toBeVisible()
  await expect(card).toContainText('Synthetic Recipient')
  await expect(card.locator('.ga-qr-card-code svg')).toHaveCount(1)
  await expect(card).toContainText('gya1_qr_SYNTHETIC_REPLACEMENT_ONLY')
  // The follow-up read fails; the one-time card must survive using its event snapshot.
  await expect.poll(() => reads.filter(path => path === '/distributions/event-1').length).toBeGreaterThan(1)
  await expect(card).toBeVisible()
  const download = page.waitForEvent('download')
  await card.getByText('Staff backup options', { exact: true }).click()
  await card.getByRole('button', { name: 'Save CSV' }).click()
  await download
  await card.getByRole('button', { name: 'Done', exact: true }).click()
  await expect(card).toHaveCount(0)
  assert.deepEqual(errors, [])
  console.log('Issued QR location, mobile layout, used-card protection, confirmed replacement, cooldown, retry, double-submit guard and one-time card survival passed.')
} finally {
  await browser?.close()
  await vite.close()
}
