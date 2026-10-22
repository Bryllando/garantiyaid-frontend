import test from 'node:test'
import assert from 'node:assert/strict'
import { programTableFromSheet, suggestProgramColumns, sourceDocumentTypes, suggestProgramDocument, mapProgramImportRows, programCorrectionsCsv } from '../src/utils/programImport.js'

const headers = ['Program name', 'Code', 'Type', 'Grant', 'Budget', 'Start date', 'End date', 'Documents', 'Status']
const input = ['Medical assistance', 'MED-2026', 'Cash assistance', 'PHP 1,500.50', '15,000', '12/01/2026', '12/31/2026', 'Valid ID;Medical Certificate', 'ACTIVE']
test('maps external columns, explicit dates and required documents without importing active status', () => {
  const table = programTableFromSheet([headers, input]); const columns = suggestProgramColumns(table.headers)
  assert.deepEqual(sourceDocumentTypes(table, columns.requiredDocumentTypes), ['Medical Certificate', 'Valid ID'])
  const documents = Object.fromEntries(sourceDocumentTypes(table, columns.requiredDocumentTypes).map(value => [value, suggestProgramDocument(value)]))
  const [record] = mapProgramImportRows(table, columns, { dateFormat: 'MDY', documents })
  assert.equal(record.applicationStartDate, '2026-12-01'); assert.equal(record.applicationEndDate, '2026-12-31')
  assert.equal(record.grantAmount, 'PHP 1,500.50'); assert.equal(record.programType, 'CASH_ASSISTANCE')
  assert.deepEqual(record.requiredDocumentTypes, ['VALID_ID', 'MEDICAL_CERTIFICATE']); assert.equal(record.status, undefined)
  assert.throws(() => mapProgramImportRows(table, columns), /match the document/)
  assert.throws(() => mapProgramImportRows(table, { ...columns, programName: '-1' }), /program name column/)
  assert.throws(() => mapProgramImportRows(table, { ...columns, programCode: columns.programName }), /only once/)
  assert.equal(suggestProgramDocument('Local eligibility clearance'), '')
})
test('5,000-row worksheets keep source rows and Excel dates; 5,001 rows are rejected', () => {
  const data = [['Program name', 'Code', 'Type', 'Start date'], ...Array.from({ length: 5000 }, (_, n) => [`Program ${n}`, `AID-${n}`, 'CASH', new Date('2026-01-12T00:00:00Z')])]
  const table = programTableFromSheet(data); const rows = mapProgramImportRows(table, suggestProgramColumns(table.headers))
  assert.equal(rows.length, 5000); assert.equal(rows[4999].sourceRow, 5001); assert.equal(rows[0].applicationStartDate, '2026-01-12'); assert.deepEqual(rows[0].requiredDocumentTypes, [])
  assert.throws(() => programTableFromSheet([...data, data[1]]), /5,000/)
  const sparse = programTableFromSheet([data[0], [], data[1]]); assert.equal(sparse.rows[0].sourceRow, 3)
})
test('correction exports preserve documents, dates and descriptions for re-import', () => {
  const table = programTableFromSheet([headers, input]); const columns = suggestProgramColumns(table.headers)
  const rows = mapProgramImportRows(table, columns, { dateFormat: 'MDY', documents: { 'Valid ID': 'VALID_ID', 'Medical Certificate': 'MEDICAL_CERTIFICATE' } })
  const csv = programCorrectionsCsv([{ sourceRow: 2, record: rows[0], issues: ['Already exists'] }])
  const corrected = programTableFromSheet(csv)
  const remapped = mapProgramImportRows(corrected, suggestProgramColumns(corrected.headers), { documents: { VALID_ID: 'VALID_ID', MEDICAL_CERTIFICATE: 'MEDICAL_CERTIFICATE' } })
  assert.deepEqual(remapped[0].requiredDocumentTypes, rows[0].requiredDocumentTypes); assert.equal(remapped[0].programCode, rows[0].programCode)
})
