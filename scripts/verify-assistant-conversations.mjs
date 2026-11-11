import assert from 'node:assert/strict'
import { chromium, expect } from '@playwright/test'
import { createServer } from 'vite'
import { historyApiFixture } from './fixtures/assistant-history.js'

// Every API is intercepted. This harness cannot reach the live notification queue.
const vite = await createServer({ cacheDir: 'node_modules/.vite-verify/conversations', logLevel: 'error', define: { 'import.meta.env.VITE_API_URL': JSON.stringify('/api/v1') }, server: { host: '127.0.0.1', port: 0, hmr: false } })
let browser, enqueueCalls = 0, rejectConfirmation = true
const errors = [], previewRequests = [], guidanceRequests = []
const events = ['morning', 'next day'].map((label, index) => ({ distributionId: `punta-${index}`, title: `Punta ${label}`, status: 'OPEN', distributionDate: `2099-12-${10 + index}`, startTime: '10:00', endTime: '12:00', program: { programCode: 'TUPAD', programName: 'TUPAD program' }, barangay: { barangayName: 'Punta' } }))
try {
  await vite.listen()
  browser = await chromium.launch({ channel: 'chrome', headless: true })
  const history = historyApiFixture()
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' })
  await context.addInitScript(() => {
    sessionStorage.setItem('garantiyaid.accessToken', 'conversation-fixture')
    sessionStorage.setItem('garantiyaid.user', JSON.stringify({ userId: 'conversation-fixture', fullName: 'Demo Administrator', role: 'SYSTEM_ADMIN' }))
  })
  await context.route(/socket\.io/, route => route.abort())
  await context.routeWebSocket(/socket\.io/, () => {})
  await context.route('**/api/v1/**', async route => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1', '')
    const respond = data => route.fulfill({ json: { success: true, data } })
    if (path.includes('/staff-assistant/conversations')) return history.route(route)
    if (path === '/health') return respond({ timestamp: new Date().toISOString() })
    if (path === '/staff-notifications') return respond({ notifications: [], unreadCount: 0, pagination: { totalPages: 1 } })
    if (path === '/distributions') return respond({ distributions: events, pagination: { totalPages: 1 } })
    if (path.endsWith('/schedules')) return respond({ schedules: [], summary: {}, pagination: { totalPages: 1 } })
    if (path.endsWith('/staff-assistant/messages')) {
      guidanceRequests.push(route.request().postDataJSON())
      return respond({ messageText: 'Mobile push delivery is unavailable. A saved push draft is not a delivered notification.', externalAiUsed: false })
    }
    if (path.endsWith('/notifications/assistant-preview')) {
      previewRequests.push({ path, body: route.request().postDataJSON() })
      return respond({ distribution: events[0], recipientCount: 1, excludedCount: 1, excluded: { invalidContactCount: 1, completedClaimCount: 0 },
        recipients: [{ scheduleId: 'fixture-schedule', beneficiaryName: 'Demo Beneficiary', recipientMasked: '********0000', queueNumber: 1, slotStart: '2099-12-10T10:00:00+08:00', message: 'TEST ONLY: Please follow your official appointment.' }],
        simulatedSmsOnly: true, checkedAt: new Date().toISOString(), previewHash: 'a'.repeat(64), approvalId: `approval-${previewRequests.length}`, approvalExpiresAt: new Date(Date.now() + 900000).toISOString() })
    }
    if (path.endsWith('/notifications/assistant-enqueue')) {
      enqueueCalls++
      assert.equal(route.request().postDataJSON().confirmed, true)
      if (rejectConfirmation) return route.fulfill({ status: 403, json: { error: { message: 'Permission changed. Reminder was not queued.', code: 'FORBIDDEN' } } })
      return respond({ queuedCount: 1, approvalId: 'approval-2', notifications: [] })
    }
    errors.push(`Unexpected request: ${path}`)
    return route.fulfill({ status: 404, json: { error: { message: 'Unexpected fixture request' } } })
  })
  const page = await context.newPage()
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(`http://127.0.0.1:${vite.httpServer.address().port}/assistant`)
  const panel = page.locator('#garantiyaid-ai-panel')
  async function chat(text) {
    await panel.locator('#garantiyaid-ai-message').fill(text)
    await panel.getByRole('button', { name: 'Send message', exact: true }).click()
    await expect(panel.locator('#garantiyaid-ai-message')).toBeEnabled()
    await expect(panel.getByText('Preparing your answer...', { exact: true })).toHaveCount(0)
  }
  await chat('Pahinumdomi ang scheduled beneficiaries sa TUPAD sa Punta.')
  const choices = panel.getByRole('region', { name: 'Matching distribution events' })
  await expect(choices.getByRole('button')).toHaveCount(2)
  assert.equal(enqueueCalls, 0)
  await choices.getByRole('button', { name: /Punta morning/ }).click()
  await chat('SMS lang.')
  await chat('Kanang event nga atong gihisgutan.')
  await expect(panel.getByRole('region', { name: 'Prepare a reminder', exact: true })).toContainText('Punta morning')
  await chat('Ayaw sa ipadala.')
  await expect(panel.getByRole('region', { name: 'Prepare a reminder', exact: true })).toHaveCount(0)
  assert.equal(enqueueCalls, 0, 'Cancellation must not enqueue')
  await chat('Send reminders for the Punta TUPAD distribution.')
  await choices.getByRole('button', { name: /Punta morning/ }).click()
  await chat('Send mobile push notifications to everyone.')
  await expect(panel).toContainText('Mobile push delivery is unavailable')
  assert.equal(guidanceRequests.at(-1).intent, 'MOBILE')
  assert.equal(enqueueCalls, 0)
  await chat('All scheduled service areas')
  await chat('TEST ONLY: Please follow your official appointment.')
  await chat('now')
  await panel.getByRole('button', { name: 'Match records and preview', exact: true }).click()
  await expect(panel.getByLabel('Distribution event', { exact: true })).toHaveValue('punta-0')
  await panel.getByRole('button', { name: 'Preview recipients and message', exact: true }).click()
  await expect(panel.getByRole('group', { name: 'Assistant tasks', exact: true })).toHaveCount(0)
  await expect(panel).toContainText('Demo Beneficiary')
  await expect(panel).toContainText('No real SMS will be sent')
  assert.equal(previewRequests[0].path, '/distributions/punta-0/notifications/assistant-preview')
  const confirm = panel.getByRole('button', { name: 'Confirm and queue 1 reminder', exact: true })
  await expect(confirm).toBeDisabled()
  assert.equal(enqueueCalls, 0)
  await panel.getByRole('checkbox').check()
  await confirm.click()
  await expect(panel.getByRole('alert')).toContainText('Permission changed')
  await expect(panel.getByRole('heading', { name: '1 reminder queued', exact: true })).toHaveCount(0)
  rejectConfirmation = false
  await panel.getByRole('button', { name: 'Preview recipients and message', exact: true }).click()
  await expect(panel.getByRole('checkbox')).not.toBeChecked()
  await panel.getByRole('checkbox').check()
  await confirm.click()
  await expect(panel.getByRole('heading', { name: '1 reminder queued', exact: true })).toBeVisible()
  await expect(panel).toContainText('recipient delivery is not confirmed by queueing')
  assert.equal(enqueueCalls, 2, 'One rejected and one successful mocked confirmation')
  const nextTasks = panel.getByRole('region', { name: 'Start another task', exact: true })
  await expect(nextTasks).toBeVisible()
  await expect(nextTasks.getByRole('button')).toHaveCount(2)
  const firstReply = await panel.getByRole('article', { name: 'Assistant reply', exact: true }).first().textContent()
  await nextTasks.getByRole('button', { name: /^Prepare a reminder/ }).click()
  const reminderTask = panel.getByRole('region', { name: 'Prepare a reminder', exact: true })
  await expect(reminderTask.getByLabel('Distribution event', { exact: true })).toHaveValue('')
  await expect(reminderTask.getByRole('progressbar')).toHaveAttribute('value', '0')
  await expect(panel.getByRole('checkbox')).toHaveCount(0)
  await expect(panel.getByRole('article', { name: 'Assistant reply', exact: true }).first()).toHaveText(firstReply)
  await reminderTask.getByRole('button', { name: 'Cancel pending task', exact: true }).click()
  await nextTasks.getByRole('button', { name: /^Prepare a distribution draft/ }).click()
  const draftTask = panel.getByRole('region', { name: 'Prepare a distribution draft', exact: true })
  await expect(draftTask.getByLabel('Program', { exact: true })).toHaveValue('')
  await expect(draftTask.getByRole('progressbar')).toHaveAttribute('value', '0')
  await draftTask.getByRole('button', { name: 'Cancel pending task', exact: true }).click()
  await expect(nextTasks).toBeVisible()
  await expect.poll(() => history.rows.size).toBe(1)
  await expect.poll(() => [...history.rows.values()][0]?.messages.some(message => message.content.includes('reminder(s) queued'))).toBe(true)
  assert.equal(enqueueCalls, 2, 'Reusing task shortcuts must not repeat an approved send')
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 1000 })
    await expect.poll(() => panel.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true)
  }
  assert.deepEqual(errors, [])
  console.log('PASS: event choices, follow-ups, cancellation, unavailable push, permission rejection, confirmation, and repeatable tasks after success without a new chat or duplicate send. No real SMS sent.')
} finally {
  await browser?.close()
  await vite.close()
}
