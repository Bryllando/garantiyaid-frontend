import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

const date = value => new Intl.DateTimeFormat('en-PH', { dateStyle: 'long', timeZone: 'Asia/Manila' }).format(new Date(value))

export default function BurialReferralLetter({ referral, onClose, returnFocusRef }) {
  const dialog = useRef(null)
  const issued = Boolean(referral.issuedAt)
  useEffect(() => {
    const opener = returnFocusRef?.current ?? document.activeElement
    dialog.current?.showModal()
    return () => opener?.focus()
  }, [returnFocusRef])
  return createPortal(<><dialog ref={dialog} data-burial-letter onClose={onClose} aria-labelledby="burial-letter-title" className="m-auto max-h-[calc(100dvh-2rem)] w-[min(52rem,calc(100%-1rem))] overflow-y-auto rounded border border-line bg-white p-0 text-ink backdrop:bg-slate-950/50">
    <div data-burial-letter-actions className="sticky top-0 flex flex-wrap items-center justify-between gap-3 border-b border-line bg-page p-4">
      <p className="text-sm font-semibold">{issued ? 'Issued record copy' : 'Reviewed copy for signature'}</p>
      <div className="flex flex-wrap gap-2"><button className="ga-btn-secondary" onClick={() => dialog.current.close()}>Close preview</button><button className="ga-btn-primary" onClick={() => window.print()}>Print / Save PDF</button></div>
      <p className="w-full text-sm text-copy">Printing does not issue the referral or approve assistance. Use your browser’s “Save as PDF” destination to download.</p>
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
      <div className="mt-10 break-inside-avoid"><p>Respectfully,</p><div className="mt-10 max-w-sm border-t border-slate-600 pt-2"><p className="font-semibold">{letter.signatoryName}</p><p>{letter.signatoryPosition}</p><p className="text-xs">Authorized signature and date: ____________________</p></div></div>
      {issued && <div className="mt-6 break-inside-avoid border-t border-line pt-3 text-xs"><p>Issuance recorded: {date(referral.issuedAt)}</p><p>Signed-original / dispatch reference: {referral.issueReference}</p></div>}
      <footer className="mt-6 border-t border-line pt-3 text-xs leading-5">Prepared using an academic prototype. Confirm the receiving office’s accepted format and the signatory’s authority before official use. This document is not a Guarantee Letter.</footer>
    </article>
}
