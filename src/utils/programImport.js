import { tableFromSheet, readStaffImportFile } from './staffImport.js'
import { importBirthDate as importDate } from './beneficiaryImport.js'

export const PROGRAM_IMPORT_FIELDS = [
  ['programName', 'Program name', true], ['programCode', 'Program code', true], ['programType', 'Program type', true],
  ['description', 'Description'], ['grantAmount', 'Grant amount'], ['budgetAmount', 'Budget amount'],
  ['applicationStartDate', 'Application start date'], ['applicationEndDate', 'Application end date'],
  ['requiredDocumentTypes', 'Required documents'],
]
export const PROGRAM_DOCUMENT_TYPES = ['VALID_ID', 'BIRTH_CERTIFICATE', 'BARANGAY_CERTIFICATE', 'PROOF_OF_RESIDENCY', 'MEDICAL_CERTIFICATE', 'PWD_ID', 'SENIOR_CITIZEN_ID', 'OTHER']
const key = value => String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]/g, '')
const aliases = {
  programName: ['programname', 'name', 'assistanceprogram'], programCode: ['programcode', 'code'],
  programType: ['programtype', 'type', 'category'], description: ['description', 'programdescription'],
  grantAmount: ['grantamount', 'grant', 'amountperbeneficiary'], budgetAmount: ['budgetamount', 'budget', 'totalbudget'],
  applicationStartDate: ['applicationstartdate', 'startdate'], applicationEndDate: ['applicationenddate', 'enddate'],
  requiredDocumentTypes: ['requireddocuments', 'requireddocumenttypes', 'documents', 'documentrequirements'],
}
export const readProgramImportFile = file => readStaffImportFile(file, { label: 'program' })
export const programTableFromSheet = data => tableFromSheet(data, { label: 'programs', maxCellLength: 5000 })
export const suggestProgramColumns = headers => Object.fromEntries(PROGRAM_IMPORT_FIELDS.map(([field]) => [field, String(headers.findIndex(header => aliases[field].includes(key(header))))]))
const splitDocuments = value => String(value ?? '').split(/[;|,]/).map(item => item.trim()).filter(Boolean)
export function sourceDocumentTypes(table, column) {
  return [...new Set(table.rows.flatMap(row => splitDocuments(row.values[Number(column)])))].sort()
}
export function suggestProgramDocument(value) {
  return PROGRAM_DOCUMENT_TYPES.find(type => key(type) === key(value)) ?? ''
}
export function mapProgramImportRows(table, columns, { dateFormat = 'YMD', documents = {} } = {}) {
  const selected = PROGRAM_IMPORT_FIELDS.map(([field]) => Number(columns[field])).filter(column => column >= 0)
  if (new Set(selected).size !== selected.length) throw new Error('Use each source column only once.')
  for (const [field, label, required] of PROGRAM_IMPORT_FIELDS) if (required && !(Number(columns[field]) >= 0)) throw new Error(`Choose the ${label.toLowerCase()} column.`)
  return table.rows.map(row => {
    const record = Object.fromEntries(PROGRAM_IMPORT_FIELDS.map(([field]) => [field, row.values[Number(columns[field])] ?? '']))
    record.programType = record.programType.toUpperCase().replace(/[ -]+/g, '_')
    record.applicationStartDate = importDate(record.applicationStartDate, dateFormat)
    record.applicationEndDate = importDate(record.applicationEndDate, dateFormat)
    record.requiredDocumentTypes = [...new Set(splitDocuments(record.requiredDocumentTypes).map(source => {
      if (!PROGRAM_DOCUMENT_TYPES.includes(documents[source])) throw new Error(`Row ${row.sourceRow}: match the document requirement “${source}”.`)
      return documents[source]
    }))]
    return { sourceRow: row.sourceRow, ...record }
  })
}
export function programCorrectionsCsv(rows) {
  return [['Source row', ...PROGRAM_IMPORT_FIELDS.map(([, label]) => label), 'Corrections'], ...rows.map(row => [row.sourceRow,
    ...PROGRAM_IMPORT_FIELDS.map(([field]) => field === 'requiredDocumentTypes' ? (row.record[field] ?? []).join('; ') : field.includes('Date') ? row.record[field]?.slice(0, 10) ?? '' : row.record[field] ?? ''), row.issues.join(' ')])]
}
