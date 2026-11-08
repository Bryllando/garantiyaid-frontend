import test from 'node:test'
import assert from 'node:assert/strict'
import { programDocumentLabel, missingProgramDocuments, programDocumentRequirements } from '../src/utils/programDocuments.js'

test('named Other documents appear in requirements without changing legacy document labels', () => {
  assert.equal(programDocumentLabel('OTHER', { otherRequiredDocumentName: ' Request letter ' }), 'Other — Request letter')
  assert.equal(programDocumentLabel('OTHER', {}), 'Other')
  assert.equal(programDocumentLabel('OTHER'), 'Other')
  assert.equal(programDocumentLabel('VALID_ID', { otherRequiredDocumentName: 'Request letter' }), 'Valid Id')
})

test('Other requirements remain separate and require matching document names and review status', () => {
  const program = { requiredDocumentTypes: ['VALID_ID', 'OTHER'], otherRequiredDocumentNames: ['Request letter', 'Certificate of indigency'] }
  assert.equal(programDocumentRequirements(program).length, 3)
  const docs = [{ documentType: 'VALID_ID', reviewStatus: 'ACCEPTED' }, { documentType: 'OTHER', documentName: ' request LETTER ', reviewStatus: 'ACCEPTED' }]
  assert.deepEqual(missingProgramDocuments(program, docs, ['ACCEPTED']).map(item => item.documentName), ['Certificate of indigency'])
  docs.push({ documentType: 'OTHER', documentName: 'Certificate of indigency', reviewStatus: 'SUBMITTED' })
  assert.equal(missingProgramDocuments(program, docs, ['ACCEPTED']).length, 1)
  assert.equal(missingProgramDocuments(program, docs, ['SUBMITTED', 'ACCEPTED']).length, 0)
})
