import test from 'node:test'
import assert from 'node:assert/strict'
import Papa from 'papaparse'
import readXlsxFile from 'read-excel-file/node'
import { fileURLToPath } from 'node:url'
import { IMPORT_TEMPLATE_TITLES, STAFF_IMPORT_FIELDS, importTemplateRows, suggestStaffColumns, tableFromSheet } from '../src/utils/staffImport.js'
import { BENEFICIARY_IMPORT_FIELDS, beneficiaryTableFromSheet, suggestBeneficiaryColumns } from '../src/utils/beneficiaryImport.js'
import { BARANGAY_IMPORT_FIELDS, barangayTableFromSheet, mapBarangayImportRows, suggestBarangayColumns } from '../src/utils/barangayImport.js'
import { previewBarangayImport, confirmBarangayImport } from '../src/auth/staffAuth.js'
import { PROGRAM_IMPORT_FIELDS, programTableFromSheet, suggestProgramColumns } from '../src/utils/programImport.js'
import { IMPORT_TEMPLATE_DATA, IMPORT_TEMPLATE_INSTRUCTIONS, importTemplateGuides, templateHeading, templateFileName } from '../src/utils/importTemplateGuides.js'

test('guided CSV templates skip examples and preserve actual physical source row numbers', () => {
  for (const [label, fields, read, suggest] of [
    ['staff', STAFF_IMPORT_FIELDS, tableFromSheet, suggestStaffColumns],
    ['beneficiaries', BENEFICIARY_IMPORT_FIELDS, beneficiaryTableFromSheet, suggestBeneficiaryColumns],
    ['barangays', BARANGAY_IMPORT_FIELDS, barangayTableFromSheet, suggestBarangayColumns],
    ['programs', PROGRAM_IMPORT_FIELDS, programTableFromSheet, suggestProgramColumns],
  ]) {
    const template = importTemplateRows(label, fields)
    assert.equal(template[0][0], IMPORT_TEMPLATE_TITLES[label])
    assert.equal(template.length, 5)
    assert.equal(template[0].length, fields.length)
    assert.throws(() => read(template), /details below/)
    const data = Papa.parse(Papa.unparse([...template, fields.map(() => '00123'), [], fields.map(() => 'José, María')]), { dynamicTyping: false }).data
    const table = read(data)
    assert.deepEqual(table.rows.map(row => row.sourceRow), [6, 8])
    assert.equal(table.rows[0].values[0], '00123')
    assert.equal(table.rows[1].values[0], 'José, María')
    assert.deepEqual(suggest(table.headers), Object.fromEntries(fields.map(([field], index) => [field, String(index)])))
    const legacy = read([fields.map(([, heading]) => heading), fields.map(() => 'Legacy')])
    assert.equal(legacy.rows[0].sourceRow, 2)
    const oldTitle = read([[IMPORT_TEMPLATE_TITLES[label]], ...[fields.map(([, heading]) => heading), fields.map(() => 'Legacy')]])
    assert.equal(oldTitle.rows[0].sourceRow, 3)
  }
})

test('guide boundaries cannot silently turn examples into records', () => {
  const template = importTemplateRows('staff', STAFF_IMPORT_FIELDS)
  const broken = template.map(row => [...row]); broken[4][0] = 'Actual staff name'
  assert.throws(() => tableFromSheet(broken), /format and example row/)
  assert.throws(() => tableFromSheet([...template.slice(0, 4), ['Actual staff', 'staff@example.com']]), /format and example row/)
  assert.throws(() => tableFromSheet([[`${IMPORT_TEMPLATE_TITLES.staff} - Column guide`], ['Column', 'Example'], ['Name', 'Maria']]), /Data worksheet/)
  assert.throws(() => programTableFromSheet(template), /different import/)
  const workbookRows = [[IMPORT_TEMPLATE_TITLES.staff], [IMPORT_TEMPLATE_INSTRUCTIONS], ['Read Guide first.'], [IMPORT_TEMPLATE_DATA], STAFF_IMPORT_FIELDS.map(([, label]) => label), ['Maria', 'maria@example.com', 'DSWD Staff']]
  assert.equal(tableFromSheet(workbookRows).rows[0].sourceRow, 6)
  const oldCsv = [[IMPORT_TEMPLATE_TITLES.staff], [IMPORT_TEMPLATE_INSTRUCTIONS], ['Old CSV instructions'], ['Name', 'Email'], ['Required', 'Required'], ['Example', 'example@example.com'], [IMPORT_TEMPLATE_DATA], ['Name', 'Email'], ['Actual staff', 'staff@example.com']]
  assert.equal(tableFromSheet(oldCsv).rows[0].sourceRow, 9)
  const missingMarker = oldCsv.map(row => [...row]); missingMarker[6][0] = 'Changed section'
  assert.throws(() => tableFromSheet(missingMarker), /data-entry section/)
  assert.equal(tableFromSheet([...template, ...Array.from({ length: 5000 }, () => ['Actual staff'])]).rows.length, 5000)
  assert.throws(() => tableFromSheet([...template, ...Array.from({ length: 5001 }, () => ['Actual staff'])]), /5,000/)
})

