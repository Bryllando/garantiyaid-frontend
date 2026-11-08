import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium, expect } from '@playwright/test'
import { createServer } from 'vite'

// Local fixtures exercise navigation and presentation without touching staff records.
const output = resolve('../output/admin-redesign')
await mkdir(output, { recursive: true })
const vite = await createServer({ cacheDir: '../tmp/admin-workflow-vite', server: { host: '127.0.0.1', port: 0 } })
await vite.listen()
const origin = `http://127.0.0.1:${vite.httpServer.address().port}`
let browser
try {
  browser = await chromium.launch({ headless: true, channel: 'chrome' })
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  page.setDefaultTimeout(8000)
  page.setDefaultNavigationTimeout(30000)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const errors = []
  const unhandled = new Set()
  let empty = false
  let failReviews = false
  let ownSubmission = false
  let operations = false
  let journey = null
  const completedJourneys = []
  let rejectCapacity = false
  let rejectMove = false
  let failVerification = false
  let duplicateQr = false
  let omitBeneficiary = false
  let enrollmentStatus = 'PENDING'
  let progressClaimStatus = ''
  let failProgress = false
  let failNotices = false
  let failAttempts = false
  let failEventReview = false
  let failIssue = false
  let reviewDispute = false
  let issueCount = 1
  let failRelease = false
  let releaseRecord = null
  const releaseKeys = []
  const verificationKeys = []
  const user = { userId: 'admin-1', role: 'SYSTEM_ADMIN', fullName: 'System Administrator', employeeId: 'ADMIN-001', email: 'admin@example.test', isActive: true, totpEnabled: true, createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z' }
  const barangay = { barangayId: 'barangay-1', barangayName: 'Poblacion', city: 'Cebu City', province: 'Cebu', isActive: true }
  const program = { programId: 'program-1', programName: 'Community Assistance', programCode: 'AID-2026', programType: 'CASH_ASSISTANCE', status: 'ACTIVE', grantAmount: '1500', budgetAmount: '150000', applicationStartDate: '2026-10-01', applicationEndDate: '2026-12-31', criteria: [], requiredDocumentTypes: ['VALID_ID'] }
  const beneficiary = { beneficiaryId: 'beneficiary-1', firstName: 'Maria', lastName: 'Santos', birthDate: '1990-01-01', sex: 'FEMALE', address: 'Barangay Hall Road', barangay, barangayId: barangay.barangayId, status: 'ACTIVE', documents: [] }
  const distribution = { distributionId: 'event-1', title: 'October community assistance', programId: program.programId, program, barangayId: barangay.barangayId, barangay, distributionDate: '2026-10-20', startTime: '08:00', endTime: '12:00', slotDurationMinutes: 30, location: 'Barangay Hall', deliveryMode: 'PHYSICAL_GOODS', packageName: 'Food pack', packageUnit: 'pack', packageQuantity: 1, verificationRequirement: 'QR', status: 'DRAFT' }
  const slots = [
    { slotId: 'slot-1', sessionId: 'session-1', sessionLabel: 'Morning session', slotStart: '2026-10-20T08:00:00+08:00', slotEnd: '2026-10-20T08:30:00+08:00', capacity: 10, slotStatus: 'AVAILABLE', serviceAreas: [], location: 'Barangay Hall' },
    { slotId: 'slot-2', sessionId: 'session-1', sessionLabel: 'Morning session', slotStart: '2026-10-20T08:30:00+08:00', slotEnd: '2026-10-20T09:00:00+08:00', capacity: 10, slotStatus: 'AVAILABLE', serviceAreas: [], location: 'Barangay Hall' },
    { slotId: 'slot-3', sessionId: 'session-2', sessionLabel: 'Other service area', slotStart: '2026-10-20T09:00:00+08:00', slotEnd: '2026-10-20T09:30:00+08:00', capacity: 10, slotStatus: 'AVAILABLE', serviceAreas: ['Purok 9'], location: 'Barangay Hall' },
  ]
  const schedule = { scheduleId: 'schedule-1', slotId: 'slot-1', beneficiary, slot: slots[0], queueNumber: 1, status: 'SCHEDULED' }
  const claim = () => ({ claimId: 'claim-1', distributionId: distribution.distributionId, distribution, beneficiaryId: beneficiary.beneficiaryId, beneficiary, schedule, allocation: { amount: '1500', allocationStatus: 'ALLOCATED' }, claimStatus: progressClaimStatus || (distribution.verificationRequirement === 'QR' ? 'VERIFIED' : 'PENDING'), qrVerified: true, biometricVerified: false, verificationMethod: distribution.verificationRequirement, disputes: reviewDispute ? [{ disputeId: 'dispute-1', status: 'OPEN', referenceNo: 'GYA-CASE-1' }] : [], ...releaseRecord })
  const enrollment = () => ({ enrollmentId: 'enrollment-1', beneficiaryId: beneficiary.beneficiaryId, beneficiary, program, programId: program.programId, status: enrollmentStatus, submittedById: ownSubmission ? user.userId : 'facilitator-1', submittedBy: { fullName: 'Assigned Facilitator' }, createdAt: '2026-10-13T02:00:00Z', eligibilityEvaluation: { overallStatus: journey ? 'ELIGIBLE' : 'REVIEW_REQUIRED', summary: { met: 0, notMet: 0, reviewRequired: 0, total: 0 }, results: [] } })
  const overview = () => ({ generatedAt: '15 Oct 2026, 9:00 AM PHT', timeZone: 'Asia/Manila', scope: { global: true }, programs: { activeProgramCount: empty ? 0 : 1 }, distributions: { totalMatchingDistributionCount: empty ? 0 : 1, openDistributionCount: 0, upcomingDistributionCount: 0, statusCounts: { DRAFT: empty ? 0 : 1 } }, beneficiaries: { approvedBeneficiaryCount: empty ? 0 : 4, claimedBeneficiaryCount: 0, unclaimedAllocationCount: 0, scheduledBeneficiaryCount: 0, verifiedBeneficiaryCount: 0, claimCompletionPercentage: 0 }, queue: { slotCount: 0, totalCapacity: 0, scheduledCount: 0, checkedInCount: 0, missedCount: 0, capacityUtilizationPercentage: 0, checkInPercentage: 0 }, anomalies: { duplicateAttemptCount: 0, invalidQrAttemptCount: 0, livenessFailureCount: 0, biometricNoMatchCount: 0, duplicateClaimFlagCount: 0 }, financialVisibility: true, fundUtilization: { allocatedAmount: 0, netCreditedAmount: 0, remainingAmount: 0 } })
  await page.addInitScript((staff) => {
    sessionStorage.setItem('garantiyaid.accessToken', 'local-preview-token')
    sessionStorage.setItem('garantiyaid.user', JSON.stringify({ ...staff, role: sessionStorage.getItem('local-test-role') || staff.role }))
  }, user)
  page.on('pageerror', (error) => { errors.push(error.message); console.error(error.message) })
  await page.route('**/socket.io/**', (route) => route.abort())
  await page.routeWebSocket(/socket\.io/, () => {})
  await page.route('**/api/v1/**', async (route) => {
    const url = new URL(route.request().url())
    const path = url.pathname.replace('/api/v1', '')
    const pagination = (total = 0) => ({ page: Number(url.searchParams.get('page') || 1), totalPages: url.searchParams.get('pageSize') === '100' ? 1 : Math.max(2, Number(url.searchParams.get('page') || 1)), total })
    let data
    if (journey && path === '/enrollments/enrollment-1/start-review') { enrollmentStatus = 'FOR_VALIDATION'; data = { enrollment: enrollment() } }
    else if (journey && path === '/enrollments/enrollment-1/approve') { assert.equal(enrollmentStatus, 'FOR_VALIDATION'); enrollmentStatus = 'APPROVED'; data = { enrollment: enrollment() } }
    else if (journey && path === '/distributions/event-1/allocations' && route.request().method() === 'POST') { assert.equal(enrollmentStatus, 'APPROVED'); assert.deepEqual(route.request().postDataJSON().enrollmentIds, ['enrollment-1']); journey.allocated = true; data = { allocations: [{ allocationId: 'allocation-1' }], summary: {} } }
    else if (journey && path === '/distributions/event-1/schedules/generate') { assert.equal(journey.allocated, true); journey.scheduled = true; data = { schedules: [schedule], summary: {} } }
    else if (journey && path === '/distributions/event-1/open') { assert.equal(journey.scheduled, true); distribution.status = 'OPEN'; data = { distribution } }
    else if (journey && path === '/distributions/event-1/claims/claim-1/credit') { assert.equal(progressClaimStatus, 'VERIFIED'); progressClaimStatus = 'CLAIMED'; journey.credited = true; data = { transaction: { referenceNo: 'SIM-TEST-001', amount: '1500' }, wallet: {}, lifecycle: {} } }
    else if (journey && path === '/dashboard/distributions/event-1') data = { summary: { distribution, fundUtilization: overview().fundUtilization } }
    else if (journey && path === '/distributions/event-1/transactions') data = { transactions: [], pagination: pagination(), summary: {} }
    else if (journey && path === '/distributions/event-1/creditable-claims') data = { claims: progressClaimStatus === 'VERIFIED' ? [claim()] : [], pagination: pagination(), summary: { creditableClaimCount: progressClaimStatus === 'VERIFIED' ? 1 : 0 } }
    else if (path === '/health') data = { timestamp: new Date().toISOString() }
    else if (path === '/dashboard/overview') data = { overview: overview() }
    else if (path === '/barangays') data = { barangays: empty ? [] : [barangay] }
    else if (path === '/users') data = { users: [user], pagination: pagination(1) }
    else if (path === '/programs') data = { programs: empty ? [] : [program], pagination: pagination(empty ? 0 : 1) }
    else if (path === '/programs/program-1') data = { program }
    else if (path === '/beneficiaries') data = { beneficiaries: empty || omitBeneficiary ? [] : [beneficiary], pagination: pagination(empty ? 0 : 1) }
    else if (path === '/beneficiaries/beneficiary-1') data = { beneficiary }
    else if (path === '/beneficiaries/beneficiary-1/documents') data = { documents: [] }
    else if (path === '/beneficiaries/beneficiary-1/biometric-consents') data = { consents: [], pagination: pagination() }
    else if (path === '/beneficiaries/beneficiary-1/biometrics/status') data = { biometricProfile: { biometricStatus: 'NOT_ENROLLED' }, processing: {} }
    else if (path === '/distributions/event-1/biometric-attempts') {
      if (failAttempts) return route.fulfill({ status: 503, json: { error: { message: 'Attempt records unavailable.' } } })
      data = { attempts: [{ attemptId: 'attempt-1', distributionId: 'event-1', beneficiaryId: beneficiary.beneficiaryId, result: 'NO_MATCH', processor: 'SIMULATED', createdAt: '2026-10-20T01:00:00Z' }], pagination: pagination(1), privacy: {} }
    }
    else if (path === '/enrollments') {
      if (failReviews) return route.fulfill({ status: 503, json: { message: 'Review service temporarily unavailable.' } })
      const rows = !empty && (journey || url.searchParams.get('status') !== 'FOR_VALIDATION') ? [enrollment()] : []
      data = { enrollments: rows, pagination: pagination(rows.length) }
    } else if (path === '/enrollments/enrollment-1') data = { enrollment: enrollment() }
    else if (path === '/distributions') data = { distributions: empty || (operations && url.searchParams.get('status') && url.searchParams.get('status') !== distribution.status) ? [] : [distribution], pagination: pagination(empty ? 0 : 1) }
    else if (path === '/distributions/event-1') data = { distribution }
    else if (path === '/distributions/event-1/slots') data = { slots: operations ? slots : [], summary: { matchingSlotCount: operations ? 3 : 0, matchingCapacity: operations ? slots.reduce((total, slot) => total + slot.capacity, 0) : 0, sessionCount: operations ? 2 : 0 } }
    else if (path === '/distributions/event-1/slots/slot-1') {
      if (rejectCapacity) return route.fulfill({ status: 409, json: { error: { message: 'Capacity cannot be lower than existing appointments.' } } })
      slots[0].capacity = route.request().postDataJSON().capacity
      data = { slot: slots[0] }
    }
    else if (path === '/distributions/event-1/allocations') data = { allocations: operations && (!journey || journey.allocated) ? [{ allocationId: 'allocation-1', beneficiaryId: beneficiary.beneficiaryId, allocationStatus: 'ALLOCATED' }] : [], summary: { countsByStatus: operations && (!journey || journey.allocated) ? { [progressClaimStatus === 'CLAIMED' ? 'CLAIMED' : 'ALLOCATED']: 1 } : {}, totalAmount: '0' }, pagination: pagination(operations && (!journey || journey.allocated) ? 1 : 0) }
    else if (path === '/distributions/event-1/schedules') data = { schedules: operations && (!journey || journey.scheduled) ? [schedule] : [], pagination: pagination(operations && (!journey || journey.scheduled) ? 1 : 0), summary: { countsByStatus: operations && (!journey || journey.scheduled) ? { SCHEDULED: 1 } : {}, matchingScheduleCount: operations && (!journey || journey.scheduled) ? 1 : 0 } }
    else if (path === '/distributions/event-1/schedules/schedule-1/reschedule') {
      if (rejectMove) return route.fulfill({ status: 409, json: { error: { message: 'This time slot has just filled. Choose another slot.' } } })
      schedule.slotId = route.request().postDataJSON().slotId
      schedule.slot = slots.find((slot) => slot.slotId === schedule.slotId)
      data = { schedule }
    }
    else if (path === '/distributions/event-1/qr-eligible-schedules') data = { schedules: [], summary: { qrEligibleScheduleCount: 0 } }
    else if (path === '/distributions/event-1/claims/preview-qr') {
      if (duplicateQr) return route.fulfill({ status: 409, json: { error: { code: 'QR_TOKEN_ALREADY_USED', message: 'This QR credential has already been used.' } } })
      data = { beneficiary, schedule, checksInBeneficiary: true, nextRequiredVerification: distribution.verificationRequirement === 'QR' ? null : 'BIOMETRIC' }
    }
    else if (path === '/distributions/event-1/claims/verify-qr') {
      verificationKeys.push(route.request().headers()['idempotency-key'])
      if (failVerification) return route.fulfill({ status: 503, json: { error: { message: 'Verification temporarily unavailable. Please retry.' } } })
      if (journey) { assert.equal(journey.scheduled, true); assert.equal(distribution.status, 'OPEN'); progressClaimStatus = 'VERIFIED'; schedule.status = 'CHECKED_IN' }
      data = { claim: claim(), verificationComplete: distribution.verificationRequirement === 'QR', nextRequiredVerification: distribution.verificationRequirement === 'QR' ? null : 'BIOMETRIC' }
    }
    else if (path === '/distributions/event-1/claims/claim-1/release') {
      releaseKeys.push(route.request().headers()['idempotency-key'])
      if (failRelease) return route.fulfill({ status: 503, json: { error: { message: 'Release service temporarily unavailable.' } } })
      const evidence = route.request().postDataJSON()
      assert.equal(evidence.beneficiaryAcknowledged, true)
      assert.equal(evidence.releasedQuantity, distribution.packageQuantity)
      progressClaimStatus = 'CLAIMED'
      releaseRecord = { releasedAt: '2026-10-20T01:00:00Z', releaseMethod: 'PHYSICAL_GOODS', releasedBy: { fullName: 'Barangay Staff' }, releaseEvidenceReference: evidence.evidenceReference, releasedPackageName: distribution.packageName, releasedPackageUnit: distribution.packageUnit, releasedQuantity: evidence.releasedQuantity }
      data = { claim: claim(), release: { evidence: { reference: evidence.evidenceReference } }, lifecycle: {} }
    }
    else if (path === '/distributions/event-1/qr-tokens') data = { qrTokens: [], summary: { matchingTokenCount: 0 } }
    else if (path === '/distributions/event-1/reconciliation') {
      if (failEventReview) return route.fulfill({ status: 503, json: { error: { message: 'Reconciliation service unavailable.' } } })
      data = { reconciliation: { readyToClose: progressClaimStatus === 'CLAIMED', ledgerBalanced: true, deliveryMode: distribution.deliveryMode, physicalReleasedCount: progressClaimStatus === 'CLAIMED' ? 1 : 0, physicalReleasedAmount: progressClaimStatus === 'CLAIMED' ? '1500' : '0', physicalPackage: distribution.deliveryMode === 'PHYSICAL_GOODS' ? { handoverCount: releaseRecord ? 1 : 0, name: distribution.packageName, unit: distribution.packageUnit, quantityPerBeneficiary: distribution.packageQuantity, allocatedQuantity: distribution.packageQuantity, recordedQuantity: releaseRecord?.releasedQuantity || 0, voidedClaimQuantity: 0, quantityNotRecordedCount: 0 } : null, exceptions: progressClaimStatus === 'CLAIMED' ? [] : Array.from({ length: issueCount }, (_, i) => ({ code: distribution.deliveryMode === 'PHYSICAL_GOODS' ? 'VERIFIED_PHYSICAL_CLAIM_AWAITING_RELEASE' : 'VERIFIED_CLAIM_AWAITING_CREDIT', claimId: `claim-${i + 1}` })) }, simulation: {} }
    }
    else if (/^\/distributions\/event-1\/claims\/claim-\d+$/.test(path)) {
      if (failIssue) return route.fulfill({ status: 503, json: { error: { message: 'Claim details unavailable.' } } })
      data = { claim: { ...claim(), claimId: path.split('/').at(-1) } }
    }
    else if (path === '/distributions/event-1/eligible-enrollments') data = { enrollments: journey && !journey.allocated && enrollmentStatus === 'APPROVED' ? [enrollment()] : [], pagination: pagination(), allocationAmount: '1500', summary: { serviceAreas: [], unspecifiedServiceAreaCount: 0 } }
    else if (path.endsWith('/claims')) {
      if (failProgress) return route.fulfill({ status: 503, json: { error: { message: 'Claim records unavailable.' } } })
      const matches = operations && (!url.searchParams.get('status') || url.searchParams.get('status') === claim().claimStatus)
      data = { claims: matches ? [claim()] : [], pagination: pagination(matches ? 1 : 0), summary: { countsByStatus: operations ? { [claim().claimStatus]: 1 } : {} } }
    }
    else if (path === '/distributions/event-1/claims/claim-1/receipt') data = { created: false, receipt: { receiptNo: 'GA-TEST-001', claimId: 'claim-1', evidenceHash: 'local-fixture-hash', receiptVersion: 'v1', currentClaimStatus: 'CLAIMED', issuedAt: '2026-10-20T01:00:00Z', snapshot: { beneficiary: { beneficiaryId: beneficiary.beneficiaryId, fullName: 'Maria Santos', barangayName: barangay.barangayName }, distribution: { ...distribution, programName: program.programName, programCode: program.programCode }, assistance: { amount: '1500', deliveryMode: distribution.deliveryMode, package: distribution.deliveryMode === 'PHYSICAL_GOODS' && releaseRecord ? { name: releaseRecord.releasedPackageName, unit: releaseRecord.releasedPackageUnit, quantity: releaseRecord.releasedQuantity } : null, evidence: { type: 'OFFICIAL_RELEASE_LOG', reference: 'TEST-LOG-1' } }, claim: claim(), service: { queueNumber: 1, sessionLabel: 'Morning session' }, verificationEvidence: {} } } }
    else if (path.endsWith('/claim-disputes')) data = { disputes: reviewDispute ? [{ ...claim().disputes[0], claim: claim(), filedBy: { userId: 'facilitator-1', fullName: 'Barangay Staff' }, filedAt: '2026-10-20T01:00:00Z', reasonCode: 'CLAIM_NOT_RECEIVED', statement: 'Beneficiary did not receive the recorded assistance.' }] : [], summary: { countsByStatus: reviewDispute ? { OPEN: 1 } : {} }, pagination: pagination(reviewDispute ? 1 : 0) }
    else if (path === '/staff-notifications') data = { notifications: [], unreadCount: 0, pagination: pagination() }
    else if (path === '/notifications') data = { notifications: [], pagination: pagination() }
    else if (path === '/notifications/summary') {
      if (failNotices) return route.fulfill({ status: 503, json: { error: { message: 'Notice records unavailable.' } } })
      data = { total: empty ? 0 : 4, byStatus: empty ? {} : { SENT: 1, PENDING: 2, FAILED: 1 } }
    }
    else if (path === '/notifications/queue/health') data = { status: 'available', counts: {} }
    else if (path === '/chatbot/escalations') data = { escalations: [], pagination: pagination() }
    else if (path === '/audit-logs') data = { auditLogs: [], pagination: pagination() }
    else if (path === '/reports/distributions/event-1/summary') data = { report: { generatedAt: '2026-10-20T08:00:00Z', timeZone: 'Asia/Manila', data: { distribution, beneficiaries: { allocatedCount: 1, claimCompletionPercentage: progressClaimStatus === 'CLAIMED' ? 100 : 0 }, slots: { capacityUtilizationPercentage: 10 }, qrScans: { duplicateCount: 0, invalidCount: 0 }, biometrics: { noMatchCount: 0 } } } }
    else if (path === '/auth/account') data = { user, security: { recoveryCodesRemaining: 8, activeSessionCount: 1 } }
    else if (path === '/auth/account/sessions') data = { sessions: [] }
    else { unhandled.add(path); return route.fulfill({ status: 404, json: { message: `Missing local fixture: ${path}` } }) }
    await route.fulfill({ json: { data } })
  })

  await page.goto(`${origin}/dashboard`)
  await expect(page.getByRole('heading', { name: 'Administration overview' })).toBeVisible({ timeout: 15000 })
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

  await page.goto(`${origin}/distributions/manage?event=event-1`)
  await page.getByRole('navigation', { name: 'Distribution setup stages' }).getByRole('button').nth(3).click()
  await expect(page.getByRole('button', { name: 'Open distribution event', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: 'Review service sessions', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Plan service sessions' })).toBeVisible()

  // Exercise the new Admin actions with local records and explicit server failures.
  operations = true
  await page.goto(`${origin}/distributions/manage?event=event-1`)
  await page.getByRole('navigation', { name: 'Distribution setup stages' }).getByRole('button').nth(0).click()
  await page.getByText('View time slots and edit capacity', { exact: true }).first().click()
  await page.getByRole('button', { name: /Edit capacity for Morning session/ }).first().click()
  const capacityDialog = page.getByRole('dialog', { name: 'Edit time-slot capacity' })
  await capacityDialog.getByLabel('Beneficiaries in this time slot').fill('2')
  rejectCapacity = true
  await capacityDialog.getByRole('button', { name: 'Save capacity' }).click()
  await expect(capacityDialog.getByRole('alert')).toContainText('existing appointments')
  await expect(capacityDialog.getByRole('alert')).toBeFocused()
  await expect(capacityDialog.getByLabel('Beneficiaries in this time slot')).toHaveValue('2')
  await page.setViewportSize({ width: 390, height: 900 })
  await page.screenshot({ path: `${output}/admin-capacity-conflict-mobile.png`, fullPage: true })
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `Capacity overflow: ${JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('#dashboard-content *, dialog')].filter((element) => element.getBoundingClientRect().right > innerWidth + 1).slice(0, 8).map((element) => ({ tag: element.tagName, class: element.className, width: element.getBoundingClientRect().width }))))}`)
  rejectCapacity = false
  await capacityDialog.getByLabel('Beneficiaries in this time slot').fill('12')
  await capacityDialog.getByRole('button', { name: 'Save capacity' }).click()
  await expect(capacityDialog).not.toBeVisible()
  assert.equal(slots[0].capacity, 12)
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.getByRole('navigation', { name: 'Distribution setup stages' }).getByRole('button').nth(2).click()
  await page.getByRole('button', { name: 'Review and adjust schedules' }).click()
  await expect(page.getByLabel('Distribution event', { exact: true })).toHaveValue('event-1')
  await page.getByRole('button', { name: 'Move', exact: true }).click()
  const moveDialog = page.getByRole('dialog', { name: 'Move Maria Santos' })
  await expect(moveDialog.getByLabel('Available session')).toHaveValue('slot-2')
  assert.equal(await moveDialog.getByLabel('Available session').locator('option').count(), 1, 'Do not offer slots outside the beneficiary service area')
  rejectMove = true
  await moveDialog.getByRole('button', { name: 'Move beneficiary' }).click()
  await expect(moveDialog.getByRole('alert')).toContainText('has just filled')
  await expect(moveDialog.getByRole('alert')).toBeFocused()
  rejectMove = false
  await moveDialog.getByRole('button', { name: 'Move beneficiary' }).click()
  await expect(moveDialog).not.toBeVisible()
  assert.equal(schedule.slotId, 'slot-2')
  await page.getByRole('button', { name: 'Return to distribution event' }).click()
  assert.equal(new URL(page.url()).searchParams.get('event'), 'event-1')

  distribution.status = 'OPEN'
  failNotices = true
  await page.reload()
  await expect(page.getByRole('alert').filter({ hasText: 'Notice status unavailable' })).toBeVisible()
  failNotices = false
  await page.getByRole('button', { name: 'Refresh notices' }).click()
  await expect(page.getByText('1 sent · 2 queued · 1 failed', { exact: true })).toBeVisible()
  await expect(page.getByText(/Counts are message records, not confirmed recipients/)).toBeVisible()
  const eventReview = page.getByLabel('Event operational review', { exact: true })
  const reconciliation = page.getByRole('region', { name: 'Distribution reconciliation', exact: true })
  await expect(eventReview.getByRole('link', { name: /1 Awaiting physical release/ })).toBeVisible()
  await expect(reconciliation.getByText('Maria Santos', { exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'Prepare push notification', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Push notifications', exact: true })).toBeVisible()
  await expect(page.getByLabel('Distribution event', { exact: true })).toHaveValue('event-1')
  await expect(page.getByText('1 selected · 1 with non-cancelled assignments')).toBeVisible()
  await page.getByRole('link', { name: 'Return to distribution event', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Distribution operations', exact: true })).toBeVisible()
  assert.equal(await page.getByRole('button', { name: 'Mark released', exact: true }).count(), 0)
  await eventReview.getByRole('link', { name: /Awaiting physical release/ }).click()
  await expect(page.getByLabel('Status', { exact: true })).toHaveValue('VERIFIED')
  await page.reload()
  await expect(page.getByLabel('Status', { exact: true })).toHaveValue('VERIFIED')
  await page.getByRole('link', { name: 'Return to distribution event' }).click()
  await eventReview.getByRole('link', { name: /Awaiting check-in/ }).click()
  await expect(page.getByLabel('Filter by queue status', { exact: true })).toHaveValue('SCHEDULED')
  await page.reload()
  await expect(page.getByLabel('Filter by queue status', { exact: true })).toHaveValue('SCHEDULED')
  await page.getByRole('button', { name: 'Return to distribution event' }).click()

  failIssue = true
  await eventReview.getByRole('button', { name: 'Refresh event review' }).click()
  await expect(reconciliation.getByRole('alert')).toContainText('Claim details unavailable')
  failIssue = false
  await reconciliation.getByRole('button', { name: 'Retry beneficiary details' }).click()
  await expect(reconciliation.getByText('Maria Santos', { exact: true })).toBeVisible()
  reviewDispute = true
  await eventReview.getByRole('button', { name: 'Refresh event review' }).click()
  await reconciliation.getByRole('link', { name: 'Review active dispute' }).click()
  await expect(page.getByRole('tab', { name: 'Dispute review' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByLabel('Search', { exact: true })).toHaveValue('GYA-CASE-1')
  await page.reload()
  await expect(page.getByRole('tab', { name: 'Dispute review' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByText('GYA-CASE-1', { exact: true }).filter({ visible: true })).toBeVisible()
  await page.getByRole('link', { name: 'Return to distribution event' }).click()
  await expect(eventReview.getByRole('link', { name: /1 Unassigned disputes/ })).toBeVisible()
  reviewDispute = false
  failEventReview = true
  await eventReview.getByRole('button', { name: 'Refresh event review' }).click()
  await expect(eventReview.getByRole('alert')).toContainText('Event review unavailable')
  assert.equal(await eventReview.getByRole('link', { name: /Awaiting physical release/ }).count(), 0, 'Failed reads must not display old or zero operational counts')
  await expect(page.getByText('1 sent · 2 queued · 1 failed', { exact: true })).toBeVisible()
  failEventReview = false
  issueCount = 6
  await eventReview.getByRole('button', { name: 'Refresh event review' }).click()
  await reconciliation.getByRole('button', { name: 'Next issues' }).click()
  await expect(reconciliation.getByText('Page 2 of 2')).toBeVisible()
  await expect(reconciliation.getByText('Maria Santos', { exact: true })).toBeVisible()
  await reconciliation.getByRole('link', { name: 'Review claim', exact: true }).click()
  await expect(page.getByLabel('Search', { exact: true })).toHaveValue('claim-6')
  assert.equal(new URL(page.url()).searchParams.get('receipt'), 'manual')
  issueCount = 1
  await page.getByRole('link', { name: 'Return to distribution event' }).click()
  distribution.deliveryMode = 'SIMULATED_WALLET'
  await page.reload()
  await expect(eventReview.getByRole('link', { name: /1 Awaiting simulated credit/ })).toContainText('DSWD staff')
  await expect(reconciliation.getByText('Simulated credit not recorded', { exact: true })).toBeVisible()
  distribution.deliveryMode = 'PHYSICAL_GOODS'
  await page.reload()
  await eventReview.getByRole('link', { name: 'Prepare event report', exact: true }).click()
  await expect(page.getByLabel('Distribution event', { exact: true })).toHaveValue('event-1')
  await page.getByRole('button', { name: 'Generate report', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Distribution summary', exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'Return to event review', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Distribution operations', exact: true })).toBeVisible()
  await expect(reconciliation.getByText('Maria Santos', { exact: true })).toBeVisible()
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 })
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.screenshot({ path: `${output}/event-workspace-${width}.png`, fullPage: width >= 1000 })
    await page.getByRole('heading', { name: 'Work remaining', exact: true }).scrollIntoViewIfNeeded()
    await page.waitForTimeout(200)
    await page.screenshot({ path: `${output}/event-monitoring-${width}.png`, fullPage: false })
    await page.getByRole('heading', { name: 'Distribution reconciliation', exact: true }).scrollIntoViewIfNeeded()
    await page.waitForTimeout(200)
    await page.screenshot({ path: `${output}/event-reconciliation-${width}.png`, fullPage: false })
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `Open event overflow at ${width}px: ${JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('#dashboard-content *')].filter((element) => element.getBoundingClientRect().right > innerWidth + 1).slice(0, 8).map((element) => ({ tag: element.tagName, class: element.className, width: element.getBoundingClientRect().width }))))}`)
  }
  await page.getByRole('button', { name: 'Verify QR claims', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Verify QR claims', exact: true })).toBeVisible()
  assert.equal(await page.getByRole('button', { name: 'Open assistant conversation' }).count(), 0, 'The help launcher must not cover validation controls')
  await expect(page.getByLabel('Distribution event', { exact: true })).toHaveValue('event-1')
  assert.equal(await page.getByRole('button', { name: /Scan with this device/ }).count(), 0)
  await page.getByLabel('QR credential', { exact: true }).fill('local-test-credential')
  await page.getByRole('button', { name: 'Review QR claim', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Confirm QR validation' })).toBeFocused()
  assert.equal(verificationKeys.length, 0, 'Preview must not verify or release a claim')
  failVerification = true
  await page.getByRole('button', { name: 'Confirm QR validation' }).click()
  await expect(page.getByRole('alert').filter({ hasText: 'Verification temporarily unavailable' })).toBeVisible()
  failVerification = false
  await page.getByRole('button', { name: 'Confirm QR validation' }).click()
  await expect(page.getByLabel('QR validation result', { exact: true })).toBeFocused()
  assert.equal(verificationKeys.length, 2)
  assert.ok(verificationKeys[0])
  assert.equal(verificationKeys[0], verificationKeys[1], 'A retry must retain the original confirmation key')
  await expect(page.getByText(/does not mark assistance as received/)).toBeVisible()
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path: `${output}/admin-qr-result-desktop.png`, fullPage: true })
  await page.getByRole('button', { name: 'View claim record' }).click()
  await expect(page.getByLabel('Search', { exact: true })).toHaveValue('claim-1')
  await expect(page.getByText('Verified claims still need a release record')).toBeVisible()
  assert.equal(await page.getByRole('button', { name: 'Mark released' }).count(), 0)

  await page.goto(`${origin}/admin/verify-claims?distribution=event-1`)
  duplicateQr = true
  await page.getByLabel('QR credential', { exact: true }).fill('already-used')
  await page.getByRole('button', { name: 'Review QR claim', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('already been used')
  assert.equal(verificationKeys.length, 2)
  duplicateQr = false
  distribution.verificationRequirement = 'QR_AND_BIOMETRIC'
  await page.reload()
  await page.getByLabel('QR credential', { exact: true }).fill('requires-face-check')
  await page.getByRole('button', { name: 'Review QR claim', exact: true }).click()
  await page.getByRole('button', { name: 'Confirm QR validation' }).click()
  await expect(page.getByText(/claim remains pending until all identity checks pass/)).toBeVisible()
  assert.equal(await page.getByRole('button', { name: 'Continue to biometric' }).count(), 0, 'Admin must not be routed to a facilitator-only action')

  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto(`${origin}/admin/verify-claims?distribution=event-1`)
    await expect(page.getByLabel('QR credential', { exact: true })).toBeVisible()
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `QR overflow at ${width}px: ${JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('#dashboard-content *')].filter((element) => element.getBoundingClientRect().right > innerWidth + 1).slice(0, 6).map((element) => ({ tag: element.tagName, class: element.className, width: element.getBoundingClientRect().width }))))}`)
    await page.screenshot({ path: `${output}/admin-qr-${width}.png`, fullPage: true })
    await page.goto(`${origin}/admin/schedules?distribution=event-1`)
    await expect(page.getByRole('heading', { name: 'Beneficiary queue', exact: true })).toBeVisible()
    assert.equal(await page.getByRole('button', { name: 'Move', exact: true }).count(), 0, 'Open-event schedules stay locked')
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `Queue overflow at ${width}px`)
    await page.screenshot({ path: `${output}/admin-queue-${width}.png`, fullPage: true })
  }
  await page.evaluate(() => sessionStorage.setItem('local-test-role', 'DSWD_STAFF'))
  await page.goto(`${origin}/admin/verify-claims`)
  // QR routes share a role-aware screen; DSWD has QR permission but cannot manage schedules.
  await expect(page.getByRole('heading', { name: 'Verify QR claims', exact: true })).toBeVisible()
  await expect(page.getByLabel('USB QR scanner input')).toBeVisible()
  assert.equal(await page.getByLabel('QR credential', { exact: true }).count(), 0)
  await page.goto(`${origin}/admin/schedules`)
  await expect(page.getByRole('heading', { name: 'Staff access required' })).toBeVisible()

  distribution.verificationRequirement = 'QR'
  await page.evaluate(() => sessionStorage.setItem('local-test-role', 'BARANGAY_FACILITATOR'))
  await page.goto(`${origin}/facilitator/qr-verification?distribution=event-1`)
  await expect(page.getByRole('button', { name: /Scan with this device/ })).toBeVisible()
  await page.getByLabel('USB QR scanner input').fill('facilitator-credential')
  await page.getByRole('button', { name: 'Review detected QR' }).click()
  await page.getByRole('button', { name: 'Confirm check-in' }).click()
  await page.getByRole('button', { name: 'Continue to physical handover' }).click()
  await expect(page.getByRole('button', { name: 'Mark released' })).toBeEnabled()
  await page.getByRole('button', { name: 'Mark released' }).click()
  const releaseDialog = page.getByRole('dialog', { name: 'Record the release' })
  await releaseDialog.getByLabel('Evidence reference', { exact: true }).fill('TEST-LOG-1')
  await releaseDialog.getByLabel('Quantity handed over', { exact: true }).fill('1')
  await releaseDialog.getByRole('checkbox').check()
  failRelease = true
  await releaseDialog.getByRole('button', { name: 'Mark assistance released' }).click()
  await expect(releaseDialog.getByRole('alert')).toContainText('Release service temporarily unavailable')
  await expect(releaseDialog.getByLabel('Evidence reference', { exact: true })).toHaveValue('TEST-LOG-1')
  failRelease = false
  await releaseDialog.getByRole('button', { name: 'Retry release record' }).click()
  await expect(releaseDialog).not.toBeVisible()
  assert.equal(releaseKeys.length, 2)
  assert.ok(releaseKeys[0])
  assert.equal(releaseKeys[0], releaseKeys[1])
  await expect(page.getByRole('button', { name: 'Released', exact: true })).toBeDisabled()
  await page.evaluate(() => sessionStorage.removeItem('local-test-role'))
  await page.goto(`${origin}/distributions/manage?event=event-1`)
  await expect(eventReview.getByRole('link', { name: /1 Completed claims/ })).toBeVisible()
  await expect(eventReview.getByRole('link', { name: /0 Awaiting physical release/ })).toBeVisible()
  await expect(reconciliation.getByText('Reconciled', { exact: true })).toBeVisible()
  assert.equal(await page.getByText('Event closed', { exact: true }).count(), 0)
  progressClaimStatus = ''
  releaseRecord = null
  omitBeneficiary = true
  await page.goto(`${origin}/biometrics?view=history&distribution=event-1&result=NO_MATCH`)
  await expect(page.getByLabel('Result', { exact: true })).toHaveValue('NO_MATCH')
  await page.getByRole('button', { name: 'Review attempt', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Maria Santos', exact: true })).toBeVisible()
  await page.getByLabel('Review notes', { exact: true }).fill('Check the beneficiary record before another live capture.')
  await page.getByRole('button', { name: 'Save review draft' }).click()
  await expect(page.getByText('Saved draft: Needs follow-up · not submitted', { exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'Back to attempt history', exact: true }).click()
  await page.getByRole('button', { name: 'Review beneficiary profile' }).click()
  await expect(page.getByLabel('Beneficiary record', { exact: true })).toHaveValue('beneficiary-1')
  await expect(page.getByRole('heading', { name: 'Informed consent' })).toBeVisible()
  await page.getByRole('tab', { name: 'Attempt history' }).click()
  await page.getByRole('button', { name: 'Review beneficiary profile' }).click()
  await expect(page.getByRole('heading', { name: 'Informed consent' })).toBeVisible()
  omitBeneficiary = false
  failAttempts = true
  await page.goto(`${origin}/biometrics?view=history&distribution=event-1`)
  await expect(page.getByRole('alert').filter({ hasText: 'Attempt history could not be loaded' })).toBeVisible()
  failAttempts = false
  await page.getByRole('button', { name: 'Try again', exact: true }).click()
  await expect(page.getByText(/The capture did not match the selected profile/).filter({ visible: true })).toBeVisible()
  await page.setViewportSize({ width: 390, height: 900 })
  await page.screenshot({ path: `${output}/biometric-followup-390.png`, fullPage: false })
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `Biometric overflow: ${JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('#dashboard-content *')].filter((element) => element.getBoundingClientRect().right > innerWidth + 1).slice(0, 8).map((element) => ({ tag: element.tagName, class: element.className, width: element.getBoundingClientRect().width }))))}`)

  enrollmentStatus = 'APPROVED'
  await page.goto(`${origin}/beneficiaries?beneficiary=beneficiary-1`)
  const progress = page.getByRole('region', { name: 'Assistance progress', exact: true })
  await expect(progress.getByLabel('Program enrollment')).toHaveValue('enrollment-1')
  await progress.getByLabel('Distribution event', { exact: true }).selectOption('event-1')
  await expect(progress.getByText('Awaiting physical release', { exact: true })).toBeVisible()
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 })
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.screenshot({ path: `${output}/beneficiary-progress-${width}.png`, fullPage: width >= 1000 })
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `Beneficiary progress overflow at ${width}px`)
  }
  await page.reload()
  await expect(progress.getByLabel('Distribution event', { exact: true })).toHaveValue('event-1')
  await expect(progress.getByText('Awaiting physical release', { exact: true })).toBeVisible()
  await progress.getByRole('link', { name: 'Review event allocation', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Allocate approved beneficiaries' })).toBeVisible()
  await page.goBack()
  await expect(progress.getByLabel('Distribution event', { exact: true })).toHaveValue('event-1')
  await progress.getByRole('link', { name: 'View schedule', exact: true }).click()
  await expect(page.getByLabel('Search beneficiary or queue number')).toHaveValue('beneficiary-1')
  await expect(page.getByLabel('Distribution event', { exact: true })).toHaveValue('event-1')

  await page.goto(`${origin}/beneficiaries?beneficiary=beneficiary-1`)
  failProgress = true
  await progress.getByLabel('Distribution event', { exact: true }).selectOption('event-1')
  await expect(progress.getByRole('alert')).toContainText('Claim records unavailable')
  assert.equal(await progress.getByText('Not assigned to this event', { exact: true }).count(), 0)
  failProgress = false
  await progress.getByRole('button', { name: 'Try again' }).click()
  await expect(progress.getByLabel('Distribution event', { exact: true })).toHaveValue('event-1')
  await expect(progress.getByText('Awaiting physical release', { exact: true })).toBeVisible()
  await progress.getByRole('link', { name: 'Open claim record', exact: true }).click()
  await expect(page.getByLabel('Search', { exact: true })).toHaveValue('claim-1')
  assert.equal(await page.getByRole('button', { name: 'Mark released' }).count(), 0)

  progressClaimStatus = 'CLAIMED'
  await page.goto(`${origin}/distributions/manage?event=event-1`)
  await expect(page.getByText('1 person', { exact: true })).toBeVisible()
  await expect(page.getByText('1 of 1', { exact: true })).toBeVisible()
  await page.goto(`${origin}/beneficiaries?beneficiary=beneficiary-1`)
  await progress.getByLabel('Distribution event', { exact: true }).selectOption('event-1')
  await expect(progress.getByText('Released', { exact: true })).toBeVisible()
  await progress.getByRole('link', { name: 'View release and receipt', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Claim acknowledgment receipt' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Issue receipt', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Claim acknowledgment receipt' })).toBeVisible()
  await expect(page.getByText('TEST-LOG-1', { exact: true }).first()).toBeVisible()
  await page.getByRole('button', { name: 'Close claim receipt' }).click()
  progressClaimStatus = ''
  for (const role of ['DSWD_STAFF', 'BARANGAY_FACILITATOR']) {
    await page.evaluate((role) => sessionStorage.setItem('local-test-role', role), role)
    await page.goto(`${origin}/beneficiaries?beneficiary=beneficiary-1`)
    await progress.getByRole('link', { name: 'Open enrollment', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Open full record' })).toBeVisible()
    assert.equal(new URL(page.url()).searchParams.get('enrollment'), 'enrollment-1')
  }
  await page.evaluate(() => sessionStorage.removeItem('local-test-role'))
  enrollmentStatus = 'PENDING'
  distribution.status = 'DRAFT'
  await page.goto(`${origin}/admin/verify-claims?distribution=event-1`)
  await expect(page.getByRole('alert')).toContainText('not open for QR validation')
  assert.equal(await page.getByLabel('QR credential', { exact: true }).count(), 0)
  operations = false

  // Two complete UI journeys use one beneficiary and stateful local API responses.
  operations = true
  await page.setViewportSize({ width: 1440, height: 1000 })
  for (const deliveryMode of ['PHYSICAL_GOODS', 'SIMULATED_WALLET']) {
    journey = { allocated: false, scheduled: false, credited: false }
    enrollmentStatus = 'PENDING'
    progressClaimStatus = 'PENDING'
    releaseRecord = null
    distribution.status = 'DRAFT'
    distribution.deliveryMode = deliveryMode
    distribution.verificationRequirement = 'QR'
    schedule.status = 'SCHEDULED'
    beneficiary.documents = [{ documentId: 'document-1', documentType: 'VALID_ID', reviewStatus: 'ACCEPTED', originalFileName: 'Accepted-ID.pdf', uploadedAt: '2026-10-01T00:00:00Z' }]
    await page.evaluate(() => sessionStorage.removeItem('local-test-role'))
    await page.goto(origin + '/enrollments?enrollment=enrollment-1')
    await page.getByRole('button', { name: 'Start validation', exact: true }).click()
    await page.getByRole('button', { name: 'Approve enrollment', exact: true }).click()
    await page.getByRole('dialog', { name: 'Approve this enrollment?' }).getByRole('button', { name: 'Approve enrollment', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Approved for the program', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Find a distribution for this program' }).click()
    await page.getByRole('checkbox', { name: 'Select Maria Santos', exact: true }).filter({ visible: true }).check()
    await page.getByRole('button', { name: 'Allocate 1 beneficiary', exact: true }).click()
    await page.getByRole('button', { name: 'Schedule 1 remaining', exact: true }).click()
    await page.getByRole('button', { name: 'Open distribution event', exact: true }).click()
    await page.getByRole('dialog', { name: 'Open this distribution event?' }).getByRole('button', { name: 'Open event', exact: true }).click()
    await page.getByRole('button', { name: 'Verify QR claims', exact: true }).click()
    await page.getByLabel('QR credential', { exact: true }).fill('local-journey-credential')
    await page.getByRole('button', { name: 'Review QR claim', exact: true }).click()
    await page.getByRole('button', { name: 'Confirm QR validation', exact: true }).click()
    await page.getByRole('button', { name: 'View claim record', exact: true }).click()
    assert.equal(progressClaimStatus, 'VERIFIED')
    assert.equal(await page.getByRole('button', { name: 'Mark released', exact: true }).count(), 0)
    await page.evaluate((role) => sessionStorage.setItem('local-test-role', role), deliveryMode === 'PHYSICAL_GOODS' ? 'BARANGAY_FACILITATOR' : 'DSWD_STAFF')
    await page.reload()
    if (deliveryMode === 'PHYSICAL_GOODS') {
      await page.getByRole('button', { name: 'Mark released', exact: true }).click()
      const form = page.getByRole('dialog', { name: 'Record the release' })
      await form.getByLabel('Evidence reference', { exact: true }).fill('JOURNEY-LOG-001')
      await form.getByLabel('Quantity handed over', { exact: true }).fill('1')
      await form.getByRole('checkbox').check()
      await form.getByRole('button', { name: 'Mark assistance released' }).click()
      await expect(form).not.toBeVisible()
    } else {
      await page.getByRole('link', { name: 'Open wallet credits', exact: true }).click()
      await page.getByRole('button', { name: 'Review and credit' }).click()
      const form = page.getByRole('dialog', { name: 'Credit this verified claim?' })
      await form.getByRole('button', { name: 'Credit verified claim' }).click()
      await expect(form).not.toBeVisible()
      assert.equal(journey.credited, true)
      await page.goto(origin + '/claim-accountability?distribution=event-1&claim=claim-1')
    }
    await page.getByRole('button', { name: 'Issue receipt', exact: true }).click()
    await expect(page.getByRole('dialog', { name: 'Claim acknowledgment receipt' })).toContainText(deliveryMode === 'PHYSICAL_GOODS' ? 'Physical goods' : 'Simulated wallet')
    await page.getByRole('button', { name: 'Close claim receipt' }).click()
    await page.evaluate(() => sessionStorage.removeItem('local-test-role'))
    await page.goto(origin + '/distributions/manage?event=event-1')
    await expect(reconciliation.getByText('Reconciled', { exact: true })).toBeVisible()
    assert.equal(distribution.status, 'OPEN', 'Reconciliation must not close the event')
    completedJourneys.push(deliveryMode)
  }
  journey = null
  operations = false
  beneficiary.documents = []

  const routes = [
    ['/dashboard', 'Administration overview', 'overview'],
    ['/beneficiaries', 'Beneficiary records', 'beneficiaries'],
    ['/enrollments', 'Enrollment review', 'enrollments'],
    ['/programs', 'Assistance programs', 'programs'],
    ['/distributions/manage', 'Distribution events', 'distributions'],
    ['/admin/schedules', 'Queue & schedules', 'admin-schedules'],
    ['/admin/verify-claims', 'Verify QR claims', 'admin-claims'],
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
      if (route === '/admin/schedules' || route === '/admin/verify-claims') {
        const heading = page.getByRole('heading', { name: route === '/admin/schedules' ? 'No draft or open distribution events' : 'No open distribution event', exact: true })
        await expect(heading).toBeVisible()
        await expect(heading.locator('../..').locator('svg').first()).toBeVisible()
        await expect(page.getByRole('button', { name: 'View distribution events', exact: true })).toBeVisible()
      }
      if (route === '/biometrics') {
        const heading = page.getByRole('heading', { name: 'Choose a beneficiary to begin', exact: true })
        await expect(heading).toBeVisible()
        await expect(heading.locator('../..').locator('svg').first()).toBeVisible()
        await expect(page.getByLabel('Find beneficiary by name')).toHaveAttribute('placeholder', 'Enter beneficiary name')
      }
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
    for (const route of ['/admin/schedules', '/admin/verify-claims', '/biometrics']) {
      await page.goto(`${origin}${route}`)
      await expect(page.getByRole('heading', { name: route === '/admin/schedules' ? 'No draft or open distribution events' : route === '/admin/verify-claims' ? 'No open distribution event' : 'Choose a beneficiary to begin', exact: true })).toBeVisible()
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
      await page.screenshot({ path: `${output}/${route.split('/').at(-1)}-empty-${width}.png`, fullPage: true })
    }
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
  console.log(JSON.stringify({ result: 'Admin workflow and responsive checks passed', completedJourneys, unhandled: [...unhandled], screenshots: output }))
} finally {
  await browser?.close()
  await vite.close()
}
