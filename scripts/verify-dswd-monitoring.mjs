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
  let claimsGate, disputesGate, eventsGate
  let physicalClaims = 4
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
      await eventsGate
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
      const snapshot = summary(n)
      if (n === 2) {
        snapshot.beneficiaries.scheduleStatusCounts.SCHEDULED = 5
        snapshot.beneficiaries.claimStatusCounts.VERIFIED = Math.max(0, 6 - physicalClaims)
        snapshot.beneficiaries.physicalHandoverCount = physicalClaims
        snapshot.beneficiaries.claimedCount = physicalClaims
        snapshot.beneficiaries.claimStatusCounts.CLAIMED = physicalClaims
      }
      data = { summary: snapshot }
    } else if (path.endsWith('/claim-disputes')) {
      await disputesGate
      data = { disputes: [], summary: { countsByStatus: { OPEN: 1, REFERRED: 1 } }, pagination: pagination() }
    }
    else if (path.endsWith('/claims')) {
      await claimsGate
      data = { claims: [], summary: { countsByStatus: { PENDING: pending, VERIFIED: 2 } }, pagination: pagination() }
    }
    else if (path.endsWith('/transactions')) data = { transactions: [], summary: {}, pagination: pagination() }
    else if (path.endsWith('/reconciliation')) data = { reconciliation: { readyToClose: false, ledgerBalanced: true, deliveryMode: 'SIMULATED_WALLET', exceptions: [] }, simulation: {} }
    else if (path.endsWith('/creditable-claims')) data = { claims: [], summary: { creditableClaimCount: 0 }, pagination: pagination() }
    else { unhandled.push(path); return route.fulfill({ status: 404, json: { error: { message: 'Missing fixture' } } }) }
    await route.fulfill({ json: { data } })
  })
  await page.goto(origin + '/dashboard')
  await expect(page.getByRole('heading', { name: 'DSWD overview' })).toBeVisible()
  let loadWorkspaceShell
  const shellGate = new Promise(resolve => { loadWorkspaceShell = resolve })
  await page.route(/\/src\/components\/layout\/DashboardShell\.jsx(?:\?|$)/, async route => {
    await shellGate
    await route.continue()
  }, { times: 1 })
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.reload({ waitUntil: 'domcontentloaded' })
  const workspaceLoader = page.getByRole('status').filter({ hasText: 'Loading staff workspace...' })
  const waves = workspaceLoader.locator('[data-slot="liquid-wave-spinner"] path')
  await expect(workspaceLoader).toBeVisible()
  await expect(waves).toHaveCount(3)
  const [back, middle, front] = await waves.evaluateAll(paths => paths.map(path => getComputedStyle(path).fill))
  assert.equal(back, front)
  assert.notEqual(middle, front)
  const waveStyle = property => waves.first().evaluate((path, name) => getComputedStyle(path)[name], property)
  await expect.poll(() => waveStyle('animationName')).toBe('ga-liquid-wave')
  const firstFrame = await waveStyle('transform')
  await expect.poll(() => waveStyle('transform')).not.toBe(firstFrame)
  await page.setViewportSize({ width: 320, height: 900 })
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect.poll(() => waveStyle('animationName')).toBe('none')
  await page.screenshot({ path: `${output}/workspace-refresh-320.png` })
  await page.setViewportSize({ width: 1440, height: 1000 })
  loadWorkspaceShell()
  await expect(page.getByRole('heading', { name: 'DSWD overview' })).toBeVisible()
  await expect(workspaceLoader).toHaveCount(0)
  await expect(page.getByRole('link', { name: '3 Under validation' })).toBeVisible()
  await expect(page.getByRole('link', { name: '12 Pending review' })).toBeVisible()
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
  await expect(page.getByRole('link', { name: '12 Pending review' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'View work remaining' }).first()).toBeVisible()
  failReviews = false
  await page.getByRole('button', { name: 'Retry enrollment reviews' }).click()
  await expect(page.getByRole('alert')).toHaveCount(0)
  await page.getByRole('link', { name: 'View work remaining' }).first().click()
  const selected = page.getByRole('region', { name: 'Selected event monitoring' })
  await expect(selected.getByRole('heading', { name: 'Community assistance 1', exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Open simulated wallets' })).toHaveAttribute('href', /^\/dswd\/ledger\?workspace=wallets&monitorFrom=/)
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
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  const staffNav = await page.locator('#staff-navigation').elementHandle()
  let loadClaimsModule, loadClaimRecords
  const claimsModuleGate = new Promise(resolve => { loadClaimsModule = resolve })
  claimsGate = new Promise(resolve => { loadClaimRecords = resolve })
  await page.route(/\/src\/pages\/ClaimAccountabilityPage\.jsx(?:\?|$)/, async route => {
    await claimsModuleGate
    await route.continue()
  }, { times: 1 })
  await selected.getByRole('link', { name: 'Review claims', exact: true }).first().click()
  await expect(page.getByRole('status').filter({ hasText: 'Loading page content' })).toBeAttached()
  await expect(page.getByRole('heading', { name: 'Claims and receipts', exact: true })).toBeVisible()
  assert.equal(await staffNav.evaluate(element => element.isConnected), true)
  assert.equal(await page.evaluate(() => scrollY), 0)
  await expect(page.locator('#dashboard-content')).toBeFocused()
  await expect(selected).toHaveCount(0)
  loadClaimsModule()
  const claimsLoading = page.getByRole('status', { name: 'Loading claims and receipts' })
  await expect(claimsLoading).toBeVisible()
  const shimmer = claimsLoading.locator('[data-slot="skeleton"]').first()
  const shimmerStyle = property => shimmer.evaluate((node, name) => getComputedStyle(node, '::after')[name], property)
  assert.equal(await shimmerStyle('animationName'), 'ga-skeleton-sweep')
  const firstPosition = await shimmerStyle('transform')
  await expect.poll(() => shimmerStyle('transform')).not.toBe(firstPosition)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect.poll(() => shimmerStyle('animationName')).toBe('none')
  await expect(page.getByText('No matching claim records')).toHaveCount(0)
  loadClaimRecords()
  await expect(page.getByText('No matching claim records')).toBeVisible()
  await expect(page.getByLabel('Status', { exact: true })).toHaveValue('PENDING')
  const disputeTab = page.getByRole('tab', { name: 'Dispute review', exact: true })
  let loadDisputes
  disputesGate = new Promise(resolve => { loadDisputes = resolve })
  await disputeTab.click()
  await expect(disputeTab).toBeFocused()
  await expect(page.getByRole('status', { name: 'Loading dispute cases' })).toBeVisible()
  await expect(page.getByText('No matching claim records')).toHaveCount(0)
  await expect(page.getByText('No matching disputes', { exact: true })).toHaveCount(0)
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 900 })
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth), { message: `${width}px claims loading overflow` }).toBeLessThanOrEqual(1)
  }
  await page.setViewportSize({ width: 1440, height: 1000 })
  loadDisputes()
  await expect(page.getByText('No matching disputes', { exact: true })).toBeVisible()
  await expect(disputeTab).toBeFocused()
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
  const oldUpdate = await selected.getByText(/Counts last synced/).textContent()
  failDetails = true
  await page.getByRole('button', { name: 'Refresh data', exact: true }).click()
  await expect(selected.getByRole('alert')).toContainText('Counts may have changed')
  await expect(selected.getByText(/Counts last synced/)).toHaveText(oldUpdate)
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
  await expect(page.getByText('Live', { exact: true })).toBeVisible()
  const popup = page.locator('[data-sonner-toast]')
  const release = { eventId: 'handover-2', distributionId: 'event-2', occurredAt: '2026-11-03T06:32:05Z', data: { reason: 'PHYSICAL_ASSISTANCE_RELEASED', queueNumber: 17, claimId: 'claim-17' } }
  const activity = selected.getByRole('region', { name: 'Recent activity' })
  const stats = selected.locator('dl[aria-label="Distribution statistics"] dd')
  async function sampleScreenshot(name, fullPage = false) {
    const label = await page.addStyleTag({ content: '.ga-page-title::after { display: block; width: fit-content; margin-top: 6px; padding: 4px 8px; color: #195580; background: #e5f0fc; border-radius: 4px; font: 600 13px/1.3 system-ui; letter-spacing: normal; content: "Sample data · Simulated stream"; }' })
    try {
      await page.screenshot({ path: `${output}/${name}.png`, fullPage, animations: 'disabled' })
    } finally { await label.evaluate(element => element.remove()) }
  }
  await expect(stats).toHaveText(['5', '2', '4'])
  await page.evaluate(() => window.scrollTo(0, 0))
  await sampleScreenshot('handover-before-1440')
  await page.setViewportSize({ width: 390, height: 900 })
  await sampleScreenshot('handover-before-390')
  await page.setViewportSize({ width: 1440, height: 1000 })
  const selectedUrl = page.url()
  await page.getByLabel('Find event').focus()
  physicalClaims++
  io.emit('dashboard.metrics.updated', { ...release, eventId: 'elsewhere', distributionId: 'event-1', data: { reason: 'DISTRIBUTION_CLOSED' } })
  io.emit('claim.released', { ...release, eventId: 'detail-2' })
  io.emit('dashboard.metrics.updated', release)
  await expect(popup).toHaveCount(1)
  await expect(popup).toContainText('Physical assistance released')
  await expect(popup).toContainText('Community assistance 2')
  await expect(popup).toContainText(/2:32:05\s*pm PHT/i)
  await expect(popup).toContainText('Queue 17')
  await expect(activity.getByRole('link', { name: 'View claim' })).toHaveAttribute('href', /claim=claim-17/)
  await expect(stats).toHaveText(['5', '1', '5'])
  await expect(selected.getByText('5 completed claims')).toBeVisible()
  await expect(page.getByLabel('Find event')).toBeFocused()
  assert.equal(page.url(), selectedUrl)
  await page.evaluate(() => window.scrollTo(0, 0))
  await sampleScreenshot('handover-update-1440')
  await page.setViewportSize({ width: 390, height: 900 })
  await sampleScreenshot('handover-update-390')
  await page.setViewportSize({ width: 1440, height: 1000 })
  if (await popup.count()) await popup.getByRole('button', { name: /close/i }).click()
  await expect(popup).toHaveCount(0)
  io.emit('dashboard.metrics.updated', release)
  await expect(page.getByText('Physical assistance released', { exact: true })).toHaveCount(1)
  const receipt = { ...release, eventId: 'receipt-17', occurredAt: '2026-11-03T06:32:12Z', data: { reason: 'CLAIM_RECEIPT_ISSUED', claimId: 'claim-17' } }
  io.emit('dashboard.metrics.updated', receipt)
  io.emit('dashboard.metrics.updated', { ...release, eventId: 'check-17', occurredAt: '2026-11-03T06:32:04Z', data: { reason: 'QR_CLAIM_UPDATED', claimId: 'claim-17' } })
  await expect(popup).toContainText('2 distribution updates')
  await expect(activity.getByRole('listitem')).toHaveCount(3)
  await expect(activity.getByRole('listitem').first()).toContainText('Claim receipt issued')
  await expect(stats).toHaveText(['5', '1', '5'])
  await popup.getByRole('button', { name: /close/i }).click()
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 })
    await page.evaluate(() => window.scrollTo(0, 0))
    await sampleScreenshot(`monitoring-${width}`, true)
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${width}px monitoring overflow`)
    if (width < 1280) {
      await expect(page.getByLabel('Find event')).not.toBeVisible()
      await expect(page.getByRole('region', { name: 'Distribution events', exact: true })).not.toBeVisible()
      await page.getByRole('button', { name: 'Choose event', exact: true }).click()
      await expect(page.getByRole('region', { name: 'Distribution events', exact: true })).toBeVisible()
      await expect(page.getByLabel('Find event')).toBeVisible()
      await page.getByRole('button', { name: /Community assistance 2 Poblacion/ }).click()
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 })
  io.disconnectSockets(true)
  await expect(page.getByText('Live updates paused', { exact: true })).toBeVisible()
  await page.evaluate(() => window.scrollTo(0, 0))
  await sampleScreenshot('handover-disconnected-1440')
  await page.setViewportSize({ width: 390, height: 900 })
  await sampleScreenshot('handover-disconnected-390')
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.reload()
  await expect(page.getByText('Live', { exact: true })).toBeVisible()
  for (const socket of io.sockets.sockets.values()) socket.conn.close()
  await expect(page.getByText('Live updates paused', { exact: true })).toBeVisible()
  physicalClaims++
  await expect(page.getByText('Live', { exact: true })).toBeVisible({ timeout: 15_000 })
  await expect(selected.getByText('6 completed claims')).toBeVisible({ timeout: 25_000 })
  await expect(popup).toHaveCount(0)
  await page.clock.install()
  await page.reload()
  await expect(page.getByText('Live', { exact: true })).toBeVisible()
  io.disconnectSockets(true)
  await expect(page.getByText('Live updates paused', { exact: true })).toBeVisible()
  const previousReads = detailReads
  pending = 7
  await page.clock.fastForward(61_000)
  await expect.poll(() => detailReads).toBeGreaterThan(previousReads)
  await expect(selected.getByRole('heading', { name: 'Verification in progress 7' })).toBeVisible()

  failEvents = true
  await page.getByRole('button', { name: 'Refresh data', exact: true }).click()
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
  await expect(page.getByRole('link', { name: 'Open simulated wallets' })).toBeVisible()
  await expect(selected.getByRole('link', { name: 'Review records' }).filter({ hasText: 'Review records' }).first()).toBeVisible()
  await expect(selected.locator('a[href*="/admin/schedules"]').first()).toHaveAttribute('href', /status=SCHEDULED/)
  const adminNav = await page.locator('#staff-navigation').elementHandle()
  let loadEvents
  eventsGate = new Promise(resolve => { loadEvents = resolve })
  await page.locator('#staff-navigation').getByRole('link', { name: 'Verify QR claims', exact: true }).click()
  await expect(page.getByRole('status', { name: 'Loading distribution events' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'No open distribution event' })).toHaveCount(0)
  loadEvents()
  await expect(page.getByRole('region', { name: 'Selected distribution event' })).toBeVisible()
  assert.equal(await adminNav.evaluate(element => element.isConnected), true)
  assert.ok(reads.some((query) => query.search === 'Rain'))
  assert.ok(reads.some((query) => query.page === '14'))
  assert.deepEqual(errors, [])
  assert.deepEqual(unhandled, [])
  console.log(JSON.stringify({ result: 'Monitoring, Claims and receipts, and Verify QR claims: navigation skeletons, focus, live updates, fallback, and mobile checks passed', screenshots: output }))
} finally {
  await browser?.close()
  await vite.close()
  await new Promise((resolve) => io.close(resolve))
}
