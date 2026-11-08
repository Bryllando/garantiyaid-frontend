import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import { chromium, expect } from '@playwright/test'

// Synthetic API fixtures only; no real barangays or staff accounts are changed.
const root = fileURLToPath(new URL('../', import.meta.url))
const output = fileURLToPath(new URL('../../output/barangay-archive/', import.meta.url))
const user = { userId: 'admin-1', employeeId: 'ADMIN-TEST', fullName: 'Synthetic Administrator', role: 'SYSTEM_ADMIN', isActive: true, totpEnabled: true, updatedAt: '2026-11-07T00:00:00Z' }
const barangays = ['Unused', 'Assigned', 'Ongoing', 'Legacy'].map((name, index) => ({ barangayId: `barangay-${index}`, barangayCode: `TEST-${index}`, barangayName: `${name} Barangay`, city: 'Cebu City', province: 'Cebu', isActive: name !== 'Legacy' }))
const history = ['synthetic-beneficiary', 'synthetic-receipt']
const changes = [], requests = [], errors = []
let interruptResponse = true
const vite = await createServer({ root, cacheDir: `${output}/.vite`, logLevel: 'error', define: { 'import.meta.env.VITE_API_URL': JSON.stringify('https://archive-api.example.test/api/v1') }, server: { host: '127.0.0.1', port: 0, hmr: false } })
let browser
try {
  await mkdir(output, { recursive: true })
  await vite.listen()
  const origin = `http://127.0.0.1:${vite.httpServer.address().port}`
  browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome', headless: true })
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' })
  await context.addInitScript(staff => {
    sessionStorage.setItem('garantiyaid.accessToken', 'synthetic-archive-token')
    sessionStorage.setItem('garantiyaid.user', JSON.stringify(staff))
  }, user)
  await context.routeWebSocket('**/*', socket => socket.close())
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url())
    if (url.origin === origin) return route.continue()
    if (url.hostname !== 'archive-api.example.test') return route.abort()
    if (url.pathname.startsWith('/socket.io/')) return route.abort()
    const path = url.pathname.replace('/api/v1', '')
    requests.push({ path, method: request.method() })
    let data = {}
    if (path === '/users') data = { users: [user,
      { ...user, userId: 'active-staff', employeeId: 'DSWD-TEST', fullName: 'Active Test Staff', role: 'DSWD_STAFF' },
      { ...user, userId: 'unused-staff', employeeId: 'DSWD-UNUSED', fullName: 'Unused Test Staff', role: 'DSWD_STAFF', isActive: false, removalMode: 'DELETE' },
    ], pagination: { page: 1, totalPages: 1, total: 3 } }
    else if (path === '/barangays') data = { barangays: barangays.filter(item => url.searchParams.get('activeOnly') === 'false' || item.isActive) }
    else if (path.startsWith('/barangays/') && request.method() === 'PATCH') {
      const record = barangays.find(item => path.endsWith(`/${item.barangayId}`))
      assert.ok(record)
      const body = request.postDataJSON()
      assert.deepEqual(Object.keys(body), ['isActive'])
      const message = record.barangayName === 'Assigned Barangay' ? 'Reassign or deactivate active Barangay Facilitators before archiving this barangay.' : record.barangayName === 'Ongoing Barangay' ? 'Close or cancel draft/open distribution events before archiving this barangay.' : ''
      if (!body.isActive && message) return route.fulfill({ status: 409, json: { success: false, error: { message } } })
      if (record.isActive !== body.isActive) changes.push({ barangayId: record.barangayId, isActive: body.isActive })
      record.isActive = body.isActive
      if (interruptResponse && !body.isActive) { interruptResponse = false; return route.abort('connectionreset') }
      data = { barangay: record }
    } else if (path === '/health') data = { timestamp: new Date().toISOString() }
    else if (path === '/staff-notifications') data = { notifications: [], unreadCount: 0 }
    else if (path === '/auth/account') data = { user }
    else throw new Error(`Unhandled fixture: ${request.method()} ${path}`)
    return route.fulfill({ status: 200, json: { success: true, data } })
  })
  const page = await context.newPage()
  page.setDefaultTimeout(10000)
  page.on('pageerror', error => errors.push(error.message))
  const row = name => page.locator('tr:visible, article:visible').filter({ hasText: `${name} Barangay` })
  const dialog = page.getByRole('dialog')
  const screenshot = async name => {
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), { message: `No page overflow: ${name}` }).toBe(true)
    await page.screenshot({ path: `${output}/${name}.png`, fullPage: !(await dialog.count()) })
  }
  await page.goto(`${origin}/admin/administration?section=barangays`)
  await expect(row('Unused')).toBeVisible()
  const launcher = page.getByRole('button', { name: 'Open assistant conversation', exact: true })
  await expect(page.locator('.ga-staff-header').getByRole('button', { name: 'Open assistant conversation', exact: true })).toBeVisible()
  await expect(row('Legacy')).toHaveCount(0)
  await row('Unused').getByRole('button', { name: 'Archive', exact: true }).click()
  await expect(dialog).toContainText('Linked beneficiary records, receipts, and audit history are retained')
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  assert.equal(changes.length, 0, 'Cancel does not archive')
  for (const [name, message] of [['Assigned', 'Reassign or deactivate'], ['Ongoing', 'Close or cancel']]) {
    await row(name).getByRole('button', { name: 'Archive', exact: true }).click()
    await dialog.getByRole('button', { name: 'Archive barangay', exact: true }).click()
    await expect(dialog.getByRole('alert')).toContainText(message)
    await expect(dialog.getByRole('alert')).toBeFocused()
    await screenshot(`blocked-${name.toLowerCase()}`)
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(row(name)).toContainText('Active')
  }
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 })
    await page.goto(`${origin}/admin/administration?section=barangays`)
    await expect(row('Unused')).toBeVisible()
    await page.evaluate(() => document.fonts.ready)
    await screenshot(`current-${width}`)
    await row('Unused').getByRole('button', { name: 'Archive', exact: true }).click()
    await screenshot(`confirmation-${width}`)
    await dialog.getByRole('button', { name: 'Archive barangay', exact: true }).click()
    if (width === 1440) {
      await expect(dialog.getByRole('alert')).toBeVisible()
      await dialog.getByRole('button', { name: 'Archive barangay', exact: true }).click()
      assert.equal(changes.length, 1, 'Lost-response retry repeats the target status without a second change')
    }
    await expect(dialog).toHaveCount(0)
    await expect(row('Unused')).toHaveCount(0)
    await page.getByRole('button', { name: 'Archived barangays', exact: true }).click()
    await expect(page.locator('#barangay-registry-heading')).toBeFocused()
    await expect(row('Unused')).toContainText('Archived')
    await expect(row('Legacy')).toBeVisible()
    await expect(row('Unused').getByRole('button', { name: 'Edit', exact: true })).toHaveCount(0)
    await screenshot(`archived-${width}`)
    await page.getByRole('textbox', { name: 'Search barangays' }).fill('TEST-0')
    await expect(row('Unused')).toBeVisible()
    await expect(row('Legacy')).toHaveCount(0)
    await page.getByRole('textbox', { name: 'Search barangays' }).fill('does-not-exist')
    await expect(page.getByRole('heading', { name: 'No archived barangays found' })).toBeVisible()
    await page.getByRole('textbox', { name: 'Search barangays' }).fill('')
    if (width === 1440) {
      await page.getByRole('button', { name: /^Staff accounts/ }).click()
      await page.getByRole('button', { name: 'Create staff account', exact: true }).click()
      await dialog.getByRole('button', { name: /Barangay Facilitator/ }).click()
      const options = await page.locator('#staff-barangay option').allTextContents()
      assert.ok(options.some(label => label.includes('Assigned Barangay')))
      assert.ok(!options.some(label => /Unused|Legacy/.test(label)), 'Archived areas are excluded from new staff assignments')
      await dialog.getByRole('button', { name: 'Close staff form', exact: true }).click()
      await page.getByRole('button', { name: /^Barangays/ }).click()
    }
    await row('Unused').getByRole('button', { name: 'Restore barangay', exact: true }).click()
    await expect(dialog).toContainText('Staff accounts keep their existing status')
    await dialog.getByRole('button', { name: 'Restore barangay', exact: true }).click()
    await expect(dialog).toHaveCount(0)
    await expect(row('Unused')).toHaveCount(0)
    await page.getByRole('button', { name: 'Back to current barangays', exact: true }).click()
    await expect(row('Unused')).toContainText('Active')
  }
  for (const width of [1900, 1440, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 850 })
    await page.goto(`${origin}/admin/administration?section=barangays`)
    await expect(row('Unused')).toBeVisible()
    await page.getByRole('textbox', { name: 'Search barangays' }).fill('TEST-0')
    const archive = row('Unused').getByRole('button', { name: 'Archive', exact: true })
    await archive.scrollIntoViewIfNeeded()
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
    const actionBounds = await archive.boundingBox(), launcherBounds = await launcher.boundingBox()
    assert.ok(actionBounds.x + actionBounds.width <= launcherBounds.x || launcherBounds.x + launcherBounds.width <= actionBounds.x || actionBounds.y + actionBounds.height <= launcherBounds.y || launcherBounds.y + launcherBounds.height <= actionBounds.y, `Launcher does not cover Archive at ${width}px`)
    await archive.click()
    await expect(dialog).toContainText('Archive Unused Barangay?')
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
    await page.evaluate(() => window.scrollTo(0, 0))
    await screenshot(`actions-clear-${width}`)
    await page.getByRole('button', { name: /^Staff accounts/ }).click()
    for (const [name, action] of [['Active Test Staff', 'Deactivate'], ['Unused Test Staff', 'Delete']]) {
      const staffRow = page.locator('tr:visible, article:visible').filter({ hasText: name })
      await staffRow.getByRole('button', { name: action, exact: true }).click()
      await expect(dialog).toBeVisible()
      await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
    }
  }
  assert.equal(barangays.length, 4, 'No barangay was removed')
  assert.deepEqual(history, ['synthetic-beneficiary', 'synthetic-receipt'])
  assert.equal(requests.filter(request => request.method === 'DELETE').length, 0)
  assert.deepEqual(errors, [])
  const result = { passed: true, data: 'synthetic API fixtures', widths: [1900, 1440, 1024, 768, 390, 320], statusChanges: changes, checks: ['archive/restore', 'cancel', 'active-facilitator and unfinished-event conflicts', 'lost-response retry', 'archived search', 'active staff choices', 'keyboard focus', 'header assistant does not obstruct archive/deactivate/delete', 'no page overflow', 'no runtime errors'] }
  await writeFile(`${output}/result.json`, JSON.stringify(result, null, 2))
  console.log(JSON.stringify(result))
} finally {
  await browser?.close()
  await vite.close()
}
