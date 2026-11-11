import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium, expect } from '@playwright/test'
import { createServer } from 'vite'
import { historyApiFixture } from './fixtures/assistant-history.js'

const output = resolve('../output/assistant-task-start')
const vite = await createServer({ cacheDir: 'node_modules/.vite-verify/assistant-start', logLevel: 'error', define: { 'import.meta.env.VITE_API_URL': JSON.stringify('/api/v1') }, server: { host: '127.0.0.1', port: 0 } })
let browser
const errors = [], operations = []
try {
  await mkdir(output, { recursive: true })
  await vite.listen()
  browser = await chromium.launch({ channel: 'chrome', headless: true })
  for (const role of ['SYSTEM_ADMIN', 'DSWD_STAFF', 'BARANGAY_FACILITATOR']) {
    const fixture = historyApiFixture()
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' })
    await context.addInitScript(role => {
      sessionStorage.setItem('garantiyaid.accessToken', 'start-fixture')
      sessionStorage.setItem('garantiyaid.user', JSON.stringify({ userId: `fixture-${role}`, role, fullName: 'Demo Staff', employeeId: 'TEST-START', barangayId: role === 'BARANGAY_FACILITATOR' ? 'test-barangay' : null }))
    }, role)
    const page = await context.newPage()
    page.on('pageerror', error => errors.push(error.message))
    await page.route(/socket\.io/, route => route.abort())
    await page.routeWebSocket(/socket\.io/, () => {})
    await page.route('**/api/v1/**', async route => {
      const path = new URL(route.request().url()).pathname
      if (path.includes('/staff-assistant/conversations')) return fixture.route(route)
      if (route.request().method() !== 'GET') operations.push(path)
      return route.fulfill({ json: { success: true, data: { timestamp: new Date().toISOString(), notifications: [], unreadCount: 0, distributions: [{ distributionId: 'demo-event', title: 'Demo Distribution', status: 'OPEN', distributionDate: '2099-12-10', startTime: '10:00', endTime: '12:00' }], programs: [], barangays: [], pagination: { page: 1, total: 0, totalPages: 1 } } } })
    })
    await page.goto(`http://127.0.0.1:${vite.httpServer.address().port}/assistant`)
    const panel = page.locator('#garantiyaid-ai-panel')
    await expect(panel.getByRole('button', { name: /^Prepare a reminder/ })).toBeEnabled()
    if (role !== 'SYSTEM_ADMIN') await expect(panel.getByRole('button', { name: /^Prepare a distribution draft/ })).toHaveCount(0)
    const tasks = role === 'SYSTEM_ADMIN' ? [
      ['Prepare a distribution draft', 'Program', 'Barangay', 'Community Assistance', 'distribution'],
      ['Prepare a reminder', 'Distribution event', 'Recipient area', 'Demo Distribution', 'reminder'],
    ] : [['Prepare a reminder', 'Distribution event', 'Recipient area', 'Demo Distribution', 'reminder']]
    for (const [title, first, next, answer, slug] of tasks) {
      for (const width of role === 'SYSTEM_ADMIN' ? [1440, 390, 320] : [1440]) {
        await page.setViewportSize({ width, height: width === 320 ? 700 : 1000 })
        await panel.getByRole('button', { name: new RegExp(`^${title}`) }).focus()
        await page.keyboard.press('Enter')
        const task = panel.getByRole('region', { name: title, exact: true })
        await expect(task).toBeVisible()
        await expect(task.getByLabel(first, { exact: true })).toBeFocused()
        await expect(task.getByRole('progressbar')).toHaveAttribute('value', '0')
        await expect(panel.getByRole('article', { name: 'Assistant reply', exact: true })).toHaveCount(0)
        await panel.getByLabel('Assistant language', { exact: true }).selectOption('en')
        await expect(panel.getByRole('article', { name: 'Assistant reply', exact: true })).toHaveCount(0)
        await panel.getByLabel('Assistant language', { exact: true }).selectOption('ceb')
        await task.getByLabel(first, { exact: true }).focus()
        await expect(task.getByRole('button', { name: 'Match records and preview', exact: true })).toHaveCount(0)
        if (width >= 640) await expect(task.getByRole('list', { name: 'Task stages' })).toBeVisible()
        await expect(panel.getByRole('textbox', { name: 'Message Staff Assistant', exact: true })).toHaveCount(0)
        assert.equal(await panel.evaluate(el => el.scrollWidth <= el.clientWidth + 1), true)
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
        const inputBounds = await task.getByLabel(first, { exact: true }).boundingBox()
        const contentBounds = await panel.locator('[data-assistant-content]').boundingBox()
        assert.ok(inputBounds.y >= contentBounds.y && inputBounds.y + inputBounds.height <= contentBounds.y + contentBounds.height, `${slug} first field fits the visible content at ${width}px`)
        if (role === 'SYSTEM_ADMIN') await page.screenshot({ path: `${output}/${slug}-${width}.png`, animations: 'disabled' })
        await task.getByRole('button', { name: 'Use chat instead', exact: true }).click()
        await expect(panel.getByRole('textbox', { name: 'Message Staff Assistant', exact: true })).toBeFocused()
        await task.getByRole('button', { name: 'Use guided fields', exact: true }).click()
        await expect(task.getByLabel(first, { exact: true })).toBeFocused()
        await task.getByLabel(first, { exact: true }).fill(answer)
        await task.getByRole('button', { name: 'Keep this detail', exact: true }).click()
        await expect(task.getByLabel(next, { exact: true })).toBeFocused()
        await task.getByRole('button', { name: `Edit ${first}`, exact: true }).click()
        await expect(task.getByLabel(first, { exact: true })).toHaveValue(answer)
        await task.getByRole('button', { name: 'Cancel pending task', exact: true }).click()
        await expect(task).toHaveCount(0)
        await expect(panel.getByRole('textbox', { name: 'Message Staff Assistant', exact: true })).toBeFocused()
        const nextTasks = panel.getByRole('region', { name: 'Start another task', exact: true })
        await expect(nextTasks).toBeVisible()
        await expect(nextTasks.getByRole('button')).toHaveCount(role === 'SYSTEM_ADMIN' ? 2 : 1)
        const replies = panel.getByRole('article', { name: 'Assistant reply', exact: true })
        const firstReply = await replies.first().textContent()
        await nextTasks.getByRole('button', { name: new RegExp(`^${title}`) }).click()
        await expect(task.getByLabel(first, { exact: true })).toHaveValue('')
        await expect(task.getByLabel(first, { exact: true })).toBeFocused()
        await expect(task.getByRole('progressbar')).toHaveAttribute('value', '0')
        await expect(replies.first()).toHaveText(firstReply)
        await expect(nextTasks).toHaveCount(0)
        await task.getByRole('button', { name: 'Cancel pending task', exact: true }).click()
        await expect(panel.getByRole('button', { name: 'New chat', exact: true })).toBeEnabled()
        await panel.getByRole('button', { name: 'New chat', exact: true }).click()
        await expect(panel.getByRole('button', { name: /^Prepare a reminder/ })).toBeEnabled()
      }
    }
    await context.close()
  }
  assert.deepEqual(operations, [], 'starting, editing and cancelling tasks must not call business mutations or send chat/SMS')
  assert.deepEqual(errors, [])
  console.log('PASS: repeatable task shortcuts in the same conversation, fresh fields, preserved replies, role permissions, keyboard focus, cancellation, and 320/390/1440 layouts. All APIs mocked; no SMS or distribution created.')
} finally {
  await browser?.close()
  await vite.close()
}
