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
const program = { programId: 'program-1', programName: 'Community Assistance', programCode: 'AID-2026', status: 'ACTIVE', programType: 'CASH_ASSISTANCE', grantAmount: '1500', budgetAmount: '150000', criteria: [], requiredDocumentTypes: [] }
const beneficiary = { beneficiaryId: 'beneficiary-1', firstName: 'Maria', lastName: 'Santos', barangayId: barangay.barangayId, barangay, birthDate: '1990-01-01', sex: 'FEMALE', address: 'Barangay Hall Road', status: 'ACTIVE' }
const distribution = { distributionId: 'event-1', title: 'October community assistance', program, barangay, distributionDate: '2026-10-21', startTime: '08:00', endTime: '12:00', location: 'Barangay Hall', deliveryMode: 'SIMULATED_WALLET', verificationRequirement: 'QR', status: 'OPEN' }
const funds = { allocatedAmount: 15000, netCreditedAmount: 7500, remainingAmount: 7500, reversedAmount: 0, failedAmount: 0 }
const pagination = { page: 1, totalPages: 1, total: 1, pageSize: 20 }
const roles = [
  ['SYSTEM_ADMIN', 'admin', 'Overview'],
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
          generatedAt: '2026-10-21T01:00:00Z', timeZone: 'Asia/Manila', scope: { global: name !== 'barangay', barangayId: name === 'barangay' ? barangay.barangayId : null },
          programs: { activeProgramCount: empty ? 0 : 2 },
          distributions: { totalMatchingDistributionCount: empty ? 0 : 2, openDistributionCount: empty ? 0 : 1, upcomingDistributionCount: empty ? 0 : 2, statusCounts: { OPEN: empty ? 0 : 1 } },
          beneficiaries: { approvedBeneficiaryCount: empty ? 0 : 20, claimedBeneficiaryCount: empty ? 0 : 10, unclaimedAllocationCount: empty ? 0 : 10, scheduledBeneficiaryCount: empty ? 0 : 16, verifiedBeneficiaryCount: empty ? 0 : 10, claimCompletionPercentage: empty ? 0 : claimed },
          queue: { slotCount: 2, totalCapacity: 20, scheduledCount: empty ? 0 : 16, checkedInCount: empty ? 0 : 8, missedCount: 0, capacityUtilizationPercentage: empty ? 0 : 80, checkInPercentage: empty ? 0 : 50 },
          anomalies: { duplicateAttemptCount: 0, invalidQrAttemptCount: 0, livenessFailureCount: 0, biometricNoMatchCount: 0, duplicateClaimFlagCount: 0 },
          financialVisibility: name !== 'barangay', fundUtilization: name !== 'barangay' ? funds : null,
        } }
      } else if (path === '/auth/account') data = { user, security: { recoveryCodesRemaining: 8, activeSessionCount: 1 } }
      else if (path === '/barangays') data = { barangays: [barangay] }
      else if (path === '/programs') data = { programs: [program], pagination }
      else if (path === '/programs/program-1') data = { program }
      else if (path === '/beneficiaries') data = { beneficiaries: [beneficiary], pagination }
      else if (path === '/distributions') data = { distributions: empty || url.searchParams.get('status') === 'DRAFT' ? [] : [distribution], pagination }
      else if (path === '/distributions/event-1') data = { distribution }
      else if (path === '/dashboard/distributions/event-1') data = { summary: { distribution, fundUtilization: funds, beneficiaries: { claimedCount: 10, scheduleStatusCounts: { SCHEDULED: 16 }, claimStatusCounts: { VERIFIED: 10 } } } }
      else if (path === '/distributions/event-1/claim-disputes') data = { disputes: [], summary: { countsByStatus: {} }, pagination: { ...pagination, total: 0 } }
      else if (path === '/distributions/event-1/slots') data = { slots: [], summary: { matchingSlotCount: 0, matchingCapacity: 0, sessionCount: 0 }, pagination: { ...pagination, total: 0 } }
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
      return { sidebar: css('#staff-navigation').width, titleSize: css('.ga-page-title').fontSize, titleWeight: css('.ga-page-title').fontWeight, buttonHeight: css('#dashboard-content .ga-btn-secondary').minHeight }
    })
    const { titleSize, ...sharedStyles } = styles
    if (name === 'admin') adminStyle = sharedStyles
    else assert.deepEqual(sharedStyles, adminStyle, `${name} matches the Admin presentation`)
    assert.equal(styles.sidebar, '256px')
    assert.equal(titleSize, '24px')
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
    }
    if (name === 'barangay') {
      const expectedLinks = ['/beneficiaries', '/biometrics', '/facilitator/queue', '/claim-accountability']
      assert.deepEqual(await page.locator('section[aria-labelledby="tools-heading"] a').evaluateAll((links) => links.map((link) => link.getAttribute('href'))), expectedLinks)
      await expect(page.getByRole('progressbar', { name: 'Claim completion', exact: true })).toHaveAttribute('aria-valuenow', '50')
      claimed = 60
      await page.getByRole('button', { name: 'Refresh records', exact: true }).click()
      await expect(page.getByRole('progressbar', { name: 'Claim completion', exact: true })).toHaveAttribute('aria-valuenow', '60')
      await page.getByText('Account and data scope', { exact: true }).click()
      await expect(page.getByText('Restricted by role', { exact: true })).toBeVisible()
      await page.getByText('Account and data scope', { exact: true }).click()
      failOverview = true
      await page.getByRole('button', { name: 'Refresh records', exact: true }).click()
      await expect(page.getByRole('alert').filter({ hasText: 'Showing the last available update' })).toBeVisible()
      await expect(page.getByRole('progressbar', { name: 'Claim completion', exact: true })).toHaveAttribute('aria-valuenow', '60')
      await page.reload()
      await expect(page.getByRole('heading', { name: 'Dashboard could not be loaded', exact: true })).toBeVisible()
      failOverview = false
      await page.getByRole('button', { name: 'Try again', exact: true }).click()
      await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible()
      await page.getByRole('link', { name: 'View beneficiary queue', exact: true }).click()
      await expect(page.getByRole('heading', { name: 'Queue & schedules', exact: true })).toBeVisible()
      await expect(page.getByRole('cell', { name: 'Maria Santos' })).toBeVisible()
    }

    const routes = name === 'dswd'
      ? [['/dswd/live-dashboard', 'Live monitoring', 'monitoring'], ['/dswd/ledger', 'Simulated aid ledger', 'ledger']]
      : name === 'barangay' ? [['/facilitator/queue', 'Queue & schedules', 'queue'], ['/facilitator/qr-verification', 'QR claim verification', 'qr']] : []
    const commonRoutes = [
      ['/beneficiaries', name === 'admin' ? 'Beneficiary records' : 'Beneficiary management', 'beneficiaries'],
      ['/programs', name === 'admin' ? 'Assistance programs' : name === 'dswd' ? 'Assistance program management' : 'Assistance program browser', 'programs'],
      ['/account?section=profile', 'Account settings', 'account'],
    ]
    for (const width of [1440, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 })
      for (const [path, title, screen] of [['/dashboard', heading, 'overview'], ...commonRoutes, ...routes]) {
        await page.goto(`${origin}${path}`)
        await expect(page.getByRole('heading', { name: title, level: 1, exact: true })).toBeVisible()
        if (screen === 'ledger') await expect(page.getByRole('heading', { name: 'Distribution reconciliation', exact: true })).toBeVisible()
        if (screen === 'beneficiaries') await expect(page.getByRole('form', { name: 'Beneficiary filters', exact: true })).toBeVisible()
        if (screen === 'queue') await expect(page.getByText('Maria Santos', { exact: true }).filter({ visible: true })).toBeVisible()
        if (screen === 'qr') {
          await expect(page.getByRole('button', { name: 'Scan with this device’s camera', exact: true })).toBeFocused()
          assert.equal(await page.evaluate(() => scrollY), 0, 'Initial focus keeps the event context visible')
          await page.getByLabel('USB QR scanner input').click()
          await expect(page.getByLabel('USB QR scanner input')).toBeFocused()
          await page.evaluate(() => scrollTo(0, 0))
        }
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${name} ${path} overflow at ${width}`)
        const theme = await page.evaluate(() => {
          const shell = getComputedStyle(document.querySelector('.ga-staff-shell'))
          const panel = document.querySelector('#dashboard-content :is(.ga-card, .ga-admin-register)')
          const input = document.querySelector('#dashboard-content .ga-input:not(textarea)')
          return { page: shell.getPropertyValue('--color-page').trim(), border: shell.getPropertyValue('--color-line').trim(), title: getComputedStyle(document.querySelector('.ga-page-title')).fontSize, panelRadius: panel && getComputedStyle(panel).borderRadius, inputHeight: input && getComputedStyle(input).minHeight }
        })
        assert.equal(theme.page, '#f3f6fb')
        assert.equal(theme.border, '#d8e2ee')
        assert.equal(theme.title, width < 640 ? '22px' : '24px')
        if (theme.panelRadius) assert.equal(theme.panelRadius, '9px', `${name} ${path} shares panel corners`)
        if (theme.inputHeight) assert.equal(theme.inputHeight, '44px', `${name} ${path} shares control heights`)
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
    if (name === 'admin') {
      await page.goto(`${origin}/beneficiaries`)
      await page.getByRole('button', { name: 'Register beneficiary', exact: true }).click()
      const dialog = page.getByRole('dialog', { name: 'Register a beneficiary', exact: true })
      await expect(dialog).toBeVisible()
      await expect(dialog).toHaveCSS('border-radius', '9px')
      await dialog.getByLabel('First name', { exact: true }).fill('Ana')
      await expect(dialog.getByLabel('First name', { exact: true })).toHaveCSS('min-height', '44px')
      await page.screenshot({ path: `${output}/admin-beneficiary-form-320.png`, fullPage: true })
      await dialog.getByRole('button', { name: 'Close beneficiary form', exact: true }).click()
      await expect(dialog).toHaveCount(0)
    }
    if (name === 'barangay') {
      empty = true
      await page.goto(`${origin}/dashboard`)
      await expect(page.getByText('No operational records yet.', { exact: true })).toBeVisible()
      await expect(page.getByRole('progressbar', { name: 'Claim completion', exact: true })).toHaveAttribute('aria-valuenow', '0')
      await expect(page.getByText('No beneficiaries currently scheduled', { exact: true })).toBeVisible()
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
