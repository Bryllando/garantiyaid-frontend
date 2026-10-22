const title = 'GarantiyAid staff recovery codes'
const reminder = 'Keep these codes private and offline. Each code can be used once.'

function validateCodes(codes) {
  if (!Array.isArray(codes) || codes.length !== 8 || codes.some(code => typeof code !== 'string' || !/^[A-F0-9]{4}(?:-[A-F0-9]{4}){3}$/.test(code))) {
    throw new Error('Recovery codes could not be exported. Copy the codes shown on screen instead.')
  }
}

export function recoveryCodeText(codes) {
  validateCodes(codes)
  return [title, reminder, '', ...codes].join('\n')
}

export async function recoveryCodePdf(codes) {
  validateCodes(codes)
  const { jsPDF } = await import('jspdf')
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', putOnlyUsedFonts: true })
  pdf.setProperties({ title, subject: 'Private, one-time recovery codes' })
  pdf.setTextColor(16, 33, 58)
  pdf.setFont('helvetica', 'bold').setFontSize(22)
  pdf.text('GarantiyAid', 20, 27)
  pdf.setFontSize(16).text('Staff recovery codes', 20, 38)
  pdf.setFont('helvetica', 'normal').setFontSize(10)
  pdf.text(reminder, 20, 49)
  pdf.text('Use one code to sign in when your authenticator is unavailable.', 20, 56)
  pdf.setDrawColor(190, 200, 214).setLineWidth(0.3)
  codes.forEach((code, index) => {
    const x = 20 + (index % 2) * 88
    const y = 68 + Math.floor(index / 2) * 22
    pdf.roundedRect(x, y, 82, 17, 2, 2)
    pdf.setFont('courier', 'bold').setFontSize(13)
    pdf.text(code, x + 41, y + 10.5, { align: 'center' })
  })
  pdf.setFont('helvetica', 'normal').setFontSize(10)
  pdf.text('Store separately from your password and work device.', 20, 170)
  pdf.text('Cross out each code after using it. A new set replaces all previous codes.', 20, 177)
  return pdf.output('blob')
}

export function recoveryCodePrintDocument(codes) {
  validateCodes(codes)
  // Only validated hexadecimal codes enter this isolated document; no account credentials or QR secret.
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${title}</title>
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
    <style>
      @page { size: A4; margin: 20mm; }
      * { box-sizing: border-box; }
      body { margin: 0; color: #10213a; font: 11pt/1.6 Arial, sans-serif; }
      h1 { margin: 0; font-size: 23pt; } h2 { margin: 0 0 12pt; font-size: 17pt; }
      p { margin: 4pt 0; } .codes { display: grid; grid-template-columns: 1fr 1fr; gap: 12pt; margin: 24pt 0; }
      code { border: 1px solid #bec8d6; border-radius: 6pt; padding: 14pt 6pt; text-align: center; font: bold 13pt monospace; }
      main { break-inside: avoid; } footer { font-size: 10pt; }
    </style></head><body><main><h1>GarantiyAid</h1><h2>Staff recovery codes</h2>
    <p>${reminder}</p><p>Use one code to sign in when your authenticator is unavailable.</p>
    <div class="codes">${codes.map(code => `<code>${code}</code>`).join('')}</div>
    <footer><p>Store separately from your password and work device.</p>
    <p>Cross out each code after using it. A new set replaces all previous codes.</p></footer>
    </main></body></html>`
}

export function downloadRecoveryFile(blob, extension) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `garantiyaid-recovery-codes.${extension}`
  document.body.append(link)
  try {
    link.click()
  } finally {
    link.remove()
    // Give the browser time to consume the download before releasing the in-memory file.
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }
}
