import test from 'node:test'
import assert from 'node:assert/strict'
import {
  confirmTotpSetup,
  approveEnrollment,
  activateProgram,
  buildStaffAccountPayload,
  createBarangay,
  createStaffUser,
  createDistribution,
  createDistributionAllocations,
  createBeneficiary,
  createProgram,
  createProgramCriterion,
  enqueueDistributionReminder,
  deleteBiometricEnrollment,
  generateDistributionQrTokens,
  generateDistributionSchedules,
  generateDistributionSlots,
  getDashboardNavigation,
  getLoginOutcome,
  isSessionExpiredError,
  openDistribution,
  programCriterionExpectedValue,
  requestAuditLogs,
  requestBarangayList,
  requestBeneficiaryDocuments,
  requestBeneficiaryList,
  requestBiometricAttempts,
  requestBiometricConsents,
  requestBiometricStatus,
  requestDashboardOverview,
  requestDistributionDashboard,
  requestDistributionCsv,
  requestDistributionList,
  requestDistributionQueue,
  requestDistributionReport,
  requestDistributionTransactions,
  requestFundUtilizationReport,
  requestEnrollmentList,
  requestNotificationList,
  requestNotificationQueueHealth,
  requestNotificationSummary,
  requestOpenDistributions,
  requestPrograms,
  requestStaffLogout,
  requestStaffUserList,
  requestStaffUsers,
  requestTotpSetup,
  recordBiometricConsent,
  resetStaffTotp,
  revokeBiometricConsent,
  retryNotification,
  saveBiometricEnrollment,
  startEnrollmentReview,
  uploadBeneficiaryDocument,
  updateBarangay,
  updateStaffUser,
  verifyDistributionQrClaim,
  verifyBiometricClaim,
} from '../src/auth/staffAuth.js'
import { connectNotificationRealtime, connectStaffRealtime, DSWD_LIVE_EVENTS, NOTIFICATION_LIVE_EVENTS, realtimeServerUrl } from '../src/realtime/staffRealtime.js'

test('login outcomes preserve the backend authentication handoff', () => {
  assert.equal(getLoginOutcome({ requiresTotp: true }), 'totp')
  assert.equal(getLoginOutcome({ requiresTotpEnrollment: true, totpSetupToken: 'token' }), 'totp-enrollment')
  assert.equal(getLoginOutcome({ accessToken: 'token', user: { userId: 'user' } }), 'authenticated')
  assert.equal(getLoginOutcome({}), 'invalid-response')
})

test('TOTP setup and confirmation preserve the backend contract', async (context) => {
  const originalFetch = globalThis.fetch
  const requests = []
  context.after(() => { globalThis.fetch = originalFetch })

  globalThis.fetch = async (url, options) => {
    requests.push({ url, options })
    return {
      ok: true,
      json: async () => ({
        data: requests.length === 1
          ? { secret: 'SETUPKEY', otpauthUri: 'otpauth://totp/GarantiyAid' }
          : {
              accessToken: 'access-token',
              user: { userId: 'staff-1' },
              recoveryCodes: Array.from({ length: 8 }, (_, index) => `CODE-${index}`),
            },
      }),
    }
  }

  await requestTotpSetup('setup-token')
  await confirmTotpSetup('setup-token', '123456')

  assert.match(requests[0].url, /\/auth\/totp\/setup$/)
  assert.equal(requests[0].options.headers.Authorization, 'Bearer setup-token')
  assert.match(requests[1].url, /\/auth\/totp\/confirm$/)
  assert.deepEqual(JSON.parse(requests[1].options.body), { code: '123456' })
})

test('administrator staff listing and TOTP reset use authenticated API contracts', async (context) => {
  const originalFetch = globalThis.fetch
  const requests = []
  context.after(() => { globalThis.fetch = originalFetch })

  globalThis.fetch = async (url, options) => {
    requests.push({ url, options })
    return {
      ok: true,
      json: async () => ({
        data: requests.length === 1
          ? { users: [{ userId: 'staff-1', totpEnabled: true }], pagination: { page: 1, total: 1 } }
          : { user: { userId: 'staff-1', totpEnabled: false }, revokedSessionCount: 2 },
      }),
    }
  }

  await requestStaffUsers('admin-token')
  await resetStaffTotp('admin-token', 'staff-1', {
    staffIdVerified: true,
    validIdVerified: true,
    supervisorConfirmed: true,
  })

  assert.equal(requests[0].options.method, 'GET')
  assert.equal(requests[0].options.headers.Authorization, 'Bearer admin-token')
  assert.match(requests[1].url, /\/users\/staff-1\/totp\/reset$/)
  assert.deepEqual(JSON.parse(requests[1].options.body), {
    staffIdVerified: true,
    validIdVerified: true,
    supervisorConfirmed: true,
  })
})

