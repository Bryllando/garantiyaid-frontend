import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { getAuthErrorMessage, isSessionExpiredError, requestDistribution, requestDistributionList, requestAllDistributionSchedules } from '../../auth/staffAuth.js'
import { emptyPushEditor, pushAudiences, pushDraftErrors, pushRecipients, readPushWorkspace, savePushWorkspace } from '../../utils/pushDrafts.js'
import { Icon } from '../ui/icon.jsx'
import { LoadingLabel } from '../ui/spinner.jsx'

const nameOf = (row) => [row.beneficiary.firstName, row.beneficiary.lastName].filter(Boolean).join(' ')
const humanize = (value) => value.toLowerCase().replaceAll('_', ' ')
const eventDate = new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeZone: 'Asia/Manila' })
const dateTime = new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Manila' })

function NotificationPreview({ title, message }) {
  return <div className="rounded-xl border border-line bg-white p-4 [overflow-wrap:anywhere]">
    <div className="flex items-center gap-2 text-xs font-bold text-muted-copy"><Icon name="notifications" className="size-4 text-brand-blue" />GarantiyAid<span className="ml-auto font-normal">Preview</span></div>
    <p className="mt-3 whitespace-pre-wrap font-bold text-ink">{title.trim() || 'Notification title'}</p>
    <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-copy">{message.trim() || 'Your message will appear here.'}</p>
  </div>
}

