import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from '../ui/icon.jsx'
import { LoadingLabel } from '../ui/spinner.jsx'
import { burialReferralPdf } from './burial-referral-pdf.js'

const date = value => new Intl.DateTimeFormat('en-PH', { dateStyle: 'long', timeZone: 'Asia/Manila' }).format(new Date(value))

export default function BurialReferralLetter({ referral, onClose, returnFocusRef }) {
  const dialog = useRef(null)
  const exporting = useRef(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const issued = Boolean(referral.issuedAt)
  useEffect(() => {
    const opener = returnFocusRef?.current ?? document.activeElement
    dialog.current?.showModal()
    return () => opener?.focus()
  }, [returnFocusRef])
  async function savePdf() {
    if (exporting.current) return
    exporting.current = true; setSaving(true); setError('')
    try {
      const blob = await burialReferralPdf(dialog.current.querySelector('article'), referral.letterSnapshot.reference)
      const url = URL.createObjectURL(blob), link = document.createElement('a')
      link.href = url
      link.download = `garantiyaid-burial-referral-${referral.letterSnapshot.reference.replace(/[^a-zA-Z0-9._-]/g, '-')}.pdf`
      link.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch { setError('The PDF could not be saved. Try again, or use Print letter.') }
    finally { exporting.current = false; setSaving(false) }
  }
  return createPortal(<><dialog ref={dialog} data-burial-letter onClose={onClose} onCancel={event => { if (exporting.current) event.preventDefault() }} aria-labelledby="burial-letter-title" className="m-auto max-h-[calc(100dvh-2rem)] w-[min(52rem,calc(100%-1rem))] overflow-y-auto rounded-lg border border-line bg-white p-0 text-ink backdrop:bg-slate-950/50">
    <div data-burial-letter-actions className="sticky top-0 border-b border-line bg-slate-50 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-sm font-semibold"><Icon name={issued ? 'archive' : 'pen'} className="size-5 shrink-0 text-brand-blue" />{issued ? 'Issued record copy' : 'Reviewed copy for signature'}</p>
        <button className="ga-btn-secondary" disabled={saving} onClick={() => dialog.current.close()}><Icon name="close" className="size-4" />Close preview</button>
      </div>
      <div className="mt-4 flex flex-wrap gap-2"><button className="ga-btn-primary" disabled={saving} onClick={savePdf}><Icon name="download" className="size-4" />{saving ? <LoadingLabel>Saving PDF...</LoadingLabel> : 'Save PDF'}</button><button className="ga-btn-secondary" disabled={saving} onClick={() => window.print()}><Icon name="printer" className="size-4" />Print letter</button></div>
      <p className="mt-3 text-xs leading-5 text-copy">Save PDF downloads a copy. Print letter opens the printer dialog. Neither action records signing, issuance or assistance approval.</p>
      {error && <p role="alert" className="mt-3 text-sm text-brand-red">{error}</p>}
    </div>
    <LetterContents referral={referral} preview />
  </dialog><div data-burial-print-root className="hidden" aria-hidden="true"><LetterContents referral={referral} /></div></>, document.body)
}

function LetterContents({ referral, preview = false }) {
  const letter = referral.letterSnapshot
  const issued = Boolean(referral.issuedAt)
  return <article data-burial-referral-print className="p-5 text-sm leading-7 [overflow-wrap:anywhere] sm:p-10">
      <header className="border-b-2 border-slate-700 pb-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-copy">GarantiyAid · Academic prototype</p>
        <p className="mt-2 text-lg font-semibold">{letter.sendingOffice}</p>
        <h2 id={preview ? 'burial-letter-title' : undefined} className="mt-4 text-xl font-bold">Referral for burial assistance assessment</h2>
        <p className="mt-2 text-xs">Reference: {letter.reference}</p>
        <p>Prepared: {date(letter.preparedAt)}</p>
        <p className="mt-2 font-bold">{issued ? 'ISSUED RECORD COPY — original signature is not reproduced' : 'FOR SIGNATURE — not yet issued'}</p>
      </header>
      <div className="mt-6"><p className="font-semibold">{letter.receivingOffice}</p><p className="whitespace-pre-wrap">{letter.receivingAddress}</p></div>
      <p className="mt-6">To the receiving officer:</p>
      <p className="mt-3">We refer <strong>{letter.applicantName}</strong>, residing at {letter.applicantAddress}, for assessment of a request for burial assistance concerning <strong>{letter.deceasedName}</strong>, who died on {date(`${letter.deathDate}T00:00:00Z`)}.</p>
      <p className="mt-3">Applicant’s relationship to the deceased: <strong>{letter.relationship}</strong>.</p>
      <p className="mt-3 whitespace-pre-wrap">Purpose of referral: {letter.purpose}</p>
      <p className="mt-4 font-semibold">Documents listed for this referral</p>
      <ol className="list-decimal pl-6">{letter.attachments.map(item => <li key={item.documentId}>{item.label}</li>)}</ol>
      <p className="mt-4">Please assess this request under your office’s applicable requirements and procedures. This referral does not establish eligibility, approve assistance, guarantee payment, or confirm that assistance was released.</p>
      <div className="mt-10 break-inside-avoid"><p>Respectfully,</p><div data-burial-signatory className="mt-10 max-w-sm border-t border-slate-600 pt-2"><p className="font-semibold">{letter.signatoryName}</p><p>{letter.signatoryPosition}</p><p className="text-xs">Authorized signature and date: ____________________</p></div></div>
      {issued && <div className="mt-6 break-inside-avoid border-t border-line pt-3 text-xs"><p>Issuance recorded: {date(referral.issuedAt)}</p><p>Signed-original / dispatch reference: {referral.issueReference}</p></div>}
      <footer className="mt-6 border-t border-line pt-3 text-xs leading-5">Prepared using an academic prototype. Confirm the receiving office’s accepted format and the signatory’s authority before official use. This document is not a Guarantee Letter.</footer>
    </article>
}