test('dashboard navigation is limited to the signed-in staff role', () => {
  const adminLabels = getDashboardNavigation('SYSTEM_ADMIN').map(({ label }) => label)
  const dswdLabels = getDashboardNavigation('DSWD_STAFF').map(({ label }) => label)
  const facilitatorLabels = getDashboardNavigation('BARANGAY_FACILITATOR').map(({ label }) => label)

  assert.ok(adminLabels.includes('Staff & barangays'))
  assert.ok(adminLabels.includes('Authenticator recovery'))
  assert.ok(adminLabels.includes('Distribution setup'))
  assert.ok(adminLabels.includes('Beneficiaries'))
  assert.ok(dswdLabels.includes('Ledger'))
  assert.ok(dswdLabels.includes('Enrollment review'))
  assert.ok(dswdLabels.includes('Assistance programs'))
  assert.ok(adminLabels.includes('Notifications'))
  assert.ok(dswdLabels.includes('Notifications'))
  assert.ok(facilitatorLabels.includes('Notifications'))
  assert.equal(getDashboardNavigation('DSWD_STAFF').find(({ label }) => label === 'Live monitoring').href, '/dswd/live-dashboard')
  assert.equal(getDashboardNavigation('DSWD_STAFF').find(({ label }) => label === 'Ledger').href, '/dswd/ledger')
  assert.equal(getDashboardNavigation('DSWD_STAFF').find(({ label }) => label === 'Reports').href, '/reports')
  assert.equal(getDashboardNavigation('SYSTEM_ADMIN').find(({ label }) => label === 'Audit logs').href, '/audit-logs')
  assert.ok(!dswdLabels.includes('Staff & barangays'))
  assert.ok(facilitatorLabels.includes('QR verification'))
  assert.ok(facilitatorLabels.includes('Enrollments'))
  assert.ok(!facilitatorLabels.includes('Audit logs'))
  assert.deepEqual(getDashboardNavigation('UNKNOWN_ROLE'), [])
})

test('staff and barangay administration preserve scoped account contracts', async (context) => {
  const originalFetch = globalThis.fetch
  const requests = []
  context.after(() => { globalThis.fetch = originalFetch })
  const responses = [
    { users: [], pagination: { page: 1, total: 0 } },
    { user: { userId: 'staff-1' } },
    { user: { userId: 'staff-1', isActive: false } },
    { barangays: [] },
    { barangay: { barangayId: 'barangay-1' } },
    { barangay: { barangayId: 'barangay-1', isActive: false } },
  ]
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options })
    return { ok: true, json: async () => ({ data: responses[requests.length - 1] }) }
  }

  await requestStaffUserList('admin-token', { page: 2, pageSize: 20, role: 'DSWD_STAFF', isActive: true, search: 'Maria' })
  await createStaffUser('admin-token', { employeeId: 'DSWD-002', fullName: 'Maria Santos' })
  await updateStaffUser('admin-token', 'staff-1', { isActive: false })
  await requestBarangayList('admin-token', { activeOnly: false })
  await createBarangay('admin-token', { barangayName: 'Barangay Sample', city: 'Sample City', province: 'Sample Province' })
  await updateBarangay('admin-token', 'barangay-1', { isActive: false })

  const facilitatorForm = { employeeId: ' brgy-002 ', fullName: 'Facilitator Two', email: 'FACILITATOR@EXAMPLE.COM', contactNumber: '', role: 'BARANGAY_FACILITATOR', username: 'facilitator.two', barangayId: 'barangay-1', password: 'TemporaryPassword123' }
  assert.deepEqual(buildStaffAccountPayload(facilitatorForm), {
    employeeId: 'BRGY-002', fullName: 'Facilitator Two', email: 'facilitator@example.com', contactNumber: undefined,
    role: 'BARANGAY_FACILITATOR', username: 'facilitator.two', barangayId: 'barangay-1', password: 'TemporaryPassword123',
  })
  const existing = { fullName: 'Facilitator Two', email: 'facilitator@example.com', contactNumber: null, role: 'BARANGAY_FACILITATOR', username: 'facilitator.two', barangayId: 'barangay-1' }
  assert.deepEqual(buildStaffAccountPayload({ ...facilitatorForm, employeeId: 'BRGY-002', role: 'DSWD_STAFF', username: '', barangayId: '' }, existing), { role: 'DSWD_STAFF', username: null, barangayId: null })

  assert.match(requests[0].url, /\/users\?page=2&pageSize=20&role=DSWD_STAFF&isActive=true&search=Maria$/)
  assert.match(requests[2].url, /\/users\/staff-1$/)
  assert.equal(requests[2].options.method, 'PATCH')
  assert.match(requests[3].url, /\/barangays\?activeOnly=false$/)
  assert.match(requests[5].url, /\/barangays\/barangay-1$/)
  requests.forEach(({ options }) => assert.equal(options.headers.Authorization, 'Bearer admin-token'))
})

