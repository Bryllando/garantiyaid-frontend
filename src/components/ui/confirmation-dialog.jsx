import { useEffect, useRef, useState } from 'react'
import { LoadingLabel } from './spinner.jsx'

export function ConfirmationDialog({ actionLabel, confirmationText, description, destructive = false, onCancel, onConfirm, open, reasonLabel, reasonMaxLength = 2000, title }) {
  const dialogRef = useRef(null)
  const [confirmation, setConfirmation] = useState('')
  const [reason, setReason] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    const dialog = dialogRef.current
    if (open && dialog && !dialog.open) dialog.showModal()
    if (!open && dialog?.open) dialog.close()
  }, [open])

  async function confirm(event) {
    event.preventDefault()
    setIsSubmitting(true)
    try {
      await onConfirm(reason.trim(), confirmation)
      setConfirmation('')
      setReason('')
    } catch {
      // The calling page reports the request error and leaves this dialog open.
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <dialog ref={dialogRef} onCancel={(event) => { event.preventDefault(); if (!isSubmitting) onCancel() }} onClose={() => { setConfirmation(''); setReason('') }} className="m-auto w-[min(32rem,calc(100%-2rem))] rounded-2xl border border-line bg-white p-0 text-ink shadow-lg backdrop:bg-slate-950/55">
      <form onSubmit={confirm} className="p-6 sm:p-7">
        <span aria-hidden="true" className={`grid size-11 place-items-center rounded-full text-lg font-black ${destructive ? 'bg-danger-soft text-brand-red' : 'bg-info-soft text-brand-blue'}`}>{destructive ? '!' : '✓'}</span>
        <h2 className="mt-4 text-xl font-extrabold">{title}</h2>
        <p className="mt-2 text-sm leading-6 text-muted-copy">{description}</p>
        {reasonLabel && (
          <div className="mt-5">
            <label htmlFor="confirmation-reason" className="ga-label">{reasonLabel}</label>
            <textarea id="confirmation-reason" autoFocus required minLength="5" maxLength={reasonMaxLength} rows="4" value={reason} onChange={(event) => setReason(event.target.value)} className="ga-input mt-2 min-h-28 resize-y py-3" />
            <p className="mt-2 text-xs text-muted-copy">Use at least 5 characters. This note becomes part of the review record.</p>
          </div>
        )}
        {confirmationText && (
          <div className="mt-5">
            <label htmlFor="confirmation-text" className="ga-label">To confirm, type <span className="font-extrabold text-ink">{confirmationText}</span></label>
            <input id="confirmation-text" autoFocus autoComplete="off" spellCheck="false" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} aria-describedby="confirmation-text-help" className="ga-input mt-2 font-mono" />
            <p id="confirmation-text-help" className="mt-2 text-xs leading-5 text-muted-copy">This check is case-sensitive and prevents accidental permanent deletion.</p>
          </div>
        )}
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button type="button" onClick={onCancel} disabled={isSubmitting} className="ga-btn-secondary">Cancel</button>
          <button type="submit" disabled={isSubmitting || Boolean(reasonLabel && reason.trim().length < 5) || Boolean(confirmationText && confirmation !== confirmationText)} className={destructive ? 'ga-btn-danger' : 'ga-btn-primary'}>{isSubmitting ? <LoadingLabel>Saving...</LoadingLabel> : actionLabel}</button>
        </div>
      </form>
    </dialog>
  )
}
