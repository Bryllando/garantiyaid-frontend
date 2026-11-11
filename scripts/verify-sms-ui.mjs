import assert from 'node:assert/strict'
import { chromium, expect } from '@playwright/test'
import { createServer } from 'vite'

const vite = await createServer({ logLevel: 'error', cacheDir: 'node_modules/.vite-verify/sms', define: { 'import.meta.env.VITE_API_URL': JSON.stringify('https://sms-ui.example.test/api/v1') }, server: { host: '127.0.0.1', port: 0, hmr: false } })
let browser
const errors = []
let simulated = false, workerCount = 1, queued = 0
const distribution = { distributionId: 'event-test', title: 'Demo distribution', status: 'OPEN', distributionDate: '2099-11-11', barangay: { barangayName: 'Demo barangay' } }
const schedule = { scheduleId: 'schedule-test', queueNumber: 1, status: 'SCHEDULED', beneficiary: { firstName: 'Demo', lastName: 'Person' }, slot: { sessionLabel: 'Morning', slotStart: '2099-11-11T00:00:00Z' } }
const base = { notificationId: 'notice-test', notificationType: 'SCHEDULE_CREATED', channel: 'SMS', distribution, schedule, recipientMasked: '*******4567', message: 'Demo schedule notification', createdAt: '2099-11-10T01:00:00Z', sentAt: '2099-11-10T01:00:00Z', attemptCount: 1 }
try {
  await vite.listen()
  browser = await chromium.launch({ channel: 'chrome', headless: true })
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' })
  await context.addInitScript(() => {
    sessionStorage.setItem('garantiyaid.accessToken', 'fixture-session')
    sessionStorage.setItem('garantiyaid.user', JSON.stringify({ userId: 'fixture-admin', fullName: 'Demo Administrator', role: 'SYSTEM_ADMIN', isActive: true, totpEnabled: true }))
  })
  await context.route(/socket\.io/, route => route.abort())
  await context.routeWebSocket(/socket\.io/, () => {})
  await context.route('https://sms-ui.example.test/api/v1/**', async route => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1', '')
    const pagination = { page: 1, totalPages: 1, total: 4 }
    const respond = data => route.fulfill({ json: { success: true, data } })
    if (path === '/health') return respond({ timestamp: new Date().toISOString() })
    if (path === '/staff-notifications') return respond({ notifications: [], unreadCount: 0, pagination })
    if (path === '/distributions') return respond({ distributions: [distribution], pagination })
    if (path === '/distributions/event-test/schedules') return respond({ schedules: [schedule], pagination, summary: {} })
    if (path === '/notifications') return respond({ simulatedSmsOnly: simulated, notifications: [
      { ...base, status: 'SENT', simulated: true, providerMode: 'SIMULATED' },
      { ...base, notificationId: 'live-test', status: 'SENT', simulated: false, providerMode: 'SIMGATE', providerReference: 'test-reference' },
      { ...base, notificationId: 'unknown-test', status: 'FAILED', simulated: false, providerMode: 'SIMGATE', lastErrorCode: 'SIMGATE_DELIVERY_UNCONFIRMED', sentAt: null },
      { ...base, notificationId: 'old-worker-test', status: 'FAILED', simulated: false, providerMode: 'SIMGATE', lastErrorCode: 'SMS_SIMULATED_BY_OLD_WORKER', sentAt: null },
    ], pagination })
    if (path === '/notifications/summary') return respond({ total: 4, byStatus: { SENT: 2, FAILED: 2 }, simulatedSmsOnly: simulated })
    if (path === '/notifications/queue/health') return respond({ status: 'ready', workerCount, simulatedSmsOnly: simulated, counts: {} })
    if (path === '/schedules/schedule-test/notifications/preview') return respond({ scheduleId: schedule.scheduleId, message: base.message, simulated, recipientMasked: base.recipientMasked, recipientAvailable: true, previewHash: 'a'.repeat(64) })
    if (path === '/schedules/schedule-test/notifications/enqueue') {
      queued++
      assert.equal(route.request().method(), 'POST')
      assert.equal(route.request().postDataJSON().previewHash, 'a'.repeat(64))
      return respond({ queuedCount: 1, simulated, notifications: [] })
    }
    errors.push(`Unexpected API path ${path}`)
    return route.fulfill({ status: 404, json: { error: { message: 'Unexpected fixture request' } } })
  })
  const page = await context.newPage()
  page.on('pageerror', error => errors.push(error.message))
  const url = `http://127.0.0.1:${vite.httpServer.address().port}/notifications`
  await page.goto(url)
  await expect(page.getByLabel('Delivery channel status')).toContainText('Real SMS via SimGate')
  await expect(page.getByText('Sent (simulation)', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('Gateway accepted', { exact: true }).first()).toBeVisible()
  const oldWorkerRow = page.getByRole('row').filter({ hasText: 'Not sent (old worker)' })
  await expect(oldWorkerRow.getByRole('button', { name: 'Retry', exact: true })).toBeEnabled()
  const uncertainRow = page.getByRole('row').filter({ hasText: 'Check gateway' })
  await expect(uncertainRow.getByRole('button', { name: 'Retry', exact: true })).toHaveCount(0)
  await uncertainRow.getByRole('button', { name: 'View details' }).click()
  await expect(page.getByRole('dialog')).toContainText('Retry is blocked to prevent duplicate texts')
  await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click()
  await page.getByRole('button', { name: 'Queue schedule message', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByLabel('Schedule', { exact: true })).toHaveValue('schedule-test')
  await dialog.getByRole('button', { name: 'Preview message', exact: true }).click()
  await expect(dialog).toContainText('Real SMS via SimGate')
  await dialog.getByRole('button', { name: 'Confirm and queue', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  assert.equal(queued, 1)
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 1000 })
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    const overflow = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth,
      elements: [...document.querySelectorAll('main *')].filter(el => el.getBoundingClientRect().right > innerWidth + 1).slice(0, 6).map(el => ({ tag: el.tagName, className: el.className, text: el.textContent.slice(0, 80) })) }))
    assert.ok(overflow.scrollWidth <= width, JSON.stringify(overflow))
  }
  simulated = true
  workerCount = 0
  await page.reload()
  await expect(page.getByLabel('Delivery channel status')).toContainText('No real SMS will be sent')
  await expect(page.getByLabel('Delivery channel status')).toContainText('Worker offline')
  await page.getByRole('button', { name: 'Queue reminders', exact: true }).click()
  await expect(page.getByRole('dialog')).toContainText('No real SMS will be sent')
  assert.deepEqual(errors, [])
  console.log('PASS: SMS mode, acceptance labels, uncertain-send retry blocking, preview/queue, worker warning, and mobile layout. All API calls mocked; no SMS sent.')
} finally {
  await browser?.close()
  await vite.close()
}
