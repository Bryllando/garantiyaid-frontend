import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium, expect } from '@playwright/test'
import { createServer } from 'vite'

// Local fixtures exercise navigation and presentation without touching staff records.
const output = resolve('../output/admin-redesign')
await mkdir(output, { recursive: true })
const vite = await createServer({ server: { host: '127.0.0.1', port: 0 } })
await vite.listen()
const origin = `http://127.0.0.1:${vite.httpServer.address().port}`
let browser
try {
  browser = await chromium.launch({ headless: true, channel: 'chrome' })
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  page.setDefaultTimeout(8000)
  const errors = []
  const unhandled = new Set()
  let empty = false
  let failReviews = false
  let ownSubmission = false
  const user = { userId: 'admin-1', role: 'SYSTEM_ADMIN', fullName: 'System Administrator', employeeId: 'ADMIN-001', email: 'admin@example.test', isActive: true, totpEnabled: true, createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z' }
  const barangay = { barangayId: 'barangay-1', barangayName: 'Poblacion', city: 'Cebu City', province: 'Cebu', isActive: true }
  const program = { programId: 'program-1', programName: 'Community Assistance', programCode: 'AID-2026', programType: 'CASH_ASSISTANCE', status: 'ACTIVE', grantAmount: '1500', budgetAmount: '150000', applicationStartDate: '2026-10-01', applicationEndDate: '2026-12-31', criteria: [], requiredDocumentTypes: ['VALID_ID'] }
  const beneficiary = { beneficiaryId: 'beneficiary-1', firstName: 'Maria', lastName: 'Santos', birthDate: '1990-01-01', sex: 'FEMALE', address: 'Barangay Hall Road', barangay, barangayId: barangay.barangayId, status: 'ACTIVE', documents: [] }
  const distribution = { distributionId: 'event-1', title: 'October community assistance', programId: program.programId, program, barangayId: barangay.barangayId, barangay, distributionDate: '2026-10-20', startTime: '08:00', endTime: '12:00', slotDurationMinutes: 30, location: 'Barangay Hall', deliveryMode: 'PHYSICAL_GOODS', verificationRequirement: 'QR', status: 'DRAFT' }
  const enrollment = () => ({ enrollmentId: 'enrollment-1', beneficiaryId: beneficiary.beneficiaryId, beneficiary, program, status: 'PENDING', submittedById: ownSubmission ? user.userId : 'facilitator-1', submittedBy: { fullName: 'Assigned Facilitator' }, createdAt: '2026-10-13T02:00:00Z', eligibilityEvaluation: { overallStatus: 'REVIEW_REQUIRED', summary: { met: 0, notMet: 0, reviewRequired: 0, total: 0 }, results: [] } })
  const overview = () => ({ generatedAt: '15 Oct 2026, 9:00 AM PHT', timeZone: 'Asia/Manila', scope: { global: true }, programs: { activeProgramCount: empty ? 0 : 1 }, distributions: { totalMatchingDistributionCount: empty ? 0 : 1, openDistributionCount: 0, upcomingDistributionCount: 0, statusCounts: { DRAFT: empty ? 0 : 1 } }, beneficiaries: { approvedBeneficiaryCount: empty ? 0 : 4, claimedBeneficiaryCount: 0, unclaimedAllocationCount: 0, scheduledBeneficiaryCount: 0, verifiedBeneficiaryCount: 0, claimCompletionPercentage: 0 }, queue: { slotCount: 0, totalCapacity: 0, scheduledCount: 0, checkedInCount: 0, missedCount: 0, capacityUtilizationPercentage: 0, checkInPercentage: 0 }, anomalies: { duplicateAttemptCount: 0, invalidQrAttemptCount: 0, livenessFailureCount: 0, biometricNoMatchCount: 0, duplicateClaimFlagCount: 0 }, financialVisibility: true, fundUtilization: { allocatedAmount: 0, netCreditedAmount: 0, remainingAmount: 0 } })
  await page.addInitScript((staff) => {
    sessionStorage.setItem('garantiyaid.accessToken', 'local-preview-token')
    sessionStorage.setItem('garantiyaid.user', JSON.stringify(staff))
  }, user)
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('**/socket.io/**', (route) => route.abort())
  await page.routeWebSocket(/socket\.io/, () => {})
  await page.route('**/api/v1/**', async (route) => {
    const url = new URL(route.request().url())
    const path = url.pathname.replace('/api/v1', '')
    const pagination = (total = 0) => ({ page: Number(url.searchParams.get('page') || 1), totalPages: Math.max(2, Number(url.searchParams.get('page') || 1)), total })
    let data
    if (path === '/health') data = { timestamp: new Date().toISOString() }
    else if (path === '/dashboard/overview') data = { overview: overview() }
    else if (path === '/barangays') data = { barangays: empty ? [] : [barangay] }
    else if (path === '/users') data = { users: [user], pagination: pagination(1) }
    else if (path === '/programs') data = { programs: empty ? [] : [program], pagination: pagination(empty ? 0 : 1) }
    else if (path === '/programs/program-1') data = { program }
    else if (path === '/beneficiaries') data = { beneficiaries: empty ? [] : [beneficiary], pagination: pagination(empty ? 0 : 1) }
    else if (path === '/beneficiaries/beneficiary-1') data = { beneficiary }
    else if (path === '/beneficiaries/beneficiary-1/documents') data = { documents: [] }
    else if (path === '/enrollments') {
      if (failReviews) return route.fulfill({ status: 503, json: { message: 'Review service temporarily unavailable.' } })
      const rows = !empty && url.searchParams.get('status') !== 'FOR_VALIDATION' ? [enrollment()] : []
      data = { enrollments: rows, pagination: pagination(rows.length) }
    } else if (path === '/enrollments/enrollment-1') data = { enrollment: enrollment() }
    else if (path === '/distributions') data = { distributions: empty ? [] : [distribution], pagination: pagination(empty ? 0 : 1) }
    else if (path === '/distributions/event-1') data = { distribution }
    else if (path === '/distributions/event-1/slots') data = { slots: [], summary: { matchingSlotCount: 0, matchingCapacity: 0, sessionCount: 0 } }
    else if (path === '/distributions/event-1/allocations') data = { allocations: [], summary: { countsByStatus: {}, totalAmount: '0' } }
    else if (path === '/distributions/event-1/schedules') data = { schedules: [], summary: { countsByStatus: {}, matchingScheduleCount: 0 } }
    else if (path === '/distributions/event-1/qr-tokens') data = { qrTokens: [], summary: { matchingTokenCount: 0 } }
    else if (path === '/distributions/event-1/eligible-enrollments') data = { enrollments: [], pagination: pagination(), allocationAmount: '1500', summary: { serviceAreas: [], unspecifiedServiceAreaCount: 0 } }
    else if (path.endsWith('/claims')) data = { claims: [], pagination: pagination() }
    else if (path.endsWith('/claim-disputes')) data = { disputes: [], pagination: pagination() }
    else if (path === '/staff-notifications') data = { notifications: [], unreadCount: 0, pagination: pagination() }
    else if (path === '/notifications') data = { notifications: [], pagination: pagination() }
    else if (path === '/notifications/summary') data = { total: 0, byStatus: {} }
    else if (path === '/notifications/queue/health') data = { status: 'available', counts: {} }
    else if (path === '/chatbot/escalations') data = { escalations: [], pagination: pagination() }
    else if (path === '/audit-logs') data = { auditLogs: [], pagination: pagination() }
    else if (path === '/auth/account') data = { user, security: { recoveryCodesRemaining: 8, activeSessionCount: 1 } }
    else if (path === '/auth/account/sessions') data = { sessions: [] }
    else { unhandled.add(path); return route.fulfill({ status: 404, json: { message: `Missing local fixture: ${path}` } }) }
    await route.fulfill({ json: { data } })
  })

  await page.goto(`${origin}/dashboard`)
  await expect(page.getByRole('heading', { name: 'Administration overview' })).toBeVisible()
  await expect(page.getByText('Maria Santos', { exact: true })).toBeVisible()
  assert.equal(await page.getByText('Prepare the first distribution', { exact: true }).count(), 0)
  assert.equal(await page.locator('#staff-navigation a[href="/service-review"]').count(), 0)
  await page.screenshot({ path: `${output}/overview-desktop.png`, fullPage: true })
  await page.getByRole('link', { name: /View draft distributions/i }).click()
  await expect(page.getByLabel('Event status')).toHaveValue('DRAFT')

  await page.goto(`${origin}/enrollments?status=PENDING&search=Maria&page=2&enrollment=enrollment-1`)
  await page.getByRole('button', { name: 'Open full record' }).click()
  await expect(page.getByRole('heading', { name: 'Maria Santos', exact: true })).toBeVisible()
  await page.getByRole('link', { name: /Return to enrollment review/ }).click()
  await expect(page.getByRole('button', { name: 'Open full record' })).toBeVisible()
  await expect(page.getByLabel('Beneficiary', { exact: true })).toHaveValue('Maria')
  assert.equal(new URL(page.url()).searchParams.get('page'), '2')
  assert.equal(new URL(page.url()).searchParams.get('enrollment'), 'enrollment-1')
  ownSubmission = true
  await page.reload()
  await expect(page.getByText('You submitted this enrollment. Another authorized reviewer must complete the review.')).toBeVisible()
  assert.equal(await page.getByRole('button', { name: 'Start validation', exact: true }).count(), 0)
  ownSubmission = false

  const routes = [
    ['/dashboard', 'Administration overview', 'overview'],
    ['/beneficiaries', 'Beneficiary records', 'beneficiaries'],
    ['/enrollments', 'Enrollment review', 'enrollments'],
    ['/programs', 'Assistance programs', 'programs'],
    ['/distributions/manage', 'Distribution events', 'distributions'],
    ['/admin/administration', 'Staff and barangays', 'staff'],
    ['/admin/staff-security', 'Staff authenticator recovery', 'security'],
    ['/biometrics', 'Biometric records', 'biometrics'],
    ['/claim-accountability', 'Claims and receipts', 'claims'],
    ['/dswd/ledger', null, 'transactions'],
    ['/dswd/live-dashboard', null, 'monitoring'],
    ['/reports', 'Operational reports', 'reports'],
    ['/audit-logs', 'Audit logs', 'audit'],
    ['/notifications', 'SMS delivery', 'notifications'],
    ['/help-cases', 'Help cases', 'help'],
    ['/account', 'Account settings', 'account'],
  ]
  // Empty records isolate layout and truthful first-use states from population volume.
  empty = true
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    for (const [route, title, name] of routes) {
      await page.goto(`${origin}${route}`)
      if (title) await expect(page.locator('h1').filter({ hasText: title })).toBeVisible()
      else await expect(page.locator('#dashboard-content h1')).toBeVisible()
      await page.waitForTimeout(200)
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${route} overflow at ${width}px`)
      await page.screenshot({ path: `${output}/${name}-${width}.png`, fullPage: true })
    }
  }
  for (const width of [320, 768]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto(`${origin}/dashboard`)
    await expect(page.getByRole('heading', { name: 'Administration overview' })).toBeVisible()
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `overview overflow at ${width}px`)
  }
  empty = false
  await page.goto(`${origin}/distributions/manage?create=1`)
  await expect(page.getByRole('heading', { name: 'Create distribution event' })).toBeVisible()
  await page.getByRole('button', { name: 'Close distribution form' }).click()
  failReviews = true
  await page.goto(`${origin}/dashboard`)
  await expect(page.getByRole('alert').filter({ hasText: 'Enrollment reviews could not be loaded' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Distribution preparation' })).toBeVisible()
  assert.deepEqual(errors, [])
  assert.deepEqual([...unhandled], [])
  console.log(JSON.stringify({ result: 'Admin workflow and responsive checks passed', unhandled: [...unhandled], screenshots: output }))
} finally {
  await browser?.close()
  await vite.close()
}
