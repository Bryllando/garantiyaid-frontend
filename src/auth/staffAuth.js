const API_BASE_URL = (import.meta.env?.VITE_API_URL ?? 'http://localhost:4000/api/v1').replace(/\/$/, '')

function queryString(values) {
  const query = new URLSearchParams()
  Object.entries(values).forEach(([key, value]) => {
    if (value !== '' && value !== undefined && value !== null) query.set(key, String(value))
  })
  const serialized = query.toString()
  return serialized ? `?${serialized}` : ''
}

async function requestJson(path, { body, headers, token, method = 'POST' } = {}) {
  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: {
      ...(body && !isFormData ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    ...(body ? { body: isFormData ? body : JSON.stringify(body) } : {}),
  })
  const payload = await response.json().catch(() => null)

  if (!response.ok) {
    const error = new Error(payload?.error?.message ?? 'The request could not be completed. Please try again.')
    error.status = response.status
    error.code = payload?.error?.code
    error.details = payload?.error?.details
    error.data = payload?.data
    throw error
  }

  return payload?.data
}

export async function requestServerTimestamp() {
  const data = await requestJson('/health', { method: 'GET' })
  if (!data?.timestamp || Number.isNaN(Date.parse(data.timestamp))) {
    throw new Error('The server returned an unexpected time response.')
  }
  return data.timestamp
}

export function getLoginOutcome(data) {
  if (data?.requiresPasswordChange) return 'password-change'
  if (data?.requiresTotpEnrollment && data.totpSetupToken) return 'totp-enrollment'
  if (data?.requiresTotp) return 'totp'
  if (data?.accessToken && data.user) return 'authenticated'
  return 'invalid-response'
}

export async function requestStaffLogin(credentials) {
  const data = await requestJson('/auth/login', { body: credentials })

  if (getLoginOutcome(data) === 'invalid-response') {
    throw new Error('The server returned an unexpected authentication response.')
  }

  return data
}

export async function requestTotpSetup(token) {
  const data = await requestJson('/auth/totp/setup', { token })

  if (!data?.secret || !data?.otpauthUri) {
    throw new Error('The server returned an unexpected TOTP setup response.')
  }

  return data
}

export async function confirmTotpSetup(token, code) {
  const data = await requestJson('/auth/totp/confirm', { token, body: { code } })

  if (getLoginOutcome(data) !== 'authenticated' || !Array.isArray(data.recoveryCodes)) {
    throw new Error('The server returned an unexpected TOTP confirmation response.')
  }

  return data
}

export async function requestStaffUsers(token) {
  const data = await requestStaffUserList(token, { pageSize: 100 })

  return data.users
}

export async function requestStaffUserList(token, filters = {}) {
  const data = await requestJson(`/users${queryString(filters)}`, { token, method: 'GET' })

  if (!Array.isArray(data?.users) || !data?.pagination) {
    throw new Error('The server returned an unexpected staff-list response.')
  }

  return data
}

export async function createStaffUser(token, user) {
  const data = await requestJson('/users', { token, body: user })
  if (!data?.user || !data?.temporaryPassword) throw new Error('The server returned an unexpected staff-account response.')
  return data
}

export async function updateStaffUser(token, userId, user) {
  const data = await requestJson(`/users/${userId}`, { token, method: 'PATCH', body: user })
  if (!data?.user) throw new Error('The server returned an unexpected staff-account response.')
  return data.user
}

export async function removeStaffUser(token, userId, confirmation) {
  const data = await requestJson(`/users/${userId}`, { token, method: 'DELETE', body: { confirmation } })
  if (!data?.user || !['ARCHIVE', 'DELETE'].includes(data.removalMode)) throw new Error('The server returned an unexpected staff-account removal response.')
  return data
}

export async function restoreStaffUser(token, userId) {
  const data = await requestJson(`/users/${userId}/restore`, { token })
  if (!data?.user || data.user.archivedAt) throw new Error('The server returned an unexpected staff-account restore response.')
  return data.user
}

export function buildStaffAccountPayload(form, existingUser = null) {
  const role = existingUser?.role ?? form.role
  const normalized = {
    fullName: form.fullName.trim(),
    email: form.email.trim().toLowerCase(),
    contactNumber: form.contactNumber.trim() || null,
    username: role === 'DSWD_STAFF' ? null : form.username.trim().toLowerCase(),
    barangayId: role === 'BARANGAY_FACILITATOR' ? form.barangayId : null,
  }
  if (!existingUser) {
    return {
      ...normalized,
      role,
      contactNumber: normalized.contactNumber ?? undefined,
      username: normalized.username ?? undefined,
      barangayId: normalized.barangayId ?? undefined,
    }
  }

  return Object.fromEntries(Object.entries(normalized).filter(([field, value]) => {
    const current = existingUser[field] ?? null
    return value !== current
  }))
}

export async function resetStaffTotp(token, userId, verification) {
  const data = await requestJson(`/users/${userId}/totp/reset`, { token, body: verification })

  if (!data?.user || data.user.totpEnabled !== false) {
    throw new Error('The server returned an unexpected authenticator-reset response.')
  }

  return data
}

export async function requestDashboardOverview(token, filters = {}) {
  const data = await requestJson(`/dashboard/overview${queryString(filters)}`, { token, method: 'GET' })

  if (!data?.overview) {
    throw new Error('The server returned an unexpected dashboard response.')
  }

  return data.overview
}

export async function requestStaffLogout(token) {
  return requestJson('/auth/logout', { token })
}

