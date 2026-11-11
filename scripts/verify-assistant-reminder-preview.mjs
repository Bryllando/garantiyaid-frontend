import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { chromium, expect } from '@playwright/test'
import { createServer } from 'vite'
import { historyApiFixture } from './fixtures/assistant-history.js'

const vite = await createServer({ cacheDir: 'node_modules/.vite-verify/reminder-preview', logLevel: 'error', define: { 'import.meta.env.VITE_API_URL': JSON.stringify('/api/v1') }, server: { host: '127.0.0.1', port: 0, hmr: false } })
let browser, ready = false, previewCalls = 0, confirmations = 0
const errors = []
const distribution = { distributionId: 'sms-demo', title: 'TEST SMS Notification Demo', status: 'DRAFT', distributionDate: '2099-12-11', barangay: { barangayName: 'Demo barangay' } }
const recipient = { scheduleId: 'demo-schedule', beneficiaryName: 'SMS Demo Alpha', recipientMasked: '********3150', queueNumber: 1, slotStart: '2099-12-11T08:50:00+08:00', message: 'TEST ONLY - SMS notification demo.', serviceArea: 'SMS Demo' }
try {
  await vite.listen()
  browser = await chromium.launch({ channel: 'chrome', headless: true })
  const history = historyApiFixture()
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' })
  await context.addInitScript(() => {
    sessionStorage.setItem('garantiyaid.accessToken', 'preview-fixture')
    sessionStorage.setItem('garantiyaid.user', JSON.stringify({ userId: 'preview-fixture', fullName: 'Demo Administrator', role: 'SYSTEM_ADMIN' }))
  })
  await context.route(/socket\.io/, route => route.abort())
  await context.routeWebSocket(/socket\.io/, () => {})
  await context.route('**/api/v1/**', async route => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1', '')
    const respond = data => route.fulfill({ json: { success: true, data } })
    if (path.includes('/staff-assistant/conversations')) return history.route(route)
    if (path === '/health') return respond({ timestamp: new Date().toISOString() })
    if (path === '/staff-notifications') return respond({ notifications: [], unreadCount: 0, pagination: { page: 1, totalPages: 1 } })
    if (path === '/distributions') return respond({ distributions: [distribution], pagination: { page: 1, totalPages: 1 } })
    if (path === '/distributions/sms-demo/schedules') return respond({ schedules: [], summary: {}, pagination: { page: 1, totalPages: 1 } })
    if (path.endsWith('/notifications/assistant-preview')) {
      previewCalls++
      return respond({ distribution, recipients: ready ? [recipient] : [], recipientCount: ready ? 1 : 0, excludedCount: 0, excluded: { invalidContactCount: 0, completedClaimCount: 0 },
        simulatedSmsOnly: !ready, checkedAt: new Date().toISOString(), previewHash: 'a'.repeat(64), approvalId: `approval-${previewCalls}`, approvalExpiresAt: new Date(Date.now() + 900000).toISOString() })
    }
    if (path.endsWith('/notifications/assistant-enqueue')) { confirmations++; return respond({ queuedCount: 1, notifications: [] }) }
    errors.push(`Unexpected request: ${path}`)
    return route.fulfill({ status: 404, json: { error: { message: 'Unexpected fixture request' } } })
  })
  const page = await context.newPage()
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(`http://127.0.0.1:${vite.httpServer.address().port}/assistant`)
  const panel = page.locator('#garantiyaid-ai-panel')
  await panel.getByRole('button', { name: /^Prepare a reminder/ }).click()
  const task = panel.getByRole('region', { name: 'Prepare a reminder', exact: true })
  for (const [label, value] of [['Distribution event', distribution.title], ['Recipient area', 'All scheduled service areas'], ['Reminder message', recipient.message], ['Queue timing', 'now']]) {
    const input = task.getByLabel(label, { exact: true })
    if (label === 'Queue timing') await input.selectOption(value)
    else await input.fill(value)
    await task.getByRole('button', { name: 'Keep this detail', exact: true }).click()
  }
  await task.getByRole('button', { name: 'Match records and preview', exact: true }).click()
  await expect(panel.getByLabel('Sitio / Purok', { exact: true })).toHaveValue('')
  await panel.getByRole('button', { name: 'Preview recipients and message', exact: true }).click()
  await expect(panel.getByRole('heading', { name: 'No recipients ready', exact: true })).toBeVisible()
  await expect(panel).toContainText('A saved beneficiary is not automatically scheduled')
  await expect(panel).toContainText('No real SMS will be sent')
  await expect(panel.getByRole('button', { name: /^Confirm and queue/ })).toHaveCount(0)
  await expect(panel.getByRole('checkbox')).toHaveCount(0)
  await expect(panel.getByRole('button', { name: 'Review event setup', exact: true })).toBeVisible()
  await expect(panel.getByRole('heading', { name: 'Personalized message sample', exact: true })).toHaveCount(0)
  await mkdir('../output/assistant-reminder-preview', { recursive: true })
  await page.screenshot({ path: '../output/assistant-reminder-preview/empty-1440.png', animations: 'disabled' })
  ready = true
  await panel.getByRole('button', { name: 'Recheck recipients', exact: true }).click()
  await expect(panel.getByText(recipient.beneficiaryName, { exact: true })).toBeVisible()
  await expect(panel).toContainText('Real SMS via SimGate')
  const confirm = panel.getByRole('button', { name: 'Confirm and queue 1 reminder', exact: true })
  await expect(confirm).toBeDisabled()
  await panel.getByRole('checkbox').check()
  await expect(confirm).toBeEnabled()
  await panel.getByRole('button', { name: 'Recheck recipients', exact: true }).click()
  await expect(confirm).toBeDisabled()
  await expect(panel.getByRole('checkbox')).not.toBeChecked()
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 })
    await expect.poll(() => panel.evaluate(el => el.scrollWidth <= el.clientWidth + 1), { message: `No horizontal overflow at ${width}px` }).toBe(true)
    await page.screenshot({ path: `../output/assistant-reminder-preview/ready-${width}.png`, animations: 'disabled' })
  }
  assert.equal(previewCalls, 3)
  assert.equal(confirmations, 0, 'Preview and recheck must not enqueue messages')
  assert.deepEqual(errors, [])
  console.log('PASS: actionable empty preview, live/simulation labels, recipient refresh, fresh confirmation required, and 320/390/1440px layout. All APIs mocked; no SMS sent.')
} finally {
  await browser?.close()
  await vite.close()
}
