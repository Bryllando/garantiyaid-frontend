import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { createServer as createHttpServer } from 'node:http'
import { Server } from '../../garantiyaid-backend/node_modules/socket.io/dist/index.js'
import { chromium, expect } from '@playwright/test'
import { createServer } from 'vite'

// All API records are fixtures; this suite never sends email or changes staff data.
const output = '../output/dswd-monitoring'
await mkdir(output, { recursive: true })
const live = createHttpServer()
const io = new Server(live)
io.on('connection', (socket) => socket.emit('realtime.ready', {}))
await new Promise((resolve) => live.listen(0, '127.0.0.1', resolve))
const vite = await createServer({ cacheDir: '../tmp/dswd-monitoring-vite', server: { host: '127.0.0.1', port: 0, proxy: { '/socket.io': { target: `http://127.0.0.1:${live.address().port}`, ws: true } } } })
await vite.listen()
const origin = `http://127.0.0.1:${vite.httpServer.address().port}`
let browser
try {
  browser = await chromium.launch({ headless: true, channel: 'chrome' })
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  page.setDefaultTimeout(10000)
  page.setDefaultNavigationTimeout(45000)
  const errors = [], unhandled = [], reads = []
  let failReviews = false, failEvents = false, failDetails = false, empty = false, slowEvent = false, detailReads = 0, pending = 3
  const funds = { allocatedAmount: '15000', netCreditedAmount: '6000', remainingAmount: '9000', reversedAmount: '0', failedAmount: '0' }
  const event = (n) => ({ distributionId: `event-${n}`, title: n === 105 ? 'Rain assistance' : `Community assistance ${n}`, distributionDate: '2026-10-28', status: n === 104 ? 'DRAFT' : 'OPEN', location: 'Community hall', deliveryMode: n === 2 ? 'PHYSICAL_GOODS' : 'SIMULATED_WALLET', verificationRequirement: 'QR', program: { programId: 'program-1', programName: 'Community assistance', programCode: 'AID' }, barangay: { barangayName: 'Poblacion' } })
  const enrollment = (status) => ({ enrollmentId: status === 'PENDING' ? 'enrollment-1' : 'enrollment-2', status, beneficiary: { firstName: status === 'PENDING' ? 'Maria' : 'Elena', lastName: 'Santos' }, program: event(1).program, createdAt: '2026-10-27T01:00:00Z' })
  const summary = (n) => ({ distribution: event(n), generatedAt: '28 Oct 2026, 9:00 AM PHT', fundUtilization: funds, beneficiaries: { claimedCount: 4, scheduleStatusCounts: { SCHEDULED: n, CHECKED_IN: 5, MISSED: 1 }, claimStatusCounts: { PENDING: pending, VERIFIED: 2, CLAIMED: 4 } }, qrScans: { duplicateCount: 1, invalidCount: 2 }, biometrics: { noMatchCount: 1, livenessFailedCount: 0 } })
  const pagination = (total = 0, page = 1, pageSize = 20) => ({ total, page, pageSize, totalPages: Math.ceil(total / pageSize) })
  await page.addInitScript(() => {
    sessionStorage.setItem('garantiyaid.accessToken', 'local-monitor-test')
    sessionStorage.setItem('garantiyaid.user', JSON.stringify({ userId: 'staff-1', role: sessionStorage.getItem('monitor-role') || 'DSWD_STAFF', fullName: 'DSWD Reviewer' }))
  })
  page.on('pageerror', (error) => { errors.push(error.message); console.error(error.message) })
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname.replace('/api/v1', '')
    assert.equal(request.method(), 'GET', 'Monitoring must not mutate any records')
    const fail = () => route.fulfill({ status: 503, json: { error: { message: 'Fixture service unavailable' } } })
    let data
    if (path === '/health') data = { timestamp: new Date().toISOString() }
    else if (path === '/staff-notifications') data = { notifications: [], unreadCount: 0, pagination: pagination() }
    else if (path === '/staff-notifications/unread-count') data = { unreadCount: 0 }
    else if (path === '/dashboard/overview') data = { overview: { generatedAt: '28 Oct 2026, 9:00 AM PHT', scope: { global: true }, programs: { activeProgramCount: 2 }, distributions: { totalMatchingDistributionCount: 105, openDistributionCount: 104, statusCounts: { DRAFT: 1 } }, beneficiaries: { approvedBeneficiaryCount: 25, claimedBeneficiaryCount: 4 }, fundUtilization: funds } }
    else if (path === '/enrollments') { if (failReviews) return fail(); const status = url.searchParams.get('status'); data = { enrollments: [enrollment(status)], pagination: pagination(status === 'PENDING' ? 12 : 3) } }
    else if (path === '/distributions') {
      if (failEvents) return fail()
      reads.push(Object.fromEntries(url.searchParams))
      const status = url.searchParams.get('status'), search = (url.searchParams.get('search') || '').toLowerCase()
      const list = empty ? [] : Array.from({ length: 105 }, (_, index) => event(index + 1)).filter((item) => (!status || item.status === status) && `${item.title} ${item.location}`.toLowerCase().includes(search))
      const size = Number(url.searchParams.get('pageSize') || 20), number = Number(url.searchParams.get('page') || 1)
      data = { distributions: list.slice((number - 1) * size, number * size), pagination: pagination(list.length, number, size) }
    } else if (/^\/distributions\/event-\d+$/.test(path)) data = { distribution: event(Number(path.split('-').at(-1))) }
    else if (/^\/dashboard\/distributions\/event-\d+$/.test(path)) {
      detailReads++
      const n = Number(path.split('-').at(-1))
      if (slowEvent && n === 1) await new Promise((resolve) => setTimeout(resolve, 650))
      if (failDetails) return fail()
      data = { summary: summary(n) }
    } else if (path.endsWith('/claim-disputes')) data = { disputes: [], summary: { countsByStatus: { OPEN: 1, REFERRED: 1 } }, pagination: pagination() }
    else if (path.endsWith('/claims')) data = { claims: [], summary: { countsByStatus: { PENDING: pending, VERIFIED: 2 } }, pagination: pagination() }
    else if (path.endsWith('/transactions')) data = { transactions: [], summary: {}, pagination: pagination() }
    else if (path.endsWith('/reconciliation')) data = { reconciliation: { readyToClose: false, ledgerBalanced: true, deliveryMode: 'SIMULATED_WALLET', exceptions: [] }, simulation: {} }
    else if (path.endsWith('/creditable-claims')) data = { claims: [], summary: { creditableClaimCount: 0 }, pagination: pagination() }
    else { unhandled.push(path); return route.fulfill({ status: 404, json: { error: { message: 'Missing fixture' } } }) }
    await route.fulfill({ json: { data } })
  })
  await page.goto(origin + '/dashboard')
  await expect(page.getByRole('heading', { name: 'DSWD overview' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Under validation (3)' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Pending review (12)' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Open review' }).first()).toHaveAttribute('href', '/enrollments?status=FOR_VALIDATION&enrollment=enrollment-2')
  await page.screenshot({ path: `${output}/overview-1440.png`, fullPage: true })
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 900 })
    await page.screenshot({ path: `${output}/overview-${width}.png`, fullPage: true, animations: 'disabled' })
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${width}px overview overflow`)
  }
  await page.setViewportSize({ width: 1440, height: 1000 })
  failReviews = true
  await page.getByRole('button', { name: 'Refresh records', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Enrollment reviews could not be refreshed')
  await expect(page.getByRole('link', { name: 'Pending review (12)' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'View work remaining' }).first()).toBeVisible()
  failReviews = false
  await page.getByRole('button', { name: 'Retry enrollment reviews' }).click()
  await expect(page.getByRole('alert')).toHaveCount(0)
  await page.getByRole('link', { name: 'View work remaining' }).first().click()
  const selected = page.getByRole('region', { name: 'Selected event monitoring' })
  await expect(selected.getByRole('heading', { name: 'Community assistance 1', exact: true })).toBeVisible()
  await expect(selected.getByText('Responsible: DSWD staff')).toBeVisible()
  await expect(selected.getByRole('link', { name: 'Review attendance' }).first()).toHaveAttribute('href', /report=SCHEDULES&status=SCHEDULED/)
  await selected.getByRole('link', { name: 'Review attendance' }).first().click()
  await expect(page.getByLabel('Report type', { exact: true })).toHaveValue('SCHEDULES')
  await expect(page.getByLabel('Status', { exact: true })).toHaveValue('SCHEDULED')
  await expect(page.getByLabel('Distribution event', { exact: true })).toHaveValue('event-1')
  await page.reload()
  await expect(page.getByLabel('Report type', { exact: true })).toHaveValue('SCHEDULES')
  await page.getByRole('link', { name: 'Return to live monitoring' }).click()
  await expect(selected.getByRole('heading', { name: 'Community assistance 1', exact: true })).toBeVisible()
  await selected.getByRole('link', { name: 'Review claims', exact: true }).first().click()
  await expect(page.getByLabel('Status', { exact: true })).toHaveValue('PENDING')
  await page.getByRole('link', { name: 'Return to live monitoring' }).click()
  await selected.getByRole('link', { name: 'Review credit queue', exact: true }).click()
  await expect(page.getByLabel('Distribution event', { exact: true })).toHaveValue('event-1')
  await page.getByRole('link', { name: 'Return to live monitoring' }).click()

  await page.getByLabel('Find event').fill('Rain')
  await page.getByRole('button', { name: 'Apply filters' }).click()
  await expect(selected.getByRole('heading', { name: 'Rain assistance', exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByLabel('Find event')).toHaveValue('Rain')
  await expect(selected.getByRole('heading', { name: 'Rain assistance', exact: true })).toBeVisible()
  assert.equal(new URL(page.url()).searchParams.get('distribution'), 'event-105')
  await page.goto(origin + '/dswd/live-dashboard?status=ALL&page=14&distribution=event-105')
  await expect(page.getByText('Page 14 of 14')).toBeVisible()
  await expect(selected.getByRole('heading', { name: 'Rain assistance', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Previous events' }).click()
  await expect(page.getByText('Page 13 of 14')).toBeVisible()
  await page.getByRole('button', { name: 'Next events' }).click()
  await expect(page.getByText('Page 14 of 14')).toBeVisible()

  await page.goto(origin + '/dswd/live-dashboard?status=OPEN&distribution=event-2')
  await expect(selected.getByText('Awaiting physical release')).toBeVisible()
  await expect(selected.getByRole('link', { name: 'Review credit queue' })).toHaveCount(0)
  await page.goto(origin + '/dswd/live-dashboard?status=DRAFT&distribution=event-104')
  await expect(selected).toContainText('Admin must complete setup')
  await expect(selected.getByRole('link', { name: 'Review credit queue' })).toHaveCount(0)

  await page.goto(origin + '/dswd/live-dashboard?status=OPEN&distribution=event-1')
  await expect(selected.getByRole('heading', { name: 'Community assistance 1', exact: true })).toBeVisible()
  const oldUpdate = await selected.getByText(/Last successful event update:/).textContent()
  failDetails = true
  await page.getByRole('button', { name: 'Refresh monitoring', exact: true }).click()
  await expect(selected.getByRole('alert')).toContainText('Counts may have changed')
  await expect(selected.getByText(/Last successful event update:/)).toHaveText(oldUpdate)
  failDetails = false
  await selected.getByRole('button', { name: 'Retry event details' }).click()
  await expect(selected.getByRole('alert')).toHaveCount(0)
  slowEvent = true
  await page.getByRole('button', { name: /Community assistance 2 Poblacion/ }).click()
  await expect(selected.getByText('Awaiting physical release')).toBeVisible()
  await page.getByRole('button', { name: /Community assistance 1 Poblacion/ }).click()
  await page.getByRole('button', { name: /Community assistance 2 Poblacion/ }).click()
  await expect(selected.getByText('Awaiting physical release')).toBeVisible()
  await page.waitForTimeout(750)
  await expect(selected.getByRole('heading', { name: 'Community assistance 2', exact: true })).toBeVisible()
  slowEvent = false
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 })
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.screenshot({ path: `${output}/monitoring-${width}.png`, fullPage: true, animations: 'disabled' })
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${width}px monitoring overflow`)
    if (width < 1280) {
      await expect(page.getByLabel('Find event')).not.toBeVisible()
      await page.getByRole('button', { name: /Filter events/ }).click()
      await expect(page.getByLabel('Find event')).toBeVisible()
      await page.getByRole('button', { name: /Filter events/ }).click()
      await expect(page.getByRole('region', { name: 'Distribution events', exact: true })).not.toBeVisible()
      await page.getByRole('button', { name: 'Choose distribution event' }).click()
      await expect(page.getByRole('region', { name: 'Distribution events', exact: true })).toBeVisible()
      await page.getByRole('button', { name: /Community assistance 2 Poblacion/ }).click()
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.clock.install()
  await page.reload()
  await expect(page.getByText(/Live updates connected\./)).toBeVisible()
  io.disconnectSockets(true)
  await expect(page.getByText(/Live updates disconnected\./)).toBeVisible()
  const previousReads = detailReads
  pending = 7
  await page.clock.fastForward(61_000)
  await expect.poll(() => detailReads).toBeGreaterThan(previousReads)
  await expect(selected.getByRole('heading', { name: 'Verification in progress 7' })).toBeVisible()

  failEvents = true
  await page.getByRole('button', { name: 'Refresh monitoring', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Event list could not be refreshed')
  failEvents = false
  await page.getByRole('button', { name: 'Retry event list' }).click()
  await expect(page.getByRole('alert')).toHaveCount(0)
  empty = true
  await page.goto(origin + '/dswd/live-dashboard?status=OPEN')
  await expect(page.getByRole('heading', { name: 'No matching events' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Select an event' })).toBeVisible()
  empty = false
  await page.evaluate(() => sessionStorage.setItem('monitor-role', 'BARANGAY_FACILITATOR'))
  const deniedReads = reads.length
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Monitoring access required' })).toBeVisible()
  assert.equal(reads.length, deniedReads)
  await page.evaluate(() => sessionStorage.setItem('monitor-role', 'SYSTEM_ADMIN'))
  await page.reload()
  await expect(selected.getByRole('link', { name: 'Review records' }).filter({ hasText: 'Review records' }).first()).toBeVisible()
  await expect(selected.locator('a[href*="/admin/schedules"]').first()).toHaveAttribute('href', /status=SCHEDULED/)
  assert.ok(reads.some((query) => query.search === 'Rain'))
  assert.ok(reads.some((query) => query.page === '14'))
  assert.deepEqual(errors, [])
  assert.deepEqual(unhandled, [])
  console.log(JSON.stringify({ result: 'DSWD overview and monitoring: scoped work links, return navigation, paging, stale data, live fallback and mobile checks passed', screenshots: output }))
} finally {
  await browser?.close()
  await vite.close()
  await new Promise((resolve) => io.close(resolve))
}
