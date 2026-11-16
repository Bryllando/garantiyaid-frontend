import { qrImage } from '../distributions/qr-card-pdf.js'

const point = 25.4 / 72

export async function claimReceiptPdf(article, receiptNo) {
  const { jsPDF } = await import('jspdf')
  await document.fonts.ready
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', compress: true, putOnlyUsedFonts: true })
  pdf.setProperties({ title: `GarantiyAid receipt ${receiptNo}` })
  const margin = 15, width = 180, bottom = 280
  let y = margin
  const canvas = document.createElement('canvas'), context = canvas.getContext('2d')
  function text(value, available, size = 9, bold = false) {
    const valueText = String(value || 'Not recorded')
    pdf.setFont('helvetica', bold ? 'bold' : 'normal').setFontSize(size)
    const unicode = /[^\x20-\x7e\xa0-\xff]/.test(valueText)
    const lines = []
    if (unicode) {
      // Browser fonts preserve the peso sign and names outside the built-in PDF alphabet.
      context.font = `${bold ? 'bold ' : ''}${size * 4}px Arial, sans-serif`
      const maximum = available / point * 4
      for (const paragraph of valueText.split('\n')) {
        let line = ''
        for (const character of paragraph) {
          if (line && context.measureText(line + character).width > maximum) {
            const space = line.lastIndexOf(' ')
            lines.push(space > 0 ? line.slice(0, space) : line)
            line = (space > 0 ? line.slice(space + 1) : '') + character
          } else line += character
        }
        lines.push(line)
      }
    } else lines.push(...pdf.splitTextToSize(valueText, available))
    const lineHeight = size * point * 1.35
    return { lines, height: lines.length * lineHeight, draw(x, top, line = null) {
      for (const [index, content] of (line === null ? lines : [line]).entries()) {
        const currentY = top + index * lineHeight
        if (!unicode) { pdf.setFont('helvetica', bold ? 'bold' : 'normal').setFontSize(size).text(content, x, currentY, { baseline: 'top' }); continue }
        canvas.width = Math.ceil(available / point * 4); canvas.height = Math.ceil(size * 4 * 1.35)
        context.fillStyle = 'white'; context.fillRect(0, 0, canvas.width, canvas.height)
        context.fillStyle = '#111'; context.font = `${bold ? 'bold ' : ''}${size * 4}px Arial, sans-serif`; context.textBaseline = 'top'
        context.fillText(content, 0, 0)
        pdf.addImage(canvas.toDataURL('image/png'), 'PNG', x, currentY, available, lineHeight)
      }
    }, lineHeight }
  }
  function space(height) { if (y + height > bottom) { pdf.addPage(); y = margin } }
  function paragraph(value, available = width, size = 9, bold = false) {
    const block = text(value, available, size, bold)
    for (const line of block.lines) { space(block.lineHeight); block.draw(margin, y, line); y += block.lineHeight }
    y += 2
  }
  function row(label, value) {
    const key = text(label, 44, 8, true), content = text(value, width - 49)
    const height = Math.max(key.height, content.height) + 1.5
    if (height > bottom - margin) { paragraph(label, width, 8, true); paragraph(value); return }
    space(height); key.draw(margin, y); content.draw(margin + 49, y); y += height
  }
  const header = article.querySelector('header')
  paragraph(header.querySelector('div > div').textContent, width - 40, 8, true)
  paragraph(header.querySelector('h2').textContent, width - 40, 16, true)
  paragraph(header.querySelector('p').textContent, width - 40, 8)
  paragraph(receiptNo, width - 40, 10, true)
  const svg = article.querySelector('[data-receipt-qr] svg')
  if (!svg) throw new Error('The receipt verification QR is unavailable.')
  pdf.addImage(await qrImage(svg), 'PNG', 163, margin, 32, 32)
  y = Math.max(y + 3, margin + 39)
  const summary = article.querySelector('section')
  row('Assistance amount', summary.querySelector('[data-receipt-amount]').textContent)
  row('Current status', summary.querySelector('[data-receipt-status]').textContent.replace(/^Current status:\s*/, ''))
  for (const section of article.querySelectorAll('section')) {
    const heading = section.querySelector('h3')
    if (!heading) continue
    space(18); y += 3
    paragraph(heading.textContent, width, 11, true)
    pdf.setDrawColor(170).line(margin, y - 1, margin + width, y - 1)
    y += 2
    for (const item of section.querySelectorAll('li')) paragraph(item.textContent)
    for (const field of section.querySelectorAll('dl > div')) row(field.querySelector('dt').textContent, field.querySelector('dd').textContent)
  }
  y += 3
  for (const note of article.querySelectorAll('[data-receipt-note]')) paragraph(note.textContent, width, 8)
  const pages = pdf.getNumberOfPages()
  for (let page = 1; page <= pages; page++) {
    pdf.setPage(page).setFont('helvetica', 'normal').setFontSize(8).text(`${receiptNo} | ${page} / ${pages}`, margin, 289)
  }
  return pdf.output('blob')
}
