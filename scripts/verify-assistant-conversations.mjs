import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { chromium, expect } from '@playwright/test'
import { createServer } from 'vite'
import { historyApiFixture } from './fixtures/assistant-history.js'

// Every API is intercepted. This harness cannot reach the live notification queue.
const vite = await createServer({ cacheDir: 'node_modules/.vite-verify/conversations', logLevel: 'error', define: { 'import.meta.env.VITE_API_URL': JSON.stringify('/api/v1') }, server: { host: '127.0.0.1', port: 0, hmr: false } })
let browser, enqueueCalls = 0, rejectConfirmation = true
const errors = [], previewRequests = [], guidanceRequests = []
const guidanceResponses = []
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
      if (guidanceResponses.length > 0) return guidanceResponses.shift()(route, respond)
      if (guidanceRequests.at(-1).messageText === 'How does GarantiyAid work?') {
        return respond({ messageText: 'GarantiyAid tracks assistance from enrollment to receipt.', externalAiUsed: false })
      }
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
  const choices = panel.locator('#ai-task-detail')
  await expect(choices.locator('optgroup[label="Matching your request"] option')).toHaveCount(2)
  assert.equal(enqueueCalls, 0)
  await choices.selectOption('punta-0')
  await panel.getByRole('button', { name: 'Use selected event', exact: true }).click()
  await chat('SMS lang.')
  await chat('Kanang event nga atong gihisgutan.')
  await expect(panel.getByRole('region', { name: 'Prepare a reminder', exact: true })).toContainText('Punta morning')
  await chat('Ayaw sa ipadala.')
  await expect(panel.getByRole('region', { name: 'Prepare a reminder', exact: true })).toHaveCount(0)
  assert.equal(enqueueCalls, 0, 'Cancellation must not enqueue')
  await chat('Send reminders for the Punta TUPAD distribution.')
  await choices.selectOption('punta-0')
  await panel.getByRole('button', { name: 'Use selected event', exact: true }).click()
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

  const output = '../output/staff-ui-ux-fixes/after'
  await mkdir(output, { recursive: true })
  const input = panel.locator('#garantiyaid-ai-message')
  const composer = panel.locator('.ga-assistant-input')
  const userMessage = panel.getByRole('article', { name: 'Your message', exact: true })
  const assistantReply = panel.getByRole('article', { name: 'Assistant reply', exact: true })
  const retry = panel.getByRole('button', { name: 'Retry answer', exact: true })
  const newChat = panel.getByRole('button', { name: 'New chat', exact: true })
  const timeout = route => route.fulfill({ status: 504, json: { error: { message: 'The answer took too long.' } } })
  const interrupted = route => route.fulfill({ contentType: 'text/event-stream', body: 'data: {"type":"text","text":"Partial reply for the fixture."}\n\ndata: {"type":"error"}\n\n' })
  await newChat.click()
  await panel.getByRole('combobox', { name: 'Assistant language' }).selectOption('en')
  const composerHeights = {}
  for (const width of [320, 1440, 390]) {
    await page.setViewportSize({ width, height: 900 })
    await expect.poll(() => composer.evaluate(el => Math.round(el.getBoundingClientRect().height))).toBeLessThan(120)
    composerHeights[width] = Math.round((await composer.boundingBox()).height)
    await input.fill('Short question')
    await expect.poll(() => input.evaluate(el => el.getBoundingClientRect().height)).toBeLessThanOrEqual(32)
    await input.fill('First line\nSecond line\nThird line')
    await expect.poll(() => input.evaluate(el => el.getBoundingClientRect().height)).toBeGreaterThan(50)
    await input.fill('Long question\n'.repeat(20))
    await expect.poll(() => input.evaluate(el => el.getBoundingClientRect().height)).toBeLessThanOrEqual(144)
    await input.clear()
    await expect.poll(() => input.evaluate(el => el.getBoundingClientRect().height)).toBeLessThanOrEqual(32)
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
  }
  await input.focus()
  await page.evaluate(() => {
    const viewport = window.visualViewport
    Object.defineProperty(viewport, 'height', { configurable: true, value: 560 })
    viewport.dispatchEvent(new Event('resize'))
  })
  await expect.poll(async () => {
    const send = await panel.getByRole('button', { name: 'Send message', exact: true }).boundingBox()
    return send.y + send.height
  }).toBeLessThanOrEqual(560)
  await page.evaluate(() => {
    const viewport = window.visualViewport
    Reflect.deleteProperty(viewport, 'height')
    viewport.dispatchEvent(new Event('resize'))
  })
  await chat('How does GarantiyAid work?')
  const question = 'Explain how the platform handles a delayed reply.'
  const start = guidanceRequests.length
  guidanceResponses.push(timeout, (_route, respond) => respond({ messageText: 'Complete fixture reply.', externalAiUsed: false }))
  await chat(question)
  await expect(retry).toBeVisible()
  await expect(input).toHaveValue('')
  await expect.poll(() => composer.evaluate(el => el.getBoundingClientRect().height)).toBeLessThan(120)
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 })
    await retry.scrollIntoViewIfNeeded()
    await page.screenshot({ path: `${output}/assistant-timeout-${width}.png` })
  }
  await panel.getByRole('combobox', { name: 'Assistant language' }).selectOption('fil')
  await expect.poll(() => [...history.rows.values()].some(row => row.language === 'fil' && row.messages.at(-1)?.content === question)).toBe(true)
  await page.reload()
  await expect(retry).toBeVisible()
  await expect(retry).toHaveAttribute('aria-disabled', 'false')
  await expect(userMessage.getByText(question, { exact: true })).toHaveCount(1)
  assert.equal(guidanceRequests.length - start, 1, 'Refreshing does not retry a guidance question automatically')
  await retry.scrollIntoViewIfNeeded()
  await page.screenshot({ path: `${output}/assistant-retry-after-refresh-390.png` })
  await retry.focus()
  await page.keyboard.press('Enter')
  await expect(assistantReply.getByText('Complete fixture reply.', { exact: true })).toBeVisible()
  assert.equal(guidanceRequests.length - start, 2)
  assert.deepEqual(guidanceRequests[start + 1], guidanceRequests[start], 'Retry uses the original request, language and context')
  assert.ok(guidanceRequests[start].history.length > 0)
  await expect(userMessage.getByText(question, { exact: true })).toHaveCount(1)
  await expect(assistantReply.getByText('Complete fixture reply.', { exact: true })).toHaveCount(1)
  await expect(retry).toHaveCount(0)
  await expect.poll(() => [...history.rows.values()].some(row => row.messages.at(-1)?.content === 'Complete fixture reply.')).toBe(true)
  await page.reload()
  await expect(assistantReply.getByText('Complete fixture reply.', { exact: true })).toHaveCount(1)
  await expect(retry).toHaveCount(0)

  let finishLateReply
  const lateReply = new Promise(resolve => { finishLateReply = resolve })
  guidanceResponses.push(interrupted, timeout, async (_route, respond) => {
    await lateReply
    await respond({ messageText: 'Late reply for the previous chat.', externalAiUsed: false }).catch(() => {})
  })
  await chat('Explain the remaining work for this office.')
  await expect(panel.getByText('This reply was interrupted before completion.', { exact: true })).toBeVisible()
  await retry.click()
  await expect(panel.getByRole('alert')).toContainText('The answer took too long.')
  await expect(panel.getByText('Partial reply for the fixture.', { exact: true })).toHaveCount(0)
  const beforeDoubleClick = guidanceRequests.length
  await retry.evaluate(button => { button.click(); button.click() })
  await expect(panel.getByRole('status').filter({ hasText: 'Retrying answer...' })).toBeVisible()
  assert.equal(guidanceRequests.length - beforeDoubleClick, 1)
  try {
    await panel.getByRole('button', { name: 'History', exact: true }).click()
    await panel.getByRole('button', { name: 'Pahinumdomi ang scheduled beneficiaries sa TUPAD sa Punta.', exact: true }).click()
    await expect(userMessage.getByText('Pahinumdomi ang scheduled beneficiaries sa TUPAD sa Punta.', { exact: true })).toBeVisible()
  } finally {
    finishLateReply()
  }
  await expect(panel.getByText('Late reply for the previous chat.', { exact: true })).toHaveCount(0)
  assert.equal(enqueueCalls, 2)
  assert.deepEqual(errors, [])
  console.log('PASS: reminder preview, confirmation and cancellation, chat retry after refresh and switching, and composer sizing. Empty composer heights: ' + JSON.stringify(composerHeights))
} finally {
  await browser?.close()
  await vite.close()
}
