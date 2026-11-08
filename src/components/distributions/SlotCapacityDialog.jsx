import { useEffect, useRef, useState } from 'react'
import { getAuthErrorMessage } from '../../auth/staffAuth.js'
import { LoadingLabel } from '../ui/spinner.jsx'

const time = new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Manila' })

export default function SlotCapacityDialog({ slot, onSave, onClose }) {
  const dialogRef = useRef(null)
  const errorRef = useRef(null)
  const [capacity, setCapacity] = useState(String(slot.capacity))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => { dialogRef.current?.showModal() }, [])
  useEffect(() => { if (error) errorRef.current?.focus() }, [error])

  async function submit(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await onSave(slot.slotId, Number(capacity))
    } catch (requestError) {
      setError(getAuthErrorMessage(requestError))
    } finally { setBusy(false) }
  }

  return <dialog ref={dialogRef} aria-labelledby="capacity-title" onClose={onClose} onCancel={(event) => { if (busy) event.preventDefault() }} className="m-auto max-h-[calc(100dvh-2rem)] w-[min(32rem,calc(100%-2rem))] overflow-y-auto rounded-xl border border-line bg-white p-6 text-ink shadow-lg backdrop:bg-slate-950/55">
    <form onSubmit={submit}>
      <h2 id="capacity-title" className="text-xl font-bold">Edit time-slot capacity</h2>
      <p className="mt-2 font-semibold">{slot.sessionLabel}</p>
      <p className="mt-1 text-sm text-muted-copy">{time.format(new Date(slot.slotStart))} · {slot.location}</p>
      <label htmlFor="slot-capacity" className="ga-label mt-5 block">Beneficiaries in this time slot</label>
      <input id="slot-capacity" type="number" required min="1" max="1000" step="1" value={capacity} onChange={(event) => setCapacity(event.target.value)} aria-describedby="capacity-help" disabled={busy} className="ga-input mt-2" />
      <p id="capacity-help" className="mt-2 text-sm leading-6 text-muted-copy">Current capacity: {slot.capacity}. The new capacity must cover everyone already scheduled here. Existing appointments stay in place.</p>
      {error && <p ref={errorRef} tabIndex={-1} role="alert" className="mt-4 rounded-lg border border-red-200 bg-danger-soft p-4 text-sm text-brand-red">{error}</p>}
      <div className="mt-6 flex flex-wrap justify-end gap-3 border-t border-line pt-4">
        <button type="button" disabled={busy} onClick={() => dialogRef.current?.close()} className="ga-btn-secondary">Cancel</button>
        <button type="submit" disabled={busy || Number(capacity) === slot.capacity} className="ga-btn-primary">{busy ? <LoadingLabel>Saving capacity...</LoadingLabel> : 'Save capacity'}</button>
      </div>
    </form>
  </dialog>
}