test('notification monitoring preserves scoped history, queue, enqueue, and retry contracts', async (context) => {
  const originalFetch = globalThis.fetch
  const requests = []
  context.after(() => { globalThis.fetch = originalFetch })
  const responses = [
    { notifications: [], pagination: { page: 2, total: 0 }, simulatedSmsOnly: true },
    { total: 3, byStatus: { SENT: 2, FAILED: 1 }, byType: {}, byChannel: { SMS: 3 }, simulatedSmsOnly: true },
    { status: 'unavailable', counts: {}, simulatedSmsOnly: true },
    { notifications: [{ notificationId: 'notification-1' }], queuedCount: 1, deduplicatedCount: 0, simulated: true },
    { notification: { notificationId: 'notification-1', status: 'PENDING' }, simulated: true },
  ]
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options })
    const index = requests.length - 1
    return { ok: index !== 2, status: index === 2 ? 503 : 200, json: async () => ({ success: index !== 2, data: responses[index] }) }
  }

  await requestNotificationList('staff-token', { page: 2, pageSize: 20, status: 'FAILED', dateFrom: '2026-08-01' })
  await requestNotificationSummary('staff-token', { distributionId: 'distribution-1' })
  const health = await requestNotificationQueueHealth('staff-token')
  await enqueueDistributionReminder('staff-token', 'distribution-1', '2026-08-28T01:00:00.000Z', '11111111-1111-4111-8111-111111111111')
  await retryNotification('staff-token', 'notification-1', '22222222-2222-4222-8222-222222222222')

  assert.match(requests[0].url, /\/notifications\?page=2&pageSize=20&status=FAILED&dateFrom=2026-08-01$/)
  assert.match(requests[1].url, /\/notifications\/summary\?distributionId=distribution-1$/)
  assert.equal(health.status, 'unavailable')
  assert.match(requests[3].url, /\/distributions\/distribution-1\/notifications\/enqueue$/)
  assert.deepEqual(JSON.parse(requests[3].options.body), { notificationType: 'DISTRIBUTION_REMINDER', sendAt: '2026-08-28T01:00:00.000Z' })
  assert.equal(requests[3].options.headers['Idempotency-Key'], '11111111-1111-4111-8111-111111111111')
  assert.match(requests[4].url, /\/notifications\/notification-1\/retry$/)
  assert.equal(requests[4].options.headers['Idempotency-Key'], '22222222-2222-4222-8222-222222222222')
  requests.forEach(({ options }) => assert.equal(options.headers.Authorization, 'Bearer staff-token'))
})

