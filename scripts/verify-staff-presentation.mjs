import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium, expect } from '@playwright/test'
import { createServer } from 'vite'

// Fake staff sessions and API records keep these checks independent of live accounts.
const output = resolve('../output/staff-presentation')
await mkdir(output, { recursive: true })
const vite = await createServer({ cacheDir: resolve(output, '.vite'), logLevel: 'error', define: { 'import.meta.env.VITE_API_URL': JSON.stringify('/api/v1') }, server: { host: '127.0.0.1', port: 0, hmr: false } })
await vite.listen()
const origin = `http://127.0.0.1:${vite.httpServer.address().port}`
const barangay = { barangayId: 'barangay-1', barangayName: 'Poblacion', city: 'Cebu City', province: 'Cebu', isActive: true }
const program = { programId: 'program-1', programName: 'Community Assistance', programCode: 'AID-2026', status: 'ACTIVE' }
const beneficiary = { beneficiaryId: 'beneficiary-1', firstName: 'Maria', lastName: 'Santos', barangay, status: 'ACTIVE' }
const distribution = { distributionId: 'event-1', title: 'October community assistance', program, barangay, distributionDate: '2026-10-21', startTime: '08:00', endTime: '12:00', location: 'Barangay Hall', deliveryMode: 'SIMULATED_WALLET', verificationRequirement: 'QR', status: 'OPEN' }
const funds = { allocatedAmount: 15000, netCreditedAmount: 7500, remainingAmount: 7500, reversedAmount: 0, failedAmount: 0 }
const pagination = { page: 1, totalPages: 1, total: 1, pageSize: 20 }
const roles = [
  ['SYSTEM_ADMIN', 'admin', 'Administration overview'],
  ['DSWD_STAFF', 'dswd', 'DSWD overview'],
  ['BARANGAY_FACILITATOR', 'barangay', 'Barangay overview'],
]
let browser
let adminStyle
try {
  browser = await chromium.launch({ headless: true, channel: 'chrome' })
  for (const [role, name, heading] of roles) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
    const user = { userId: `${name}-1`, role, fullName: `${name.toUpperCase()} Staff`, employeeId: `${name}-001`, email: `${name}@example.test`, isActive: true, totpEnabled: true, ...(name === 'barangay' ? { barangayId: barangay.barangayId, barangay } : {}) }
    await context.addInitScript((staff) => {
      sessionStorage.setItem('garantiyaid.accessToken', 'staff-presentation-preview')
      sessionStorage.setItem('garantiyaid.user', JSON.stringify(staff))
    }, user)
    const page = await context.newPage()
    page.setDefaultTimeout(15000)
    page.setDefaultNavigationTimeout(60000)
    const errors = []
    const unhandled = new Set()
    let empty = false
    let failOverview = false
    let claimed = 50
    page.on('pageerror', (error) => errors.push(error.message))
    await page.route('**/socket.io/**', (route) => route.abort())
    await page.routeWebSocket(/socket\.io/, () => {})
    await page.route('**/api/v1/**', async (route) => {
      const request = route.request()
      const url = new URL(request.url())
      const path = url.pathname.replace('/api/v1', '')
      if (request.method() !== 'GET') {
        unhandled.add(`${request.method()} ${path}`)
        return route.fulfill({ status: 405, json: { message: 'Read-only preview' } })
      }
      let data
      if (path === '/health') data = { timestamp: new Date().toISOString() }
      else if (path === '/dashboard/overview') {
        if (failOverview) return route.fulfill({ status: 503, json: { message: 'Overview temporarily unavailable.' } })
        data = { overview: {
          generatedAt: '21 Oct 2026, 9:00 AM PHT', timeZone: 'Asia/Manila', scope: { global: name !== 'barangay' },
          programs: { activeProgramCount: empty ? 0 : 2 },
          distributions: { totalMatchingDistributionCount: empty ? 0 : 2, openDistributionCount: empty ? 0 : 1, upcomingDistributionCount: empty ? 0 : 2, statusCounts: { OPEN: empty ? 0 : 1 } },
          beneficiaries: { approvedBeneficiaryCount: empty ? 0 : 20, claimedBeneficiaryCount: empty ? 0 : 10, unclaimedAllocationCount: empty ? 0 : 10, scheduledBeneficiaryCount: empty ? 0 : 16, verifiedBeneficiaryCount: empty ? 0 : 10, claimCompletionPercentage: empty ? 0 : claimed },
          queue: { slotCount: 2, totalCapacity: 20, scheduledCount: empty ? 0 : 16, checkedInCount: empty ? 0 : 8, missedCount: 0, capacityUtilizationPercentage: empty ? 0 : 80, checkInPercentage: empty ? 0 : 50 },
          anomalies: { duplicateAttemptCount: 0, invalidQrAttemptCount: 0, livenessFailureCount: 0, biometricNoMatchCount: 0, duplicateClaimFlagCount: 0 },
          financialVisibility: name !== 'barangay', fundUtilization: name !== 'barangay' ? funds : null,
        } }
      } else if (path === '/distributions') data = { distributions: empty || url.searchParams.get('status') === 'DRAFT' ? [] : [distribution], pagination }
      else if (path === '/dashboard/distributions/event-1') data = { summary: { distribution, fundUtilization: funds } }
      else if (path === '/distributions/event-1/transactions') data = { transactions: [], summary: {}, pagination: { ...pagination, total: 0 } }
      else if (path === '/distributions/event-1/creditable-claims') data = { claims: [], summary: { creditableClaimCount: 0 }, pagination: { ...pagination, total: 0 } }
      else if (path === '/distributions/event-1/reconciliation') data = { reconciliation: { readyToClose: true, ledgerBalanced: true, deliveryMode: 'SIMULATED_WALLET', expectedWalletCreditedAmount: 7500, netCreditedAmount: 7500, completedBenefitCreditCount: 5, reversedBenefitCreditCount: 0, exceptions: [] }, simulation: {} }
      else if (path === '/distributions/event-1/schedules') data = { schedules: [{ scheduleId: 'schedule-1', beneficiary, queueNumber: 1, status: 'SCHEDULED', assignmentMethod: 'STAFF', slot: { sessionLabel: 'Morning session', slotStart: '2026-10-21T00:00:00Z', slotEnd: '2026-10-21T04:00:00Z', location: 'Barangay Hall' } }], summary: { countsByStatus: { SCHEDULED: 1 }, matchingScheduleCount: 1 }, pagination }
      else if (path === '/enrollments') data = { enrollments: [], pagination: { ...pagination, total: 0 } }
      else if (path === '/staff-notifications') data = { notifications: [], unreadCount: 0, pagination: { ...pagination, total: 0 } }
      else { unhandled.add(path); return route.fulfill({ status: 404, json: { message: `Missing fixture: ${path}` } }) }
      await route.fulfill({ json: { data } })
    })

    await page.goto(`${origin}/dashboard`)
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible()
    await expect(page.locator('.ga-admin-register').first()).toBeVisible()
    const styles = await page.evaluate(() => {
      const css = (selector) => getComputedStyle(document.querySelector(selector))
      return { sidebar: css('#staff-navigation').width, titleSize: css('.ga-page-title').fontSize, titleWeight: css('.ga-page-title').fontWeight, background: css('.ga-staff-shell').backgroundColor, radius: css('.ga-admin-register').borderRadius, shadow: css('.ga-admin-register').boxShadow, buttonHeight: css('#dashboard-content .ga-btn-secondary').minHeight }
    })
    if (name === 'admin') adminStyle = styles
    else assert.deepEqual(styles, adminStyle, `${name} matches the Admin presentation`)
    assert.equal(styles.sidebar, '256px')
    assert.equal(styles.titleSize, '24px')
    assert.equal(styles.buttonHeight, '44px')
    await page.waitForTimeout(500)
    await page.screenshot({ path: `${output}/${name}-overview-1440.png`, fullPage: true })
    await page.getByRole('button', { name: 'Collapse navigation', exact: true }).click()
    await expect(page.locator('#staff-navigation')).toHaveAttribute('data-collapsed', 'true')
    await expect.poll(() => page.locator('#staff-navigation').evaluate((element) => Math.round(element.getBoundingClientRect().width))).toBe(84)
    await page.getByRole('button', { name: 'Expand navigation', exact: true }).click()

    if (name !== 'admin') {
      assert.equal(await page.locator('#staff-navigation a[href^="/admin/"]').count(), 0)
      if (name === 'barangay') assert.equal(await page.locator('#staff-navigation a[href^="/dswd/"]').count(), 0)
      const expectedLinks = name === 'dswd' ? ['/dswd/live-dashboard', '/enrollments', '/programs', '/dswd/ledger'] : ['/facilitator/queue', '/facilitator/qr-verification', '/beneficiaries', '/biometrics']
      assert.deepEqual(await page.locator('section[aria-labelledby="tools-heading"] a').evaluateAll((links) => links.map((link) => link.getAttribute('href'))), expectedLinks)
      await expect(page.getByRole('progressbar', { name: 'Claim completion', exact: true })).toHaveAttribute('aria-valuenow', '50')
      claimed = 60
      await page.getByRole('button', { name: 'Refresh records', exact: true }).click()
      await expect(page.getByRole('progressbar', { name: 'Claim completion', exact: true })).toHaveAttribute('aria-valuenow', '60')
      await page.getByText('Account and data scope', { exact: true }).click()
      await expect(page.getByText(name === 'barangay' ? 'Restricted by role' : 'Authorized', { exact: true })).toBeVisible()
      await page.getByText('Account and data scope', { exact: true }).click()
      failOverview = true
      await page.getByRole('button', { name: 'Refresh records', exact: true }).click()
      await expect(page.getByRole('status').filter({ hasText: 'Showing the last available update' })).toBeVisible()
      await expect(page.getByRole('progressbar', { name: 'Claim completion', exact: true })).toHaveAttribute('aria-valuenow', '60')
      await page.reload()
      await expect(page.getByRole('alert')).toContainText('We could not load operations data')
      failOverview = false
      await page.getByRole('button', { name: 'Try again', exact: true }).click()
      await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible()
      await page.getByRole('link', { name: name === 'dswd' ? 'Open live monitoring' : 'View beneficiary queue', exact: true }).click()
      await expect(page.getByRole('heading', { name: name === 'dswd' ? 'Live operations dashboard' : 'Queue & schedules', exact: true })).toBeVisible()
      if (name === 'barangay') await expect(page.getByRole('cell', { name: 'Maria Santos' })).toBeVisible()
    }

    const routes = name === 'dswd'
      ? [['/dswd/live-dashboard', 'Live operations dashboard', 'monitoring'], ['/dswd/ledger', 'Simulated aid ledger', 'ledger']]
      : name === 'barangay' ? [['/facilitator/queue', 'Queue & schedules', 'queue'], ['/facilitator/qr-verification', 'QR claim verification', 'qr']] : []
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 })
      for (const [path, title, screen] of [['/dashboard', heading, 'overview'], ...routes]) {
        await page.goto(`${origin}${path}`)
        await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible()
        if (screen === 'ledger') await expect(page.getByRole('heading', { name: 'Distribution reconciliation', exact: true })).toBeVisible()
        if (screen === 'queue') await expect(page.getByText('Maria Santos', { exact: true }).filter({ visible: true })).toBeVisible()
        if (screen === 'qr') {
          await expect(page.getByLabel('USB QR scanner input')).toBeFocused()
          assert.equal(await page.evaluate(() => scrollY), 0, 'Scanner focus keeps the event context visible')
        }
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${name} ${path} overflow at ${width}`)
        await page.waitForTimeout(500)
        if (width !== 320) await page.screenshot({ path: `${output}/${name}-${screen}-${width}.png`, fullPage: true })
      }
      if (width < 1024) {
        await page.getByRole('button', { name: 'Open navigation', exact: true }).click()
        await expect(page.getByRole('dialog', { name: 'Staff navigation menu' })).toBeVisible()
        await page.keyboard.press('Escape')
        await expect(page.getByRole('button', { name: 'Open navigation', exact: true })).toBeFocused()
      }
    }
    if (name !== 'admin') {
      empty = true
      await page.goto(`${origin}/dashboard`)
      await expect(page.getByText('No operational records yet.', { exact: true })).toBeVisible()
      await expect(page.getByRole('progressbar', { name: 'Claim completion', exact: true })).toHaveAttribute('aria-valuenow', '0')
      await expect(page.getByText(name === 'barangay' ? 'No beneficiaries currently scheduled' : 'No upcoming distributions', { exact: true })).toBeVisible()
    }
    assert.deepEqual(errors, [], `${name} browser errors`)
    assert.deepEqual([...unhandled], [], `${name} unexpected API requests`)
    console.log(`${name}: shared styles, role navigation, responsive screens and interactions passed`)
    await context.close()
  }
  console.log(`Screenshots: ${output}`)
} finally {
  await browser?.close()
  await vite.close()
}