export async function requestOwnAccount(token) {
  const data = await requestJson('/auth/account', { token, method: 'GET' })
  if (!data?.user || !data?.security) throw new Error('The server returned an unexpected account response.')
  return data
}

export async function updateOwnProfile(token, profile) {
  const data = await requestJson('/auth/account', { token, method: 'PATCH', body: profile })
  if (!data?.user) throw new Error('The server returned an unexpected profile response.')
  return data.user
}

export async function changeOwnPassword(token, credentials) {
  const data = await requestJson('/auth/account/password', { token, body: credentials })
  if (typeof data?.revokedSessionCount !== 'number') throw new Error('The server returned an unexpected password response.')
  return data
}

export async function regenerateOwnRecoveryCodes(token, credentials) {
  const data = await requestJson('/auth/account/recovery-codes', { token, body: credentials })
  if (!Array.isArray(data?.recoveryCodes)) throw new Error('The server returned an unexpected recovery-code response.')
  return data.recoveryCodes
}

export async function startOwnTotpReplacement(token, credentials) {
  const data = await requestJson('/auth/account/totp-replacement', { token, body: credentials })
  if (!data?.secret || !data?.otpauthUri || !data?.replacementToken) throw new Error('The server returned an unexpected authenticator response.')
  return data
}

export async function confirmOwnTotpReplacement(token, replacementToken, code) {
  const data = await requestJson('/auth/account/totp-replacement/confirm', {
    token,
    body: { replacementToken, code },
  })
  if (!data?.user || !Array.isArray(data?.recoveryCodes)) throw new Error('The server returned an unexpected authenticator response.')
  return data
}

export async function revokeOwnOtherSessions(token) {
  const data = await requestJson('/auth/account/sessions/revoke-others', { token })
  if (typeof data?.revokedSessionCount !== 'number') throw new Error('The server returned an unexpected session response.')
  return data
}

export async function requestOpenDistributions(token) {
  const data = await requestDistributionList(token, { page: 1, pageSize: 100, status: 'OPEN' })

  return data.distributions
}

export async function requestDistributionList(token, filters = {}) {
  const data = await requestJson(`/distributions${queryString(filters)}`, { token, method: 'GET' })

  if (!Array.isArray(data?.distributions) || !data?.pagination) {
    throw new Error('The server returned an unexpected distribution-list response.')
  }

  return data
}

export async function requestDistributionQueue(token, distributionId, { page = 1, search = '', status = '' } = {}) {
  const query = new URLSearchParams({ page: String(page), pageSize: '20' })
  if (search) query.set('search', search)
  if (status) query.set('status', status)
  const data = await requestJson(`/distributions/${distributionId}/schedules?${query}`, { token, method: 'GET' })

  if (!Array.isArray(data?.schedules) || !data?.summary || !data?.pagination) {
    throw new Error('The server returned an unexpected distribution-queue response.')
  }

  return data
}

export async function previewDistributionQrClaim(token, distributionId, qrToken) {
  const data = await requestJson(`/distributions/${distributionId}/claims/preview-qr`, {
    token,
    body: { token: qrToken, deviceInfo: 'GarantiyAid Web Portal' },
  })

  if (!data?.beneficiary || !data?.schedule || typeof data.checksInBeneficiary !== 'boolean') {
    throw new Error('The server returned an unexpected QR preview response.')
  }

  return data
}

export async function verifyDistributionQrClaim(token, distributionId, qrToken, idempotencyKey) {
  const data = await requestJson(`/distributions/${distributionId}/claims/verify-qr`, {
    token,
    headers: { 'Idempotency-Key': idempotencyKey },
    body: { token: qrToken, deviceInfo: 'GarantiyAid Web Portal' },
  })

  if (!data?.claim || typeof data.verificationComplete !== 'boolean') {
    throw new Error('The server returned an unexpected QR verification response.')
  }

  return data
}

export async function requestDistributionDashboard(token, distributionId) {
  const data = await requestJson(`/dashboard/distributions/${distributionId}`, { token, method: 'GET' })

  if (!data?.summary?.fundUtilization || !data.summary.distribution) {
    throw new Error('The server returned an unexpected distribution-dashboard response.')
  }

  return data.summary
}

export async function requestDistributionTransactions(token, distributionId, filters = {}) {
  const data = await requestJson(`/distributions/${distributionId}/transactions${queryString(filters)}`, { token, method: 'GET' })

  if (!Array.isArray(data?.transactions) || !data?.summary || !data?.pagination) {
    throw new Error('The server returned an unexpected transaction-list response.')
  }

  return data
}

export async function requestCreditableClaims(token, distributionId, filters = {}) {
  const data = await requestJson(`/distributions/${distributionId}/creditable-claims${queryString(filters)}`, { token, method: 'GET' })
  if (!Array.isArray(data?.claims) || !data?.summary || !data?.pagination) throw new Error('The server returned an unexpected creditable-claim response.')
  return data
}

export async function requestDistributionClaims(token, distributionId, filters = {}) {
  const data = await requestJson(`/distributions/${distributionId}/claims${queryString(filters)}`, { token, method: 'GET' })
  if (!Array.isArray(data?.claims) || !data?.summary || !data?.pagination) throw new Error('The server returned an unexpected claim-list response.')
  return data
}

export async function issueClaimReceipt(token, distributionId, claimId) {
  const data = await requestJson(`/distributions/${distributionId}/claims/${claimId}/receipt`, { token, body: {} })
  if (!data?.receipt?.receiptNo || !data.receipt.evidenceHash) throw new Error('The server returned an unexpected claim-receipt response.')
  return data
}

