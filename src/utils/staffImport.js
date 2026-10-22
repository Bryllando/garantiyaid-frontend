import { STAFF_IMPORT_LIMIT, STAFF_IMPORT_FILE_LIMIT_MB } from './staffImportLimits.js'
export { STAFF_IMPORT_LIMIT, STAFF_IMPORT_FILE_LIMIT_MB } from './staffImportLimits.js'
export const STAFF_IMPORT_FIELDS = [
  ['fullName', 'Full name', true], ['email', 'Email', true], ['role', 'Role'],
  ['username', 'Username'], ['contactNumber', 'Contact number'], ['barangayId', 'Barangay'],
]
const key = value => String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]/g, '')
const aliases = {
  fullName: ['fullname', 'name', 'employeename', 'staffname'], email: ['email', 'emailaddress', 'workemail'],
  role: ['role', 'staffrole', 'stafftype', 'accounttype', 'position'], username: ['username', 'loginname'],
  contactNumber: ['contactnumber', 'mobile', 'mobilenumber', 'phone', 'phonenumber'],
  barangayId: ['barangay', 'barangayname', 'barangaycode', 'barangayid', 'assignedbarangay'],
}

export function tableFromSheet(data, { label = "staff", maxCellLength = 300 } = {}) {
  const cell = value => value instanceof Date ? value.toISOString().slice(0, 10) : String(value ?? "").trim()
  if (!data?.length) throw new Error('This worksheet is empty.')
  const headers = data[0].map(value => String(value ?? '').trim())
  if (headers.length > 40) throw new Error(`Use a ${label} list with no more than 40 columns.`)
  if (headers.some(header => !header) || new Set(headers.map(key)).size !== headers.length) throw new Error('Give each column a unique heading in the first row.')
  const rows = data.slice(1).map((values, index) => ({ sourceRow: index + 2, values: values.map(value => cell(value)) }))
    .filter(row => row.values.some(Boolean))
  if (!rows.length) throw new Error(`Add ${label} details below the column headings before importing.`)
  if (rows.length > STAFF_IMPORT_LIMIT) throw new Error(`Import up to ${STAFF_IMPORT_LIMIT.toLocaleString('en-US')} ${label} per file. Split larger lists into smaller files.`)
  if (rows.some(row => row.values.slice(headers.length).some(Boolean))) throw new Error('Some rows contain values without a column heading. Check the file.')
  if (rows.some(row => row.values.some(value => value.length > maxCellLength))) throw new Error(`A cell exceeds ${maxCellLength} characters. Use a ${label} list without long notes or documents.`)
  return { headers, rows }
}

export function suggestStaffColumns(headers) {
  return Object.fromEntries(STAFF_IMPORT_FIELDS.map(([field]) => [field, String(headers.findIndex(header => aliases[field].includes(key(header))))]))
}

export function suggestStaffRole(value) {
  return { dswd: 'DSWD_STAFF', dswdstaff: 'DSWD_STAFF', barangayfacilitator: 'BARANGAY_FACILITATOR', barangaystaff: 'BARANGAY_FACILITATOR' }[key(value)] ?? ''
}

export function suggestStaffBarangay(value, barangays) {
  const normalized = String(value ?? '').trim().toLowerCase()
  if (!normalized) return ''
  const matches = barangays.filter(barangay => [barangay.barangayId, barangay.barangayCode, barangay.barangayName, `${barangay.barangayName}, ${barangay.city}`].some(candidate => candidate?.trim().toLowerCase() === normalized))
  return matches.length === 1 ? matches[0].barangayId : ''
}

export function columnValues(table, column) {
  if (Number(column) < 0) return []
  return [...new Set(table.rows.map(row => row.values[Number(column)] ?? ''))]
}

export function mapStaffImportRows(table, columns, { roles = {}, barangays = {}, defaultRole = '', defaultBarangay = '' } = {}) {
  const selected = Object.values(columns).filter(column => Number(column) >= 0)
  if (new Set(selected).size !== selected.length) throw new Error('Use each source column only once.')
  for (const [field, label, required] of STAFF_IMPORT_FIELDS) if (required && Number(columns[field]) < 0) throw new Error(`Choose the ${label.toLowerCase()} column.`)
  return table.rows.map(row => {
    const value = field => row.values[Number(columns[field])] ?? ''
    const role = Number(columns.role) < 0 ? defaultRole : roles[value('role')] ?? ''
    const barangayId = Number(columns.barangayId) < 0 ? defaultBarangay : barangays[value('barangayId')] ?? ''
    return {
      sourceRow: row.sourceRow, fullName: value('fullName'), email: value('email'), role,
      ...(role === 'BARANGAY_FACILITATOR' ? { username: value('username'), barangayId } : {}),
      ...(value('contactNumber') ? { contactNumber: value('contactNumber') } : {}),
    }
  })
}

export async function downloadStaffCsv(filename, rows) {
  const { default: Papa } = await import('papaparse')
  const blob = new Blob(['\ufeff', Papa.unparse(rows, { escapeFormulae: true })], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function readStaffImportFile(file, { label = "staff" } = {}) {
  if (!/\.(csv|xlsx)$/i.test(file.name)) return Promise.reject(new Error('Choose a CSV (.csv) or Excel (.xlsx) file. Save older .xls files as .xlsx first.'))
  if (!file.size || file.size > STAFF_IMPORT_FILE_LIMIT_MB * 1024 * 1024) return Promise.reject(new Error(`Choose a non-empty file up to ${STAFF_IMPORT_FILE_LIMIT_MB} MB.`))
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./staffImport.worker.js', import.meta.url), { type: 'module' })
    const finish = (error, data) => {
      clearTimeout(timer)
      worker.terminate()
      if (error) reject(new Error(error))
      else resolve(data)
    }
    const timer = setTimeout(() => finish(`The file took too long to read. Export a smaller ${label} list and try again.`), 15_000)
    worker.onmessage = ({ data }) => finish(data.error, data.sheets)
    worker.onerror = () => finish('The file could not be read. Check its format and try again.')
    worker.postMessage(file)
  })
}
