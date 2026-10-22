import test from 'node:test'
import assert from 'node:assert/strict'
import { mapStaffImportRows, tableFromSheet, suggestStaffBarangay, suggestStaffColumns, suggestStaffRole } from '../src/utils/staffImport.js'
import { previewStaffImport, confirmStaffImport } from '../src/auth/staffAuth.js'

test('column mapping preserves names, phone zeroes and source row numbers without inventing missing data', () => {
  const table = tableFromSheet([['Employee Name', 'Work Email', 'Mobile', 'Position', 'Barangay name', 'Login name'], ['Garcia, Ana', 'ana@example.test', '09171234567', 'Local officer', 'Poblacion', 'ana.staff'], [], ['José Santos', 'jose@example.test', '', 'Social worker', '', '']])
  const columns = suggestStaffColumns(table.headers)
  const rows = mapStaffImportRows(table, columns, { roles: { 'Local officer': 'BARANGAY_FACILITATOR', 'Social worker': 'DSWD_STAFF' }, barangays: { Poblacion: 'barangay-1' } })
  assert.equal(rows[0].fullName, 'Garcia, Ana')
  assert.equal(rows[0].contactNumber, '09171234567')
  assert.equal(rows[0].barangayId, 'barangay-1')
  assert.equal(rows[1].sourceRow, 4)
  assert.equal(rows[1].username, undefined)
  assert.equal(rows[1].barangayId, undefined)
  assert.equal(suggestStaffRole('SYSTEM_ADMIN'), '')
  assert.equal(suggestStaffRole('Social worker'), '')
  assert.equal(suggestStaffRole('DSWD_STAFF'), 'DSWD_STAFF')
})

test('file shape checks reject empty, oversized, duplicate and unheaded data without truncation', () => {
  for (const data of [[], [['Name']], [['Email', 'email'], ['one', 'two']], [['Name'], ['one', 'extra']], [['Name'], ...Array.from({ length: 5001 }, () => ['Staff'])]]) assert.throws(() => tableFromSheet(data))
  assert.equal(tableFromSheet([['Name'], ...Array.from({ length: 5000 }, (_, i) => [`Staff ${i}`])]).rows.length, 5000)
  const table = tableFromSheet([['Name', 'Email'], ['Staff', 'staff@example.test']])
  assert.throws(() => mapStaffImportRows(table, { ...suggestStaffColumns(table.headers), email: '0' }), /only once/)
  assert.throws(() => mapStaffImportRows(table, { ...suggestStaffColumns(table.headers), email: '-1' }), /email column/)
})

test('barangay suggestions require an unambiguous match and default roles must be chosen', () => {
  const barangays = [{ barangayId: 'one', barangayName: 'Poblacion', city: 'City A' }, { barangayId: 'two', barangayName: 'Poblacion', city: 'City B' }]
  assert.equal(suggestStaffBarangay('Poblacion', barangays), '')
  assert.equal(suggestStaffBarangay('Poblacion, City B', barangays), 'two')
  assert.equal(suggestStaffBarangay('', barangays), '')
  const table = tableFromSheet([['Name', 'Email'], ['Staff', 'staff@example.test']])
  assert.equal(mapStaffImportRows(table, suggestStaffColumns(table.headers))[0].role, '')
})

test('API confirmation preserves the reviewed rows and approval key for safe retries', async t => {
  const calls = []
  const rows = [{ sourceRow: 2, fullName: 'Test', email: 'test@example.test', role: 'DSWD_STAFF' }]
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({ url, ...options })
    return { ok: true, json: async () => ({ data: url.endsWith('/preview') ? { rows, invalidCount: 0, approvalId: 'review-id' } : { accounts: [{ user: { employeeId: 'DSWD-0001' }, temporaryPassword: 'fixture-only' }] } }) }
  })
  await previewStaffImport('test-token', rows)
  await confirmStaffImport('test-token', rows, 'review-id')
  await confirmStaffImport('test-token', rows, 'review-id')
  assert.equal(calls[1].headers['Idempotency-Key'], 'review-id')
  assert.deepEqual(JSON.parse(calls[1].body), { rows, approvalId: 'review-id', confirmed: true })
  assert.equal(calls[1].body, calls[2].body)
  assert.equal(calls[1].headers.Authorization, 'Bearer test-token')
})
