import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium, expect } from '@playwright/test'
import { createServer } from 'vite'

const output = resolve('../output/admin-redesign')
await mkdir(output, { recursive: true })
const vite = await createServer({ cacheDir: 'node_modules/.vite-verify/push-notifications', server: { host: '127.0.0.1', port: 0 } })
await vite.listen()
const origin = `http://127.0.0.1:${vite.httpServer.address().port}`
let browser
try {
  browser = await chromium.launch({ headless: true, channel: 'chrome' })
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  page.setDefaultTimeout(10000)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const errors = []
  const unhandled = new Set()
  const mutations = []
  let failRecipients = false
  let failEvents = false
  let cancelChosen = false
  const program = { programId: 'program-1', programName: 'Community Assistance' }
  const distribution = { distributionId: 'event-1', programId: program.programId, program, title: 'October community assistance', distributionDate: '2026-10-25', status: 'OPEN', location: 'Barangay Hall' }
  const secondEvent = { ...distribution, distributionId: 'event-2', title: 'November community assistance' }
  const schedules = Array.from({ length: 11 }, (_, i) => ({ scheduleId: `schedule-${i + 1}`, queueNumber: i + 1, status: i === 10 ? 'CHECKED_IN' : 'SCHEDULED', beneficiary: { beneficiaryId: `beneficiary-${i + 1}`, firstName: 'Person', lastName: String(i + 1), barangay: { barangayName: 'Poblacion' } } }))
  schedules.push({ ...schedules[0], scheduleId: 'duplicate-person' }, { ...schedules[1], scheduleId: 'cancelled', status: 'CANCELLED', beneficiary: { ...schedules[1].beneficiary, beneficiaryId: 'cancelled-person', firstName: 'Cancelled', lastName: 'Person' } })
  await page.addInitScript(() => {
    sessionStorage.setItem('garantiyaid.accessToken', 'local-preview-token')
    sessionStorage.setItem('garantiyaid.user', JSON.stringify({ userId: sessionStorage.getItem('test-user') || 'admin-1', fullName: 'System Administrator', role: sessionStorage.getItem('test-role') || 'SYSTEM_ADMIN', isActive: true, totpEnabled: true }))
  })
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('**/socket.io/**', (route) => route.abort())
  await page.routeWebSocket(/socket\.io/, () => {})
  await page.route('**/api/v1/**', async (route) => {
    const url = new URL(route.request().url())
    const path = url.pathname.replace('/api/v1', '')
    const pageNumber = Number(url.searchParams.get('page') || 1)
    const pagination = { page: pageNumber, totalPages: 1, total: 0 }
    if (route.request().method() !== 'GET') mutations.push(path)
    let data
    if (path === '/health') data = { timestamp: new Date().toISOString() }
    else if (path === '/staff-notifications') data = { notifications: [], unreadCount: 0, pagination }
    else if (path === '/distributions') {
      if (failEvents) return route.fulfill({ status: 503, json: { error: { message: 'Events temporarily unavailable.' } } })
      data = { distributions: pageNumber === 1 ? [distribution] : [secondEvent], pagination: { page: pageNumber, totalPages: 2, total: 2 } }
    } else if (path === '/distributions/event-1') data = { distribution }
    else if (path === '/distributions/event-2') data = { distribution: secondEvent }
    else if (path === '/distributions/event-2/schedules') data = { schedules: [], pagination, summary: {} }
    else if (path === '/distributions/event-1/schedules') {
      if (failRecipients) return route.fulfill({ status: 503, json: { error: { message: 'Assignments temporarily unavailable.' } } })
      const rows = schedules.map((item) => cancelChosen && item.beneficiary.beneficiaryId === 'beneficiary-11' ? { ...item, status: 'CANCELLED' } : item)
      data = { schedules: pageNumber === 1 ? rows.slice(0, 8) : rows.slice(8), pagination: { page: pageNumber, totalPages: 2, total: rows.length }, summary: {} }
    } else if (path === '/notifications') data = { notifications: [], pagination }
    else if (path === '/notifications/summary') data = { total: 0, byStatus: {} }
    else if (path === '/notifications/queue/health') data = { status: 'available', counts: {} }
    else { unhandled.add(path); return route.fulfill({ status: 404, json: { message: `Missing fixture: ${path}` } }) }
    await route.fulfill({ json: { data } })
  })

  await page.goto(`${origin}/notifications?channel=push&distribution=event-1`)
  await expect(page.getByRole('heading', { name: 'Push notifications', exact: true })).toBeVisible()
  await expect(page.getByText('10 selected · 11 with non-cancelled assignments')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Send unavailable' })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Open assistant conversation' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Review notification', exact: true }).click()
  await expect(page.getByLabel('Notification title')).toBeFocused()
  await page.getByLabel('Notification title').fill('Distribution schedule update')
  await page.getByLabel('Message', { exact: true }).fill('Please attend your assigned session at Barangay Hall and bring your identification.')
  await page.getByLabel('Recipient group').selectOption('SELECTED')
  await page.getByRole('checkbox', { name: /Person 1 Queue #1 / }).check()
  await page.getByRole('button', { name: 'Next recipients' }).click()
  await page.getByRole('checkbox', { name: /Person 11/ }).check()
  await expect(page.getByText('2 selected · 11 with non-cancelled assignments')).toBeVisible()
  await expect(page.getByText('Cancelled Person', { exact: true })).toHaveCount(0)
  await page.reload()
  await expect(page.getByLabel('Notification title')).toHaveValue('Distribution schedule update')
  await expect(page.getByText('2 selected · 11 with non-cancelled assignments')).toBeVisible()

  failRecipients = true
  await page.getByRole('button', { name: 'Review notification', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Assignments temporarily unavailable')
  await expect(page.getByRole('alert')).toBeFocused()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByLabel('Message', { exact: true })).toHaveValue(/Please attend/)
  failRecipients = false
  await page.getByRole('button', { name: 'Refresh recipients', exact: true }).click()
  await expect(page.getByText('2 selected · 11 with non-cancelled assignments')).toBeVisible()
  cancelChosen = true
  await page.getByRole('button', { name: 'Review notification', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Review push notification' })
  await expect(dialog).toContainText('1 beneficiary · Choose beneficiaries')
  await dialog.getByText('Review recipient names', { exact: true }).click()
  await expect(dialog.getByText('Person 1', { exact: false })).toBeVisible()
  await expect(dialog.getByText('Person 11', { exact: false })).toHaveCount(0)
  await page.evaluate(() => {
    window.originalSetItem = Storage.prototype.setItem
    Storage.prototype.setItem = function (key, value) { if (key === 'garantiyaid.pushDrafts') throw new Error('Storage full'); return window.originalSetItem.call(this, key, value) }
  })
  await dialog.getByRole('button', { name: 'Confirm and save draft' }).click()
  await expect(dialog.getByRole('alert')).toContainText('could not be saved')
  await page.evaluate(() => { Storage.prototype.setItem = window.originalSetItem })
  await dialog.getByRole('button', { name: 'Confirm and save draft' }).click()
  await expect(dialog).toHaveCount(0)
  const history = page.getByRole('region', { name: 'Draft history' })
  await expect(history.getByRole('button', { name: 'Open draft: Distribution schedule update' })).toBeVisible()
  await expect(history).toContainText('1 selected at review')
  await page.reload()
  await history.getByRole('button', { name: 'Open draft: Distribution schedule update' }).click()
  await page.getByLabel('Notification title').fill('Updated notice')
  await page.getByRole('button', { name: 'Review notification', exact: true }).click()
  await dialog.getByRole('button', { name: 'Back to editing' }).click()
  await expect(page.getByLabel('Notification title')).toHaveValue('Updated notice')
  await page.getByRole('button', { name: 'Review notification', exact: true }).click()
  await dialog.getByRole('button', { name: 'Confirm and save draft' }).click()
  await expect(history.getByRole('listitem')).toHaveCount(1)

  for (const width of [1440, 768, 375]) {
    await page.setViewportSize({ width, height: 1000 })
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.waitForTimeout(200)
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `No page overflow at ${width}px`)
    await page.screenshot({ path: `${output}/push-notifications-${width}.png`, fullPage: true })
  }
  await page.getByRole('button', { name: 'Review notification', exact: true }).click()
  await page.screenshot({ path: `${output}/push-review-375.png`, fullPage: false })
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await page.setViewportSize({ width: 812, height: 375 })
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.getByLabel('Distribution event', { exact: true }).selectOption('event-2')
  await expect(page.getByText('0 selected · 0 with non-cancelled assignments')).toBeVisible()
  await page.getByRole('navigation', { name: 'Notification channels' }).getByRole('link', { name: 'SMS delivery' }).click()
  await expect(page.getByRole('heading', { name: 'SMS delivery', exact: true })).toBeVisible()
  assert.equal(new URL(page.url()).searchParams.get('distribution'), 'event-2')
  await page.goBack()
  await expect(page.getByLabel('Distribution event', { exact: true })).toHaveValue('event-2')
  failEvents = true
  await page.reload()
  await expect(page.getByRole('alert')).toContainText('Events temporarily unavailable')
  failEvents = false
  await page.getByRole('button', { name: 'Retry events' }).click()
  await expect(page.getByLabel('Distribution event', { exact: true })).toHaveValue('event-2')

  await page.evaluate(() => sessionStorage.setItem('test-user', 'admin-2'))
  await page.reload()
  await expect(page.getByRole('region', { name: 'Draft history' })).toContainText('No saved push drafts')
  await expect(page.getByLabel('Notification title')).toHaveValue('')
  for (const role of ['BARANGAY_FACILITATOR', 'DSWD_STAFF']) {
    await page.evaluate((value) => sessionStorage.setItem('test-role', value), role)
    await page.goto(`${origin}/notifications?channel=push&distribution=event-1`)
    await expect(page.getByRole('heading', { name: 'SMS notifications and delivery monitoring' })).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'Notification channels' })).toHaveCount(0)
    await expect(page.getByLabel('Notification title')).toHaveCount(0)
  }
  assert.deepEqual(mutations, [], 'Push preparation never sends a message or mutates government records')
  assert.deepEqual([...unhandled], [])
  assert.deepEqual(errors, [])
  console.log(JSON.stringify({ result: 'Push notification UI checks passed', screenshots: output, mutations }))
} finally {
  await browser?.close()
  await vite.close()
}