export async function recordClaimReceiptPrint(token, distributionId, claimId) {
  const data = await requestJson(`/distributions/${distributionId}/claims/${claimId}/receipt/print-events`, { token, body: {} })
  if (!data?.receipt?.receiptNo) throw new Error('The server returned an unexpected claim-receipt response.')
  return data.receipt
}

export async function createClaimDispute(token, distributionId, claimId, dispute) {
  const data = await requestJson(`/distributions/${distributionId}/claims/${claimId}/disputes`, { token, body: dispute })
  if (!data?.dispute?.referenceNo) throw new Error('The server returned an unexpected claim-dispute response.')
  return data.dispute
}

export async function requestClaimDisputes(token, distributionId, filters = {}) {
  const data = await requestJson(`/distributions/${distributionId}/claim-disputes${queryString(filters)}`, { token, method: 'GET' })
  if (!Array.isArray(data?.disputes) || !data?.summary || !data?.pagination) throw new Error('The server returned an unexpected claim-dispute list.')
  return data
}

export async function reviewClaimDispute(token, distributionId, disputeId, review) {
  const data = await requestJson(`/distributions/${distributionId}/claim-disputes/${disputeId}/review`, { token, body: review })
  if (!data?.dispute?.referenceNo) throw new Error('The server returned an unexpected claim-dispute response.')
  return data.dispute
}

export async function creditVerifiedClaim(token, distributionId, claimId, description = '', idempotencyKey = crypto.randomUUID()) {
  const data = await requestJson(`/distributions/${distributionId}/claims/${claimId}/credit`, {
    token,
    headers: { 'Idempotency-Key': idempotencyKey },
    body: { ...(description.trim() ? { description: description.trim() } : {}) },
  })
  if (!data?.transaction || !data?.wallet || !data?.lifecycle) throw new Error('The server returned an unexpected simulated-credit response.')
  return data
}

export async function requestDistributionReconciliation(token, distributionId) {
  const data = await requestJson(`/distributions/${distributionId}/reconciliation`, { token, method: 'GET' })
  if (!data?.reconciliation || !data?.simulation) throw new Error('The server returned an unexpected reconciliation response.')
  return data
}

export async function requestTransactionReceipt(token, walletId, transactionId) {
  const data = await requestJson(`/wallets/${walletId}/transactions/${transactionId}/receipt`, { token, method: 'GET' })
  if (!data?.receiptVersion || !data?.transaction || !data?.simulation) throw new Error('The server returned an unexpected receipt response.')
  return data
}

export async function reverseBenefitCredit(token, walletId, transactionId, reason, idempotencyKey = crypto.randomUUID()) {
  const data = await requestJson(`/wallets/${walletId}/transactions/${transactionId}/reverse`, {
    token,
    headers: { 'Idempotency-Key': idempotencyKey },
    body: { reason: reason.trim() },
  })
  if (!data?.originalTransaction || !data?.reversalTransaction || !data?.wallet || !data?.lifecycle) throw new Error('The server returned an unexpected reversal response.')
  return data
}

const distributionReportPaths = Object.freeze({
  SUMMARY: 'summary',
  CLAIMS: 'claims',
  SCHEDULES: 'schedules',
  ANOMALIES: 'anomalies',
})

export async function requestDistributionReport(token, distributionId, reportType, filters = {}) {
  const reportPath = distributionReportPaths[reportType]
  if (!reportPath) throw new Error('Select a valid report type.')
  const data = await requestJson(`/reports/distributions/${distributionId}/${reportPath}${queryString(filters)}`, { token, method: 'GET' })

  if (!data?.report) throw new Error('The server returned an unexpected report response.')
  return data.report
}

export async function requestFundUtilizationReport(token, filters = {}) {
  const data = await requestJson(`/reports/fund-utilization${queryString(filters)}`, { token, method: 'GET' })

  if (!data?.report?.data?.distributions || !data.report.data.pagination) {
    throw new Error('The server returned an unexpected fund-utilization report.')
  }
  return data.report
}

export async function requestAuditLogs(token, filters = {}) {
  const data = await requestJson(`/audit-logs${queryString(filters)}`, { token, method: 'GET' })

  if (!Array.isArray(data?.auditLogs) || !data?.pagination) {
    throw new Error('The server returned an unexpected audit-log response.')
  }
  return data
}

export async function requestBeneficiaryList(token, filters = {}) {
  const data = await requestJson(`/beneficiaries${queryString(filters)}`, { token, method: 'GET' })
  if (!Array.isArray(data?.beneficiaries) || !data?.pagination) {
    throw new Error('The server returned an unexpected beneficiary-list response.')
  }
  return data
}

export async function requestBeneficiary(token, beneficiaryId) {
  const data = await requestJson(`/beneficiaries/${beneficiaryId}`, { token, method: 'GET' })
  if (!data?.beneficiary) throw new Error('The server returned an unexpected beneficiary response.')
  return data.beneficiary
}

export async function createBeneficiary(token, beneficiary) {
  const data = await requestJson('/beneficiaries', { token, body: beneficiary })
  if (!data?.beneficiary) throw new Error('The server returned an unexpected beneficiary response.')
  return data.beneficiary
}

export async function updateBeneficiary(token, beneficiaryId, beneficiary) {
  const data = await requestJson(`/beneficiaries/${beneficiaryId}`, { token, method: 'PATCH', body: beneficiary })
  if (!data?.beneficiary) throw new Error('The server returned an unexpected beneficiary response.')
  return data.beneficiary
}