function ReviewDraftDialog({ editor, distribution, recipients, onClose, onSave }) {
  const ref = useRef(null)
  const [error, setError] = useState('')
  useEffect(() => { ref.current?.showModal() }, [])
  return <dialog ref={ref} onCancel={onClose} onClose={onClose} aria-labelledby="push-review-title" className="m-auto max-h-[calc(100dvh-2rem)] w-[min(38rem,calc(100%-2rem))] overflow-y-auto rounded-2xl border border-line bg-white p-0 text-ink shadow-lg backdrop:bg-slate-950/55">
    <div className="border-b border-line p-5 sm:p-6"><p className="ga-eyebrow">Review before saving</p><h2 id="push-review-title" className="mt-2 text-xl font-extrabold">Review push notification</h2><p className="mt-2 text-sm leading-6 text-copy">Check the event, recipients, and wording. This saves a draft; no notification will be sent.</p></div>
    <div className="space-y-5 p-5 sm:p-6"><dl className="space-y-3 text-sm"><div><dt className="text-muted-copy">Distribution event</dt><dd className="mt-1 font-bold">{distribution.title}</dd></div><div><dt className="text-muted-copy">Recipients</dt><dd className="mt-1 font-bold">{recipients.length} {recipients.length === 1 ? 'beneficiary' : 'beneficiaries'} · {pushAudiences[editor.audience]}</dd></div><div><dt className="text-muted-copy">App delivery</dt><dd className="mt-1">Unavailable. Device registration and notification permission cannot be checked yet.</dd></div></dl>
      <details className="rounded-lg border border-line"><summary className="min-h-11 cursor-pointer px-4 py-3 text-sm font-bold text-brand-blue">Review recipient names</summary><ul className="max-h-48 overflow-y-auto border-t border-line px-4 py-2 text-sm">{recipients.map((row) => <li key={row.beneficiary.beneficiaryId} className="py-2">{nameOf(row)} <span className="text-muted-copy">· Queue #{row.queueNumber}</span></li>)}</ul></details>
      <NotificationPreview title={editor.title} message={editor.message} />
      {error && <p role="alert" className="text-sm text-brand-red">{error}</p>}
    </div>
    <div className="flex flex-col-reverse gap-3 border-t border-line p-5 sm:flex-row sm:justify-end"><button type="button" onClick={onClose} className="ga-btn-secondary">Back to editing</button><button type="button" onClick={() => { try { onSave() } catch { setError('The draft could not be saved in this tab. Your message is still here. Please try again.') } }} className="ga-btn-primary">Confirm and save draft</button></div>
  </dialog>
}

export default function PushNotificationWorkspace({ session, onNavigate, onSessionExpired, onDistributionChange }) {
  const [linkedId] = useState(() => new URLSearchParams(window.location.search).get('distribution') || '')
  const [initial] = useState(() => {
    try { return readPushWorkspace(sessionStorage, session.user.userId, linkedId) }
    catch { return { editor: emptyPushEditor(linkedId), drafts: [], storageError: 'Saved drafts could not be read. Keep this tab open and contact your system administrator.' } }
  })
  const [workspace, setWorkspace] = useState(initial)
  const { editor, drafts } = workspace
  const [storageError, setStorageError] = useState(initial.storageError || '')
  const [events, setEvents] = useState([])
  const [eventLoading, setEventLoading] = useState(true)
  const [eventError, setEventError] = useState('')
  const [eventReload, setEventReload] = useState(0)
  const [schedules, setSchedules] = useState([])
  const [loading, setLoading] = useState(Boolean(editor.distributionId))
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  const [errors, setErrors] = useState({})
  const [search, setSearch] = useState('')
  const [recipientPage, setRecipientPage] = useState(1)
  const [historyPage, setHistoryPage] = useState(1)
  const [review, setReview] = useState(null)
  const [reviewing, setReviewing] = useState(false)
  const formRef = useRef(null)
  const errorRef = useRef(null)
  const distribution = events.find((item) => item.distributionId === editor.distributionId)
  const programs = useMemo(() => [...new Map(events.filter((item) => item.program).map((item) => [item.programId, item.program])).values()], [events])
  const [programFilter, setProgramFilter] = useState('')
  const available = useMemo(() => pushRecipients(schedules, 'ACTIVE'), [schedules])
  const recipients = useMemo(() => pushRecipients(schedules, editor.audience, editor.selectedIds), [schedules, editor.audience, editor.selectedIds])
  const matches = available.filter((row) => `${nameOf(row)} ${row.queueNumber} ${row.beneficiary.barangay?.barangayName || ''}`.toLowerCase().includes(search.toLowerCase()))
  const missingSelected = editor.audience === 'SELECTED' ? editor.selectedIds.filter((id) => !available.some((row) => row.beneficiary.beneficiaryId === id)).length : 0
  const visibleDrafts = drafts.filter((item) => !editor.distributionId || item.distributionId === editor.distributionId)

  useEffect(() => { if (error && !loading) errorRef.current?.focus() }, [error, loading])
  useEffect(() => { if (Object.keys(errors).length) formRef.current?.querySelector('[aria-invalid="true"]')?.focus() }, [errors])

  useEffect(() => {
    onDistributionChange(editor.distributionId)
    const url = new URL(window.location.href)
    if (editor.distributionId) url.searchParams.set('distribution', editor.distributionId)
    else url.searchParams.delete('distribution')
    window.history.replaceState({}, '', url)
  }, [editor.distributionId, onDistributionChange])

  useEffect(() => {
    let active = true
    async function load() {
      const all = []
      for (let page = 1; ; page += 1) {
        const result = await requestDistributionList(session.accessToken, { page, pageSize: 100 })
        if (!active) return
        if (result.pagination.page !== page || !Number.isInteger(result.pagination.totalPages)) throw new Error('The event list could not be verified. Please try again.')
        all.push(...result.distributions)
        if (page >= result.pagination.totalPages) break
        if (!result.distributions.length) throw new Error('The event list is incomplete. Please try again.')
      }
      const wanted = linkedId || initial.editor.distributionId
      if (wanted && !all.some((item) => item.distributionId === wanted)) all.unshift(await requestDistribution(session.accessToken, wanted))
      if (active) { setEvents(all); setEventError('') }
    }
    load().catch((issue) => { if (active) { if (isSessionExpiredError(issue)) onSessionExpired(); else setEventError(getAuthErrorMessage(issue)) } }).finally(() => { if (active) setEventLoading(false) })
    return () => { active = false }
  }, [eventReload, initial.editor.distributionId, linkedId, onSessionExpired, session.accessToken])

  useEffect(() => {
    if (!editor.distributionId) return undefined
    let active = true
    requestAllDistributionSchedules(session.accessToken, editor.distributionId)
      .then((rows) => { if (active) { setSchedules(rows); setRecipientPage(1); setError('') } })
      .catch((issue) => { if (active) { if (isSessionExpiredError(issue)) onSessionExpired(); else setError(getAuthErrorMessage(issue)) } })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [editor.distributionId, onSessionExpired, reload, session.accessToken])

  function persist(next) {
    if (initial.storageError) throw new Error(initial.storageError)
    savePushWorkspace(sessionStorage, session.user.userId, next)
    setStorageError('')
  }

  function updateEditor(changes) {
    const next = { ...workspace, editor: { ...editor, ...changes } }
    setWorkspace(next)
    setErrors({})
    try { persist(next) } catch { setStorageError('Changes could not be saved in this tab. Keep this page open and try again.') }
  }

  function selectEvent(distributionId) {
    updateEditor({ distributionId, selectedIds: [] })
    setSchedules([]); setLoading(Boolean(distributionId)); setError(''); setSearch(''); setRecipientPage(1); setHistoryPage(1)
  }

  async function preview(event) {
    event.preventDefault()
    const validation = pushDraftErrors(editor, recipients.length)
    if (Object.keys(validation).length) {
      setErrors(validation)
      return
    }
    setReviewing(true); setError('')
    try {
      const rows = await requestAllDistributionSchedules(session.accessToken, editor.distributionId)
      const current = pushRecipients(rows, editor.audience, editor.selectedIds)
      setSchedules(rows)
      setRecipientPage(1)
      if (!current.length) throw new Error('No selected beneficiaries still have an eligible assignment. Review recipients before continuing.')
      setReview({ editor: { ...editor, selectedIds: editor.audience === 'SELECTED' ? current.map((row) => row.beneficiary.beneficiaryId) : editor.selectedIds, title: editor.title.trim(), message: editor.message.trim() }, recipients: current })
    } catch (issue) {
      if (isSessionExpiredError(issue)) onSessionExpired()
      else setError(getAuthErrorMessage(issue))
    } finally { setReviewing(false) }
  }

  function saveReviewedDraft() {
    const saved = { ...review.editor, id: review.editor.id || crypto.randomUUID(), status: 'DRAFT', recipientCount: review.recipients.length, savedAt: new Date().toISOString() }
    const next = { editor: { ...review.editor, id: saved.id }, drafts: [saved, ...drafts.filter((item) => item.id !== saved.id)] }
    persist(next)
    setWorkspace(next); setReview(null); setHistoryPage(1)
    toast.success('Push draft saved in this tab.', { description: 'No app notification was sent.' })
  }

  function openDraft(item) {
    selectEvent(item.distributionId)
    const next = { ...workspace, editor: { id: item.id, distributionId: item.distributionId, audience: item.audience, selectedIds: item.selectedIds, title: item.title, message: item.message } }
    setWorkspace(next)
    try { persist(next) } catch { setStorageError('Changes could not be saved in this tab. Keep this page open and try again.') }
    setProgramFilter(''); setReload((value) => value + 1)
    requestAnimationFrame(() => document.getElementById('push-title')?.focus())
  }

  return <div className="space-y-6">
    <div className="border-l-4 border-brand-amber bg-warning-soft px-4 py-3 text-sm leading-6" role="note"><strong className="text-ink">Push delivery is not available yet.</strong><p className="text-copy">Prepare and review notices here. Drafts stay in this browser tab until you sign out or close it; they are not shared with other staff.</p></div>
    {editor.distributionId && <a href={`/distributions/manage?event=${encodeURIComponent(editor.distributionId)}`} onClick={(event) => { event.preventDefault(); onNavigate(`/distributions/manage?event=${encodeURIComponent(editor.distributionId)}`) }} className="inline-flex min-h-11 items-center gap-2 text-sm font-bold text-brand-blue hover:underline"><Icon name="arrowLeft" className="size-4" />Return to distribution event</a>}
    {storageError && <p role="alert" className="rounded-lg border border-red-200 bg-danger-soft p-4 text-sm text-brand-red">{storageError}</p>}
    <form ref={formRef} onSubmit={preview} noValidate className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
      <fieldset disabled={reviewing} className="min-w-0 space-y-5">
        <section className="ga-card overflow-hidden" aria-labelledby="push-recipients-heading">
          <div className="border-b border-line px-5 py-4"><h2 id="push-recipients-heading" className="ga-section-heading">1. Select recipients</h2><p className="mt-1 text-sm text-muted-copy">Use the event assignments to define who this notice is for.</p></div>
          <div className="space-y-4 p-5">
            {eventError ? <div role="alert"><p className="text-sm text-brand-red">{eventError}</p><button type="button" className="ga-btn-secondary mt-3" disabled={eventLoading} onClick={() => { setEventLoading(true); setEventReload((value) => value + 1) }}>{eventLoading ? <LoadingLabel>Loading events...</LoadingLabel> : 'Retry events'}</button></div> : <>
              <div><label htmlFor="push-program" className="ga-label">Filter events by program</label><select id="push-program" disabled={eventLoading} value={programFilter} onChange={(event) => { setProgramFilter(event.target.value); if (distribution && distribution.programId !== event.target.value && event.target.value) selectEvent('') }} className="ga-input mt-2"><option value="">All programs</option>{programs.map((program) => <option key={program.programId} value={program.programId}>{program.programName}</option>)}</select></div>
              <div><label htmlFor="push-event" className="ga-label">Distribution event</label><select id="push-event" value={editor.distributionId} disabled={eventLoading} aria-invalid={Boolean(errors.distributionId)} aria-describedby={errors.distributionId ? 'push-event-error' : undefined} onChange={(event) => selectEvent(event.target.value)} className="ga-input mt-2"><option value="">{eventLoading ? 'Loading events...' : 'Select an event'}</option>{events.filter((item) => !programFilter || item.programId === programFilter).map((item) => <option key={item.distributionId} value={item.distributionId}>{item.title} · {humanize(item.status)}</option>)}</select>{errors.distributionId && <p id="push-event-error" className="mt-2 text-sm text-brand-red">{errors.distributionId}</p>}{!eventLoading && !events.length && <p className="mt-2 text-sm text-muted-copy">No distribution events are available yet.</p>}</div>
            </>}
            {distribution && <p className="border-l-2 border-line pl-3 text-sm leading-6 text-copy">{distribution.program?.programName}<br />{eventDate.format(new Date(distribution.distributionDate))} · {distribution.location || distribution.barangay?.barangayName}</p>}
            <div><label htmlFor="push-audience" className="ga-label">Recipient group</label><select id="push-audience" value={editor.audience} onChange={(event) => { updateEditor({ audience: event.target.value }); setRecipientPage(1) }} disabled={!distribution || loading || Boolean(error)} aria-invalid={Boolean(errors.recipients)} aria-describedby={errors.recipients ? 'push-audience-help push-recipients-error' : 'push-audience-help'} className="ga-input mt-2">{Object.entries(pushAudiences).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><p id="push-audience-help" className="mt-2 text-xs leading-5 text-muted-copy">Cancelled assignments are excluded. Each beneficiary is counted once.</p>{errors.recipients && <p id="push-recipients-error" className="mt-2 text-sm text-brand-red">{errors.recipients}</p>}</div>
            {loading ? <p role="status" className="text-sm text-copy"><LoadingLabel>Loading event recipients...</LoadingLabel></p> : error ? <div ref={errorRef} tabIndex={-1} role="alert" className="rounded-lg border border-red-200 bg-danger-soft p-4 outline-none"><p className="text-sm text-brand-red">{error}</p><button type="button" onClick={() => { setLoading(true); setSchedules([]); setError(''); setReload((value) => value + 1) }} className="ga-btn-secondary mt-3">Refresh recipients</button></div> : distribution && <>
              <div role="status" className="flex flex-wrap items-center justify-between gap-2 border-y border-line py-3"><p className="text-sm"><strong className="font-bold text-ink">{recipients.length}</strong> selected · {available.length} with non-cancelled assignments</p><button type="button" onClick={() => { setLoading(true); setSchedules([]); setReload((value) => value + 1) }} className="ga-admin-link">Refresh recipients</button></div>
              {!available.length && <p className="text-sm leading-6 text-copy">No beneficiaries have a non-cancelled assignment for this event. Review the event schedule before preparing a notice.</p>}
              {missingSelected > 0 && <p role="status" className="text-sm text-brand-amber">{missingSelected} previously selected {missingSelected === 1 ? 'beneficiary is' : 'beneficiaries are'} no longer available and will be excluded from the draft.</p>}
              <details open={editor.audience === 'SELECTED' ? true : undefined} className="rounded-lg border border-line">
                <summary className="min-h-11 cursor-pointer px-4 py-3 text-sm font-bold text-brand-blue">{editor.audience === 'SELECTED' ? 'Choose beneficiaries' : 'View event beneficiaries'}</summary>
                <div className="border-t border-line p-4"><label htmlFor="push-recipient-search" className="ga-label">Find by name, queue number, or barangay</label><input id="push-recipient-search" type="search" value={search} onChange={(event) => { setSearch(event.target.value); setRecipientPage(1) }} className="ga-input mt-2" />
                  <ul tabIndex={0} aria-label="Event beneficiaries" className="mt-3 max-h-80 overflow-y-auto overscroll-contain divide-y divide-line focus-visible:outline-2 focus-visible:outline-brand-blue">{matches.slice((recipientPage - 1) * 10, recipientPage * 10).map((row) => <li key={row.beneficiary.beneficiaryId}><label className="flex min-h-12 items-start gap-3 py-3">{editor.audience === 'SELECTED' && <input type="checkbox" checked={editor.selectedIds.includes(row.beneficiary.beneficiaryId)} onChange={(event) => updateEditor({ selectedIds: event.target.checked ? [...editor.selectedIds, row.beneficiary.beneficiaryId] : editor.selectedIds.filter((id) => id !== row.beneficiary.beneficiaryId) })} className="mt-1 size-5 shrink-0 accent-brand-blue" />}<span className="min-w-0 text-sm"><span className="font-bold">{nameOf(row)}</span><span className="mt-1 block text-xs text-muted-copy">Queue #{row.queueNumber} · {humanize(row.status)}{row.beneficiary.barangay?.barangayName && ` · ${row.beneficiary.barangay.barangayName}`}</span></span>{editor.audience !== 'SELECTED' && <span className="ml-auto text-xs text-muted-copy">{recipients.some((item) => item.beneficiary.beneficiaryId === row.beneficiary.beneficiaryId) ? 'Included' : 'Excluded'}</span>}</label></li>)}</ul>
                  {!matches.length && <p className="py-3 text-sm text-muted-copy">No matching beneficiaries.</p>}
                  {matches.length > 10 && <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs"><p>Page {recipientPage} of {Math.ceil(matches.length / 10)}</p><div className="flex gap-2"><button type="button" disabled={recipientPage <= 1} className="ga-btn-secondary" onClick={() => setRecipientPage((value) => value - 1)}>Previous recipients</button><button type="button" disabled={recipientPage * 10 >= matches.length} className="ga-btn-secondary" onClick={() => setRecipientPage((value) => value + 1)}>Next recipients</button></div></div>}
                </div>
              </details>
            </>}
          </div>
        </section>
        <section className="ga-card overflow-hidden" aria-labelledby="push-message-heading"><div className="border-b border-line px-5 py-4"><h2 id="push-message-heading" className="ga-section-heading">2. Write the notice</h2><p className="mt-1 text-sm text-muted-copy">State what changed, when to attend, or what beneficiaries need to bring.</p></div><div className="space-y-4 p-5">
          <div><label htmlFor="push-title" className="ga-label">Notification title</label><input id="push-title" value={editor.title} maxLength={80} aria-invalid={Boolean(errors.title)} aria-describedby="push-title-help" onChange={(event) => updateEditor({ title: event.target.value })} className="ga-input mt-2" placeholder="e.g. Updated distribution schedule" /><p id="push-title-help" className={`mt-2 text-xs ${errors.title ? 'text-brand-red' : 'text-muted-copy'}`}>{errors.title || `${editor.title.length}/80 characters`}</p></div>
          <div><label htmlFor="push-message" className="ga-label">Message</label><textarea id="push-message" value={editor.message} rows={5} maxLength={500} aria-invalid={Boolean(errors.message)} aria-describedby="push-message-help" onChange={(event) => updateEditor({ message: event.target.value })} className="ga-input mt-2 resize-y py-3" placeholder="Write a short notice with a clear next step." /><p id="push-message-help" className={`mt-2 text-xs leading-5 ${errors.message ? 'text-brand-red' : 'text-muted-copy'}`}>{errors.message || `${editor.message.length}/500 characters. Keep personal and claim details out of notifications that may appear on a lock screen.`}</p></div>
        </div></section>
      </fieldset>
      <aside className="ga-card min-w-0 p-5 xl:sticky xl:top-24" aria-labelledby="push-preview-heading"><h2 id="push-preview-heading" className="ga-section-heading">3. Preview and review</h2><p className="mt-2 mb-4 text-sm leading-6 text-muted-copy">An example of how the notice may appear on a beneficiary’s device.</p><NotificationPreview title={editor.title} message={editor.message} /><dl className="my-5 space-y-3 text-sm"><div className="flex justify-between gap-3"><dt className="text-muted-copy">Selected recipients</dt><dd className="font-bold">{loading || error ? 'Not verified' : recipients.length}</dd></div><div className="flex justify-between gap-3"><dt className="text-muted-copy">Can receive push</dt><dd className="font-semibold">Not available</dd></div><div className="flex justify-between gap-3"><dt className="text-muted-copy">Status</dt><dd className="font-bold text-brand-amber">Draft · not sent</dd></div></dl><p className="mb-4 text-xs leading-5 text-muted-copy">A schedule or mobile number does not confirm that someone can receive a push notification.</p><button type="submit" disabled={loading || eventLoading || Boolean(error) || Boolean(eventError) || reviewing || Boolean(initial.storageError)} className="ga-btn-primary w-full">{reviewing ? <LoadingLabel>Checking recipients...</LoadingLabel> : 'Review notification'}</button><p className="mt-3 text-xs leading-5 text-muted-copy">Recipients are checked again before review.</p><button type="button" disabled aria-describedby="push-send-help" className="ga-btn-secondary mt-3 w-full">Send unavailable</button><p id="push-send-help" className="mt-2 text-xs leading-5 text-muted-copy">Sending will be available when app delivery is connected.</p></aside>
    </form>
    <section className="ga-card overflow-hidden" aria-labelledby="push-history-heading"><div className="flex flex-wrap items-start justify-between gap-3 border-b border-line p-5"><div><h2 id="push-history-heading" className="ga-section-heading">Draft history</h2><p className="mt-1 text-sm text-muted-copy">{editor.distributionId ? 'For the selected event. ' : ''}Saved in this tab only. No delivery records yet.</p></div><button type="button" className="ga-btn-secondary" disabled={reviewing} onClick={() => { updateEditor(emptyPushEditor(editor.distributionId)); document.getElementById('push-title')?.focus() }}>New notice</button></div>
      {!visibleDrafts.length ? <div className="p-6"><p className="font-bold">No saved push drafts</p><p className="mt-2 text-sm leading-6 text-muted-copy">Review a notice and confirm the draft to keep it here.</p></div> : <ul className="divide-y divide-line">{visibleDrafts.slice((historyPage - 1) * 5, historyPage * 5).map((item) => <li key={item.id} className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><h3 className="break-words font-bold">{item.title}</h3><p className="mt-1 text-sm text-muted-copy">{events.find((entry) => entry.distributionId === item.distributionId)?.title || 'Distribution event'} · {item.recipientCount} selected at review</p><p className="mt-1 text-xs text-muted-copy">Saved {dateTime.format(new Date(item.savedAt))} PHT</p></div><div className="flex shrink-0 flex-wrap items-center gap-3"><span className="rounded-full border border-line bg-slate-50 px-3 py-1 text-xs font-bold text-copy">Draft · not sent</span><button type="button" className="ga-btn-secondary" disabled={reviewing} onClick={() => openDraft(item)} aria-label={`Open draft: ${item.title}`}>Open draft</button></div></li>)}</ul>}
      {visibleDrafts.length > 5 && <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line p-4 text-sm"><p>Page {historyPage} of {Math.ceil(visibleDrafts.length / 5)}</p><div className="flex gap-2"><button type="button" className="ga-btn-secondary" disabled={historyPage === 1} onClick={() => setHistoryPage((value) => value - 1)}>Previous drafts</button><button type="button" className="ga-btn-secondary" disabled={historyPage * 5 >= visibleDrafts.length} onClick={() => setHistoryPage((value) => value + 1)}>Next drafts</button></div></div>}
    </section>
    {review && <ReviewDraftDialog editor={review.editor} distribution={distribution} recipients={review.recipients} onClose={() => setReview(null)} onSave={saveReviewedDraft} />}
  </div>
}
