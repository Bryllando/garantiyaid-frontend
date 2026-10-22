import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium, expect } from '@playwright/test'
import { createServer } from 'vite'
import { historyApiFixture } from './fixtures/assistant-history.js'

const output = resolve('../output/assistant-history')
await mkdir(output, { recursive: true })
const fixture = historyApiFixture(), title = 'Prepare reminders for tomorrow’s distribution'
const id = await fixture.seed(title)
await fixture.seed('How do I review beneficiary enrollment?')
await fixture.seed('Distribution checklist and required documents')
const archived = await fixture.seed('Previous outreach planning notes')
await fixture.api.action(archived, 'archive', 1)
const vite = await createServer({ cacheDir: resolve(output, '.vite'), define: { 'import.meta.env.VITE_API_URL': JSON.stringify('/api/v1') }, server: { host: '127.0.0.1', port: 0 } })
let browser, page
const errors = []
try {
  await vite.listen()
  const origin = `http://127.0.0.1:${vite.httpServer.address().port}`
  browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome' })
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  await context.addInitScript(() => {
    sessionStorage.setItem('garantiyaid.accessToken', 'history-fixture')
    sessionStorage.setItem('garantiyaid.user', JSON.stringify({ userId: 'history-fixture', role: 'SYSTEM_ADMIN', fullName: 'System Administrator', employeeId: 'TEST-HISTORY' }))
  })
  page = await context.newPage()
  page.on('pageerror', error => errors.push(error.message))
  await page.route('**/socket.io/**', route => route.abort())
  await page.routeWebSocket(/socket\.io/, () => {})
  await page.route('**/api/v1/**', async route => {
    const path = new URL(route.request().url()).pathname
    if (path.includes('/staff-assistant/conversations')) return fixture.route(route)
    if (path.includes('notifications')) return route.fulfill({ json: { data: { notifications: [], unreadCount: 0, pagination: { page: 1, pageSize: 20, total: 0, totalPages: 1 } } } })
    return route.fulfill({ json: { data: { timestamp: new Date().toISOString(), beneficiaries: [], programs: [], distributions: [], enrollments: [], barangays: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 1 } } } })
  })
  const panel = page.locator('#garantiyaid-ai-panel'), history = page.locator('#staff-assistant-history')
  const input = page.getByRole('textbox', { name: 'Message Staff Assistant', exact: true })
  const openHistory = () => page.getByRole('button', { name: 'History', exact: true }).click()
  const actions = name => history.getByRole('button', { name: `Actions for ${name}`, exact: true }).click()
  const shot = name => page.screenshot({ path: `${output}/${name}.png`, animations: 'disabled' })
  await page.goto(`${origin}/assistant`)
  await expect(input).toBeEnabled()
  await openHistory()
  await expect(history.getByRole('button', { name: title, exact: true })).toBeVisible()
  await shot('desktop-active')
  await history.getByRole('button', { name: title, exact: true }).click()
  await input.fill('Keep this unsent follow-up question')
  await expect.poll(() => fixture.rows.get(id).input).toBe('Keep this unsent follow-up question')
  await page.reload()
  await expect(input).toHaveValue('Keep this unsent follow-up question')
  await expect(panel.getByRole('article', { name: 'Your message', exact: true })).toContainText(title)
  await openHistory(); await actions(title)
  await history.getByRole('button', { name: 'Archive', exact: true }).click()
  await expect(history.getByRole('button', { name: title, exact: true })).toHaveCount(0)
  await history.getByRole('button', { name: 'Archived', exact: true }).click()
  await actions(title); await shot('desktop-archived')
  await history.getByRole('button', { name: 'Restore', exact: true }).click()
  await history.getByRole('button', { name: 'Active', exact: true }).click()
  await history.getByRole('button', { name: title, exact: true }).click()
  await expect(input).toHaveValue('Keep this unsent follow-up question')

  // A new sign-in has no tab cache; account history still contains the chat.
  await page.evaluate(() => sessionStorage.removeItem('garantiyaid.assistantConversations'))
  await page.reload(); await expect(input).toBeEnabled(); await openHistory()
  await history.getByRole('button', { name: title, exact: true }).click()
  await expect(input).toHaveValue('Keep this unsent follow-up question')
  fixture.failWrites = true
  await input.fill('Recover this draft after a failed save')
  await expect(panel.getByText(/Unable to save while offline/).first()).toBeVisible()
  await shot('save-error')
  fixture.failWrites = false
  await panel.getByRole('button', { name: 'Retry', exact: true }).first().click()
  await expect.poll(() => fixture.rows.get(id).input).toBe('Recover this draft after a failed save')
  await openHistory(); await actions(title)
  await history.getByRole('button', { name: 'Delete', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Delete this conversation?' })
  await expect(dialog).toBeVisible(); await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused()
  await page.keyboard.press('Escape'); await expect(dialog).toBeHidden()
  assert.ok(fixture.rows.has(id), 'Cancel keeps the chat')
  await history.getByRole('button', { name: 'Delete', exact: true }).click()
  await shot('delete-confirmation')
  await dialog.getByRole('button', { name: 'Delete chat', exact: true }).click()
  await expect(dialog).toBeHidden()
  assert.equal(fixture.rows.has(id), false)
  await page.getByRole('button', { name: 'Use compact window', exact: true }).click()
  for (const [width, height] of [[480, 800], [390, 844], [320, 640]]) {
    await page.setViewportSize({ width, height })
    await expect(history).toBeVisible()
    const rowTitle = 'How do I review beneficiary enrollment?'
    await actions(rowTitle)
    assert.equal(await history.evaluate(element => element.scrollWidth <= element.clientWidth + 1), true)
    for (const button of await history.locator('.ga-assistant-history-actions button').all()) assert.ok((await button.boundingBox()).height >= 44)
    await shot(`mobile-history-${width}`)
    await history.getByRole('button', { name: 'Delete', exact: true }).click()
    const bounds = await dialog.boundingBox()
    assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width)
    await page.keyboard.press('Tab'); await expect(dialog.getByRole('button', { name: 'Delete chat', exact: true })).toBeFocused()
    await page.keyboard.press('Tab'); await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused()
    await page.keyboard.press('Escape')
    await actions(rowTitle)
  }
  const expired = [...fixture.rows.values()].find(row => row.title === 'Distribution checklist and required documents')
  expired.expiresAt = new Date(Date.now() - 1).toISOString()
  await history.getByRole('button', { name: 'Refresh history', exact: true }).click()
  await expect(history.getByRole('button', { name: expired.title, exact: true })).toHaveCount(0)
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.getByRole('button', { name: 'Expand conversation', exact: true }).click()
  await history.getByRole('button', { name: 'How do I review beneficiary enrollment?', exact: true }).click()
  const remaining = [...fixture.rows.values()].find(row => row.title === 'How do I review beneficiary enrollment?')
  fixture.failWrites = true
  await input.fill('Unsaved draft before sign-out')
  await page.getByRole('button', { name: 'Sign out securely', exact: true }).click()
  const logoutWarning = page.getByRole('dialog', { name: 'Some chat changes are not saved', exact: true })
  await expect(logoutWarning).toBeVisible()
  await logoutWarning.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(input).toHaveValue('Unsaved draft before sign-out')
  fixture.failWrites = false
  await input.fill('Saved immediately before signing out')
  await page.getByRole('button', { name: 'Sign out securely', exact: true }).click()
  await expect(page).toHaveURL(/\/login$/)
  assert.equal(fixture.rows.get(remaining.id).input, 'Saved immediately before signing out')
  assert.equal(await page.evaluate(() => sessionStorage.getItem('garantiyaid.assistantConversations')), null)
  assert.deepEqual(errors, [])
  console.log('PASS account history after reload/new sign-in, retained draft, archive/restore, delete/cancel, retry, expiry, mobile widths, dialog focus and safe logout saving')
} catch (error) {
  if (page && !page.isClosed()) await shotFailure()
  throw error
} finally { await browser?.close(); vite.httpServer?.closeAllConnections(); await vite.close() }
async function shotFailure() { await page.screenshot({ path: `${output}/failure.png` }).catch(() => {}) }