test('program and distribution setup preserve lifecycle and idempotency contracts', async (context) => {
  const originalFetch = globalThis.fetch
  const requests = []
  context.after(() => { globalThis.fetch = originalFetch })
  const responses = [
    { program: { programId: 'program-1' } },
    { criterion: { criterionId: 'criterion-1' } },
    { program: { programId: 'program-1', status: 'ACTIVE' } },
    { distribution: { distributionId: 'distribution-1' } },
    { slots: [], summary: { slotCount: 8 } },
    { allocations: [], summary: { allocationCount: 2 } },
    { schedules: [], summary: { generatedScheduleCount: 2 } },
    { distribution: { distributionId: 'distribution-1', status: 'OPEN' } },
    { qrTokens: [], summary: { generatedTokenCount: 2 } },
  ]
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options })
    return { ok: true, json: async () => ({ data: responses[requests.length - 1] }) }
  }

  await createProgram('staff-token', { programName: 'Emergency Aid', programCode: 'EA-2026', programType: 'CASH_ASSISTANCE' })
  await createProgramCriterion('staff-token', 'program-1', { criterionName: 'Adult', fieldName: 'AGE', operator: 'GREATER_THAN_OR_EQUAL', expectedValue: 18, isRequired: true })
  await activateProgram('staff-token', 'program-1')
  await createDistribution('admin-token', { programId: 'program-1', title: 'Barangay payout' })
  await generateDistributionSlots('admin-token', 'distribution-1', 10)
  await createDistributionAllocations('admin-token', 'distribution-1', ['enrollment-1', 'enrollment-2'], '11111111-1111-4111-8111-111111111111')
  await generateDistributionSchedules('admin-token', 'distribution-1', '22222222-2222-4222-8222-222222222222')
  await openDistribution('admin-token', 'distribution-1')
  await generateDistributionQrTokens('admin-token', 'distribution-1')

  assert.equal(programCriterionExpectedValue('AGE', 'GREATER_THAN_OR_EQUAL', '18'), 18)
  assert.deepEqual(programCriterionExpectedValue('DOCUMENT_TYPE', 'IN', 'VALID_ID, PWD_ID'), ['VALID_ID', 'PWD_ID'])
  assert.equal(programCriterionExpectedValue('MANUAL_REVIEW', 'REQUIRED', ''), true)
  assert.throws(() => programCriterionExpectedValue('AGE', 'EQUALS', 'invalid'), /valid non-negative number/i)
  assert.match(requests[1].url, /\/programs\/program-1\/criteria$/)
  assert.match(requests[2].url, /\/programs\/program-1\/activate$/)
  assert.match(requests[4].url, /\/distributions\/distribution-1\/slots\/generate$/)
  assert.equal(requests[5].options.headers['Idempotency-Key'], '11111111-1111-4111-8111-111111111111')
  assert.equal(requests[6].options.headers['Idempotency-Key'], '22222222-2222-4222-8222-222222222222')
  assert.match(requests[7].url, /\/distributions\/distribution-1\/open$/)
  assert.match(requests[8].url, /\/distributions\/distribution-1\/qr-tokens\/generate$/)
})

test('beneficiary and enrollment workflows preserve scoped backend contracts', async (context) => {
  const originalFetch = globalThis.fetch
  const requests = []
  context.after(() => { globalThis.fetch = originalFetch })

  globalThis.fetch = async (url, options) => {
    requests.push({ url, options })
    const responses = [
      { beneficiaries: [], pagination: { page: 1 } },
      { beneficiary: { beneficiaryId: 'beneficiary-1' } },
      { documents: [] },
      { programs: [], pagination: { page: 1 } },
      { enrollments: [], pagination: { page: 1 } },
      { enrollment: { enrollmentId: 'enrollment-1' } },
      { enrollment: { enrollmentId: 'enrollment-1' } },
    ]
    return { ok: true, json: async () => ({ data: responses[requests.length - 1] }) }
  }

  await requestBeneficiaryList('staff-token', { page: 1, pageSize: 20, status: 'ACTIVE', search: 'Juan' })
  await createBeneficiary('staff-token', { firstName: 'Juan', lastName: 'Dela Cruz' })
  await requestBeneficiaryDocuments('staff-token', 'beneficiary-1')
  await requestPrograms('staff-token', { pageSize: 100, status: 'ACTIVE' })
  await requestEnrollmentList('staff-token', { page: 1, status: 'PENDING' })
  await startEnrollmentReview('staff-token', 'enrollment-1')
  await approveEnrollment('staff-token', 'enrollment-1')

  assert.match(requests[0].url, /\/beneficiaries\?page=1&pageSize=20&status=ACTIVE&search=Juan$/)
  assert.deepEqual(JSON.parse(requests[1].options.body), { firstName: 'Juan', lastName: 'Dela Cruz' })
  assert.match(requests[2].url, /\/beneficiaries\/beneficiary-1\/documents$/)
  assert.match(requests[3].url, /\/programs\?pageSize=100&status=ACTIVE$/)
  assert.match(requests[4].url, /\/enrollments\?page=1&status=PENDING$/)
  assert.match(requests[5].url, /\/enrollments\/enrollment-1\/start-review$/)
  assert.match(requests[6].url, /\/enrollments\/enrollment-1\/approve$/)
  requests.forEach(({ options }) => assert.equal(options.headers.Authorization, 'Bearer staff-token'))
})

