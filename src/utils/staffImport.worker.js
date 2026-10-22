import { STAFF_IMPORT_LIMIT } from './staffImportLimits.js'

self.onmessage = async ({ data: file }) => {
  try {
    let sheets
    if (/\.csv$/i.test(file.name)) {
      const { default: Papa } = await import('papaparse')
      const result = Papa.parse(await file.text(), { dynamicTyping: false })
      if (result.errors.some(error => error.code !== 'UndetectableDelimiter')) throw new Error('The CSV has invalid quotes or separators. Export it again as CSV.')
      sheets = [{ sheet: 'Imported list', data: result.data }]
    } else {
      const { default: readXlsxFile } = await import('read-excel-file/web-worker')
      sheets = await readXlsxFile(file, { parseNumber: value => value })
    }
    if (!sheets.length || sheets.length > 20) throw new Error('Use a workbook with 1 to 20 worksheets.')
    // Keep oversized worksheets out of the UI without silently importing a truncated list.
    self.postMessage({ sheets: sheets.map(({ sheet, data }) => {
      const nonEmpty = data.filter(row => row.some(value => value !== null && String(value).trim() !== ''))
      return nonEmpty.length > STAFF_IMPORT_LIMIT + 1 || data.length > 100_000 ? { sheet, tooLarge: true } : { sheet, data }
    }) })
  } catch (error) {
    self.postMessage({ error: error.message || 'The file could not be read. Export a CSV or .xlsx list and try again.' })
  }
}
