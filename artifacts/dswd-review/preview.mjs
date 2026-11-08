import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium, expect } from '@playwright/test'
import { createServer } from 'vite'

// Local fixtures exercise navigation and presentation without touching staff records.
const output = resolve('../output/dswd-review')
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
  const user = { userId: 'admin-1', role: 'DSWD_STAFF', fullName: 'DSWD Reviewer', employeeId: 'ADMIN-001', email: 'admin@example.test', isActive: true, totpEnabled: true, createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z' }
  const barangay = { barangayId: 'barangay-1', barangayName: 'Poblacion', city: 'Cebu City', province: 'Cebu', isActive: true }
  const program = { programId: 'program-1', programName: 'Community Assistance', programCode: 'AID-2026', programType: 'CASH_ASSISTANCE', status: 'ACTIVE', grantAmount: '1500', budgetAmount: '150000', applicationStartDate: '2026-10-01', applicationEndDate: '2026-12-31', criteria: [], requiredDocumentTypes: ['VALID_ID'] }
  const beneficiary = { beneficiaryId: 'beneficiary-1', firstName: 'Maria', lastName: 'Santos', birthDate: '1990-01-01', sex: 'FEMALE', address: 'Barangay Hall Road', barangay, barangayId: barangay.barangayId, status: 'ACTIVE', documents: [] }
  const distribution = { distributionId: 'event-1', title: 'October community assistance', programId: program.programId, program, barangayId: barangay.barangayId, barangay, distributionDate: '2026-10-20', startTime: '08:00', endTime: '12:00', slotDurationMinutes: 30, location: 'Barangay Hall', deliveryMode: 'PHYSICAL_GOODS', verificationRequirement: 'QR', status: 'DRAFT' }
  const slots = [
    { slotId: 'slot-1', sessionId: 'session-1', sessionLabel: 'Morning session', slotStart: '2026-10-20T08:00:00+08:00', slotEnd: '2026-10-20T08:30:00+08:00', capacity: 10, slotStatus: 'AVAILABLE', serviceAreas: [], location: 'Barangay Hall' },
    { slotId: 'slot-2', sessionId: 'session-1', sessionLabel: 'Morning session', slotStart: '2026-10-20T08:30:00+08:00', slotEnd: '2026-10-20T09:00:00+08:00', capacity: 10, slotStatus: 'AVAILABLE', serviceAreas: [], location: 'Barangay Hall' },
    { slotId: 'slot-3', sessionId: 'session-2', sessionLabel: 'Other service area', slotStart: '2026-10-20T09:00:00+08:00', slotEnd: '2026-10-20T09:30:00+08:00', capacity: 10, slotStatus: 'AVAILABLE', serviceAreas: ['Purok 9'], location: 'Barangay Hall' },
  ]
  const schedule = { scheduleId: 'schedule-1', slotId: 'slot-1', beneficiary, slot: slots[0], queueNumber: 1, status: 'SCHEDULED' }
  const claim = () => ({ claimId: 'claim-1', distributionId: distribution.distributionId, beneficiaryId: beneficiary.beneficiaryId, beneficiary, schedule, allocation: { amount: '1500' }, claimStatus: progressClaimStatus || (distribution.verificationRequirement === 'QR' ? 'VERIFIED' : 'PENDING'), qrVerified: true, biometricVerified: false, verificationMethod: distribution.verificationRequirement, disputes: reviewDispute ? [{ disputeId: 'dispute-1', status: 'OPEN', referenceNo: 'GYA-CASE-1' }] : [], ...releaseRecord })
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
      progressClaimStatus = 'CLAIMED'
      releaseRecord = { releasedAt: '2026-10-20T01:00:00Z', releaseMethod: 'PHYSICAL_GOODS', releasedBy: { fullName: 'Barangay Staff' }, releaseEvidenceReference: evidence.evidenceReference }
      data = { claim: claim(), release: { evidence: { reference: evidence.evidenceReference } }, lifecycle: {} }
    }
    else if (path === '/distributions/event-1/qr-tokens') data = { qrTokens: [], summary: { matchingTokenCount: 0 } }
    else if (path === '/distributions/event-1/reconciliation') {
      if (failEventReview) return route.fulfill({ status: 503, json: { error: { message: 'Reconciliation service unavailable.' } } })
      data = { reconciliation: { readyToClose: progressClaimStatus === 'CLAIMED', ledgerBalanced: true, deliveryMode: distribution.deliveryMode, physicalReleasedCount: progressClaimStatus === 'CLAIMED' ? 1 : 0, physicalReleasedAmount: progressClaimStatus === 'CLAIMED' ? '1500' : '0', exceptions: progressClaimStatus === 'CLAIMED' ? [] : Array.from({ length: issueCount }, (_, i) => ({ code: distribution.deliveryMode === 'PHYSICAL_GOODS' ? 'VERIFIED_PHYSICAL_CLAIM_AWAITING_RELEASE' : 'VERIFIED_CLAIM_AWAITING_CREDIT', claimId: `claim-${i + 1}` })) }, simulation: {} }
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
    else if (path === '/distributions/event-1/claims/claim-1/receipt') data = { created: false, receipt: { receiptNo: 'GA-TEST-001', claimId: 'claim-1', evidenceHash: 'local-fixture-hash', receiptVersion: 'v1', currentClaimStatus: 'CLAIMED', issuedAt: '2026-10-20T01:00:00Z', snapshot: { beneficiary: { beneficiaryId: beneficiary.beneficiaryId, fullName: 'Maria Santos', barangayName: barangay.barangayName }, distribution: { ...distribution, programName: program.programName, programCode: program.programCode }, assistance: { amount: '1500', deliveryMode: distribution.deliveryMode, evidence: { type: 'OFFICIAL_RELEASE_LOG', reference: 'TEST-LOG-1' } }, claim: claim(), service: { queueNumber: 1, sessionLabel: 'Morning session' }, verificationEvidence: {} } } }
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

  operations = true
  journey = { allocated: true, scheduled: true }
  distribution.status = 'OPEN'
  distribution.deliveryMode = 'SIMULATED_WALLET'
  progressClaimStatus = 'VERIFIED'
  const writes = []
  page.on('request', request => { if (request.url().includes('/api/v1/') && request.method() !== 'GET') writes.push(request.method() + ' ' + new URL(request.url()).pathname) })
  const reviewRoutes = [
    ['/dashboard', 'DSWD overview', 'overview'],
    ['/enrollments?enrollment=enrollment-1', 'Enrollment review', 'enrollment'],
    ['/beneficiaries?beneficiary=beneficiary-1', 'Beneficiary', 'beneficiary'],
    ['/dswd/live-dashboard?distribution=event-1', 'Live operations dashboard', 'live'],
    ['/dswd/ledger?distribution=event-1', 'Simulated aid ledger', 'ledger'],
    ['/claim-accountability?distribution=event-1', 'Claims and receipts', 'claims'],
  ]
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    for (const [path, title, name] of reviewRoutes) {
      await page.goto(origin + path)
      await expect(page.locator('h1:visible').filter({ hasText: title }).first()).toBeVisible()
      await page.waitForTimeout(450)
      if (name === 'ledger') await expect(page.getByRole('button', { name: 'Review and credit' })).toBeVisible()
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), path + ' overflow')
      await page.screenshot({ path: `${output}/${name}-${width}.png`, fullPage: true })
    }
  }
  assert.deepEqual(writes, [])
  assert.deepEqual(errors, [])
  assert.deepEqual([...unhandled], [])
  console.log(JSON.stringify({ result: 'Six DSWD screens rendered at desktop and mobile sizes', writes, screenshots: output }))
} finally {
  await browser?.close()
  await vite.close()
}