test('beneficiary document upload leaves the multipart boundary to the browser', async (context) => {
  const originalFetch = globalThis.fetch
  let request
  context.after(() => { globalThis.fetch = originalFetch })
  globalThis.fetch = async (url, options) => {
    request = { url, options }
    return { ok: true, json: async () => ({ data: { document: { documentId: 'document-1' } } }) }
  }

  await uploadBeneficiaryDocument('facilitator-token', 'beneficiary-1', 'VALID_ID', new Blob(['pdf'], { type: 'application/pdf' }))

  assert.match(request.url, /\/beneficiaries\/beneficiary-1\/documents$/)
  assert.equal(request.options.body instanceof FormData, true)
  assert.equal(request.options.body.get('documentType'), 'VALID_ID')
  assert.equal(request.options.headers['Content-Type'], undefined)
})

test('biometric identity workflow preserves consent, multipart capture, idempotency, and privacy contracts', async (context) => {
  const originalFetch = globalThis.fetch
  const requests = []
  context.after(() => { globalThis.fetch = originalFetch })
  const responses = [
    { consent: { consentId: 'consent-1' }, biometricEnrollmentRequired: true },
    { consents: [], pagination: { page: 1, total: 0 } },
    { biometricProfile: { biometricStatus: 'NOT_ENROLLED' }, processing: { rawCaptureStored: false } },
    { biometricProfile: { biometricId: 'biometric-1' }, processing: { rawCaptureStored: false } },
    { consent: { consentId: 'consent-1', consentStatus: 'REVOKED' } },
    { deleted: true, biometricStatus: 'NOT_ENROLLED' },
    { claim: { claimId: 'claim-1' }, verificationComplete: true },
    { attempts: [], pagination: { page: 1, total: 0 }, privacy: { rawCapturesStored: false } },
  ]
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options })
    return { ok: true, json: async () => ({ data: responses[requests.length - 1] }) }
  }
  const capture = new Blob(['face-capture'], { type: 'image/jpeg' })

  await recordBiometricConsent('staff-token', 'beneficiary-1', { consentVersion: 'v1.0', consentGiven: true, retentionUntil: '2027-08-26T15:59:59.000Z' })
  await requestBiometricConsents('staff-token', 'beneficiary-1', { page: 1, pageSize: 20 })
  await requestBiometricStatus('staff-token', 'beneficiary-1')
  await saveBiometricEnrollment('staff-token', 'beneficiary-1', capture, 'consent-1')
  await revokeBiometricConsent('staff-token', 'beneficiary-1', 'consent-1')
  await deleteBiometricEnrollment('admin-token', 'beneficiary-1')
  await verifyBiometricClaim('facilitator-token', 'distribution-1', 'beneficiary-1', capture, '11111111-1111-4111-8111-111111111111')
  await requestBiometricAttempts('oversight-token', 'distribution-1', { page: 1, pageSize: 20, result: 'MATCHED' })

  assert.match(requests[0].url, /\/beneficiaries\/beneficiary-1\/biometric-consents$/)
  assert.deepEqual(JSON.parse(requests[0].options.body), { consentVersion: 'v1.0', consentGiven: true, retentionUntil: '2027-08-26T15:59:59.000Z' })
  assert.match(requests[1].url, /\/beneficiaries\/beneficiary-1\/biometric-consents\?page=1&pageSize=20$/)
  assert.match(requests[2].url, /\/beneficiaries\/beneficiary-1\/biometrics\/status$/)
  assert.equal(requests[3].options.body instanceof FormData, true)
  assert.equal(requests[3].options.body.get('faceCapture').size, capture.size)
  assert.equal(requests[3].options.body.get('faceCapture').type, capture.type)
  assert.equal(requests[3].options.body.get('consentId'), 'consent-1')
  assert.match(requests[4].url, /\/biometric-consents\/consent-1\/revoke$/)
  assert.equal(requests[5].options.method, 'DELETE')
  assert.equal(requests[6].options.headers['Idempotency-Key'], '11111111-1111-4111-8111-111111111111')
  assert.equal(requests[6].options.body.get('beneficiaryId'), 'beneficiary-1')
  assert.equal(requests[6].options.body.get('deviceInfo'), 'GarantiyAid Web Portal')
  assert.match(requests[7].url, /\/distributions\/distribution-1\/biometric-attempts\?page=1&pageSize=20&result=MATCHED$/)
  assert.equal(requests[3].options.headers['Content-Type'], undefined)
  assert.equal(requests[6].options.headers['Content-Type'], undefined)
})