export async function recordBiometricConsent(token, beneficiaryId, consent) {
  const data = await requestJson(`/beneficiaries/${beneficiaryId}/biometric-consents`, { token, body: consent })
  if (!data?.consent) throw new Error('The server returned an unexpected biometric-consent response.')
  return data
}

export async function requestBiometricConsents(token, beneficiaryId, filters = {}) {
  const data = await requestJson(`/beneficiaries/${beneficiaryId}/biometric-consents${queryString(filters)}`, { token, method: 'GET' })
  if (!Array.isArray(data?.consents) || !data?.pagination) throw new Error('The server returned an unexpected biometric-consent response.')
  return data
}

export async function revokeBiometricConsent(token, beneficiaryId, consentId) {
  const data = await requestJson(`/beneficiaries/${beneficiaryId}/biometric-consents/${consentId}/revoke`, { token })
  if (!data?.consent) throw new Error('The server returned an unexpected biometric-consent response.')
  return data
}

export async function requestBiometricStatus(token, beneficiaryId) {
  const data = await requestJson(`/beneficiaries/${beneficiaryId}/biometrics/status`, { token, method: 'GET' })
  if (!data?.biometricProfile || !data?.processing) throw new Error('The server returned an unexpected biometric-status response.')
  return data
}

function biometricCaptureForm(file, fields = {}) {
  const body = new FormData()
  body.set('faceCapture', file)
  Object.entries(fields).forEach(([key, value]) => {
    if (value !== '' && value !== undefined && value !== null) body.set(key, value)
  })
  return body
}

export async function saveBiometricEnrollment(token, beneficiaryId, file, consentId, reenroll = false) {
  const data = await requestJson(`/beneficiaries/${beneficiaryId}/biometrics/${reenroll ? 're-enroll' : 'enroll'}`, {
    token,
    body: biometricCaptureForm(file, { consentId }),
  })
  if (!data?.biometricProfile || !data?.processing) throw new Error('The server returned an unexpected biometric-enrollment response.')
  return data
}

export async function deleteBiometricEnrollment(token, beneficiaryId) {
  const data = await requestJson(`/beneficiaries/${beneficiaryId}/biometrics`, { token, method: 'DELETE' })
  if (data?.deleted !== true) throw new Error('The server returned an unexpected biometric-deletion response.')
  return data
}

export async function verifyBiometricClaim(token, distributionId, beneficiaryId, file, idempotencyKey = crypto.randomUUID()) {
  const data = await requestJson(`/distributions/${distributionId}/claims/verify-biometric`, {
    token,
    headers: { 'Idempotency-Key': idempotencyKey },
    body: biometricCaptureForm(file, { beneficiaryId, deviceInfo: 'GarantiyAid Web Portal' }),
  })
  if (!data?.claim || typeof data.verificationComplete !== 'boolean') throw new Error('The server returned an unexpected biometric-verification response.')
  return data
}

export async function submitClaimSignature(token, distributionId, claimId, signature, idempotencyKey = crypto.randomUUID()) {
  const data = await requestJson(`/distributions/${distributionId}/claims/${claimId}/signature`, {
    token,
    headers: { 'Idempotency-Key': idempotencyKey },
    body: { ...signature, deviceInfo: 'GarantiyAid Web Signature Pad' },
  })
  if (!data?.claim || !data?.signature || data.verificationComplete !== true) throw new Error('The server returned an unexpected signature-verification response.')
  return data
}

export async function requestBiometricAttempts(token, distributionId, filters = {}) {
  const data = await requestJson(`/distributions/${distributionId}/biometric-attempts${queryString(filters)}`, { token, method: 'GET' })
  if (!Array.isArray(data?.attempts) || !data?.pagination || !data?.privacy) throw new Error('The server returned an unexpected biometric-attempt response.')
  return data
}

export async function requestBarangays(token) {
  return requestBarangayList(token, { activeOnly: true })
}

export async function requestBarangayList(token, filters = {}) {
  const data = await requestJson(`/barangays${queryString(filters)}`, { token, method: 'GET' })
  if (!Array.isArray(data?.barangays)) throw new Error('The server returned an unexpected barangay-list response.')
  return data.barangays
}

export async function createBarangay(token, barangay) {
  const data = await requestJson('/barangays', { token, body: barangay })
  if (!data?.barangay) throw new Error('The server returned an unexpected barangay response.')
  return data.barangay
}

export async function updateBarangay(token, barangayId, barangay) {
  const data = await requestJson(`/barangays/${barangayId}`, { token, method: 'PATCH', body: barangay })
  if (!data?.barangay) throw new Error('The server returned an unexpected barangay response.')
  return data.barangay
}

export async function requestBeneficiaryDocuments(token, beneficiaryId) {
  const data = await requestJson(`/beneficiaries/${beneficiaryId}/documents`, { token, method: 'GET' })
  if (!Array.isArray(data?.documents)) throw new Error('The server returned an unexpected document-list response.')
  return data.documents
}

function documentForm(documentType, file) {
  const body = new FormData()
  body.set('documentType', documentType)
  body.set('file', file)
  return body
}

export async function uploadBeneficiaryDocument(token, beneficiaryId, documentType, file) {
  const data = await requestJson(`/beneficiaries/${beneficiaryId}/documents`, {
    token,
    body: documentForm(documentType, file),
  })
  if (!data?.document) throw new Error('The server returned an unexpected document response.')
  return data.document
}

