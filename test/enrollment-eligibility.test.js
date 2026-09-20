import test from 'node:test'
import assert from 'node:assert/strict'
import {
  applyManualEligibilityDecisions,
  eligibilityApprovalBlockers,
  manualEligibilityPayload,
} from '../src/utils/enrollmentEligibility.js'

const evaluation = {
  overallStatus: 'REVIEW_REQUIRED',
  results: [
    { criterionId: 'age', fieldName: 'AGE', outcome: 'MET', blocking: false, isRequired: true },
    { criterionId: 'manual', fieldName: 'MANUAL_REVIEW', outcome: 'REVIEW_REQUIRED', blocking: true, isRequired: true },
  ],
}

test('complete manual decisions update the review summary without re-evaluating automatic rules', () => {
  const decisions = { manual: { passed: true, remarks: 'Verified during the home visit.' } }
  const result = applyManualEligibilityDecisions(evaluation, decisions)
  assert.equal(result.overallStatus, 'ELIGIBLE')
  assert.deepEqual(result.summary, { total: 2, met: 2, notMet: 0, reviewRequired: 0, blocking: 0 })
  assert.deepEqual(manualEligibilityPayload(evaluation, decisions), [{
    criterionId: 'manual',
    passed: true,
    remarks: 'Verified during the home visit.',
  }])
})

test('incomplete rationale keeps manual review unresolved and explains approval blockers', () => {
  const result = applyManualEligibilityDecisions(evaluation, {
    manual: { passed: true, remarks: 'No' },
  })
  assert.equal(result.overallStatus, 'REVIEW_REQUIRED')
  assert.deepEqual(manualEligibilityPayload(evaluation, { manual: { passed: true, remarks: 'No' } }), [])
  assert.deepEqual(eligibilityApprovalBlockers(result, ['VALID_ID']), [
    'Accept all required documents: Valid Id.',
    'Complete every manual eligibility decision and enter at least 5 characters of remarks.',
  ])
})

test('a failed mandatory manual criterion blocks approval', () => {
  const result = applyManualEligibilityDecisions(evaluation, {
    manual: { passed: false, remarks: 'The household evidence did not match.' },
  })
  assert.equal(result.overallStatus, 'INELIGIBLE')
  assert.equal(result.results[1].blocking, true)
})