test('reports, CSV export, and audit logs preserve oversight API contracts', async (context) => {
  const originalFetch = globalThis.fetch
  const requests = []
  context.after(() => { globalThis.fetch = originalFetch })

  globalThis.fetch = async (url, options) => {
    requests.push({ url, options })
    const responses = [
      { report: { reportType: 'CLAIM_STATUS', data: { claims: [] } } },
      { report: { reportType: 'SIMULATED_FUND_UTILIZATION', data: { distributions: [], pagination: { page: 1 } } } },
      { auditLogs: [], pagination: { page: 1 } },
    ]
    const isCsv = requests.length === 4
    return {
      ok: true,
      headers: { get: (name) => isCsv && name === 'content-disposition' ? 'attachment; filename="distribution-report.csv"' : null },
      json: async () => ({ data: responses[requests.length - 1] }),
      text: async () => 'report_version,distribution_id\nGYA-PHASE8-1,distribution-1',
    }
  }

  await requestDistributionReport('oversight-token', 'distribution-1', 'CLAIMS', { page: 2, pageSize: 20, status: 'CLAIMED' })
  await requestFundUtilizationReport('oversight-token', { page: 1, pageSize: 20, status: 'OPEN' })
  await requestAuditLogs('oversight-token', { page: 1, pageSize: 25, action: 'STAFF_LOGIN' })
  const exported = await requestDistributionCsv('oversight-token', 'distribution-1')

  assert.match(requests[0].url, /\/reports\/distributions\/distribution-1\/claims\?page=2&pageSize=20&status=CLAIMED$/)
  assert.match(requests[1].url, /\/reports\/fund-utilization\?page=1&pageSize=20&status=OPEN$/)
  assert.match(requests[2].url, /\/audit-logs\?page=1&pageSize=25&action=STAFF_LOGIN$/)
  assert.match(requests[3].url, /\/reports\/distributions\/distribution-1\/export\.csv$/)
  requests.forEach(({ options }) => assert.equal(options.headers.Authorization, 'Bearer oversight-token'))
  assert.equal(exported.filename, 'distribution-report.csv')
  assert.match(exported.csv, /GYA-PHASE8-1/)
  await assert.rejects(() => requestDistributionReport('token', 'distribution-1', 'UNKNOWN'), /valid report type/i)
})

test('DSWD live dashboard and ledger preserve authenticated backend contracts', async (context) => {
  const originalFetch = globalThis.fetch
  const requests = []
  context.after(() => { globalThis.fetch = originalFetch })

  globalThis.fetch = async (url, options) => {
    requests.push({ url, options })
    const responses = [
      { distributions: [], pagination: { page: 1 } },
      { summary: { distribution: { distributionId: 'distribution-1' }, fundUtilization: {} } },
      { transactions: [], summary: {}, pagination: { page: 2 } },
    ]
    return { ok: true, json: async () => ({ data: responses[requests.length - 1] }) }
  }

  await requestDistributionList('dswd-token', { page: 1, pageSize: 100, status: 'OPEN', dateFrom: '2026-08-01' })
  await requestDistributionDashboard('dswd-token', 'distribution-1')
  await requestDistributionTransactions('dswd-token', 'distribution-1', { page: 2, pageSize: 20, type: 'BENEFIT_CREDIT', status: 'COMPLETED' })

  assert.match(requests[0].url, /\/distributions\?page=1&pageSize=100&status=OPEN&dateFrom=2026-08-01$/)
  assert.match(requests[1].url, /\/dashboard\/distributions\/distribution-1$/)
  assert.match(requests[2].url, /\/distributions\/distribution-1\/transactions\?page=2&pageSize=20&type=BENEFIT_CREDIT&status=COMPLETED$/)
  requests.forEach(({ options }) => {
    assert.equal(options.method, 'GET')
    assert.equal(options.headers.Authorization, 'Bearer dswd-token')
  })
})

