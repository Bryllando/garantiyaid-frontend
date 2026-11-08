import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { chromium, expect } from '@playwright/test'
import { createServer } from 'vite'

// One beneficiary across role handoffs. Every API call is intercepted; no real records or biometric processing.
const output = '../output/role-walkthrough'
await mkdir(output, { recursive: true })
const vite = await createServer({ cacheDir: '../tmp/role-walkthrough-vite', server: { host: '127.0.0.1', port: 0 } })
await vite.listen()
const origin = `http://127.0.0.1:${vite.httpServer.address().port}`
let browser
try {
  browser = await chromium.launch({ headless: true, channel: 'chrome' })
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  page.setDefaultTimeout(10000)
  page.setDefaultNavigationTimeout(45000)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const errors = [], unhandled = [], mutations = [], schedulePages = []
  let role = 'BARANGAY_FACILITATOR', enrollmentStatus = '', claimStatus = '', qrVerified = false, biometricVerified = false, hasReceipt = false
  let registered = false, allocated = false, scheduled = false, submittedBy = '', reviewNotes = '', closeConflict = false, expired = false
  let failSignature = false, signatureVerified = false
  const signatureKeys = [], signatureBodies = []
  let finishQr, holdQr = false
  const qrSaved = new Promise(resolve => { finishQr = resolve })
  let failWorkspace = false, failSchedules = false, failBiometric = false
  let profileEnrolled = false, consentRecorded = false, failEnrollment = true, holdEnrollment = false
  let finishEnrollment
  const enrollmentSaved = new Promise(resolve => { finishEnrollment = resolve })
  const processing = { simulatedProcessor: true, processorMode: 'SIMULATED_LOCAL' }
  const profile = () => ({ biometricId: profileEnrolled ? 'profile-1' : null, biometricStatus: profileEnrolled ? 'ENROLLED' : 'NOT_ENROLLED' })
  const consent = () => ({ consentId: 'consent-1', consentStatus: 'ACTIVE', consentVersion: 'v1.0', retentionUntil: '2099-01-01T00:00:00Z' })
  const barangay = { barangayId: 'barangay-1', barangayName: 'Poblacion', city: 'Cebu City', province: 'Cebu' }
  const program = { programId: 'program-1', programName: 'Community Assistance', programCode: 'AID', status: 'ACTIVE', grantAmount: '1500', requiredDocumentTypes: ['VALID_ID'] }
  const beneficiary = { beneficiaryId: 'person-1', firstName: 'Maria', lastName: 'Santos', status: 'ACTIVE', barangayId: barangay.barangayId, barangay, birthDate: '1990-01-01', sex: 'FEMALE', address: 'Community Road' }
  const documents = []
  const event = { distributionId: 'event-1', title: 'October assistance', status: 'DRAFT', distributionDate: '2026-10-29', startTime: '08:00', endTime: '17:00', location: 'Community hall', program, barangay, deliveryMode: 'SIMULATED_WALLET', verificationRequirement: 'QR_AND_BIOMETRIC' }
  const slot = { slotId: 'slot-1', sessionId: 'session-1', sessionLabel: 'Morning', slotStart: '2026-10-29T00:00:00Z', slotEnd: '2026-10-29T01:00:00Z', location: 'Community hall', serviceAreas: [], capacity: 200, slotStatus: 'AVAILABLE' }
  const pagination = (total = 1, number = 1, size = 20) => ({ page: number, pageSize: size, total, totalPages: Math.ceil(total / size) })
  const schedule = () => ({ scheduleId: 'schedule-1', beneficiaryId: 'person-1', beneficiary, queueNumber: 101, status: qrVerified || biometricVerified ? 'CHECKED_IN' : 'SCHEDULED', slot: { sessionLabel: 'Morning', slotStart: '2026-10-29T00:00:00Z', slotEnd: '2026-10-29T01:00:00Z', location: event.location }, claim: claimStatus ? { claimId: 'claim-1', claimStatus } : null })
  const claim = () => ({ claimId: 'claim-1', distributionId: event.distributionId, beneficiaryId: beneficiary.beneficiaryId, beneficiary, distribution: { ...event }, claimStatus, qrVerified, biometricVerified, signatureVerified, verificationMethod: event.verificationRequirement, schedule: schedule(), allocation: { amount: '1500', allocationStatus: 'ALLOCATED' }, disputes: [], receipt: hasReceipt ? { receiptNo: 'RECEIPT-001' } : null, ...(claimStatus === 'CLAIMED' ? { releasedAt: '2026-10-29T01:00:00Z', releasedBy: { fullName: 'Release officer' }, releaseMethod: event.deliveryMode, releaseEvidenceReference: 'LOG-001' } : {}) })
  const enrollment = () => ({ enrollmentId: 'enrollment-1', beneficiaryId: 'person-1', beneficiary: { ...beneficiary, documents }, programId: program.programId, program, status: enrollmentStatus, reviewNotes, submittedById: submittedBy, submittedBy: { fullName: 'Barangay Submitter' }, createdAt: '2026-10-29T00:00:00Z', eligibilityEvaluation: { overallStatus: 'ELIGIBLE', results: [], referenceDate: '2026-10-29' } })
  const funds = () => ({ allocatedAmount: '1500', netCreditedAmount: claimStatus === 'CLAIMED' ? '1500' : '0', remainingAmount: claimStatus === 'CLAIMED' ? '0' : '1500', reversedAmount: '0', failedAmount: '0' })
  const transaction = () => ({ transactionId: 'transaction-1', walletId: 'wallet-1', claimId: 'claim-1', referenceNo: 'SIM-001', amount: '1500', status: 'COMPLETED', transactionType: 'BENEFIT_CREDIT', beneficiary, balanceBefore: '0', balanceAfter: '1500', createdAt: '2026-10-29T01:00:00Z' })
  const receipt = () => ({ receiptNo: 'RECEIPT-001', evidenceHash: 'fixture-hash', issuedAt: '2026-10-29T01:00:00Z', currentClaimStatus: claimStatus, snapshot: { beneficiary: { ...beneficiary, fullName: 'Maria Santos' }, distribution: { ...event, programName: program.programName, programCode: 'AID' }, assistance: { amount: '1500', deliveryMode: event.deliveryMode, evidence: { type: 'OFFICIAL_RELEASE_LOG', reference: 'LOG-001' } }, claim: claim(), service: { queueNumber: 101 }, verificationEvidence: {} } })
  await page.addInitScript(() => {
    const role = sessionStorage.getItem('walk-role') || 'BARANGAY_FACILITATOR'
    sessionStorage.setItem('garantiyaid.accessToken', 'local-walkthrough')
    sessionStorage.setItem('garantiyaid.user', JSON.stringify({ userId: role, role, fullName: role === 'DSWD_STAFF' ? 'DSWD Reviewer' : role === 'SYSTEM_ADMIN' ? 'Admin Reviewer' : 'Barangay Facilitator', barangayId: role === 'BARANGAY_FACILITATOR' ? 'barangay-1' : null }))
  })
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('**/socket.io/**', (route) => route.abort())
  await page.routeWebSocket(/socket\.io/, () => {})
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname.replace('/api/v1', ''), method = request.method()
    const fail = (message) => route.fulfill({ status: 503, json: { error: { message } } })
    if (expired && path === '/enrollments/enrollment-1') return route.fulfill({ status: 401, json: { error: { code: 'INVALID_SESSION', message: 'Session expired. Sign in again.' } } })
    if (method !== 'GET') mutations.push({ role, path })
    let data
    if (path === '/health') data = { timestamp: new Date().toISOString() }
    else if (path === '/staff-notifications') data = { notifications: [], unreadCount: 0, pagination: pagination(0) }
    else if (path === '/staff-notifications/unread-count') data = { unreadCount: 0 }
    else if (path === '/barangays') data = { barangays: [barangay] }
    else if (path === '/programs') data = { programs: [program], pagination: pagination() }
    else if (path === '/beneficiaries' && method === 'POST') { assert.equal(role, 'BARANGAY_FACILITATOR'); assert.equal(request.postDataJSON().firstName, 'Maria'); registered = true; data = { beneficiary } }
    else if (path === '/beneficiaries') data = { beneficiaries: registered ? [beneficiary] : [], pagination: pagination(registered ? 1 : 0) }
    else if (path === '/beneficiaries/person-1') data = { beneficiary }
    else if (path === '/beneficiaries/person-1/biometric-consents' && method === 'POST') {
      assert.equal(role, 'BARANGAY_FACILITATOR'); assert.equal(request.postDataJSON().consentGiven, true)
      consentRecorded = true; data = { consent: consent() }
    }
    else if (path === '/beneficiaries/person-1/biometric-consents') data = { consents: consentRecorded ? [consent()] : [], pagination: pagination(consentRecorded ? 1 : 0) }
    else if (path === '/beneficiaries/person-1/biometrics/status') data = { biometricProfile: profile(), processing }
    else if (path === '/beneficiaries/person-1/biometrics/enroll') {
      assert.equal(role, 'BARANGAY_FACILITATOR'); assert.ok(consentRecorded)
      assert.ok(request.postDataBuffer().includes(Buffer.from('consent-1')))
      if (failEnrollment) return route.fulfill({ status: 503, json: { error: { code: 'BIOMETRIC_SERVICE_UNAVAILABLE', message: 'The face service took too long to respond. Wait a moment, then retry with the captured photo.' } } })
      if (holdEnrollment) await enrollmentSaved
      profileEnrolled = true; data = { biometricProfile: profile(), processing }
    }
    else if (path === '/beneficiaries/person-1/documents' && method === 'POST') { assert.ok(registered); assert.equal(role, 'BARANGAY_FACILITATOR'); documents.push({ documentId: 'document-1', documentType: 'VALID_ID', reviewStatus: 'SUBMITTED', originalFileName: 'id.pdf' }); data = { document: documents[0] } }
    else if (path === '/beneficiaries/person-1/documents/document-1/review') { assert.equal(role, 'DSWD_STAFF'); Object.assign(documents[0], { reviewStatus: request.postDataJSON().decision }); data = { document: documents[0] } }
    else if (path === '/beneficiaries/person-1/documents/document-1/replacement') { assert.equal(role, 'BARANGAY_FACILITATOR'); Object.assign(documents[0], { reviewStatus: 'SUBMITTED', originalFileName: 'clear-id.pdf' }); data = { document: documents[0] } }
    else if (path === '/beneficiaries/person-1/documents') data = { documents }
    else if (path === '/programs/program-1/enrollments') { assert.equal(role, 'BARANGAY_FACILITATOR'); assert.equal(enrollmentStatus, ''); submittedBy = role; enrollmentStatus = 'PENDING'; data = { enrollment: enrollment() } }
    else if (path === '/enrollments') data = { enrollments: enrollmentStatus ? [enrollment()] : [], pagination: pagination(enrollmentStatus ? 1 : 0) }
    else if (path === '/enrollments/enrollment-1') data = { enrollment: enrollment() }
    else if (path === '/enrollments/enrollment-1/request-correction') { assert.equal(role, 'DSWD_STAFF'); reviewNotes = request.postDataJSON().reason; enrollmentStatus = 'NEEDS_CORRECTION'; data = { enrollment: enrollment() } }
    else if (path === '/enrollments/enrollment-1/resubmit') { assert.equal(role, 'BARANGAY_FACILITATOR'); assert.equal(documents[0].reviewStatus, 'SUBMITTED'); submittedBy = role; reviewNotes = ''; enrollmentStatus = 'PENDING'; data = { enrollment: enrollment() } }
    else if (path === '/enrollments/enrollment-1/start-review') { assert.equal(role, 'DSWD_STAFF'); assert.notEqual(role, submittedBy); enrollmentStatus = 'FOR_VALIDATION'; data = { enrollment: enrollment() } }
    else if (path === '/enrollments/enrollment-1/approve') { assert.equal(role, 'DSWD_STAFF'); assert.notEqual(role, submittedBy); assert.equal(documents[0].reviewStatus, 'ACCEPTED'); assert.equal(enrollmentStatus, 'FOR_VALIDATION'); enrollmentStatus = 'APPROVED'; data = { enrollment: enrollment() } }
    else if (path === '/distributions') {
      if (failWorkspace) return fail('Distribution events are temporarily unavailable.')
      data = { distributions: [event], pagination: pagination() }
    }
    else if (path === '/distributions/event-1') data = { distribution: event }
    else if (path === '/distributions/event-1/allocations' && method === 'POST') { assert.equal(role, 'SYSTEM_ADMIN'); assert.equal(enrollmentStatus, 'APPROVED'); allocated = true; data = { allocations: [{ allocationId: 'allocation-1' }], summary: {} } }
    else if (path === '/distributions/event-1/allocations') data = { allocations: allocated ? [{ allocationId: 'allocation-1', beneficiaryId: 'person-1', amount: '1500', allocationStatus: 'ALLOCATED', enrollmentId: 'enrollment-1' }] : [], pagination: pagination(allocated ? 1 : 0), summary: { countsByStatus: allocated ? { ALLOCATED: 1 } : {}, totalAmount: allocated ? '1500' : '0' } }
    else if (path === '/distributions/event-1/slots') data = { slots: [slot], summary: { matchingSlotCount: 1, matchingCapacity: 200, sessionCount: 1 } }
    else if (path === '/distributions/event-1/eligible-enrollments') data = { enrollments: allocated ? [] : [enrollment()], pagination: pagination(allocated ? 0 : 1), allocationAmount: '1500', summary: { serviceAreas: [] } }
    else if (path === '/distributions/event-1/schedules/generate') { assert.ok(allocated); assert.equal(role, 'SYSTEM_ADMIN'); scheduled = true; data = { schedules: [schedule()], summary: {} } }
    else if (path === '/distributions/event-1/open') { assert.ok(scheduled); assert.equal(role, 'SYSTEM_ADMIN'); event.status = 'OPEN'; data = { distribution: event } }
    else if (path === '/distributions/event-1/close') {
      assert.equal(role, 'SYSTEM_ADMIN'); assert.ok(hasReceipt); assert.equal(claimStatus, 'CLAIMED'); assert.ok(request.postDataJSON().notes.length >= 5)
      if (closeConflict) return route.fulfill({ status: 409, json: { error: { code: 'DISTRIBUTION_NOT_RECONCILED', message: 'Event records changed. Refresh and review before closing.' } } })
      event.status = 'CLOSED'; data = { distribution: event }
    }
    else if (path === '/distributions/event-1/qr-tokens') data = { qrTokens: [], summary: { matchingTokenCount: 0 } }
    else if (path === '/distributions/event-1/qr-eligible-schedules') data = { schedules: [], summary: { qrEligibleScheduleCount: 0 } }
    else if (path === '/notifications/summary') data = { total: 0, byStatus: {} }
    else if (path === '/distributions/event-1/schedules') {
      if (failSchedules) return fail('Schedule records are temporarily unavailable.')
      if (!scheduled || event.status === 'DRAFT' || url.searchParams.get('pageSize') !== '100') return route.fulfill({ json: { data: { schedules: scheduled ? [schedule()] : [], pagination: pagination(scheduled ? 1 : 0), summary: { countsByStatus: scheduled ? { [qrVerified ? 'CHECKED_IN' : 'SCHEDULED']: 1 } : {}, matchingScheduleCount: scheduled ? 1 : 0 } } } })
      const number = Number(url.searchParams.get('page') || 1)
      schedulePages.push(number)
      // The linked beneficiary is on page 2, after the previous 100-row limit.
      const rows = Array.from({ length: 100 }, (_, i) => ({ ...schedule(), scheduleId: `other-${i}`, beneficiaryId: `other-${i}`, beneficiary: { ...beneficiary, beneficiaryId: `other-${i}`, firstName: 'Other', lastName: String(i) }, queueNumber: i + 1 }))
      data = { schedules: number === 1 ? rows : [schedule()], summary: { countsByStatus: { [qrVerified ? 'CHECKED_IN' : 'SCHEDULED']: 1 } }, pagination: pagination(101, number, 100) }
    } else if (path === '/distributions/event-1/claims/preview-qr' && qrVerified) return route.fulfill({ status: 409, json: { error: { code: 'QR_TOKEN_ALREADY_USED', message: 'This credential has already been used.', details: { claimId: 'claim-1' } } } })
    else if (path === '/distributions/event-1/claims/preview-qr') data = { beneficiary, schedule: schedule(), checksInBeneficiary: true, distribution: event, allocation: { amount: '1500' }, nextRequiredVerification: ['QR', 'QR_OR_BIOMETRIC'].includes(event.verificationRequirement) ? null : 'BIOMETRIC' }
    else if (path === '/distributions/event-1/claims/verify-qr') {
      assert.ok(['SYSTEM_ADMIN', 'DSWD_STAFF', 'BARANGAY_FACILITATOR'].includes(role))
      assert.equal(enrollmentStatus, 'APPROVED')
      if (holdQr) await qrSaved
      qrVerified = true; claimStatus = ['QR', 'QR_OR_BIOMETRIC'].includes(event.verificationRequirement) ? 'VERIFIED' : 'PENDING'
      data = { claim: claim(), verificationComplete: claimStatus === 'VERIFIED', nextRequiredVerification: claimStatus === 'VERIFIED' ? null : 'BIOMETRIC', beneficiary, schedule: schedule() }
    } else if (path === '/distributions/event-1/claims/verify-biometric') {
      assert.ok(['DSWD_STAFF', 'BARANGAY_FACILITATOR'].includes(role)); assert.ok(qrVerified || event.verificationRequirement === 'QR_OR_BIOMETRIC')
      if (!profileEnrolled) return route.fulfill({ status: 409, json: { error: { code: 'BIOMETRIC_PROFILE_REQUIRED', message: 'The beneficiary does not have an enrolled biometric profile.' } } })
      if (failBiometric) return fail('The face processor is unavailable. Retry the verification.')
      biometricVerified = true; claimStatus = 'VERIFIED'
      data = { claim: claim(), verificationComplete: true, nextRequiredVerification: null, biometricVerification: { simulatedProcessor: true, processorMode: 'SIMULATED_LOCAL' } }
    } else if (path === '/distributions/event-1/claims/claim-1/signature') {
      signatureKeys.push(request.headers()['idempotency-key']); signatureBodies.push(request.postDataJSON())
      assert.equal(request.postDataJSON().signatureMethod, 'TYPED')
      assert.equal(request.postDataJSON().attestation, true)
      if (failSignature) return fail('Signature service unavailable. Retry the original confirmation.')
      signatureVerified = true; claimStatus = 'VERIFIED'
      data = { claim: claim(), signature: { signatureId: 'signature-1', signatureMethod: 'TYPED' }, verificationComplete: true, nextRequiredVerification: null }
    } else if (path === '/distributions/event-1/biometric-attempts') data = { attempts: [], privacy: {}, summary: {}, pagination: pagination(0) }
    else if (path === '/distributions/event-1/claims') data = { claims: claimStatus ? [claim()] : [], summary: { countsByStatus: { [claimStatus]: 1 } }, pagination: pagination(claimStatus ? 1 : 0) }
    else if (path === '/distributions/event-1/claims/claim-1') data = { claim: claim() }
    else if (path === '/distributions/event-1/claim-disputes') data = { disputes: [], summary: { countsByStatus: {} }, pagination: pagination(0) }
    else if (path === '/dashboard/overview') data = { overview: { fundUtilization: funds() } }
    else if (path === '/dashboard/distributions/event-1') data = { summary: { distribution: event, fundUtilization: funds() } }
    else if (path === '/distributions/event-1/creditable-claims') data = { claims: claimStatus === 'VERIFIED' ? [claim()] : [], summary: { creditableClaimCount: claimStatus === 'VERIFIED' ? 1 : 0 }, pagination: pagination(claimStatus === 'VERIFIED' ? 1 : 0) }
    else if (path === '/distributions/event-1/transactions') data = { transactions: claimStatus === 'CLAIMED' ? [transaction()] : [], summary: {}, pagination: pagination(claimStatus === 'CLAIMED' ? 1 : 0) }
    else if (path === '/distributions/event-1/reconciliation') data = { reconciliation: { readyToClose: claimStatus === 'CLAIMED' && hasReceipt, unvisitedScheduleCount: 0, ledgerBalanced: true, deliveryMode: event.deliveryMode, exceptions: [], expectedWalletCreditedAmount: claimStatus === 'CLAIMED' ? '1500' : '0', netCreditedAmount: funds().netCreditedAmount, physicalReleasedCount: claimStatus === 'CLAIMED' ? 1 : 0, physicalReleasedAmount: '1500' }, simulation: {} }
    else if (path === '/distributions/event-1/claims/claim-1/credit') { assert.equal(role, 'DSWD_STAFF'); assert.equal(claimStatus, 'VERIFIED'); assert.ok(qrVerified && biometricVerified); claimStatus = 'CLAIMED'; data = { transaction: transaction(), wallet: { walletId: 'wallet-1' }, lifecycle: {} } }
    else if (path === '/distributions/event-1/claims/claim-1/release') { assert.equal(role, 'BARANGAY_FACILITATOR'); assert.equal(event.deliveryMode, 'PHYSICAL_GOODS'); assert.equal(claimStatus, 'VERIFIED'); claimStatus = 'CLAIMED'; data = { claim: claim(), release: { evidence: { reference: 'LOG-001' } }, lifecycle: {} } }
    else if (path === '/distributions/event-1/claims/claim-1/receipt') { assert.equal(claimStatus, 'CLAIMED'); hasReceipt = true; data = { receipt: receipt(), created: true } }
    else if (path === '/reports/distributions/event-1/summary') data = { report: { generatedAt: '2026-10-29T02:00:00Z', timeZone: 'Asia/Manila', distributionId: 'event-1', data: { distribution: event, beneficiaries: { allocatedCount: 1, claimCompletionPercentage: 100 }, slots: { capacityUtilizationPercentage: 100 }, qrScans: { duplicateCount: 0, invalidCount: 0 }, biometrics: { noMatchCount: 0 }, fundUtilization: funds() } } }
    else { unhandled.push(`${method} ${path}`); return route.fulfill({ status: 404, json: { error: { message: `Missing fixture: ${path}` } } }) }
    await route.fulfill({ json: { data } })
  })
  async function as(nextRole, path) {
    role = nextRole
    if (page.url() !== 'about:blank') await page.evaluate((value) => sessionStorage.setItem('walk-role', value), role)
    await page.goto(origin + path)
  }
  async function screenshot(name) {
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 })
      await page.evaluate(() => window.scrollTo(0, 0))
      const dialog = page.getByRole('dialog')
      const hasDialog = await dialog.count() > 0
      if (hasDialog) assert.ok(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth + 1), `${name} dialog content must fit at ${width}px`)
      if (name === 'dswd-biometric') assert.ok(await page.locator('fieldset').evaluate((element) => element.scrollWidth <= element.clientWidth + 1), `Face capture controls must fit at ${width}px`)
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), { message: `${name} must fit before capture at ${width}px` }).toBe(true)
      await page.screenshot({ path: `${output}/${name}-${width}.png`, fullPage: !hasDialog, animations: 'disabled' })
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${name} must fit at ${width}px`)
    }
    await page.setViewportSize({ width: 1440, height: 1000 })
  }
  await as('BARANGAY_FACILITATOR', '/beneficiaries')
  await page.getByRole('button', { name: 'Register beneficiary', exact: true }).click()
  const registration = page.getByRole('dialog')
  await registration.getByLabel('First name', { exact: true }).fill('Maria')
  await registration.getByLabel('Last name', { exact: true }).fill('Santos')
  await registration.getByLabel('Birth date').fill('1990-01-01')
  await registration.getByLabel('Sex', { exact: true }).selectOption('FEMALE')
  await registration.getByLabel('Complete address').fill('Community Road')
  await registration.getByRole('button', { name: 'Review beneficiary details' }).click()
  await registration.getByRole('button', { name: 'Register beneficiary', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Supporting documents' })).toBeVisible()
  const file = (name) => ({ name, mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 fixture') })
  await page.getByLabel('Choose document', { exact: true }).setInputFiles(file('id.pdf'))
  await page.getByRole('button', { name: 'Upload for review', exact: true }).click()
  await expect(page.getByText('id.pdf', { exact: true })).toBeVisible()
  await page.getByLabel('Active program', { exact: true }).selectOption('program-1')
  await page.getByRole('button', { name: 'Submit enrollment', exact: true }).click()
  await page.getByRole('link', { name: 'View submitted enrollment' }).click()
  await expect(page.getByRole('button', { name: 'Approve enrollment', exact: true })).toHaveCount(0)
  await as('DSWD_STAFF', '/enrollments?enrollment=enrollment-1')
  await page.getByRole('button', { name: 'Start validation', exact: true }).click()
  await page.getByRole('button', { name: 'Reject', exact: true }).click()
  await page.getByRole('dialog').getByLabel('Correction reason').fill('Upload a clearer ID scan.')
  await page.getByRole('dialog').getByRole('button', { name: 'Reject document' }).click()
  await page.getByRole('button', { name: 'Request correction', exact: true }).click()
  await page.getByRole('dialog').getByLabel('Required correction').fill('Replace the unreadable ID, then resubmit.')
  await page.getByRole('dialog').getByRole('button', { name: 'Send correction request' }).click()
  await expect(page.getByRole('button', { name: 'Resubmit for review' })).toBeDisabled()
  await as('BARANGAY_FACILITATOR', '/enrollments?enrollment=enrollment-1')
  await expect(page.getByRole('button', { name: 'Resubmit for review' })).toBeDisabled()
  await page.getByRole('button', { name: 'Correct beneficiary documents' }).click()
  await page.getByLabel('Upload corrected Valid Id', { exact: true }).setInputFiles(file('clear-id.pdf'))
  await page.getByRole('button', { name: 'Replace document', exact: true }).click()
  await expect(page.getByText('clear-id.pdf', { exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'Return to enrollment review' }).click()
  await page.getByRole('button', { name: 'Resubmit for review' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Resubmit enrollment' }).click()
  await expect.poll(() => enrollmentStatus).toBe('PENDING')
  await as('DSWD_STAFF', '/enrollments?enrollment=enrollment-1')
  await page.getByRole('button', { name: 'Start validation', exact: true }).click()
  await page.getByRole('button', { name: 'Accept', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Accept document' }).click()
  await page.getByRole('button', { name: 'Approve enrollment', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Approve enrollment', exact: true }).click()
  await page.getByRole('link', { name: 'View beneficiary assistance progress' }).click()
  await expect(page.getByLabel('Program enrollment')).toHaveValue('enrollment-1')
  await as('SYSTEM_ADMIN', '/distributions/manage?event=event-1&stage=beneficiaries')
  await page.getByRole('checkbox', { name: 'Select Maria Santos', exact: true }).filter({ visible: true }).check()
  await page.getByRole('button', { name: 'Allocate 1 beneficiary', exact: true }).click()
  await page.getByRole('button', { name: 'Schedule 1 remaining', exact: true }).click()
  await page.getByRole('button', { name: 'Open distribution event', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Open event', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Close distribution event' })).toBeDisabled()

  await as('DSWD_STAFF', '/dswd/verify-claims?distribution=event-1')
  await page.getByLabel('USB QR scanner input').fill('local-test-credential')
  await page.getByRole('button', { name: 'Review detected QR' }).click()
  assert.equal(claimStatus, '', 'Preview must not verify or settle a claim')
  holdQr = true
  const confirmQr = page.getByRole('button', { name: 'Confirm check-in' })
  await confirmQr.evaluate(button => { button.click(); button.click() })
  await expect(page.getByRole('button', { name: /Recording verification/ })).toBeDisabled()
  finishQr(); holdQr = false

  await expect(page.getByRole('heading', { name: 'QR accepted — biometric required' })).toBeVisible()
  assert.equal(claimStatus, 'PENDING')
  await screenshot('dswd-qr')
  failWorkspace = true; failSchedules = true
  await page.getByRole('button', { name: /Continue to biometric/ }).click()
  await expect(page.getByRole('alert')).toContainText('Biometric workspace could not be loaded')
  failWorkspace = false
  await page.getByRole('button', { name: 'Retry workspace' }).click()
  await expect(page.getByRole('alert')).toContainText('Scheduled beneficiaries could not be loaded')
  await expect(page.getByRole('button', { name: 'Verify beneficiary identity' })).toBeDisabled()
  failSchedules = false
  await page.getByRole('button', { name: 'Retry schedules' }).click()
  await expect(page.getByLabel('Scheduled beneficiary')).toHaveValue('person-1')
  await expect(page.getByRole('option', { name: /Queue 101/ })).toHaveCount(1)
  assert.ok(schedulePages.includes(2))
  await screenshot('dswd-biometric')
  const faceImage = { name: 'fixture.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jZQAAAABJRU5ErkJggg==', 'base64') }
  await page.locator('#verification-face-capture').setInputFiles(faceImage)
  await page.getByLabel('Scheduled beneficiary').selectOption('other-0')
  assert.equal(await page.locator('#verification-face-capture').evaluate((input) => input.files.length), 0, 'Changing beneficiary must discard the previous face image')
  await page.getByLabel('Scheduled beneficiary').selectOption('person-1')
  await page.locator('#verification-face-capture').setInputFiles(faceImage)
  await page.getByRole('button', { name: 'Verify beneficiary identity' }).click()
  await expect(page.getByRole('alert')).toContainText('Consent and an enrolled face profile are required')
  await expect(page.getByRole('button', { name: 'Verify beneficiary identity' })).toBeDisabled()
  await expect(page.getByRole('button', { name: /Start live camera|Retake live photo/ })).toBeDisabled()
  assert.equal(claimStatus, 'PENDING', 'A missing reference profile cannot verify or release a claim')
  await screenshot('missing-face-profile')
  const beforeRecovery = mutations.length
  await page.getByRole('button', { name: 'Review consent & enrollment' }).click()
  await expect(page.getByRole('tab', { name: 'Profiles & consent' })).toBeFocused()
  await expect(page.getByLabel('Beneficiary record', { exact: true })).toHaveValue('person-1')
  await expect(page.getByRole('button', { name: 'Save face profile' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Return to claim verification' })).toBeEnabled()
  assert.equal(new URL(page.url()).searchParams.get('distribution'), 'event-1')
  await page.getByRole('button', { name: 'Return to claim verification' }).click()
  await expect(page.getByLabel('Scheduled beneficiary')).toHaveValue('person-1')
  await expect(page.getByLabel('Open distribution')).toHaveValue('event-1')
  assert.equal(await page.locator('#verification-face-capture').evaluate(input => input.files.length), 0, 'Returning from enrollment requires a fresh verification capture')
  assert.equal(mutations.length, beforeRecovery, 'Recovery navigation cannot record consent, enrollment, verification or handover')

  await as('BARANGAY_FACILITATOR', '/biometrics?view=verify&distribution=event-1&beneficiary=person-1')
  await page.locator('#verification-face-capture').setInputFiles(faceImage)
  await page.getByRole('button', { name: 'Verify beneficiary identity' }).click()
  await page.getByRole('button', { name: 'Review consent & enrollment' }).click()
  await expect(page.getByRole('tab', { name: 'Consent & enrollment' })).toBeFocused()
  await expect(page.getByLabel('Beneficiary record', { exact: true })).toHaveValue('person-1')
  await expect(page.getByRole('button', { name: 'Save face profile' })).toHaveCount(0)
  await page.getByRole('radio', { name: /Consent granted/ }).check()
  await page.getByRole('button', { name: 'Record consent decision' }).click()
  await expect(page.getByRole('radio', { name: /Consent granted/ })).toBeHidden()
  await expect(page.getByRole('button', { name: 'Save face profile' })).toBeEnabled()
  await page.locator('#enrollment-face-capture').setInputFiles(faceImage)
  await expect(page.getByText('Photo captured. Use Save face profile below to enroll it.', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Save face profile' }).click()
  await expect(page.getByRole('alert')).toBeFocused()
  await expect(page.getByRole('alert')).toContainText('Your captured photo is still on this screen')
  assert.equal(await page.locator('#enrollment-face-capture').evaluate(input => input.files.length), 1, 'A processor outage must preserve the same captured photo for retry')
  assert.equal(profileEnrolled, false)
  assert.equal(mutations.filter(entry => entry.path.endsWith('/biometrics/enroll')).length, 1, 'Enrollment must not retry automatically')
  await screenshot('face-service-unavailable')
  failEnrollment = false; holdEnrollment = true
  await page.getByRole('button', { name: 'Retry saving face profile' }).evaluate(button => { button.click(); button.click() })
  await expect(page.getByRole('button', { name: /Saving face profile/ })).toBeDisabled()
  await expect(page.getByRole('button', { name: /Retake live photo/ })).toBeDisabled()
  assert.equal(mutations.filter(entry => entry.path.endsWith('/biometrics/enroll')).length, 2, 'Double clicks cannot submit a second enrollment while the first is processing')
  finishEnrollment(); holdEnrollment = false
  await expect(page.getByRole('heading', { name: 'Face profile ready for the claim check' })).toBeVisible()
  assert.equal(claimStatus, 'PENDING', 'Enrollment must not complete verification or record assistance release')
  await screenshot('enrolled-face-profile')
  await page.getByRole('button', { name: 'Return to claim verification' }).click()
  await expect(page.getByRole('tab', { name: 'Claim verification' })).toBeFocused()
  await expect(page.getByLabel('Scheduled beneficiary')).toHaveValue('person-1')
  await expect(page.getByLabel('Open distribution')).toHaveValue('event-1')
  assert.equal(await page.locator('#verification-face-capture').evaluate(input => input.files.length), 0)
  await as('DSWD_STAFF', '/biometrics?view=verify&distribution=event-1&beneficiary=person-1')
  await page.locator('#verification-face-capture').setInputFiles(faceImage)
  failBiometric = true
  await page.getByRole('button', { name: 'Verify beneficiary identity' }).click()
  await expect(page.getByRole('alert')).toContainText('Identity verification was not confirmed')
  assert.equal(claimStatus, 'PENDING')
  failBiometric = false
  await page.getByRole('button', { name: 'Verify beneficiary identity' }).click()
  await expect(page.getByRole('heading', { name: 'Claim verification complete' })).toBeVisible()
  assert.equal(claimStatus, 'VERIFIED')
  await page.getByRole('link', { name: 'Open verified claim' }).click()
  await expect(page.getByRole('button', { name: 'Issue receipt' })).toBeDisabled()
  await page.getByRole('link', { name: 'Open wallet credits' }).click()
  await page.getByRole('button', { name: 'Review and credit', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Credit verified claim' }).click()
  await expect(page.getByRole('heading', { name: 'Simulated credit recorded' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Distribution reconciliation' })).toBeVisible()
  await expect(page.getByText('Action required', { exact: true })).toBeVisible()
  assert.equal(event.status, 'OPEN', 'Reconciliation does not close the event')
  await page.getByRole('link', { name: 'Open claim record', exact: true }).click()
  await page.getByRole('button', { name: 'Issue receipt' }).click()
  await expect(page.getByRole('dialog', { name: 'Claim acknowledgment receipt' })).toBeVisible()
  await screenshot('wallet-receipt')
  await as('DSWD_STAFF', '/dswd/verify-claims?distribution=event-1')
  await page.getByLabel('USB QR scanner input').fill('used-credential')
  await page.getByRole('button', { name: 'Review detected QR' }).click()
  await page.getByRole('link', { name: 'Review existing claim' }).click()
  assert.equal(new URL(page.url()).searchParams.get('claim'), 'claim-1')
  await as('DSWD_STAFF', '/reports?distribution=event-1')
  await page.getByRole('button', { name: 'Generate report' }).click()
  await expect(page.getByRole('region', { name: 'Distribution summary' })).toContainText('100%')
  event.status = 'CLOSED'
  await as('DSWD_STAFF', '/biometrics?view=verify&distribution=event-1&beneficiary=person-1')
  await expect(page.getByText('This event is unavailable for biometric verification. Select an open event that requires a face check.')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Claim verification complete' })).toBeVisible()
  await expect(page.getByText('Assistance release or wallet credit is already recorded. Open the claim to review its receipt and history.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Verify beneficiary identity' })).toHaveCount(0)
  event.status = 'OPEN'

  // A separate signature-required scenario resumes an existing face match.
  event.verificationRequirement = 'BIOMETRIC_AND_SIGNATURE'
  claimStatus = 'PENDING'; biometricVerified = true; qrVerified = false; hasReceipt = false
  await as('DSWD_STAFF', '/biometrics?view=verify&distribution=event-1&beneficiary=person-1')
  await expect(page.getByRole('heading', { name: 'Collect beneficiary signature' })).toBeVisible()
  const typed = page.getByRole('button', { name: /Typed acknowledgment/ })
  await typed.focus(); await page.keyboard.press('Enter')
  const signatureName = page.getByLabel('Type full legal name')
  await signatureName.focus(); await page.keyboard.type('Maria Santos')
  await page.keyboard.press('Tab'); await page.keyboard.press('Space')
  await expect(page.getByRole('checkbox')).toBeChecked()
  await screenshot('signature-keyboard')
  failSignature = true
  await page.getByRole('button', { name: 'Secure signature and verify claim' }).click()
  await expect(page.getByRole('alert')).toContainText('Signature confirmation unavailable')
  assert.equal(claimStatus, 'PENDING')
  failSignature = false
  await page.getByRole('button', { name: 'Retry signature confirmation' }).click()
  await expect(page.getByRole('heading', { name: 'Claim verification complete' })).toBeVisible()
  assert.equal(mutations.filter(entry => entry.path.endsWith('/verify-qr')).length, 1, 'A simultaneous second confirmation must not create another verification request')
  assert.equal(signatureKeys.length, 2)
  assert.equal(signatureKeys[0], signatureKeys[1])
  assert.deepEqual(signatureBodies[0], signatureBodies[1])

  // A second distribution scenario for the same approved beneficiary uses physical handover.
  event.deliveryMode = 'PHYSICAL_GOODS'; event.verificationRequirement = 'QR'
  claimStatus = ''; qrVerified = false; biometricVerified = false; hasReceipt = false
  await as('SYSTEM_ADMIN', '/admin/verify-claims?distribution=event-1')
  await page.getByLabel('QR credential', { exact: true }).fill('local-physical-credential')
  await page.getByRole('button', { name: 'Review QR claim' }).click()
  await page.getByRole('button', { name: 'Confirm QR validation' }).click()
  await page.getByRole('button', { name: 'View claim record' }).click()
  await expect(page.getByRole('button', { name: 'Mark released', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Issue receipt' })).toBeDisabled()
  await as('BARANGAY_FACILITATOR', '/claim-accountability?distribution=event-1&claim=claim-1')
  await page.getByRole('button', { name: 'Mark released', exact: true }).click()
  const release = page.getByRole('dialog')
  await release.getByLabel('Evidence reference', { exact: true }).fill('LOG-001')
  await release.getByRole('checkbox').check()
  await release.getByRole('button', { name: 'Mark assistance released' }).click()
  await expect(page.getByRole('button', { name: 'Released', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: 'Issue receipt' }).click()
  await expect(page.getByRole('dialog', { name: 'Claim acknowledgment receipt' })).toBeVisible()
  await screenshot('physical-receipt')
  await as('SYSTEM_ADMIN', '/reports?distribution=event-1')
  await page.getByRole('button', { name: 'Generate report' }).click()
  await expect(page.getByRole('region', { name: 'Distribution summary' })).toContainText('Physical assistance release; wallet credits are not required.')
  await as('SYSTEM_ADMIN', '/distributions/manage?event=event-1')
  await page.getByRole('button', { name: 'Close distribution event' }).click()
  const closeDialog = page.getByRole('dialog', { name: 'Close this distribution event?' })
  await closeDialog.getByLabel('Closure note').fill('Reviewed releases, receipts and attendance with field staff.')
  closeConflict = true
  await closeDialog.getByRole('button', { name: 'Close event', exact: true }).click()
  await expect(closeDialog.getByRole('alert')).toContainText('Event records changed')
  assert.equal(event.status, 'OPEN')
  await expect(closeDialog.getByLabel('Closure note')).toHaveValue(/Reviewed releases/)
  closeConflict = false
  await closeDialog.getByRole('button', { name: 'Close event', exact: true }).click()
  await expect(page.getByText('Closed distribution', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Close distribution event' })).toHaveCount(0)
  for (const nextRole of ['SYSTEM_ADMIN', 'DSWD_STAFF', 'BARANGAY_FACILITATOR']) {
    await as(nextRole, '/beneficiaries?beneficiary=person-1&progressEnrollment=enrollment-1&progressEvent=event-1')
    const stages = page.getByRole('list', { name: 'Beneficiary assistance stages' })
    await expect(stages).toContainText('Issued')
    await expect(stages).toContainText('Event closed')
    await screenshot(`progress-${nextRole.toLowerCase()}`)
  }
  // A separate flexible event offers either method, with the same event preserved on handoff.
  event.status = 'OPEN'; event.verificationRequirement = 'QR_OR_BIOMETRIC'
  for (const nextRole of ['DSWD_STAFF', 'BARANGAY_FACILITATOR']) {
    const qrPath = nextRole === 'DSWD_STAFF' ? '/dswd/verify-claims' : '/facilitator/qr-verification'
    for (const method of ['QR', 'BIOMETRIC']) {
      claimStatus = ''; qrVerified = false; biometricVerified = false; signatureVerified = false; hasReceipt = false
      await as(nextRole, `${qrPath}?distribution=event-1`)
      await expect(page.getByText('QR code OR live face match', { exact: true })).toBeVisible()
      await page.getByRole('button', { name: 'Use face match instead', exact: true }).click()
      await expect(page.getByLabel('Open distribution')).toHaveValue('event-1')
      await page.getByLabel('Scheduled beneficiary').selectOption('person-1')
      if (method === 'QR') {
        await page.getByRole('button', { name: 'Use QR instead', exact: true }).click()
        assert.equal(new URL(page.url()).searchParams.get('distribution'), 'event-1')
        await page.getByLabel('USB QR scanner input').fill('flexible-credential')
        await page.getByRole('button', { name: 'Review detected QR' }).click()
        await page.getByRole('button', { name: 'Confirm check-in' }).click()
        await page.getByRole('button', { name: nextRole === 'BARANGAY_FACILITATOR' ? 'Continue to physical handover' : 'View claim record' }).click()
      } else {
        await page.locator('#verification-face-capture').setInputFiles(faceImage)
        await page.getByRole('button', { name: 'Verify beneficiary identity' }).click()
        await expect(page.getByRole('heading', { name: 'Claim verification complete' })).toBeVisible()
        await page.getByRole('link', { name: 'Open verified claim' }).click()
      }
      assert.equal(claimStatus, 'VERIFIED')
      assert.equal(qrVerified, method === 'QR')
      assert.equal(biometricVerified, method === 'BIOMETRIC')
      await expect(page.getByText('Alternative not needed', { exact: true })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Mark released', exact: true })).toHaveCount(nextRole === 'BARANGAY_FACILITATOR' ? 1 : 0)
      await screenshot(`alternative-${nextRole.toLowerCase()}-${method.toLowerCase()}`)
    }
  }
  const beforeExpired = mutations.length
  expired = true
  await as('DSWD_STAFF', '/enrollments?enrollment=enrollment-1')
  await expect(page.getByRole('button', { name: 'Approve enrollment', exact: true })).toHaveCount(0)
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem('garantiyaid.accessToken'))).toBe(null)
  assert.equal(mutations.length, beforeExpired)
  assert.equal(mutations.filter((entry) => entry.path.endsWith('/credit')).length, 1)
  assert.equal(mutations.filter((entry) => entry.path.endsWith('/release')).length, 1)
  assert.deepEqual(errors, [])
  assert.deepEqual(unhandled, [])
  console.log('Role walkthrough passed: registration, documents, correction/resubmission, independent review, allocation/schedule, QR + face + signature, either QR or face in DSWD and Barangay, credit/handover, receipts, closure conflict/retry, session expiry and 1440/390/320px layouts.')
} finally { await browser?.close(); await vite.close() }
