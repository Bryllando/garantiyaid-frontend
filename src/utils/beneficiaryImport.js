import { tableFromSheet, readStaffImportFile } from './staffImport.js'

export const BENEFICIARY_IMPORT_FIELDS = [
  ['firstName', 'First name', true], ['middleName', 'Middle name'], ['lastName', 'Last name', true],
  ['birthDate', 'Birth date', true], ['sex', 'Sex', true], ['address', 'Address', true],
  ['sitioPurok', 'Sitio / Purok'], ['barangayId', 'Barangay'], ['contactNumber', 'Mobile number'],
  ['email', 'Email'], ['philsysNumber', 'PhilSys number'], ['programId', 'Assistance program'],
]
const key = value => String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]/g, '')
const aliases = {
  firstName: ['firstname', 'givenname'], middleName: ['middlename'], lastName: ['lastname', 'surname', 'familyname'],
  birthDate: ['birthdate', 'dateofbirth', 'dob', 'birthday'], sex: ['sex', 'gender'],
  address: ['address', 'completeaddress', 'homeaddress'], sitioPurok: ['sitiopurok', 'sitio', 'purok'],
  barangayId: ['barangay', 'barangayname', 'barangaycode', 'barangayid'],
  contactNumber: ['mobilenumber', 'contactnumber', 'phone', 'mobile', 'phonenumber'],
  email: ['email', 'emailaddress'], philsysNumber: ['philsysnumber', 'philsys', 'nationalidnumber'],
  programId: ['assistanceprogram', 'program', 'programname', 'programcode', 'programid'],
}
export const readBeneficiaryImportFile = file => readStaffImportFile(file, { label: 'beneficiary' })
export const beneficiaryTableFromSheet = data => tableFromSheet(data, { label: 'beneficiaries', maxCellLength: 2000 })
export const suggestBeneficiaryColumns = headers => Object.fromEntries(BENEFICIARY_IMPORT_FIELDS.map(([field]) => [field, String(headers.findIndex(header => aliases[field].includes(key(header))))]))
export function suggestImportProgram(value, programs) {
  const normalized = String(value ?? '').trim().toLowerCase()
  if (!normalized) return ''
  const matches = programs.filter(program => [program.programId, program.programCode, program.programName].some(candidate => candidate?.trim().toLowerCase() === normalized))
  return matches.length === 1 ? matches[0].programId : ''
}
export function importBirthDate(value, format = 'YMD') {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  if (format === 'YMD') return value
  const match = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(value)
  if (!match) return value
  const [, a, b, year] = match
  return `${year}-${(format === 'MDY' ? a : b).padStart(2, '0')}-${(format === 'MDY' ? b : a).padStart(2, '0')}`
}
export function mapBeneficiaryImportRows(table, columns, { barangays = {}, defaultBarangay = '', assignedBarangay = '', dateFormat = 'YMD', includeProgram = false, programs = {}, defaultProgram = '' } = {}) {
  const fields = BENEFICIARY_IMPORT_FIELDS.filter(([field]) => (includeProgram || field !== 'programId'))
  const selected = fields.map(([field]) => columns[field]).filter(column => Number(column) >= 0)
  if (new Set(selected).size !== selected.length) throw new Error('Use each source column only once.')
  for (const [field, label, required] of fields) if (required && Number(columns[field]) < 0) throw new Error(`Choose the ${label.toLowerCase()} column. Names must be in separate first, middle and last name columns.`)
  return table.rows.map(row => {
    const value = field => row.values[Number(columns[field])] ?? ''
    const mappedBarangay = Number(columns.barangayId) < 0 ? defaultBarangay : barangays[value('barangayId')] ?? ''
    if (assignedBarangay && Number(columns.barangayId) >= 0 && mappedBarangay !== assignedBarangay) throw new Error(`Row ${row.sourceRow}: confirm that the file's barangay matches your assigned barangay.`)
    const record = Object.fromEntries(fields.filter(([field]) => !['barangayId', 'programId'].includes(field)).map(([field]) => [field, value(field)]))
    record.birthDate = importBirthDate(record.birthDate, dateFormat)
    record.sex = ({ m: 'MALE', male: 'MALE', f: 'FEMALE', female: 'FEMALE', other: 'OTHER', unknown: 'UNKNOWN' })[record.sex.toLowerCase()] ?? record.sex
    record.barangayId = assignedBarangay || mappedBarangay
    if (includeProgram) {
      record.programId = Number(columns.programId) < 0 ? defaultProgram : programs[value('programId')] ?? ''
      if (!record.programId) throw new Error(`Row ${row.sourceRow}: select the assistance program, or choose records only.`)
    }
    return { sourceRow: row.sourceRow, ...record }
  })
}

export function beneficiaryCorrectionsCsv(rows) {
  return [['Source row', ...BENEFICIARY_IMPORT_FIELDS.map(([, label]) => label), 'Corrections'], ...rows.map(row => [row.sourceRow,
    ...BENEFICIARY_IMPORT_FIELDS.map(([field]) => field === 'programId' ? row.programLabel ?? row.programId ?? '' : field === 'barangayId' ? row.barangayLabel ?? row.record.barangayId ?? '' : field === 'birthDate' ? row.record.birthDate?.slice(0, 10) ?? '' : row.record[field] ?? ''), row.issues.join(' ')])]
}
