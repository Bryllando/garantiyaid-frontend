import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { QRCodeSVG } from 'qrcode.react'
import { toast } from 'sonner'
import { Icon } from '../ui/icon.jsx'
import { qrCardsPdf } from './qr-card-pdf.js'
import './qr-credentials.css'

const date = new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeZone: 'Asia/Manila' })
const dateTime = new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Manila' })
const fullName = person => [person.firstName, person.middleName, person.lastName].filter(Boolean).join(' ')

function CredentialCard({ distribution, item, number, total }) {
  const name = fullName(item.beneficiary)
  return <article className="ga-qr-card">
    <header className="ga-qr-card-heading"><span>GarantiyAid</span><span>Beneficiary QR card</span></header>
    <h3 className="ga-qr-card-name">{name}</h3>
    <p className="ga-qr-card-event">{distribution.title}</p>
    <div className="ga-qr-card-details">
      <div className="ga-qr-card-code"><QRCodeSVG value={item.token} size={152} level="M" marginSize={4} role="img" title={`Claim QR code for ${name}`} /></div>
      <dl>
        <div><dt>Event date</dt><dd>{date.format(new Date(`${distribution.distributionDate.slice(0, 10)}T00:00:00+08:00`))}</dd></div>
        <div><dt>Event venue</dt><dd>{distribution.location}</dd></div>
        <div><dt>Valid until (PHT)</dt><dd>{dateTime.format(new Date(item.expiresAt))}</dd></div>
      </dl>
    </div>
    <div className="ga-qr-card-backup"><p>Backup token · authorized staff only</p><code>{item.token}</code></div>
    <footer className="ga-qr-card-footer"><p>Keep this card private. Follow your assigned schedule. Single use; invalid after a successful claim.</p><span>{number} / {total}</span></footer>
  </article>
}

