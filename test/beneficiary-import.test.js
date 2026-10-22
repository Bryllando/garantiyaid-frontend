import test from 'node:test'
import assert from 'node:assert/strict'
import { beneficiaryTableFromSheet, suggestBeneficiaryColumns, mapBeneficiaryImportRows, importBirthDate, suggestImportProgram, beneficiaryCorrectionsCsv } from '../src/utils/beneficiaryImport.js'
import { startBeneficiaryImport } from '../src/auth/staffAuth.js'

const headers = ['First name', 'Surname', 'Date of birth', 'Gender', 'Complete address', 'Barangay', 'Mobile', 'Program']
const table = () => beneficiaryTableFromSheet([headers, ['José', 'Dela Cruz', '12/31/1990', 'M', 'Test street', 'Poblacion', '09171234567', 'AID']])

test('beneficiary mapping preserves names and phone numbers, requires explicit date and program choices', () => {
  const input = table(); const columns = suggestBeneficiaryColumns(input.headers)
  const options = { dateFormat: 'MDY', barangays: { Poblacion: 'b1' }, programs: { AID: 'p1' }, includeProgram: true }
  const [row] = mapBeneficiaryImportRows(input, columns, options)
  assert.equal(row.firstName, 'José'); assert.equal(row.lastName, 'Dela Cruz'); assert.equal(row.birthDate, '1990-12-31')
  assert.equal(row.contactNumber, '09171234567'); assert.equal(row.sex, 'MALE'); assert.equal(row.programId, 'p1')
  assert.equal(mapBeneficiaryImportRows(input, columns, { ...options, includeProgram: false })[0].programId, undefined)
  assert.throws(() => mapBeneficiaryImportRows(input, columns, { ...options, programs: {} }), /select the assistance program/)
  assert.throws(() => mapBeneficiaryImportRows(input, { ...columns, lastName: '-1' }, options), /last name column/)
  assert.throws(() => mapBeneficiaryImportRows(input, { ...columns, lastName: columns.firstName }, options), /only once/)
  assert.throws(() => mapBeneficiaryImportRows(input, columns, { ...options, assignedBarangay: 'b2' }), /assigned barangay/)
  assert.equal(importBirthDate('01/02/1990', 'YMD'), '01/02/1990')
  assert.equal(importBirthDate('01/02/1990', 'DMY'), '1990-02-01')
})

test('Excel dates, long addresses and 5,000-row files are handled without silent truncation', () => {
  const data = beneficiaryTableFromSheet([['Birth date', 'Address'], [new Date('1990-01-12T00:00:00Z'), 'a'.repeat(2000)]])
  assert.equal(data.rows[0].values[0], '1990-01-12')
  assert.equal(beneficiaryTableFromSheet([['First name'], ...Array.from({ length: 5000 }, (_, n) => [`Test ${n}`])]).rows.length, 5000)
  assert.throws(() => beneficiaryTableFromSheet([['Name'], ...Array.from({ length: 5001 }, () => ['Test'])]), /5,000 beneficiaries/)
  assert.throws(() => beneficiaryTableFromSheet([['Address'], ['a'.repeat(2001)]]), /2000 characters/)
})

test('program suggestions reject ambiguous names and corrections retain usable fields', () => {
  const programs = [{ programId: 'one', programName: 'Assistance', programCode: 'AID-1' }, { programId: 'two', programName: 'Assistance', programCode: 'AID-2' }]
  assert.equal(suggestImportProgram('Assistance', programs), '')
  assert.equal(suggestImportProgram('AID-2', programs), 'two')
  const csv = beneficiaryCorrectionsCsv([{ sourceRow: 2, record: { firstName: 'Test', birthDate: '1990-01-12T00:00:00Z', barangayId: 'b1' }, programId: 'p1', issues: ['Fix address'] }])
  assert.ok(csv[1].includes('1990-01-12')); assert.ok(csv[1].includes('p1')); assert.ok(csv[1].includes('Fix address'))
})

test('beneficiary confirmation reuses the approval key on retry', async t => {
  const calls = []
  t.mock.method(globalThis, 'fetch', async (url, options) => { calls.push({ url, ...options }); return { ok: true, json: async () => ({ data: { importId: 'review-key', status: 'QUEUED' } }) } })
  const rows = [{ sourceRow: 2, firstName: 'Test' }]
  await startBeneficiaryImport('fixture-token', rows, 'review-key'); await startBeneficiaryImport('fixture-token', rows, 'review-key')
  assert.ok(calls[0].url.endsWith('/beneficiaries/import/jobs')); assert.equal(calls[0].headers['Idempotency-Key'], 'review-key')
  assert.equal(calls[0].body, calls[1].body)
})
