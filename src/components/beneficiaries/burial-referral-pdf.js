const point = 25.4 / 72

export async function burialReferralPdf(article, reference) {
  const { jsPDF } = await import('jspdf')
  await document.fonts.ready
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', compress: true, putOnlyUsedFonts: true })
  pdf.setProperties({ title: `GarantiyAid burial referral ${reference}` })
  const margin = 18, width = 174, bottom = 277
  const canvas = document.createElement('canvas'), context = canvas.getContext('2d')
  let y = margin
  function space(height) { if (y + height > bottom) { pdf.addPage(); y = margin } }
  for (const element of article.querySelectorAll('p, h2, li, footer')) {
    const style = getComputedStyle(element)
    const size = Math.min(16, Math.max(8, parseFloat(style.fontSize) * 0.75))
    const bold = Number(style.fontWeight) >= 600
    const item = element.tagName === 'LI'
    const available = width - (item ? 5 : 0)
    const value = `${item ? `${Array.from(element.parentElement.children).indexOf(element) + 1}. ` : ''}${element.textContent.trim()}`
    pdf.setFont('helvetica', bold ? 'bold' : 'normal').setFontSize(size)
    const encoding = pdf.getFont().metadata.Unicode.encoding.WinAnsiEncoding
    const unicode = Array.from(value).some(character => character.codePointAt(0) > 255 && !encoding[character.codePointAt(0)])
    const lines = []
    if (unicode) {
      // Browser fonts keep localized names and punctuation intact outside the PDF's built-in alphabet.
      context.font = `${bold ? 'bold ' : ''}${size * 4}px Arial, sans-serif`
      for (const paragraph of value.split('\n')) {
        let line = ''
        for (const character of paragraph) {
          if (line && context.measureText(line + character).width > available / point * 4) {
            const split = line.lastIndexOf(' ')
            lines.push(split > 0 ? line.slice(0, split) : line)
            line = (split > 0 ? line.slice(split + 1) : '') + character
          } else line += character
        }
        lines.push(line)
      }
    } else lines.push(...pdf.splitTextToSize(value, available))
    const lineHeight = size * point * 1.4
    if (element.matches('[data-burial-signatory] > p:first-child')) {
      space(32); y += 8
      pdf.setDrawColor(90).line(margin, y, margin + 90, y)
      y += 3
    }
    if (element.tagName === 'H2') space(lineHeight * lines.length + 18)
    if (element.tagName === 'FOOTER') { space(lineHeight + 8); y += 3 }
    for (const line of lines) {
      space(lineHeight)
      const x = margin + (item ? 5 : 0)
      if (!unicode) pdf.text(line, x, y, { baseline: 'top' })
      else {
        canvas.width = Math.ceil(available / point * 4); canvas.height = Math.ceil(size * 4 * 1.4)
        context.fillStyle = 'white'; context.fillRect(0, 0, canvas.width, canvas.height)
        context.fillStyle = '#111'; context.font = `${bold ? 'bold ' : ''}${size * 4}px Arial, sans-serif`; context.textBaseline = 'top'
        context.fillText(line, 0, 0)
        pdf.addImage(canvas.toDataURL('image/png'), 'PNG', x, y, available, lineHeight)
      }
      y += lineHeight
    }
    y += item ? 1 : 3
  }
  const pages = pdf.getNumberOfPages()
  for (let page = 1; page <= pages; page++) {
    pdf.setPage(page).setFont('helvetica', 'normal').setFontSize(7)
    pdf.text(reference, margin, 282)
    pdf.text(`${page} / ${pages}`, 192, 282, { align: 'right' })
  }
  return pdf.output('blob')
}