export default function QrCredentialsDialog({ distribution, onClose, tokens }) {
  const dialog = useRef(null)
  const pdfButton = useRef(null)
  const printRoot = useRef(null)
  const exportingRef = useRef(false)
  const errorRef = useRef(null)
  const [saved, setSaved] = useState(false)
  const [printAttempted, setPrintAttempted] = useState(false)
  const [exporting, setExporting] = useState('')
  const [error, setError] = useState('')
  const count = tokens.length
  useEffect(() => { dialog.current?.showModal(); pdfButton.current?.focus({ preventScroll: true }) }, [])
  useEffect(() => { if (error) errorRef.current?.focus() }, [error])

  async function downloadPdf() {
    if (exportingRef.current) return
    exportingRef.current = true
    setExporting('pdf'); setError('')
    try {
      const blob = await qrCardsPdf([...printRoot.current.querySelectorAll('.ga-qr-card')])
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url; link.download = 'garantiyaid-qr-cards.pdf'; link.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      setSaved(true)
      toast.success('QR card PDF downloaded. Keep it so you can print the cards again.')
    } catch { setError('The PDF could not be downloaded. Try again, or use Print QR cards or Save CSV before closing.') }
    finally { exportingRef.current = false; setExporting('') }
  }

  async function copy() {
    if (exportingRef.current) return
    exportingRef.current = true
    setExporting('copy')
    try {
      await navigator.clipboard.writeText(tokens.map(item => `${fullName(item.beneficiary)}: ${item.token}`).join('\n'))
      setSaved(true)
      toast.success('Token list copied. Keep it in an authorized secure location.')
    } catch { toast.error('Copy failed. Download the CSV instead.') }
    finally { exportingRef.current = false; setExporting('') }
  }
  function download() {
    try {
      const rows = [['Beneficiary', 'Token', 'Expires at'], ...tokens.map(item => [fullName(item.beneficiary), item.token, item.expiresAt])]
      const csv = rows.map(row => row.map(value => {
        const text = String(value ?? '')
        return `"${(/^[=+\-@\t\r]/.test(text) ? "'" + text : text).replaceAll('"', '""')}"`
      }).join(',')).join('\r\n')
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
      const link = document.createElement('a')
      link.href = url; link.download = 'garantiyaid-qr-tokens.csv'; link.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      setSaved(true)
      toast.success('QR credential CSV downloaded. Keep it private.')
    } catch { toast.error('Download failed. Print or copy the credentials before closing.') }
  }
  function printCards() {
    try {
      window.print()
      // Browsers also fire afterprint when printing is cancelled; require confirmation.
      setPrintAttempted(true)
    } catch { toast.error('Printing could not open. Download the CSV to keep these credentials.') }
  }
  function cancel(event) {
    if (exportingRef.current) { event.preventDefault(); return }
    if (saved) return
    event.preventDefault()
    toast.error('Save these one-time credentials before closing this window.')
  }
  function cards() {
    return tokens.filter((_, index) => index % 2 === 0).map((item, row) => <div className="ga-qr-card-row" key={item.qrTokenId}>
      {tokens.slice(row * 2, row * 2 + 2).map((token, column) => <CredentialCard key={token.qrTokenId} distribution={distribution} item={token} number={row * 2 + column + 1} total={count} />)}
    </div>)
  }

  return createPortal(<>
    <dialog ref={dialog} onCancel={cancel} onClose={onClose} aria-labelledby="qr-credentials-title" aria-describedby="qr-credentials-warning" className={`m-auto max-h-[calc(100dvh-1rem)] overflow-hidden rounded-xl border border-line bg-white p-0 text-ink shadow-lg backdrop:bg-slate-950/55 sm:max-h-[calc(100dvh-2rem)] ${count === 1 ? 'w-[min(40rem,calc(100%-1rem))]' : 'w-[min(66rem,calc(100%-1rem))]'}`}>
      <div className="flex max-h-[calc(100dvh-1rem)] flex-col sm:max-h-[calc(100dvh-2rem)]">
        <header className="shrink-0 border-b border-line px-4 py-4 sm:px-6 sm:py-5">
          <div className="flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-lg bg-info-soft text-brand-blue"><Icon name="qr" /></span><div><p className="ga-eyebrow">One-time credentials</p><h2 id="qr-credentials-title" className="mt-1 text-xl font-bold">Save beneficiary QR cards</h2><p className="mt-1 text-sm text-copy">{count} {count === 1 ? 'card' : 'cards'} ready · {distribution.title}</p></div></div>
        </header>
        <div className="min-h-0 overflow-y-auto bg-page p-4 sm:p-6">
          <p id="qr-credentials-warning" className="mb-5 flex gap-2 rounded-lg border border-amber-200 bg-warning-soft p-3 text-sm leading-6 text-copy"><Icon name="lock" className="mt-1 size-4 shrink-0 text-brand-amber" /><span><strong className="text-ink">Save before closing.</strong> Download a PDF to print later, or print the cards now. These QR values appear only once.</span></p>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-1 text-xs leading-5 text-muted-copy"><span className="inline-flex items-center gap-1.5"><Icon name="eye" className="size-4" />Enlarged preview</span><span>PDF / print: up to 4 cards per A4 page</span></div>
          <section aria-label="QR card preview" className="ga-qr-card-preview" data-single={count === 1}>{cards()}</section>
          <p className="mt-4 flex gap-2 text-xs leading-5 text-muted-copy"><Icon name="printer" className="mt-0.5 size-4 shrink-0" /><span>PDF and print use compact cards with a 38 mm QR code. Print on A4 at 100% / actual size, with browser headers and footers off. Cut along the borders.</span></p>
          <details className="mt-4 border-t border-line pt-1"><summary className="cursor-pointer py-3 text-sm font-semibold text-brand-blue focus-visible:outline-2 focus-visible:outline-brand-blue">Staff backup options</summary><p className="mb-3 text-xs leading-5 text-muted-copy">CSV and copied tokens contain the private credentials. Use these for an authorized staff backup.</p><div className="flex flex-wrap gap-2"><button type="button" onClick={download} disabled={Boolean(exporting)} className="ga-btn-secondary"><Icon name="download" className="size-4" />Save CSV</button><button type="button" onClick={copy} disabled={Boolean(exporting)} className="ga-btn-secondary"><Icon name="copy" className="size-4" />{exporting === 'copy' ? 'Copying...' : 'Copy tokens'}</button></div></details>
        </div>
        <footer className="shrink-0 border-t border-line bg-white p-4 sm:px-6">
          {error && <p ref={errorRef} tabIndex={-1} role="alert" className="mb-3 rounded-lg border border-red-200 bg-danger-soft p-3 text-sm leading-6 text-brand-red">{error}</p>}
          {printAttempted && <label className="mb-3 flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border border-line p-3 text-sm leading-6"><input type="checkbox" checked={saved} onChange={event => setSaved(event.target.checked)} className="mt-1 size-4 shrink-0 accent-brand-blue" /><span>I have printed or securely saved all {count} {count === 1 ? 'card' : 'cards'}.</span></label>}
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap"><button ref={pdfButton} type="button" onClick={downloadPdf} disabled={Boolean(exporting)} className="ga-btn-primary col-span-2 sm:col-auto"><Icon name="download" className="size-4" />{exporting === 'pdf' ? 'Preparing PDF...' : 'Download PDF'}</button><button type="button" onClick={printCards} disabled={Boolean(exporting)} className="ga-btn-secondary px-2 text-xs sm:px-4 sm:text-sm"><Icon name="printer" className="size-4" />Print QR cards</button><button type="button" disabled={!saved || Boolean(exporting)} onClick={() => dialog.current?.close()} className="ga-btn-secondary sm:ml-auto">Done</button></div>
          <p role="status" className="mt-3 text-xs leading-5 text-muted-copy">{saved ? 'Credentials saved or printing confirmed. You can now close this window.' : 'Keep this window open until you have saved the credentials.'}</p>
        </footer>
      </div>
    </dialog>
    <div ref={printRoot} data-qr-print-root aria-hidden="true" className="hidden">{cards()}</div>
  </>, document.body)
}
