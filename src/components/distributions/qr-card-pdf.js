const mmPerPoint = 25.4 / 72

async function qrImage(svg) {
  const clone = svg.cloneNode(true)
  const size = Math.round(svg.viewBox.baseVal.width * 12)
  clone.setAttribute('width', size)
  clone.setAttribute('height', size)
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml' }))
  try {
    const image = new Image()
    image.src = url
    await image.decode()
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = size
    canvas.getContext('2d').drawImage(image, 0, 0)
    return canvas.toDataURL('image/png')
  } finally { URL.revokeObjectURL(url) }
}

export async function qrCardsPdf(cards) {
  if (!cards.length) throw new Error('No QR cards are available to export.')
  const { jsPDF } = await import('jspdf')
  await document.fonts.ready
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', compress: true, putOnlyUsedFonts: true })
  pdf.setProperties({ title: 'GarantiyAid beneficiary QR cards', subject: 'Private, single-use claim credentials' })
  const width = 92, padding = 5, inner = width - padding * 2
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')

  function layout(card) {
    const blocks = []
    function text(value, x, y, available, size, font = 'helvetica', weight = 'normal') {
      pdf.setFont(font, weight).setFontSize(size)
      const unicode = /[^\x20-\x7e\xa0-\xff]/.test(value)
      let lines = []
      if (unicode) {
        // Browser fonts preserve names outside the PDF's built-in Latin alphabet.
        context.font = `${weight === 'bold' ? 'bold ' : ''}${size * 4}px Arial, sans-serif`
        const maximum = available / mmPerPoint * 4
        let line = ''
        for (const character of value) {
          if (line && context.measureText(line + character).width > maximum) {
            const space = line.lastIndexOf(' ')
            lines.push(space > 0 ? line.slice(0, space) : line)
            line = (space > 0 ? line.slice(space + 1) : '') + character
          } else line += character
        }
        lines.push(line)
      } else lines = pdf.splitTextToSize(value, available)
      const height = lines.length * size * mmPerPoint * 1.3
      blocks.push({ lines, x, y, available, size, font, weight, height, unicode })
      return height
    }
    text('GarantiyAid', padding, padding, inner / 2, 8, 'helvetica', 'bold')
    text('Beneficiary QR card', padding + inner / 2, padding, inner / 2, 8, 'helvetica', 'bold')
    let y = padding + 7
    y += text(card.querySelector('.ga-qr-card-name').textContent, padding, y, inner, 12, 'helvetica', 'bold') + 1
    y += text(card.querySelector('.ga-qr-card-event').textContent, padding, y, inner, 9) + 3
    const qrY = y
    let detailsY = y
    for (const field of card.querySelectorAll('dl > div')) {
      detailsY += text(field.querySelector('dt').textContent, padding + 41, detailsY, inner - 41, 8)
      detailsY += text(field.querySelector('dd').textContent, padding + 41, detailsY, inner - 41, 8.5, 'helvetica', 'bold') + 1.5
    }
    y = Math.max(qrY + 38, detailsY) + 3
    const lineY = y
    y += 2
    y += text('Backup token - authorized staff only', padding, y, inner, 8) + 1
    y += text(card.querySelector('.ga-qr-card-backup code').textContent, padding, y, inner, 8, 'courier') + 3
    const footerHeight = text(card.querySelector('.ga-qr-card-footer p').textContent, padding, y, inner - 12, 8)
    text(card.querySelector('.ga-qr-card-footer span').textContent, width - padding - 10, y + footerHeight - 8 * mmPerPoint * 1.3, 10, 8)
    return { blocks, qrY, lineY, svg: card.querySelector('.ga-qr-card-code svg'), height: Math.max(100, y + footerHeight + padding) }
  }

  function drawText(block, x, y) {
    if (block.unicode) {
      canvas.width = Math.ceil(block.available / mmPerPoint * 4)
      canvas.height = Math.ceil(block.height / mmPerPoint * 4)
      context.fillStyle = 'white'; context.fillRect(0, 0, canvas.width, canvas.height)
      context.font = `${block.weight === 'bold' ? 'bold ' : ''}${block.size * 4}px Arial, sans-serif`
      context.fillStyle = 'black'; context.textBaseline = 'top'
      block.lines.forEach((line, index) => context.fillText(line, 0, index * block.size * 4 * 1.3))
      pdf.addImage(canvas.toDataURL('image/png'), 'PNG', x + block.x, y + block.y, block.available, block.height)
    } else {
      pdf.setFont(block.font, block.weight).setFontSize(block.size).setTextColor(0)
      pdf.text(block.lines, x + block.x, y + block.y + block.size * mmPerPoint, { lineHeightFactor: 1.3 })
    }
  }

  let top = 10
  for (let index = 0; index < cards.length; index += 2) {
    const row = cards.slice(index, index + 2).map(layout)
    const height = Math.max(...row.map(card => card.height))
    if (height > 277) throw new Error('Card details exceed the available A4 page height.')
    if (top + height > 287) { pdf.addPage(); top = 10 }
    for (let column = 0; column < row.length; column++) {
      const card = row[column], left = 10 + column * 98
      pdf.setDrawColor(110).setLineWidth(0.25).rect(left, top, width, height)
      card.blocks.forEach(block => drawText(block, left, top))
      pdf.setDrawColor(170).line(left + padding, top + card.lineY, left + width - padding, top + card.lineY)
      pdf.addImage(await qrImage(card.svg), 'PNG', left + padding, top + card.qrY, 38, 38)
    }
    top += height + 6
  }
  return pdf.output('blob')
}