export async function replaceBeneficiaryDocument(token, beneficiaryId, documentId, documentType, file) {
  const data = await requestJson(`/beneficiaries/${beneficiaryId}/documents/${documentId}/replacement`, {
    token,
    body: documentForm(documentType, file),
  })
  if (!data?.document) throw new Error('The server returned an unexpected document response.')
  return data.document
}

export async function reviewBeneficiaryDocument(token, beneficiaryId, documentId, review) {
  const data = await requestJson(`/beneficiaries/${beneficiaryId}/documents/${documentId}/review`, { token, body: review })
  if (!data?.document) throw new Error('The server returned an unexpected document response.')
  return data.document
}

export async function downloadBeneficiaryDocument(token, beneficiaryId, documentId) {
  const response = await fetch(`${API_BASE_URL}/beneficiaries/${beneficiaryId}/documents/${documentId}/download`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!response.ok) {
    const payload = await response.json().catch(() => null)
    const error = new Error(payload?.error?.message ?? 'Unable to download the beneficiary document.')
    error.status = response.status
    error.code = payload?.error?.code
    throw error
  }
  return response.blob()
}

export async function requestPrograms(token, filters = {}) {
  const data = await requestJson(`/programs${queryString(filters)}`, { token, method: 'GET' })
  if (!Array.isArray(data?.programs) || !data?.pagination) {
    throw new Error('The server returned an unexpected program-list response.')
  }
  return data
}

export async function requestProgram(token, programId) {
  const data = await requestJson(`/programs/${programId}`, { token, method: 'GET' })
  if (!data?.program) throw new Error('The server returned an unexpected program response.')
  return data.program
}

export async function createProgram(token, program) {
  const data = await requestJson('/programs', { token, body: program })
  if (!data?.program) throw new Error('The server returned an unexpected program response.')
  return data.program
}

export async function updateProgram(token, programId, program) {
  const data = await requestJson(`/programs/${programId}`, { token, method: 'PATCH', body: program })
  if (!data?.program) throw new Error('The server returned an unexpected program response.')
  return data.program
}

async function programAction(token, programId, action) {
  const data = await requestJson(`/programs/${programId}/${action}`, { token })
  if (!data?.program) throw new Error('The server returned an unexpected program response.')
  return data.program
}

export const activateProgram = (token, programId) => programAction(token, programId, 'activate')
export const closeProgram = (token, programId) => programAction(token, programId, 'close')
export const cancelProgram = (token, programId) => programAction(token, programId, 'cancel')

export function programCriterionExpectedValue(fieldName, operator, input) {
  if (operator === 'REQUIRED') return true
  const values = ['IN', 'NOT_IN'].includes(operator)
    ? input.split(',').map((value) => value.trim()).filter(Boolean)
    : [input.trim()]
  if (values.length === 0 || values[0] === '') throw new Error('Enter the expected criterion value.')
  const parsed = fieldName === 'AGE' ? values.map(Number) : values
  if (fieldName === 'AGE' && parsed.some((value) => !Number.isFinite(value) || value < 0)) {
    throw new Error('Age criteria must use a valid non-negative number.')
  }
  return ['IN', 'NOT_IN'].includes(operator) ? parsed : parsed[0]
}

export async function createProgramCriterion(token, programId, criterion) {
  const data = await requestJson(`/programs/${programId}/criteria`, { token, body: criterion })
  if (!data?.criterion) throw new Error('The server returned an unexpected criterion response.')
  return data.criterion
}

export async function updateProgramCriterion(token, programId, criterionId, criterion) {
  const data = await requestJson(`/programs/${programId}/criteria/${criterionId}`, { token, method: 'PATCH', body: criterion })
  if (!data?.criterion) throw new Error('The server returned an unexpected criterion response.')
  return data.criterion
}

export async function deleteProgramCriterion(token, programId, criterionId) {
  return requestJson(`/programs/${programId}/criteria/${criterionId}`, { token, method: 'DELETE' })
}

export async function requestDistribution(token, distributionId) {
  const data = await requestJson(`/distributions/${distributionId}`, { token, method: 'GET' })
  if (!data?.distribution) throw new Error('The server returned an unexpected distribution response.')
  return data.distribution
}

export async function createDistribution(token, distribution) {
  const data = await requestJson('/distributions', { token, body: distribution })
  if (!data?.distribution) throw new Error('The server returned an unexpected distribution response.')
  return data.distribution
}

export async function previewAssistantDistribution(token, distribution) {
  const data = await requestJson('/distributions/assistant-preview', { token, body: distribution })
  if (data?.conflictFree !== true || data?.draftOnly !== true || !data?.checkedAt) {
    throw new Error('The server returned an unexpected distribution-draft preview.')
  }
  return data
}

export async function updateDistribution(token, distributionId, distribution) {
  const data = await requestJson(`/distributions/${distributionId}`, { token, method: 'PATCH', body: distribution })
  if (!data?.distribution) throw new Error('The server returned an unexpected distribution response.')
  return data.distribution
}

export async function cancelDistribution(token, distributionId) {
  const data = await requestJson(`/distributions/${distributionId}/cancel`, { token })
  if (!data?.distribution) throw new Error('The server returned an unexpected distribution response.')
  return data.distribution
}

export async function requestDistributionSlots(token, distributionId) {
  const data = await requestJson(`/distributions/${distributionId}/slots?page=1&pageSize=100`, { token, method: 'GET' })
  if (!Array.isArray(data?.slots) || !data?.summary) throw new Error('The server returned an unexpected slot-list response.')
  return data
}

