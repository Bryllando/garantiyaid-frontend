import { copyFile, mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { IMPORT_TEMPLATE_TITLES, STAFF_IMPORT_FIELDS, importTemplateRows } from '../src/utils/staffImport.js'
import { BENEFICIARY_IMPORT_FIELDS } from '../src/utils/beneficiaryImport.js'
import { PROGRAM_IMPORT_FIELDS } from '../src/utils/programImport.js'
import { BARANGAY_IMPORT_FIELDS } from '../src/utils/barangayImport.js'
import { importTemplateGuides, importTemplateGroups, importTemplateNotes, templateFileName } from '../src/utils/importTemplateGuides.js'

// Run with the authoring runtime's Artifact Tool; the app serves the saved files without a workbook dependency.
export async function generateImportTemplates({ Workbook, SpreadsheetFile }) {
  const output = fileURLToPath(new URL('../public/import-templates/', import.meta.url))
  const previews = fileURLToPath(new URL('../artifacts/import-ui/templates/', import.meta.url))
  await mkdir(output, { recursive: true }); await mkdir(previews, { recursive: true })
  const variants = [
    ['staff', STAFF_IMPORT_FIELDS],
    ['beneficiaries', BENEFICIARY_IMPORT_FIELDS.filter(([field]) => field !== 'programId')],
    ['beneficiaries', BENEFICIARY_IMPORT_FIELDS, true],
    ['programs', PROGRAM_IMPORT_FIELDS],
    ['barangays', BARANGAY_IMPORT_FIELDS],
  ]
  const widths = { fullName: 25, email: 30, role: 26, username: 23, contactNumber: 21, barangayId: 27, firstName: 22, middleName: 20, lastName: 22, birthDate: 17, sex: 20, address: 28, sitioPurok: 20, philsysNumber: 24, programId: 28, programName: 26, programCode: 17, programType: 16, description: 28, grantAmount: 18, budgetAmount: 18, applicationStartDate: 18, applicationEndDate: 19, requiredDocumentTypes: 29, barangayName: 29, barangayCode: 26, city: 26, province: 24 }
  const header = range => { range.format = { fill: '#08274C', font: { name: 'Arial', size: 10, color: '#FFFFFF', bold: true }, wrapText: true, horizontalAlignment: 'left', verticalAlignment: 'center', rowHeight: 34, borders: { insideVertical: { style: 'thin', color: '#FFFFFF' } } } }
  for (const [label, fields, includeProgram = false] of variants) {
    const fileName = templateFileName(label, includeProgram)
    const title = IMPORT_TEMPLATE_TITLES[label]
    const workbook = Workbook.create()
    const data = workbook.worksheets.add('Data')
    const guide = workbook.worksheets.add('Guide')
    const last = String.fromCharCode(64 + fields.length)
    const lastRow = label === 'barangays' ? 505 : 5005
    data.showGridLines = false; guide.showGridLines = false
    data.tabColor = '#08274C'; guide.tabColor = '#64748B'
    data.getRange(`A1:${last}105`).format = { font: { name: 'Arial', size: 10, color: '#172B43' }, rowHeight: 24, verticalAlignment: 'center' }
    data.getRange(`A1:${last}5`).values = importTemplateRows(label, fields)
    data.getRange(`A1:${last}1`).merge()
    data.getRange('A1').format.font = { name: 'Arial', size: 14, bold: true, color: '#08274C' }
    data.getRange(`A1:${last}1`).format.rowHeight = 34
    data.getRange(`A2:${last}2`).merge()
    data.getRange(`A2:${last}2`).format = { wrapText: true, rowHeight: 26, font: { name: 'Arial', size: 10, color: '#526278' } }
    data.getRange(`A3:${last}3`).format = { fill: '#DCE6F0', font: { name: 'Arial', size: 10, bold: true, color: '#08274C' }, rowHeight: 24 }
    for (const [, start, end] of importTemplateGroups[label]) {
      if (start >= fields.length) continue
      const group = data.getRange(`${String.fromCharCode(65 + start)}3:${String.fromCharCode(65 + Math.min(end, fields.length - 1))}3`)
      group.merge()
      group.format.borders = { right: { style: 'thin', color: '#FFFFFF' } }
    }
    header(data.getRange(`A4:${last}4`))
    data.getRange(`A5:${last}5`).format = { fill: '#F3F6FA', wrapText: true, rowHeight: 42, font: { name: 'Arial', size: 10, color: '#526278' }, borders: { bottom: { style: 'thin', color: '#8FA4BD' }, insideVertical: { style: 'thin', color: '#DCE3EC' } } }
    data.getRange(`A6:${last}105`).format.borders = { preset: 'all', style: 'thin', color: '#E2E8F0' }
    for (let row = 8; row <= 104; row += 2) data.getRange(`A${row}:${last}${row}`).format.fill = '#F1F5F9'
    data.freezePanes.freezeRows(5)
    data.freezePanes.freezeColumns(1)
    for (let index = 0; index < fields.length; index++) {
      const [field] = fields[index], col = String.fromCharCode(65 + index)
      data.getRange(`${col}1:${col}105`).format.columnWidth = widths[field] || 24
      const cells = data.getRange(`${col}6:${col}${lastRow}`)
      cells.setNumberFormat(field.toLowerCase().includes('date') ? 'yyyy-mm-dd' : field.endsWith('Amount') ? '#,##0.00' : '@')
      if (field === 'role') cells.dataValidation = { rule: { type: 'list', values: ['DSWD Staff', 'Barangay Facilitator'] } }
      if (field === 'sex') cells.dataValidation = { rule: { type: 'list', values: ['MALE', 'FEMALE', 'OTHER', 'UNKNOWN'] } }
    }

    const instructions = fields.map(([, heading]) => importTemplateGuides[label].find(([name]) => name === heading))
    guide.getRange(`A1:D${instructions.length + 4}`).format = { font: { name: 'Arial', size: 10, color: '#172B43' }, verticalAlignment: 'center', rowHeight: 26 }
    guide.getRange('A1:A30').format.columnWidth = 25
    guide.getRange('B1:B30').format.columnWidth = 22
    guide.getRange('C1:C30').format.columnWidth = 65
    guide.getRange('D1:D30').format.columnWidth = 35
    guide.getRange('A1').values = [[`${title} - Column guide`]]
    guide.getRange('A1:D1').merge()
    guide.getRange('A1').format.font = { name: 'Arial', size: 14, bold: true, color: '#08274C' }
    guide.getRange('A1:D1').format.rowHeight = 34
    guide.getRange('A2:D2').merge()
    guide.getRange('A2').values = [['Fill in Data from row 6. These examples are for reference; this Guide tab is not imported.']]
    guide.getRange('A3:D3').merge()
    guide.getRange('A3').values = [[importTemplateNotes[label]]]
    guide.getRange('A2:D3').format = { wrapText: true, rowHeight: 30, font: { name: 'Arial', size: 10, color: '#526278' } }
    guide.getRange('A4:D4').values = [['Column', 'Required?', 'Format and rules', 'Example only']]
    header(guide.getRange('A4:D4'))
    guide.getRange(`D5:D${instructions.length + 4}`).setNumberFormat('@')
    guide.getRange(`A5:D${instructions.length + 4}`).values = instructions.map(([name, instruction, example], index) => {
      const [field, , required] = fields[index]
      const requirement = required ? 'Required' : label === 'staff' && ['username', 'barangayId'].includes(field) ? 'Facilitators only' : ['role', 'barangayId', 'programId'].includes(field) ? 'Fill in or select at import' : 'Optional'
      return [name, requirement, instruction.replace(/^(Required|Optional)\. /, ''), example ? (/^\d+(\.\d+)?$/.test(example) ? `e.g. ${example}` : example) : 'Leave blank if unavailable']
    })
    guide.getRange(`A5:D${instructions.length + 4}`).format = { wrapText: true, rowHeight: 42, verticalAlignment: 'center' }
    guide.getRange(`A5:A${instructions.length + 4}`).format.font.bold = true
    for (let index = 0; index < instructions.length; index++) {
      const row = index + 5
      if (index % 2 === 0) guide.getRange(`A${row}:D${row}`).format.fill = '#F1F5F9'
      if (instructions[index][1].length > 150) guide.getRange(`A${row}:D${row}`).format.rowHeight = 70
    }
    workbook.recalculate()
    const inspection = await workbook.inspect({ kind: 'table', range: `Data!A1:${last}6`, include: 'values', tableMaxRows: 6, tableMaxCols: fields.length, maxChars: 1000 })
    if (!inspection.ndjson.includes(title)) throw new Error(`Missing title in ${fileName}`)
    for (const [sheetName, range] of [['Data', `A1:${last}12`], ['Guide', `A1:D${instructions.length + 4}`]]) {
      const preview = await workbook.render({ sheetName, range, scale: 1, format: 'png' })
      await writeFile(`${previews}/${fileName.replace('.xlsx', '')}-${sheetName}.png`, new Uint8Array(await preview.arrayBuffer()))
    }
    const xlsx = await SpreadsheetFile.exportXlsx(workbook)
    await xlsx.save(`${previews}/${fileName}`)
    await copyFile(`${previews}/${fileName}`, `${output}/${fileName}`)
    console.log(`Saved ${fileName}: Data and Guide, ${fields.length} fields`)

    // Isolated browser fixtures exercise the actual workbook reader; public templates stay blank.
    const sample = instructions.map(([, , example], index) => {
      const field = fields[index][0]
      if (field.toLowerCase().includes('date') && example) return new Date(`${example}T00:00:00Z`)
      if (field.endsWith('Amount') && example) return Number(example)
      return example || ''
    })
    data.getRange(`A6:${last}6`).values = [sample]
    workbook.recalculate()
    const filled = await SpreadsheetFile.exportXlsx(workbook)
    await filled.save(`${previews}/filled-${fileName}`)
  }
}
