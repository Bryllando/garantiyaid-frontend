import assert from 'node:assert/strict'
import test from 'node:test'
import { getBeneficiaryNextTask } from '../src/utils/beneficiaryNextTask.js'

test('beneficiary next task follows the record and document state', () => {
  const active = { status: 'ACTIVE' }
  const inactive = { status: 'INACTIVE' }
  assert.equal(getBeneficiaryNextTask(null, [], 'SYSTEM_ADMIN'), null)
  assert.equal(getBeneficiaryNextTask(active, [{ reviewStatus: 'SUBMITTED' }], 'DSWD_STAFF').action, 'Review documents')
  assert.equal(getBeneficiaryNextTask(active, [{ reviewStatus: 'REJECTED' }], 'BARANGAY_FACILITATOR').action, 'Open documents')
  assert.equal(getBeneficiaryNextTask(inactive, [], 'SYSTEM_ADMIN').action, 'View record details')
  assert.equal(getBeneficiaryNextTask(active, [], 'SYSTEM_ADMIN').action, 'Check program requirements')
  assert.equal(getBeneficiaryNextTask(active, [], 'DSWD_STAFF'), null)
})
