import { formatReportDate } from './reportPresentation.js'
import { philippineDate } from './philippineDate.js'

let assetsPromise
async function pdfAssets() {
  if (!assetsPromise) assetsPromise = Promise.all([
    '/fonts/NotoSans-Regular.ttf', '/fonts/NotoSans-Bold.ttf', '/GarantiyAid-logo.png',
  ].map(async path => {
    const response = await fetch(path)
    if (!response.ok) throw new Error('A PDF font or logo could not be loaded. Try the download again.')
    return new Uint8Array(await response.arrayBuffer())
  })).catch(error => { assetsPromise = null; throw error })
  return assetsPromise
}

function base64(bytes) {
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += 32768) binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768))
  return btoa(binary)
}

export async function createReportPdf(document) {
  const [{ jsPDF }, [regular, bold, logo]] = await Promise.all([import('jspdf'), pdfAssets()])
  const pdf = new jsPDF({ format: 'a4', unit: 'mm', compress: true, putOnlyUsedFonts: true })
  pdf.addFileToVFS('NotoSans-Regular.ttf', base64(regular))
  pdf.addFont('NotoSans-Regular.ttf', 'NotoSans', 'normal')
  pdf.addFileToVFS('NotoSans-Bold.ttf', base64(bold))
  pdf.addFont('NotoSans-Bold.ttf', 'NotoSans', 'bold')
  pdf.setProperties({ title: `GarantiyAid ${document.title}`, author: 'GarantiyAid', subject: 'Authorized operational review', creator: 'GarantiyAid reports' })
  const margin = 14
  const logoInfo = pdf.getImageProperties(logo)
  let y = 14
  let orientation = 'portrait'
  const pageWidth = () => pdf.internal.pageSize.getWidth()
  const bottom = () => pdf.internal.pageSize.getHeight() - 22
  const width = () => pageWidth() - margin * 2
  function font(size = 9, weight = 'normal', color = [38, 57, 79]) {
    pdf.setFont('NotoSans', weight).setFontSize(size).setTextColor(...color)
  }
  function brand(cover = false) {
    const logoSize = cover ? 14 : 9
    const scale = logoSize / Math.max(logoInfo.width, logoInfo.height)
    pdf.addImage(logo, 'PNG', margin, margin, logoInfo.width * scale, logoInfo.height * scale)
    font(cover ? 17 : 11, 'bold', [6, 38, 77])
    pdf.text('GarantiyAid', margin + logoSize + 4, margin + 5)
    font(8)
    pdf.text(cover ? 'Assistance management / Operational review' : document.title, margin + logoSize + 4, margin + 10)
    y = margin + logoSize + 6
    pdf.setDrawColor(203, 218, 234).line(margin, y, pageWidth() - margin, y)
    y += 6
  }
  function newPage(nextOrientation = orientation) {
    orientation = nextOrientation
    pdf.addPage('a4', orientation)
    brand()
  }
  function space(height) { if (y + height > bottom()) newPage() }
  function paragraph(value, { size = 9, weight = 'normal', color, gap = 3 } = {}) {
    if (value == null || value === '') return
    font(size, weight, color)
    const lines = pdf.splitTextToSize(String(value), width())
    const lineHeight = size * 0.352778 * 1.5
    for (const line of lines) {
      space(lineHeight)
      font(size, weight, color)
      pdf.text(line, margin, y, { baseline: 'top' })
      y += lineHeight
    }
    y += gap
  }
  function heading(title) {
    space(20)
    y += 3
    paragraph(title, { size: 11, weight: 'bold', color: [6, 38, 77] })
  }
  function metrics(items) {
    for (let index = 0; index < items.length; index += 2) {
      const pair = items.slice(index, index + 2)
      font(8)
      const labels = pair.map(([label]) => pdf.splitTextToSize(label, width() / 2 - 6))
      font(12, 'bold')
      const values = pair.map(([, value]) => pdf.splitTextToSize(String(value), width() / 2 - 6))
      const labelLines = Math.max(...labels.map(lines => lines.length))
      const valueLines = Math.max(...values.map(lines => lines.length))
      const height = labelLines * 4 + valueLines * 6 + 6
      space(height)
      pair.forEach((_, column) => {
        const x = margin + column * width() / 2
        font(8)
        pdf.text(labels[column], x, y, { baseline: 'top', lineHeightFactor: 1.4 })
        font(12, 'bold', [6, 38, 77])
        pdf.text(values[column], x, y + labelLines * 4 + 1, { baseline: 'top', lineHeightFactor: 1.4 })
      })
      y += height
    }
  }
  function table(section) {
    if (!section.rows.length) {
      heading(section.title)
      paragraph('No records matched this coverage.')
      return
    }
    newPage('landscape')
    const columnWidths = section.widths ?? section.columns.map(() => width() / section.columns.length)
    const unit = width() / columnWidths.reduce((total, value) => total + value, 0)
    const widths = columnWidths.map(value => value * unit)
    const lineHeight = 4.2
    function tableHeader() {
      paragraph(section.title, { size: 13, weight: 'bold', color: [6, 38, 77] })
      paragraph(`${section.rows.length.toLocaleString('en-PH')} records / Generated ${formatReportDate(document.generatedAt)}`, { size: 8 })
      paragraph([section.description, section.notice].filter(Boolean).join(' '), { size: 8 })
      font(8, 'bold')
      const labels = section.columns.map(([label], index) => pdf.splitTextToSize(label, widths[index] - 4))
      const height = Math.max(...labels.map(lines => lines.length)) * lineHeight + 5
      pdf.setFillColor(237, 245, 254).rect(margin, y, width(), height, 'F')
      let x = margin
      labels.forEach((lines, index) => {
        font(8, 'bold', [6, 38, 77])
        lines.forEach((line, lineIndex) => pdf.text(line, x + 2, y + 2 + lineIndex * lineHeight, { baseline: 'top' }))
        x += widths[index]
      })
      y += height
    }
    tableHeader()
    section.rows.forEach((row, rowIndex) => {
      font(8)
      const cells = section.columns.map(([, render], index) => pdf.splitTextToSize(String(render(row) ?? 'Not recorded'), widths[index] - 4))
      const lines = Math.max(1, ...cells.map(cell => cell.length))
      let offset = 0
      while (offset < lines) {
        const rowHeight = (lines - offset) * lineHeight + 5
        if (y + Math.min(rowHeight, 22) > bottom()) { newPage('landscape'); tableHeader() }
        const available = Math.max(1, Math.floor((bottom() - y - 5) / lineHeight))
        const count = Math.min(lines - offset, available)
        const height = count * lineHeight + 5
        if (rowIndex % 2 === 1) pdf.setFillColor(248, 250, 253).rect(margin, y, width(), height, 'F')
        let x = margin
        cells.forEach((cell, column) => {
          font(8)
          cell.slice(offset, offset + count).forEach((line, lineIndex) => pdf.text(line, x + 2, y + 2 + lineIndex * lineHeight, { baseline: 'top' }))
          x += widths[column]
        })
        y += height
        pdf.setDrawColor(216, 226, 238).line(margin, y, pageWidth() - margin, y)
        offset += count
        if (offset < lines) {
          newPage('landscape')
          tableHeader()
          paragraph(`Record ${rowIndex + 1} continued`, { size: 7, gap: 2 })
        }
      }
    })
  }
  brand(true)
  paragraph(document.title, { size: 20, weight: 'bold', color: [6, 38, 77], gap: 5 })
  for (const [label, value] of document.metadata) {
    space(14)
    paragraph(label, { size: 7.5, weight: 'bold', gap: 0.5 })
    paragraph(value, { size: 9, gap: 3 })
  }
  paragraph(document.disclaimer, { size: 8, color: [79, 96, 116] })
  for (const section of document.sections) {
    if (section.rows) { table(section); continue }
    heading(section.title)
    if (section.metrics) metrics(section.metrics)
    paragraph(section.description)
    for (const text of section.paragraphs ?? []) paragraph(text)
  }
  const total = pdf.getNumberOfPages()
  for (let page = 1; page <= total; page++) {
    pdf.setPage(page)
    const height = pdf.internal.pageSize.getHeight()
    const right = pdf.internal.pageSize.getWidth() - margin
    pdf.setDrawColor(216, 226, 238).line(margin, height - 15, right, height - 15)
    font(7, 'normal', [79, 96, 116])
    pdf.text('GarantiyAid | Prototype review | Simulated wallet amounts', margin, height - 9)
    pdf.text(`Page ${page} of ${total}`, right, height - 9, { align: 'right' })
  }
  return pdf.output('blob')
}

export function downloadReportPdf(blob, kind, generatedAt) {
  const parsed = new Date(generatedAt)
  const day = Number.isNaN(parsed.getTime()) ? 'undated' : philippineDate(parsed)
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `garantiyaid-${kind.toLowerCase()}-${day}.pdf`
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
