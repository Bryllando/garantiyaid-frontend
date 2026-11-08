export function applyManualEligibilityDecisions(evaluation, decisions = {}) {
  if (!evaluation?.results) return evaluation ?? null

  const results = evaluation.results.map((result) => {
    if (result.fieldName !== 'MANUAL_REVIEW') return result
    const decision = decisions[result.criterionId]
    const remarks = decision?.remarks?.trim() ?? ''
    if (typeof decision?.passed !== 'boolean' || remarks.length < 5) return result
    return {
      ...result,
      actualValue: { passed: decision.passed, remarks },
      outcome: decision.passed ? 'MET' : 'NOT_MET',
      blocking: result.isRequired && !decision.passed,
      reason: decision.passed ? 'Manual criterion met.' : 'Manual criterion not met.',
    }
  })
  const overallStatus = results.some((result) => result.blocking && result.outcome === 'NOT_MET')
    ? 'INELIGIBLE'
    : results.some((result) => result.outcome === 'REVIEW_REQUIRED')
      ? 'REVIEW_REQUIRED'
      : 'ELIGIBLE'

  return {
    ...evaluation,
    overallStatus,
    results,
    summary: {
      total: results.length,
      met: results.filter((result) => result.outcome === 'MET').length,
      notMet: results.filter((result) => result.outcome === 'NOT_MET').length,
      reviewRequired: results.filter((result) => result.outcome === 'REVIEW_REQUIRED').length,
      blocking: results.filter((result) => result.blocking).length,
    },
  }
}

export function manualEligibilityPayload(evaluation, decisions = {}) {
  return (evaluation?.results ?? [])
    .filter((result) => result.fieldName === 'MANUAL_REVIEW')
    .map((result) => ({ criterionId: result.criterionId, ...decisions[result.criterionId] }))
    .filter((decision) => typeof decision.passed === 'boolean' && decision.remarks?.trim().length >= 5)
    .map((decision) => ({ ...decision, remarks: decision.remarks.trim() }))
}

export function eligibilityApprovalBlockers(evaluation, unacceptedDocumentTypes = []) {
  const blockers = unacceptedDocumentTypes.length > 0
    ? [`Accept all required documents: ${unacceptedDocumentTypes.map(humanize).join(', ')}.`]
    : []
  if (!evaluation) return [...blockers, 'Eligibility evidence is still loading.']
  if (evaluation.overallStatus === 'INELIGIBLE') {
    blockers.push('One or more mandatory eligibility criteria are not met.')
  }
  if (evaluation.overallStatus === 'REVIEW_REQUIRED') {
    blockers.push('Complete every manual eligibility decision and enter at least 5 characters of remarks.')
  }
  if (!['ELIGIBLE', 'INELIGIBLE', 'REVIEW_REQUIRED'].includes(evaluation.overallStatus)) {
    blockers.push('Eligibility evidence is unavailable. Reload the case before making a decision.')
  }
  return blockers
}

export function enrollmentReadiness({ status, evaluation, unacceptedDocumentTypes = [], canReview, loading, error }) {
  if (loading) return 'Checking review requirements…'
  if (error) return 'Review needs a refresh'
  if (status === 'APPROVED') return 'Review complete'
  if (status === 'REJECTED') return 'Review closed'
  if (status === 'NEEDS_CORRECTION') return 'Awaiting corrected submission'
  if (!['PENDING', 'FOR_VALIDATION'].includes(status)) return 'Review is not active'
  if (!canReview) return 'Another reviewer required'
  if (status === 'PENDING') return 'Ready to start validation'
  if (unacceptedDocumentTypes.length) return 'Documents incomplete'
  if (evaluation?.overallStatus === 'INELIGIBLE') return 'Eligibility requirement not met'
  if (evaluation?.overallStatus !== 'ELIGIBLE') return 'Eligibility review pending'
  return 'Ready for decision'
}

function humanize(value = '') {
  return value.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase())
}
