export const BIOMETRIC_FOLLOW_UP_KEY = 'garantiyaid.biometricFollowUps'
export const followUpStatuses = { NEEDS_FOLLOW_UP: 'Needs follow-up', UNDER_REVIEW: 'Under review', RESOLVED: 'Resolved' }

export const attemptGuidance = {
  MATCHED: 'The face check passed. Review any remaining claim requirements before release.',
  NO_MATCH: 'The capture did not match the selected profile. Check that the correct beneficiary and profile were selected before a new live attempt.',
  LIVENESS_FAILED: 'The capture did not pass the liveness check. Barangay staff should check lighting and retry with the beneficiary present.',
  CONSENT_INVALID: 'This attempt could not use valid consent. Review the current consent record before another capture.',
  PROFILE_UNAVAILABLE: 'No usable face profile was available for this check. Review the profile and its enrollment status.',
  DUPLICATE: 'This attempt stopped because the face profile was held for duplicate review. Check the latest case outcome before another verification attempt.',
  PROCESSOR_ERROR: 'The identity service could not complete the check. Retry when service is available; this is not an identity mismatch.',
}

export function biometricAttemptGuidance(attempt) {
  if (attempt.result === 'DUPLICATE' && attempt.claimId) return 'A claim already exists for this beneficiary and event. Review that claim before any further action.'
  return attemptGuidance[attempt.result] || 'Review the recorded result before deciding the next step.'
}

export function followUpActions(attempt) {
  const profile = { value: 'PROFILE_REVIEW', label: 'Review beneficiary profile', owner: 'Admin', area: 'enrollment' }
  const identity = { value: 'IDENTITY_REVIEW', label: 'Review identity records', owner: 'Admin', area: 'beneficiary' }
  const recapture = { value: 'BARANGAY_RECAPTURE', label: 'Request a new live capture', owner: 'Barangay staff', area: 'verify' }
  const claim = { value: 'CLAIM_REVIEW', label: 'Review existing claim', owner: 'Admin', area: 'claim' }
  if (attempt.result === 'DUPLICATE') return attempt.claimId ? [claim] : [{ value: 'DUPLICATE_REVIEW', label: 'Review held face profile', owner: 'Admin / DSWD reviewer', area: 'duplicates' }]
  if (attempt.result === 'CONSENT_INVALID') return [{ value: 'CONSENT_REVIEW', label: 'Review consent', owner: 'Authorized staff', area: 'enrollment' }]
  if (attempt.result === 'PROFILE_UNAVAILABLE') return [profile, identity]
  if (attempt.result === 'PROCESSOR_ERROR') return [{ value: 'SERVICE_RETRY', label: 'Retry after service recovery', owner: 'Barangay staff', area: 'verify' }]
  if (attempt.result === 'MATCHED') return [claim]
  return attempt.result === 'LIVENESS_FAILED' ? [recapture, identity] : [identity, profile, recapture]
}

export function defaultFollowUp(attempt) {
  return { status: 'NEEDS_FOLLOW_UP', action: followUpActions(attempt)[0].value, notes: '', outcome: '' }
}

export function followUpErrors(form, attempt) {
  const errors = {}
  if (!Object.hasOwn(followUpStatuses, form.status)) errors.status = 'Select a follow-up status.'
  if (!followUpActions(attempt).some((item) => item.value === form.action)) errors.action = 'Select an appropriate next action for this attempt.'
  if (form.notes.trim().length < 10 || form.notes.length > 1000) errors.notes = 'Use 10–1,000 characters to explain the checks or follow-up needed.'
  if (form.outcome.length > 1000 || (form.status === 'RESOLVED' && form.outcome.trim().length < 10)) errors.outcome = 'Describe the follow-up outcome in 10–1,000 characters before proposing resolution.'
  return errors
}

export function biometricHistoryHref({ distributionId, result = '', page = 1 }) {
  const query = new URLSearchParams({ view: 'history', distribution: distributionId })
  if (result) query.set('result', result)
  if (page > 1) query.set('page', String(page))
  return `/biometrics?${query}`
}

export function biometricActionHref(action, attempt, distributionId) {
  const query = new URLSearchParams({ distribution: distributionId })
  if (action.area === 'claim') {
    if (attempt.claimId) query.set('claim', attempt.claimId)
    else query.set('search', attempt.beneficiaryId)
    query.set('receipt', 'manual')
    return `/claim-accountability?${query}`
  }
  if (action.area === 'beneficiary') return `/beneficiaries?beneficiary=${encodeURIComponent(attempt.beneficiaryId)}`
  query.set('view', action.area)
  query.set('beneficiary', attempt.beneficiaryId)
  return `/biometrics?${query}`
}

// shortcut: review drafts are tab-local; use shared case records when a follow-up API is available.
export function readBiometricFollowUps(storage, user) {
  const raw = storage.getItem(BIOMETRIC_FOLLOW_UP_KEY)
  if (!raw) return {}
  const value = JSON.parse(raw)
  if (value.userId !== user.userId || value.role !== user.role) return {}
  const validForm = (form) => form && Object.hasOwn(followUpStatuses, form.status) && typeof form.action === 'string'
    && typeof form.notes === 'string' && form.notes.length <= 1000 && typeof form.outcome === 'string' && form.outcome.length <= 1000
  if (!value.cases || Array.isArray(value.cases) || typeof value.cases !== 'object' || !Object.values(value.cases).every((item) =>
    item && typeof item.distributionId === 'string' && typeof item.beneficiaryId === 'string' && validForm(item.working)
    && (!item.saved || (validForm(item.saved) && typeof item.saved.reviewer === 'string' && Number.isFinite(Date.parse(item.saved.savedAt))))
  )) throw new Error('Saved review drafts could not be read. Contact your system administrator before clearing this tab.')
  return value.cases
}

export function writeBiometricFollowUp(storage, user, attempt, distributionId, working, saved) {
  const cases = readBiometricFollowUps(storage, user)
  const key = `${distributionId}:${attempt.attemptId}`
  const previous = cases[key]
  cases[key] = { distributionId, beneficiaryId: attempt.beneficiaryId, working, saved: saved ?? previous?.saved ?? null }
  storage.setItem(BIOMETRIC_FOLLOW_UP_KEY, JSON.stringify({ userId: user.userId, role: user.role, cases }))
  return cases[key]
}