test('DSWD realtime client authenticates once and forwards subscribed events', () => {
  const listeners = {}
  const updates = []
  let socketOptions
  let socketUrl
  let disconnected = false
  const socket = {
    on(eventName, handler) {
      listeners[eventName] = handler
      return this
    },
    disconnect() { disconnected = true },
  }
  const stop = connectStaffRealtime('dswd-token', {
    onUpdate: (eventName, payload) => updates.push([eventName, payload]),
  }, (url, options) => {
    socketUrl = url
    socketOptions = options
    return socket
  })

  assert.equal(realtimeServerUrl('https://api.example.gov/api/v1'), 'https://api.example.gov')
  assert.equal(socketUrl, 'http://localhost:4000')
  assert.deepEqual(socketOptions.auth, { accessToken: 'dswd-token' })
  assert.deepEqual(Object.keys(listeners).filter((event) => DSWD_LIVE_EVENTS.includes(event)), [...DSWD_LIVE_EVENTS])
  listeners['dashboard.metrics.updated']({ distributionId: 'distribution-1' })
  assert.deepEqual(updates, [['dashboard.metrics.updated', { distributionId: 'distribution-1' }]])
  stop()
  assert.equal(disconnected, true)
})

test('notification realtime client subscribes only to delivery lifecycle events', () => {
  const listeners = {}
  const updates = []
  const socket = {
    on(eventName, handler) { listeners[eventName] = handler; return this },
    disconnect() {},
  }
  const stop = connectNotificationRealtime('staff-token', {
    onUpdate: (eventName, payload) => updates.push([eventName, payload]),
  }, () => socket)

  assert.deepEqual(Object.keys(listeners).filter((event) => NOTIFICATION_LIVE_EVENTS.includes(event)), [...NOTIFICATION_LIVE_EVENTS])
  assert.equal(Object.hasOwn(listeners, 'dashboard.metrics.updated'), false)
  listeners['notification.sent']({ notificationId: 'notification-1', status: 'SENT' })
  assert.deepEqual(updates, [['notification.sent', { notificationId: 'notification-1', status: 'SENT' }]])
  stop()
})

test('dashboard loading and secure logout use the authenticated backend endpoints', async (context) => {
  const originalFetch = globalThis.fetch
  const requests = []
  context.after(() => { globalThis.fetch = originalFetch })

  globalThis.fetch = async (url, options) => {
    requests.push({ url, options })
    return {
      ok: true,
      json: async () => ({ data: requests.length === 1 ? { overview: { programs: {} } } : { message: 'Session ended.' } }),
    }
  }

  await requestDashboardOverview('access-token')
  await requestStaffLogout('access-token')

  assert.match(requests[0].url, /\/dashboard\/overview$/)
  assert.equal(requests[0].options.method, 'GET')
  assert.equal(requests[0].options.headers.Authorization, 'Bearer access-token')
  assert.match(requests[1].url, /\/auth\/logout$/)
  assert.equal(requests[1].options.method, 'POST')

  const expired = new Error('Expired')
  expired.status = 401
  assert.equal(isSessionExpiredError(expired), true)
})

test('facilitator queue and QR verification preserve scoped backend contracts', async (context) => {
  const originalFetch = globalThis.fetch
  const requests = []
  context.after(() => { globalThis.fetch = originalFetch })

  globalThis.fetch = async (url, options) => {
    requests.push({ url, options })
    const responses = [
      { distributions: [{ distributionId: 'distribution-1' }], pagination: {} },
      { schedules: [], summary: { countsByStatus: {} }, pagination: { page: 2 } },
      { claim: { claimId: 'claim-1' }, verificationComplete: true },
    ]
    return { ok: true, json: async () => ({ data: responses[requests.length - 1] }) }
  }

  await requestOpenDistributions('facilitator-token')
  await requestDistributionQueue('facilitator-token', 'distribution-1', { page: 2, search: 'Pedro', status: 'SCHEDULED' })
  await verifyDistributionQrClaim('facilitator-token', 'distribution-1', 'gya1_token', '11111111-1111-4111-8111-111111111111')

  assert.match(requests[0].url, /\/distributions\?page=1&pageSize=100&status=OPEN$/)
  assert.match(requests[1].url, /\/distributions\/distribution-1\/schedules\?page=2&pageSize=20&search=Pedro&status=SCHEDULED$/)
  assert.match(requests[2].url, /\/distributions\/distribution-1\/claims\/verify-qr$/)
  assert.equal(requests[2].options.headers['Idempotency-Key'], '11111111-1111-4111-8111-111111111111')
  assert.deepEqual(JSON.parse(requests[2].options.body), { token: 'gya1_token', deviceInfo: 'GarantiyAid Web Portal' })
})