export async function generateDistributionSlots(token, distributionId, sessionsOrCapacity) {
  const body = Array.isArray(sessionsOrCapacity)
    ? { sessions: sessionsOrCapacity }
    : { capacity: sessionsOrCapacity }
  const data = await requestJson(`/distributions/${distributionId}/slots/generate`, { token, body })
  if (!Array.isArray(data?.slots) || !data?.summary) throw new Error('The server returned an unexpected slot-generation response.')
  return data
}

export async function requestEligibleDistributionEnrollments(token, distributionId) {
  const data = await requestJson(`/distributions/${distributionId}/eligible-enrollments?page=1&pageSize=100`, { token, method: 'GET' })
  if (!Array.isArray(data?.enrollments) || !data?.pagination || !data?.summary) throw new Error('The server returned an unexpected eligible-enrollment response.')
  return data
}

export async function requestDistributionAllocations(token, distributionId) {
  const data = await requestJson(`/distributions/${distributionId}/allocations?page=1&pageSize=100`, { token, method: 'GET' })
  if (!Array.isArray(data?.allocations) || !data?.summary) throw new Error('The server returned an unexpected allocation-list response.')
  return data
}

export async function createDistributionAllocations(token, distributionId, enrollmentIds, idempotencyKey = crypto.randomUUID()) {
  const data = await requestJson(`/distributions/${distributionId}/allocations`, {
    token,
    headers: { 'Idempotency-Key': idempotencyKey },
    body: { enrollmentIds },
  })
  if (!Array.isArray(data?.allocations) || !data?.summary) throw new Error('The server returned an unexpected allocation response.')
  return data
}

export async function requestDistributionSchedules(token, distributionId) {
  const data = await requestJson(`/distributions/${distributionId}/schedules?page=1&pageSize=100`, { token, method: 'GET' })
  if (!Array.isArray(data?.schedules) || !data?.summary) throw new Error('The server returned an unexpected schedule-list response.')
  return data
}

export async function generateDistributionSchedules(token, distributionId, idempotencyKey = crypto.randomUUID()) {
  const data = await requestJson(`/distributions/${distributionId}/schedules/generate`, {
    token,
    headers: { 'Idempotency-Key': idempotencyKey },
    body: {},
  })
  if (!Array.isArray(data?.schedules) || !data?.summary) throw new Error('The server returned an unexpected schedule-generation response.')
  return data
}

export async function requestNotificationList(token, filters = {}) {
  const data = await requestJson(`/notifications${queryString(filters)}`, { token, method: 'GET' })
  if (!Array.isArray(data?.notifications) || !data?.pagination) throw new Error('The server returned an unexpected notification-list response.')
  return data
}

export async function requestStaffNotifications(token, pageSize = 8) {
  const data = await requestJson(`/staff-notifications${queryString({ pageSize })}`, { token, method: 'GET' })
  if (!Array.isArray(data?.notifications) || typeof data?.unreadCount !== 'number') {
    throw new Error('The server returned an unexpected staff-notification response.')
  }
  return data
}

export async function markStaffNotificationRead(token, notificationId) {
  const data = await requestJson(`/staff-notifications/${notificationId}/read`, { token, method: 'PATCH' })
  if (!data?.notification || typeof data?.unreadCount !== 'number') {
    throw new Error('The server returned an unexpected staff-notification response.')
  }
  return data
}

export async function markAllStaffNotificationsRead(token) {
  const data = await requestJson('/staff-notifications/read-all', { token })
  if (typeof data?.updatedCount !== 'number' || data?.unreadCount !== 0) {
    throw new Error('The server returned an unexpected staff-notification response.')
  }
  return data
}

export async function requestNotificationSummary(token, filters = {}) {
  const data = await requestJson(`/notifications/summary${queryString(filters)}`, { token, method: 'GET' })
  if (typeof data?.total !== 'number' || !data?.byStatus) throw new Error('The server returned an unexpected notification-summary response.')
  return data
}

export async function requestNotificationQueueHealth(token) {
  try {
    const data = await requestJson('/notifications/queue/health', { token, method: 'GET' })
    if (!data?.status) throw new Error('The server returned an unexpected notification-queue response.')
    return data
  } catch (error) {
    if (error.status === 503 && error.data?.status === 'unavailable') return error.data
    throw error
  }
}

export async function enqueueDistributionReminder(token, distributionId, sendAt, idempotencyKey = crypto.randomUUID()) {
  const data = await requestJson(`/distributions/${distributionId}/notifications/enqueue`, {
    token,
    headers: { 'Idempotency-Key': idempotencyKey },
    body: { notificationType: 'DISTRIBUTION_REMINDER', ...(sendAt ? { sendAt } : {}) },
  })
  if (!Array.isArray(data?.notifications) || typeof data?.queuedCount !== 'number') throw new Error('The server returned an unexpected notification-enqueue response.')
  return data
}

export async function previewAssistantDistributionReminder(token, distributionId, reminder) {
  const data = await requestJson(`/distributions/${distributionId}/notifications/assistant-preview`, {
    token,
    body: reminder,
  })
  if (!Array.isArray(data?.recipients) || typeof data?.recipientCount !== 'number' || !data?.excluded || !/^[a-f0-9]{64}$/.test(data?.previewHash)) {
    throw new Error('The server returned an unexpected assistant reminder preview.')
  }
  return data
}

