import { useEffect, useRef, useState } from 'react'
import { getAuthErrorMessage, isSessionExpiredError, requestDistributionQrTokens } from '../../auth/staffAuth.js'
import { ConfirmationDialog } from '../ui/confirmation-dialog.jsx'
import { Icon } from '../ui/icon.jsx'
import { LoadingLabel } from '../ui/spinner.jsx'

const dateTime = new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Manila' })
const name = person => [person?.firstName, person?.middleName, person?.lastName].filter(Boolean).join(' ')

export default function QrCredentialIssuance({ accessToken, busy, data, distribution, onGenerate, onReplace, onSessionExpired, readyCount }) {
  const [paged, setPaged] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [replacement, setReplacement] = useState(null)
  const [replacementError, setReplacementError] = useState('')
  const [retrySeconds, setRetrySeconds] = useState(0)
  const submitting = useRef(false)
  const errorRef = useRef(null)
  const current = paged?.source === data ? paged.result : data
  const page = current.pagination?.page ?? 1
  const pages = Math.max(1, current.pagination?.totalPages ?? 1)
  const unavailable = Boolean(busy || loading || retrySeconds)
  useEffect(() => { if (error) errorRef.current?.focus() }, [error])
  useEffect(() => {
    if (!retrySeconds) return undefined
    const timer = setTimeout(() => setRetrySeconds(seconds => Math.max(0, seconds - 1)), 1000)
    return () => clearTimeout(timer)
  }, [retrySeconds])
  function report(issue) {
    if (isSessionExpiredError(issue)) onSessionExpired()
    setError(getAuthErrorMessage(issue))
    setRetrySeconds(issue.retryAfterSeconds ?? 0)
  }
  async function generate() {
    if (submitting.current || unavailable) return
    submitting.current = true
    setError('')
    try { await onGenerate() } catch (issue) { report(issue) }
    finally { submitting.current = false }
  }
  async function changePage(next) {
    if (submitting.current || unavailable) return
    submitting.current = true
    setLoading(true); setError('')
    try { setPaged({ source: data, result: await requestDistributionQrTokens(accessToken, distribution.distributionId, { page: next }) }) }
    catch (issue) { report(issue) }
    finally { setLoading(false); submitting.current = false }
  }
  async function replace() {
    setReplacementError('')
    try { await onReplace(replacement); setReplacement(null) }
    catch (issue) { setReplacementError(getAuthErrorMessage(issue)); setRetrySeconds(issue.retryAfterSeconds ?? 0); throw issue }
  }
  return <section id="event-qr-credentials" aria-labelledby="event-qr-title" className="scroll-mt-28 overflow-hidden rounded-lg border border-line bg-white">
    <header className="flex items-start gap-3 border-b border-line p-4 sm:p-5"><span className="grid size-10 shrink-0 place-items-center rounded-lg bg-info-soft text-brand-blue"><Icon name="qr" /></span><div><h3 id="event-qr-title" className="font-bold text-ink">Beneficiary QR cards</h3><p className="mt-1 text-sm leading-6 text-copy">Save or print each card, then give it to the beneficiary for verification.</p></div></header>
    <div className="p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-copy"><strong className="text-ink">{current.summary.matchingTokenCount} issued</strong> · {readyCount} ready to generate</p><button type="button" disabled={!readyCount || unavailable} onClick={generate} className="ga-btn-primary"><Icon name="qr" className="size-4" />{busy === 'qr' ? <LoadingLabel>Generating...</LoadingLabel> : 'Generate remaining QR credentials'}</button></div>
      {error && <p ref={errorRef} tabIndex={-1} role="alert" className="mt-4 rounded-lg border border-red-200 bg-danger-soft p-3 text-sm leading-6 text-brand-red">{error}</p>}
      {retrySeconds > 0 && <p role="status" className="mt-3 text-sm text-copy">Please wait {Math.floor(retrySeconds / 60)}:{String(retrySeconds % 60).padStart(2, '0')} before trying again. Your event and appointments are unchanged.</p>}
      <div className="mt-4 flex items-start gap-2 rounded-lg bg-slate-50 p-3 text-sm leading-6 text-copy"><Icon name="info" className="mt-1 size-4 shrink-0" /><p>{current.summary.matchingTokenCount > 0 ? <><strong className="text-ink">Cards already issued.</strong> Use your saved card/PDF or the Token column in your CSV. To recover a lost copy, choose <strong>Replace lost QR</strong> below.</> : 'The QR image appears in a save-and-print window after generation. Keep that window open until you have saved the cards.'}</p></div>
      {current.qrTokens.length > 0 ? <ul aria-label="Issued beneficiary QR credentials" className="mt-4 divide-y divide-line border-y border-line">{current.qrTokens.map(item => <li key={item.qrTokenId} className="flex flex-wrap items-center justify-between gap-3 py-4"><div className="min-w-0 flex-1 basis-48"><p className="[overflow-wrap:anywhere] text-sm font-semibold text-ink">{name(item.beneficiary)}</p><p className="mt-1 text-xs leading-5 text-muted-copy">{item.qrStatus === 'USED' ? 'Used · cannot be replaced' : `${item.qrStatus === 'REVOKED' ? 'Revoked' : item.qrStatus === 'EXPIRED' ? 'Expired' : 'Issued'} · Valid until ${dateTime.format(new Date(item.expiresAt))} PHT`}</p></div>{['ACTIVE', 'REVOKED', 'EXPIRED'].includes(item.qrStatus) && <button type="button" disabled={unavailable} onClick={() => { setReplacementError(''); setReplacement(item) }} className="ga-btn-secondary text-sm"><Icon name="reset" className="size-4" />Replace lost QR</button>}</li>)}</ul> : !readyCount && !current.summary.matchingTokenCount && <p className="mt-4 text-sm leading-6 text-copy">No credentials are available yet. Check that the beneficiary has an active allocation and appointment in this event.</p>}
      {pages > 1 && <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-muted-copy"><span>Page {page} of {pages}</span><div className="flex gap-2"><button type="button" disabled={page <= 1 || unavailable} onClick={() => changePage(page - 1)} className="ga-btn-secondary">Previous</button><button type="button" disabled={page >= pages || unavailable} onClick={() => changePage(page + 1)} className="ga-btn-secondary">Next</button></div></div>}
      <p className="mt-4 flex items-start gap-2 text-xs leading-5 text-muted-copy"><Icon name="lock" className="mt-0.5 size-4 shrink-0" />Replacement invalidates the previous card. Used credentials and ended appointments cannot be replaced.</p>
    </div>
    {replacement && <ConfirmationDialog open title={`Replace QR for ${name(replacement.beneficiary)}?`} description="The previous card will stop working. A new QR card will appear once so you can save or print it. This does not create another appointment or claim." actionLabel="Create replacement QR" error={replacementError} confirmDisabled={retrySeconds > 0} onCancel={() => setReplacement(null)} onConfirm={replace} />}
  </section>
}