test('all downloadable Excel templates have a blank Data sheet and a complete separate Guide', async () => {
  for (const [label, fields, includeProgram, read] of [
    ['staff', STAFF_IMPORT_FIELDS, false, tableFromSheet],
    ['beneficiaries', BENEFICIARY_IMPORT_FIELDS.filter(([field]) => field !== 'programId'), false, beneficiaryTableFromSheet],
    ['beneficiaries', BENEFICIARY_IMPORT_FIELDS, true, beneficiaryTableFromSheet],
    ['programs', PROGRAM_IMPORT_FIELDS, false, programTableFromSheet],
    ['barangays', BARANGAY_IMPORT_FIELDS, false, barangayTableFromSheet],
  ]) {
    const file = fileURLToPath(new URL(`../public/import-templates/${templateFileName(label, includeProgram)}`, import.meta.url))
    const sheets = await readXlsxFile(file, { parseNumber: value => value })
    assert.deepEqual(sheets.map(item => item.sheet), ['Data', 'Guide'])
    assert.deepEqual(sheets[0].data[3], fields.map(templateHeading))
    assert.throws(() => read(sheets[0].data), /details below/)
    assert.throws(() => read(sheets[1].data), /Data worksheet/)
    assert.equal(sheets[1].data.slice(4).length, fields.length)
    assert.deepEqual(sheets[1].data.slice(4).map(row => row[3]), fields.map(([, heading]) => {
      const example = importTemplateGuides[label].find(([name]) => name === heading)[2]
      return example ? (/^\d+(\.\d+)?$/.test(example) ? `e.g. ${example}` : example) : 'Leave blank if unavailable'
    }))
    const completed = sheets[0].data.slice(0, 5)
    completed.push(fields.map(() => '00123'))
    const table = read(completed)
    assert.equal(table.rows.length, 1)
    assert.equal(table.rows[0].sourceRow, 6)
    assert.equal(table.rows[0].values[0], '00123')
  }
})

test('titles do not hide data or bypass the record limits', () => {
  const rows = Array.from({ length: 5000 }, () => ['Staff'])
  assert.equal(tableFromSheet([[IMPORT_TEMPLATE_TITLES.staff], ['Name'], ...rows]).rows.length, 5000)
  assert.throws(() => tableFromSheet([[IMPORT_TEMPLATE_TITLES.staff], ['Name'], ...rows, ['Extra']]), /5,000/)
  assert.throws(() => tableFromSheet([[IMPORT_TEMPLATE_TITLES.staff, 'Unexpected data'], ['Name'], ['Person']]), /title on its own row/)
  assert.throws(() => barangayTableFromSheet([['Barangay'], ...Array.from({ length: 501 }, () => ['Place'])]), /500 barangays/)
})

test('barangay mapping preserves code zeroes and requires unique, complete column assignments', () => {
  const table = barangayTableFromSheet([['Barangay', 'PSGC code', 'Municipality', 'Province'], ['San Nicolas', '00123', 'Cebu City', 'Cebu']])
  const columns = suggestBarangayColumns(table.headers)
  assert.deepEqual(mapBarangayImportRows(table, columns)[0], { sourceRow: 2, barangayName: 'San Nicolas', barangayCode: '00123', city: 'Cebu City', province: 'Cebu' })
  assert.throws(() => mapBarangayImportRows(table, { ...columns, province: '-1' }), /province column/)
  assert.throws(() => mapBarangayImportRows(table, { ...columns, province: '2' }), /only once/)
  assert.throws(() => mapBarangayImportRows(table, { ...columns, city: 'NaN' }), /city/)
  assert.equal(mapBarangayImportRows(table, { ...columns, barangayCode: '-1' })[0].barangayCode, '')
})

test('barangay API retries preserve reviewed rows and the original idempotency key', async t => {
  const calls = []
  const rows = [{ sourceRow: 3, barangayName: 'Test', barangayCode: '', city: 'City', province: 'Province' }]
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({ url, ...options })
    return { ok: true, json: async () => ({ data: url.endsWith('/preview') ? { rows, invalidCount: 0 } : { importId: 'review-id', createdCount: 1, barangays: [{ sourceRow: 3, barangay: { barangayId: 'new-id' } }] } }) }
  })
  await previewBarangayImport('test-token', rows)
  await confirmBarangayImport('test-token', rows, 'review-id')
  await confirmBarangayImport('test-token', rows, 'review-id')
  assert.equal(calls[1].headers['Idempotency-Key'], 'review-id')
  assert.equal(calls[1].body, calls[2].body)
  assert.deepEqual(JSON.parse(calls[1].body), { rows, approvalId: 'review-id', confirmed: true })
})
