import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { createServer as createHttpServer } from 'node:http'
import { Server } from '../../garantiyaid-backend/node_modules/socket.io/dist/index.js'
import { chromium, expect } from '@playwright/test'
import { createServer } from 'vite'

// Local fixtures only: exercise the real screens without changing staff or beneficiary records.
const output = '../output/barangay-review'
await mkdir(output, { recursive: true })
const live = createHttpServer()
const io = new Server(live)
io.on('connection', socket => socket.emit('realtime.ready', {}))
await new Promise(resolve => live.listen(0, '127.0.0.1', resolve))
const vite = await createServer({ cacheDir: '../tmp/barangay-review-vite', server: { host: '127.0.0.1', port: 0, proxy: { '/socket.io': { target: `http://127.0.0.1:${live.address().port}`, ws: true } } } })
await vite.listen()
const origin = `http://127.0.0.1:${vite.httpServer.address().port}`
let browser
try {
  browser = await chromium.launch({ headless: true, channel: 'chrome' })
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  const page = await context.newPage()
  page.setDefaultTimeout(15000)
  page.setDefaultNavigationTimeout(60000)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const errors = [], unhandled = [], releases = []
  let eventsPresent = false, queueFails = false, eventListFails = false, duplicateFlag = false, claimStatus = 'VERIFIED'
  const barangay = { barangayId: 'barangay-1', barangayName: 'Poblacion', city: 'Cebu City', province: 'Cebu' }
  const beneficiary = { beneficiaryId: 'person-1', firstName: 'Maria', lastName: 'Santos', barangayId: barangay.barangayId, barangay }
  const event = { distributionId: 'event-1', title: 'Community food assistance', status: 'OPEN', distributionDate: '2026-11-03', startTime: '08:00', endTime: '17:00', location: 'Barangay Hall', deliveryMode: 'PHYSICAL_GOODS', verificationRequirement: 'QR', barangay, program: { programName: 'Food assistance', programCode: 'FOOD' } }
  const faceEvent = { ...event, distributionId: 'event-2', title: 'Face verification event', verificationRequirement: 'BIOMETRIC_AND_SIGNATURE' }
  const pagination = (total = 1) => ({ page: 1, pageSize: 100, total, totalPages: total ? 1 : 0 })
  const slot = { sessionLabel: 'Morning', slotStart: '2026-11-03T00:00:00Z', slotEnd: '2026-11-03T02:00:00Z', location: event.location }
  const schedule = { scheduleId: 'schedule-1', beneficiaryId: 'person-1', beneficiary, queueNumber: 1, status: 'CHECKED_IN', slot }
  const claim = () => ({ claimId: 'claim-1', beneficiaryId: 'person-1', beneficiary, distributionId: event.distributionId, distribution: event, claimStatus, isDuplicateFlag: duplicateFlag, qrVerified: true, verificationMethod: 'QR', schedule, allocation: { amount: '500' }, disputes: [], ...(claimStatus === 'CLAIMED' ? { releasedAt: '2026-11-03T01:00:00Z', releaseMethod: 'PHYSICAL_GOODS', releaseEvidenceReference: 'LOG-001' } : {}) })
  await page.context().addInitScript((barangay) => {
    sessionStorage.setItem('garantiyaid.accessToken', 'local-barangay-review')
    sessionStorage.setItem('garantiyaid.user', JSON.stringify({ userId: 'barangay-staff', role: 'BARANGAY_FACILITATOR', fullName: 'Barangay Staff', employeeId: 'BRGY-001', barangayId: barangay.barangayId, barangay, totpEnabled: true }))
  }, barangay)
  page.on('pageerror', (error) => errors.push(error.message))
  await page.context().route('**/api/v1/**', async (route) => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname.replace('/api/v1', '')
    const fail = (message) => route.fulfill({ status: 503, json: { error: { message } } })
    let data
    if (path === '/health') data = { timestamp: new Date().toISOString() }
    else if (path === '/staff-notifications') data = { notifications: [], unreadCount: 0, pagination: pagination(0) }
    else if (path === '/staff-notifications/unread-count') data = { unreadCount: 0 }
    else if (path === '/dashboard/overview') data = { overview: { generatedAt: '03 Nov 2026, 9:00 AM PHT', scope: { global: false }, programs: { activeProgramCount: 1 }, distributions: { totalMatchingDistributionCount: 2 }, beneficiaries: { approvedBeneficiaryCount: 4, claimedBeneficiaryCount: 2, verifiedBeneficiaryCount: 1, unclaimedAllocationCount: 2, claimCompletionPercentage: 50 }, queue: { scheduledCount: 1 }, financialVisibility: false } }
    else if (path === '/distributions') {
      if (eventListFails) return fail('Event list unavailable')
      const items = !eventsPresent || url.searchParams.get('status') === 'DRAFT' ? [] : [event, faceEvent]
      data = { distributions: items, pagination: pagination(items.length) }
    } else if (path === '/distributions/event-1' || path === '/distributions/event-2') data = { distribution: path.endsWith('event-1') ? event : faceEvent }
    else if (path.endsWith('/slots')) data = { slots: [], summary: { matchingSlotCount: 0, matchingCapacity: 0, sessionCount: 0 } }
    else if (path.endsWith('/schedules')) {
      if (queueFails) return fail('Queue records unavailable')
      const rows = path.includes('event-2') ? [{ ...schedule, claim: null, status: 'SCHEDULED' }] : [{ ...schedule, claim: { claimId: 'claim-1', claimStatus, releaseMethod: claimStatus === 'CLAIMED' ? 'PHYSICAL_GOODS' : null } }, { ...schedule, scheduleId: 'schedule-2', beneficiaryId: 'person-2', beneficiary: { ...beneficiary, beneficiaryId: 'person-2', firstName: 'Juan' }, queueNumber: 2, status: 'SCHEDULED' }]
      data = { schedules: rows, summary: { countsByStatus: { SCHEDULED: 1, CHECKED_IN: 1 } }, pagination: pagination(rows.length) }
    } else if (path === '/distributions/event-1/claims') data = { claims: [claim()], summary: { countsByStatus: { [claimStatus]: 1 } }, pagination: pagination() }
    else if (path === '/distributions/event-1/claims/claim-1') data = { claim: claim() }
    else if (path === '/distributions/event-1/claims/claim-1/release') {
      releases.push({ key: request.headers()['idempotency-key'], payload: request.postDataJSON() })
      claimStatus = 'CLAIMED'
      if (releases.length === 1) {
        io.emit('dashboard.metrics.updated', { distributionId: event.distributionId, eventId: 'fixture-release', occurredAt: new Date().toISOString(), data: { reason: 'PHYSICAL_ASSISTANCE_RELEASED' } })
        return fail('Response interrupted after saving the release')
      }
      assert.deepEqual(releases[1], releases[0], 'The retry must preserve the evidence and idempotency key')
      data = { claim: claim(), release: { evidence: { reference: 'LOG-001' } }, lifecycle: { claimStatus: 'CLAIMED' } }
    } else { unhandled.push(`${request.method()} ${path}`); return route.fulfill({ status: 404, json: { error: { message: `Missing fixture: ${path}` } } }) }
    await route.fulfill({ json: { data } })
  })
  async function screenshot(name) {
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 })
      const dialog = page.getByRole('dialog')
      const hasDialog = await dialog.count() > 0
      if (hasDialog) await dialog.getByRole('button', { name: 'Retry release record' }).scrollIntoViewIfNeeded()
      await page.screenshot({ path: `${output}/${name}-${width}.png`, fullPage: !hasDialog })
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${name} must fit ${width}px`)
      if (hasDialog) assert.ok(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth + 1), `${name} dialog must fit ${width}px`)
    }
    await page.setViewportSize({ width: 1440, height: 1000 })
  }

  await page.goto(`${origin}/dashboard`)
  await expect(page.getByRole('heading', { name: 'Barangay overview', exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Review verified claims', exact: true })).toHaveAttribute('href', '/claim-accountability?status=VERIFIED')
  await expect(page.getByRole('region', { name: 'Who handles the next step' })).toContainText('Admin')
  await screenshot('overview')

  await page.goto(`${origin}/facilitator/queue`)
  await expect(page.getByRole('heading', { name: 'No distribution work assigned' })).toBeVisible()
  const queueShortcut = page.getByRole('link', { name: 'View beneficiary queue', exact: true })
  await expect(queueShortcut).toHaveCount(0)
  eventsPresent = true
  await page.getByRole('button', { name: 'Refresh queue', exact: true }).click()
  await expect(page.getByRole('cell', { name: 'Maria Santos', exact: false })).toBeVisible()
  const queueSearch = page.getByLabel('Search beneficiary or queue number', { exact: true })
  await expect(queueSearch).toHaveAttribute('type', 'search')
  await expect(queueSearch.locator('..').locator('svg')).toBeVisible()
  await queueSearch.fill('Maria')
  await queueSearch.press('Enter')
  await expect(page).toHaveURL(/search=Maria/)
  await page.getByLabel('Filter by queue status', { exact: true }).selectOption('SCHEDULED')
  await expect(page).toHaveURL(/status=SCHEDULED/)
  await page.setViewportSize({ width: 390, height: 900 })
  await page.evaluate(() => window.scrollTo(0, 0))
  await expect(queueShortcut).toBeInViewport({ ratio: 1 })
  await page.screenshot({ path: `${output}/queue-shortcut-390.png` })
  const filteredUrl = page.url()
  await queueShortcut.press('Enter')
  const queueHeading = page.getByRole('heading', { name: 'Beneficiary queue', exact: true })
  await expect(queueHeading).toBeFocused()
  await expect(queueHeading).toBeInViewport({ ratio: 1 })
  const stickyHeader = await page.locator('.ga-staff-header').boundingBox()
  assert.ok((await queueHeading.boundingBox()).y >= stickyHeader.y + stickyHeader.height, 'Queue heading is visible below the sticky staff header')
  assert.equal(page.url(), filteredUrl)
  await expect(queueSearch).toHaveValue('Maria')
  await expect(page.getByLabel('Filter by queue status', { exact: true })).toHaveValue('SCHEDULED')
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.getByRole('button', { name: 'Clear filters', exact: true }).click()
  await expect(queueSearch).toHaveValue('')
  await expect(queueSearch).toBeFocused()
  await expect(page.getByLabel('Filter by queue status', { exact: true })).toHaveValue('')
  await expect.poll(() => new URL(page.url()).searchParams.has('search') || new URL(page.url()).searchParams.has('status')).toBe(false)
  await expect(page.getByRole('cell', { name: 'Maria Santos', exact: false })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Review claim', exact: true }).first()).toHaveAttribute('href', '/claim-accountability?distribution=event-1&claim=claim-1')
  await page.setViewportSize({ width: 390, height: 900 })
  const mobileRow = page.getByRole('list', { name: 'Beneficiary distribution schedules' }).getByRole('listitem').filter({ hasText: 'Maria Santos' })
  await expect(mobileRow).toContainText('Appointment')
  await expect(mobileRow).toContainText('Checked In')
  await expect(mobileRow).toContainText('Claim verified')
  await expect(mobileRow.getByRole('link', { name: 'Review claim' })).toHaveAttribute('href', '/claim-accountability?distribution=event-1&claim=claim-1')
  await screenshot('queue')
  queueFails = true
  await page.getByRole('button', { name: 'Refresh queue', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Queue records unavailable')
  await expect(page.getByRole('link', { name: 'Review claim', exact: true })).toHaveCount(0)
  queueFails = false
  await page.getByRole('button', { name: 'Try again', exact: true }).click()
  await expect(page.getByRole('cell', { name: 'Maria Santos', exact: false })).toBeVisible()
  await page.getByLabel('Distribution event', { exact: true }).selectOption('event-2')
  await expect(page.getByRole('link', { name: 'Verify identity', exact: true }).first()).toHaveAttribute('href', '/biometrics?distribution=event-2&view=verify&beneficiary=person-1')
  await expect(page.getByRole('link', { name: 'Review claim', exact: true })).toHaveCount(0)
  await page.getByLabel('Distribution event', { exact: true }).selectOption('event-1')
  await page.getByRole('link', { name: 'Review claim', exact: true }).first().click()
  await expect(page.getByRole('heading', { name: 'Maria Santos', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Issue receipt', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: 'Mark released', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Record the release' })
  await dialog.getByRole('button', { name: 'Mark assistance released', exact: true }).click()
  assert.equal(releases.length, 0, 'Missing evidence and acknowledgment must not submit')
  await dialog.getByLabel('Evidence reference', { exact: true }).fill('LOG-001')
  await dialog.getByRole('checkbox').check()
  const observer = await page.context().newPage()
  await observer.setViewportSize({ width: 390, height: 900 })
  await observer.goto(`${origin}/facilitator/queue?distribution=event-1&search=Maria`)
  await expect(observer.getByText('Live', { exact: true })).toBeVisible()
  await expect(observer.getByRole('link', { name: 'Review claim', exact: true }).first()).toBeVisible()
  await dialog.getByRole('button', { name: 'Mark assistance released', exact: true }).click()
  await expect(observer.locator('[data-sonner-toast]')).toContainText('Physical assistance released')
  await expect(observer.getByRole('link', { name: 'View release / receipt', exact: true }).first()).toBeVisible()
  await expect(observer.getByLabel('Search beneficiary or queue number')).toHaveValue('Maria')
  await observer.screenshot({ path: `${output}/live-release-390.png`, animations: 'disabled' })
  await observer.close()
  await expect(dialog.getByRole('button', { name: 'Retry release record', exact: true })).toBeVisible()
  await expect(dialog.getByLabel('Evidence reference', { exact: true })).toBeDisabled()
  await expect(dialog.getByLabel('Evidence type', { exact: true })).toBeDisabled()
  await screenshot('release-retry')
  await dialog.getByRole('button', { name: 'Retry release record', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Released', exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Issue receipt', exact: true })).toBeEnabled()
  assert.equal(releases.length, 2)

  duplicateFlag = true
  claimStatus = 'PENDING'
  await page.reload()
  await expect(page.getByText('Flagged for review', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Mark released', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: 'File dispute', exact: true }).click()
  const concern = page.getByRole('dialog', { name: 'File a claim dispute' })
  await expect(concern.getByLabel('Reason', { exact: true })).toHaveValue('OTHER')
  await concern.getByRole('button', { name: 'Cancel', exact: true }).click()
  duplicateFlag = false
  claimStatus = 'CLAIMED'

  eventListFails = true
  await page.goto(`${origin}/facilitator/queue`)
  await expect(page.getByRole('alert')).toContainText('Event list unavailable')
  eventListFails = false
  await page.getByRole('button', { name: 'Try again', exact: true }).click()
  await expect(page.getByRole('link', { name: 'View release / receipt', exact: true }).first()).toBeVisible()
  assert.deepEqual(errors, [])
  assert.deepEqual(unhandled, [])
  console.log('Barangay checks passed: overview, empty/error recovery, scoped next steps, evidence validation, and safe release retry; layouts at 1440, 390, and 320px.')
} finally {
  await browser?.close()
  await vite.close()
  await new Promise(resolve => io.close(resolve))
}