export async function enqueueAssistantDistributionReminder(token, distributionId, reminder, idempotencyKey = crypto.randomUUID()) {
  const data = await requestJson(`/distributions/${distributionId}/notifications/assistant-enqueue`, {
    token,
    headers: { 'Idempotency-Key': idempotencyKey },
    body: reminder,
  })
  if (!Array.isArray(data?.notifications) || typeof data?.queuedCount !== 'number') {
    throw new Error('The server returned an unexpected assistant reminder response.')
  }
  return data
}

export async function recordStaffAssistantFeedback(token, feedback) {
  const data = await requestJson('/chatbot/staff-feedback', { token, body: feedback })
  if (data?.recorded !== true) throw new Error('The server returned an unexpected assistant-feedback response.')
  return data
}

export async function requestStaffAssistantMessage(token, message, { onText, onStatus, signal } = {}) {
  const response = await fetch(`${API_BASE_URL}/chatbot/staff-assistant/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify(message),
    signal: AbortSignal.any([AbortSignal.timeout(40_000), ...(signal ? [signal] : [])]),
  })
  if (!response.ok) {
    const payload = await response.json().catch(() => null)
    const error = new Error(payload?.error?.message ?? 'The answer could not be loaded. Please try again.')
    error.status = response.status
    error.code = payload?.error?.code
    throw error
  }
  let data
  if (response.headers.get('content-type')?.includes('text/event-stream')) {
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let pending = ''
    try {
      while (!data) {
        const { value, done } = await reader.read()
        if (done) throw new Error('The answer was interrupted. Please try again.')
        pending += decoder.decode(value, { stream: true })
        let newline
        while ((newline = pending.indexOf('\n')) !== -1) {
          const line = pending.slice(0, newline).trimEnd()
          pending = pending.slice(newline + 1)
          if (!line.startsWith('data: ')) continue
          const event = JSON.parse(line.slice(6))
          if (event.type === 'text' && typeof event.text === 'string' && event.text.length <= 2_000) onText?.(event.text)
          if (event.type === 'status') onStatus?.(event.status)
          if (event.type === 'error') throw new Error('The answer was interrupted. Please try again.')
          if (event.type === 'done') { data = event.data; break }
        }
        if (pending.length > 16_000) throw new Error('The server returned an invalid answer stream.')
      }
    } finally {
      await reader.cancel().catch(() => {})
      reader.releaseLock()
    }
  } else {
    data = (await response.json())?.data
  }
  if (!data?.messageText || typeof data.externalAiUsed !== 'boolean') throw new Error('The server returned an unexpected staff-assistant response.')
  return data
}

export async function createPublicChatbotSession(language = 'en') {
  const data = await requestJson('/chatbot/sessions', { body: { language } })
  if (!data?.session?.sessionId || !data?.sessionToken) throw new Error('The server returned an unexpected chatbot-session response.')
  return data
}

export async function submitPublicChatbotMessage(sessionId, sessionToken, messageText) {
  const data = await requestJson(`/chatbot/sessions/${sessionId}/messages`, {
    headers: { 'X-Chatbot-Session-Token': sessionToken },
    body: { messageText },
  })
  if (!data?.userMessage || !data?.botMessage || !data?.session) throw new Error('The server returned an unexpected chatbot response.')
  return data
}

export async function retryNotification(token, notificationId, idempotencyKey = crypto.randomUUID()) {
  const data = await requestJson(`/notifications/${notificationId}/retry`, {
    token,
    headers: { 'Idempotency-Key': idempotencyKey },
    body: {},
  })
  if (!data?.notification) throw new Error('The server returned an unexpected notification-retry response.')
  return data
}

export async function openDistribution(token, distributionId) {
  const data = await requestJson(`/distributions/${distributionId}/open`, { token })
  if (!data?.distribution) throw new Error('The server returned an unexpected distribution response.')
  return data.distribution
}

export async function requestQrEligibleSchedules(token, distributionId) {
  const data = await requestJson(`/distributions/${distributionId}/qr-eligible-schedules?page=1&pageSize=100`, { token, method: 'GET' })
  if (!Array.isArray(data?.schedules) || !data?.summary) throw new Error('The server returned an unexpected QR-eligible response.')
  return data
}

export async function requestDistributionQrTokens(token, distributionId) {
  const data = await requestJson(`/distributions/${distributionId}/qr-tokens?page=1&pageSize=100`, { token, method: 'GET' })
  if (!Array.isArray(data?.qrTokens) || !data?.summary) throw new Error('The server returned an unexpected QR-token response.')
  return data
}

export async function generateDistributionQrTokens(token, distributionId) {
  const data = await requestJson(`/distributions/${distributionId}/qr-tokens/generate`, { token, body: {} })
  if (!Array.isArray(data?.qrTokens) || !data?.summary) throw new Error('The server returned an unexpected QR-token response.')
  return data
}

export async function submitEnrollment(token, programId, beneficiaryId) {
  const data = await requestJson(`/programs/${programId}/enrollments`, { token, body: { beneficiaryId } })
  if (!data?.enrollment) throw new Error('The server returned an unexpected enrollment response.')
  return data.enrollment
}

export async function requestEnrollmentList(token, filters = {}) {
  const data = await requestJson(`/enrollments${queryString(filters)}`, { token, method: 'GET' })
  if (!Array.isArray(data?.enrollments) || !data?.pagination) {
    throw new Error('The server returned an unexpected enrollment-list response.')
  }
  return data
}

async function enrollmentAction(token, enrollmentId, action, body) {
  const data = await requestJson(`/enrollments/${enrollmentId}/${action}`, { token, body })
  if (!data?.enrollment) throw new Error('The server returned an unexpected enrollment response.')
  return data.enrollment
}

export const startEnrollmentReview = (token, enrollmentId) => enrollmentAction(token, enrollmentId, 'start-review')
export const requestEnrollmentCorrection = (token, enrollmentId, reason) => enrollmentAction(token, enrollmentId, 'request-correction', { reason })
export const approveEnrollment = (token, enrollmentId, remarks = '') => enrollmentAction(token, enrollmentId, 'approve', { remarks })
export const rejectEnrollment = (token, enrollmentId, reason) => enrollmentAction(token, enrollmentId, 'reject', { reason })
export const resubmitEnrollment = (token, enrollmentId) => enrollmentAction(token, enrollmentId, 'resubmit')

export async function requestDistributionCsv(token, distributionId) {
  const response = await fetch(`${API_BASE_URL}/reports/distributions/${distributionId}/export.csv`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  })

  if (!response.ok) {
    const payload = await response.json().catch(() => null)
    const error = new Error(payload?.error?.message ?? 'Unable to export the distribution report.')
    error.status = response.status
    error.code = payload?.error?.code
    throw error
  }

  const disposition = response.headers.get('content-disposition') ?? ''
  return {
    csv: await response.text(),
    filename: disposition.match(/filename="?([^";]+)"?/i)?.[1] ?? 'garantiyaid-distribution-report.csv',
  }
}

export function storeStaffSession(data) {
  // ponytail: session storage matches the current Bearer-token API; switch to
  // HttpOnly cookie sessions when the backend supports them.
  sessionStorage.setItem('garantiyaid.accessToken', data.accessToken)
  sessionStorage.setItem('garantiyaid.user', JSON.stringify(data.user))
}

export function getStoredStaffSession() {
  try {
    return {
      accessToken: sessionStorage.getItem('garantiyaid.accessToken'),
      user: JSON.parse(sessionStorage.getItem('garantiyaid.user')),
    }
  } catch {
    return { accessToken: null, user: null }
  }
}

export function clearStaffSession() {
  sessionStorage.removeItem('garantiyaid.accessToken')
  sessionStorage.removeItem('garantiyaid.user')
  sessionStorage.removeItem('garantiyaid.totpSetupToken')
}

export function isSessionExpiredError(error) {
  return error?.status === 401
}

export const STAFF_ROLE_LABELS = Object.freeze({
  SYSTEM_ADMIN: 'System Administrator',
  DSWD_STAFF: 'DSWD Staff',
  BARANGAY_FACILITATOR: 'Barangay Facilitator',
})

const overviewItem = { label: 'Overview', icon: 'overview', href: '/dashboard' }

const dashboardNavigation = Object.freeze({
  SYSTEM_ADMIN: [
    overviewItem,
    { label: 'Distribution setup', icon: 'distributions', href: '/distributions/manage' },
    { label: 'Biometric identity', icon: 'biometrics', href: '/biometrics' },
    { label: 'Claim settlement', icon: 'ledger', href: '/dswd/ledger' },
    { label: 'Claim accountability', icon: 'receipt', href: '/claim-accountability' },
    { label: 'SMS delivery', icon: 'smsDelivery', href: '/notifications' },
    { label: 'Beneficiaries', icon: 'beneficiaries', href: '/beneficiaries' },
    { label: 'Staff & barangays', icon: 'administration', href: '/admin/administration' },
    { label: 'Authenticator recovery', icon: 'security', href: '/admin/staff-security' },
    { label: 'Reports', icon: 'reports', href: '/reports' },
    { label: 'Audit logs', icon: 'audit', href: '/audit-logs' },
  ],
  DSWD_STAFF: [
    overviewItem,
    { label: 'Assistance programs', icon: 'programs', href: '/programs' },
    { label: 'Enrollment review', icon: 'enrollments', href: '/enrollments' },
    { label: 'Biometric identity', icon: 'biometrics', href: '/biometrics' },
    { label: 'SMS delivery', icon: 'smsDelivery', href: '/notifications' },
    { label: 'Beneficiaries', icon: 'beneficiaries', href: '/beneficiaries' },
    { label: 'Live monitoring', icon: 'monitoring', href: '/dswd/live-dashboard' },
    { label: 'Ledger', icon: 'ledger', href: '/dswd/ledger' },
    { label: 'Claim accountability', icon: 'receipt', href: '/claim-accountability' },
    { label: 'Reports', icon: 'reports', href: '/reports' },
    { label: 'Audit logs', icon: 'audit', href: '/audit-logs' },
  ],
  BARANGAY_FACILITATOR: [
    overviewItem,
    { label: 'Beneficiaries', icon: 'beneficiaries', href: '/beneficiaries' },
    { label: 'Enrollments', icon: 'enrollments', href: '/enrollments' },
    { label: 'Queue & schedules', icon: 'queue', href: '/facilitator/queue' },
    { label: 'Biometric identity', icon: 'biometrics', href: '/biometrics' },
    { label: 'SMS delivery', icon: 'smsDelivery', href: '/notifications' },
    { label: 'QR verification', icon: 'qr', href: '/facilitator/qr-verification' },
    { label: 'Claim accountability', icon: 'receipt', href: '/claim-accountability' },
  ],
})

export function getDashboardNavigation(role) {
  return dashboardNavigation[role] ?? []
}

export function getAuthErrorMessage(error) {
  return error instanceof TypeError
    ? 'Unable to reach the GarantiyAid server. Check that the backend is running.'
    : error.message
}
