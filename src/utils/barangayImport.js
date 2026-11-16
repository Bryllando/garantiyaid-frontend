import { tableFromSheet } from './staffImport.js'

export const BARANGAY_IMPORT_LIMIT = 500
export const BARANGAY_IMPORT_FIELDS = [
  ['barangayName', 'Barangay name', true], ['barangayCode', 'Barangay code'],
  ['city', 'City / Municipality', true], ['province', 'Province', true],
  ['serviceAreas', 'Sitios / Puroks'],
]
export { barangayTemplateGuide } from './importTemplateGuides.js'
const aliases = { barangayName: ['barangayname', 'barangay', 'name'], barangayCode: ['barangaycode', 'code', 'psgc', 'psgccode'], city: ['citymunicipality', 'city', 'municipality', 'cityormunicipality'], province: ['province', 'provincename'], serviceAreas: ['serviceareas', 'sitiospuroks', 'sitios', 'puroks', 'sitiopurok'] }
const key = value => String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]/g, '')
export const barangayTableFromSheet = data => tableFromSheet(data, { label: 'barangays', maxRows: BARANGAY_IMPORT_LIMIT, maxCellLength: 24_200 })
export const suggestBarangayColumns = headers => Object.fromEntries(BARANGAY_IMPORT_FIELDS.map(([field]) => [field, String(headers.findIndex(header => aliases[field].includes(key(header))))]))

export function mapBarangayImportRows(table, columns) {
  const indices = BARANGAY_IMPORT_FIELDS.map(([field]) => Number(columns[field] ?? -1)).filter(index => index >= 0)
  if (new Set(indices).size !== indices.length) throw new Error('Use each source column only once.')
  for (const [field, label, required] of BARANGAY_IMPORT_FIELDS) {
    const index = Number(columns[field] ?? -1)
    if (!Number.isInteger(index) || index < -1 || index >= table.headers.length || (required && index < 0)) throw new Error(`Choose the ${label.toLowerCase()} column.`)
  }
  return table.rows.map(row => ({ sourceRow: row.sourceRow,
    ...Object.fromEntries(BARANGAY_IMPORT_FIELDS.filter(([field]) => field !== 'serviceAreas').map(([field]) => [field, row.values[Number(columns[field] ?? -1)] ?? ''])),
    ...(Number(columns.serviceAreas ?? -1) >= 0 ? { serviceAreas: (row.values[Number(columns.serviceAreas)] ?? '').split(/[|;\r\n]+/).map(value => value.trim()).filter(Boolean) } : {}),
  }))
}

export const barangayCorrectionsCsv = rows => [['Source row', ...BARANGAY_IMPORT_FIELDS.map(([, label]) => label), 'Corrections'], ...rows.map(row => [row.sourceRow, ...BARANGAY_IMPORT_FIELDS.map(([field]) => Array.isArray(row.record[field]) ? row.record[field].join(' | ') : row.record[field] ?? ''), row.issues.join(' ')])]
