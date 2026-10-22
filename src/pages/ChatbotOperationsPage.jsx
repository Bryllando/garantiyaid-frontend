import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import DashboardShell from '../components/layout/DashboardShell.jsx'
import { Icon } from '../components/ui/icon.jsx'
import { Skeleton } from '../components/ui/skeleton.jsx'
import { LoadingLabel } from '../components/ui/spinner.jsx'
import {
  getAuthErrorMessage,
  isSessionExpiredError,
  referChatbotEscalation,
  replyToChatbotEscalation,
  requestBeneficiary,
  requestChatbotConversation,
  requestChatbotEscalations,
  requestChatbotHistory,
  resolveChatbotEscalation,
} from '../auth/staffAuth.js'
import { connectChatbotRealtime } from '../realtime/staffRealtime.js'

const dateTime = new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Manila' })
const resolutionOptions = [
  ['ANSWERED', 'Answered'],
  ['REFERRED_TO_BARANGAY', 'Referred to barangay'],
  ['REFERRED_TO_DSWD', 'Referred to DSWD'],
  ['DUPLICATE_INQUIRY', 'Duplicate inquiry'],
  ['OUT_OF_SCOPE', 'Outside service scope'],
]
const statusTone = {
  ACTIVE: 'border-blue-200 bg-info-soft text-brand-blue',
  ESCALATED: 'border-amber-200 bg-warning-soft text-brand-amber',
  RESOLVED: 'border-emerald-200 bg-success-soft text-brand-green',
  ENDED: 'border-line bg-slate-100 text-copy',
}

function formatTime(value) { return value ? dateTime.format(new Date(value)) : 'Not recorded' }
function personName(beneficiary) { return [beneficiary?.firstName, beneficiary?.lastName].filter(Boolean).join(' ') }
function Status({ value }) { return <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${statusTone[value] ?? statusTone.ENDED}`}>{value.toLowerCase().replace(/^./, (letter) => letter.toUpperCase())}</span> }

function ConversationList({ rows, selectedId, onSelect, loading, error, page, pagination, onPageChange, onRetry }) {
  return <section className="ga-card flex flex-col overflow-hidden xl:min-h-[31rem]" aria-label="Conversations">
    <div className="border-b border-line px-4 py-3.5"><h2 className="font-extrabold text-ink">Conversations</h2><p className="mt-1 text-xs text-muted-copy">{pagination ? `${pagination.total} matching records` : 'Loading records'}</p></div>
    {loading ? <div className="space-y-3 p-4" role="status" aria-label="Loading conversations">{Array.from({ length: 5 }, (_, index) => <Skeleton key={index} className="h-24 rounded-xl" />)}</div> : error ? <div className="p-5" role="alert"><p className="text-sm text-brand-red">{error}</p><button type="button" onClick={onRetry} className="ga-btn-secondary mt-4">Try again</button></div> : rows.length === 0 ? <div className="p-7 text-center"><p className="font-bold text-ink">No conversations in this view</p><p className="mt-2 text-sm text-muted-copy">Try another status or return to the escalation inbox.</p></div> : <ul className="divide-y divide-line">{rows.map((item) => <li key={item.sessionId}><button type="button" onClick={() => onSelect(item.sessionId)} aria-current={selectedId === item.sessionId ? 'true' : undefined} className={`w-full px-4 py-4 text-left transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-brand-blue ${selectedId === item.sessionId ? 'bg-info-soft/70' : ''}`}><span className="flex items-start justify-between gap-3"><span className="min-w-0"><span className="block truncate font-bold text-ink">{item.beneficiary ? personName(item.beneficiary) : 'Unlinked public conversation'}</span><span className="mt-1 block truncate text-xs text-muted-copy">{item.beneficiary?.barangayName || 'Administrator review'} · {item.messageCount ?? 0} messages</span></span><Status value={item.status} /></span><span className="mt-3 flex items-center justify-between gap-2 text-xs text-muted-copy"><span className="truncate">{item.assignedStaff?.fullName || 'Unassigned'}</span><time dateTime={item.lastActivityAt}>{formatTime(item.lastActivityAt)}</time></span></button></li>)}</ul>}
    {pagination?.totalPages > 1 && <div className="mt-auto flex items-center justify-between gap-2 border-t border-line px-4 py-3 text-sm"><span className="text-muted-copy">Page {page} of {pagination.totalPages}</span><div className="flex gap-2"><button type="button" disabled={page <= 1} onClick={() => onPageChange(page - 1)} className="ga-btn-secondary min-h-10 px-3 text-xs">Previous</button><button type="button" disabled={page >= pagination.totalPages} onClick={() => onPageChange(page + 1)} className="ga-btn-secondary min-h-10 px-3 text-xs">Next</button></div></div>}
  </section>
}

function ReferralForm({ token, sessionId, onReferral, onSessionExpired, busy }) {
  const [beneficiaryId, setBeneficiaryId] = useState('')
  const [beneficiary, setBeneficiary] = useState(null)
  const [method, setMethod] = useState('IN_PERSON_AT_OFFICE')
  const [verified, setVerified] = useState(false)
  const [error, setError] = useState('')
  const [lookingUp, setLookingUp] = useState(false)

  async function lookup(event) {
    event.preventDefault()
    setLookingUp(true); setBeneficiary(null); setVerified(false); setError('')
    try {
      const record = await requestBeneficiary(token, beneficiaryId.trim())
      setBeneficiary(record)
    } catch (requestError) {
      if (isSessionExpiredError(requestError)) return onSessionExpired()
      setError(getAuthErrorMessage(requestError))
    } finally { setLookingUp(false) }
  }

  return <section className="mt-6 rounded-xl border border-blue-200 bg-info-soft/50 p-4 sm:p-5" aria-labelledby="referral-title">
    <p className="ga-eyebrow">Administrator handoff</p>
    <h3 id="referral-title" className="mt-1 font-extrabold text-ink">Refer to the assigned barangay</h3>
    <p className="mt-2 text-sm leading-6 text-copy">Verify the requester outside this chat, then link the correct active beneficiary record. Chat text alone is not identity proof.</p>
    <form onSubmit={lookup} className="mt-4 flex flex-col gap-2 sm:flex-row"><div className="min-w-0 flex-1"><label htmlFor="referral-beneficiary" className="ga-label">Beneficiary ID</label><input id="referral-beneficiary" type="text" required value={beneficiaryId} onChange={(event) => { setBeneficiaryId(event.target.value); setBeneficiary(null); setVerified(false) }} placeholder="Paste the beneficiary ID" className="ga-input mt-2" /></div><button type="submit" disabled={lookingUp || !beneficiaryId.trim()} className="ga-btn-secondary sm:self-end">{lookingUp ? <LoadingLabel>Checking...</LoadingLabel> : 'Look up record'}</button></form>
    {error && <p className="mt-3 text-sm font-semibold text-brand-red" role="alert">{error}</p>}
    {beneficiary && <div className="mt-4 rounded-lg border border-line bg-white p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-bold text-ink">{personName(beneficiary)}</p><p className="mt-1 text-sm text-muted-copy">{beneficiary.barangay?.barangayName || 'Barangay not recorded'}</p></div><span className="rounded-full border border-line px-2.5 py-1 text-xs font-bold text-copy">{beneficiary.status}</span></div><label htmlFor="referral-method" className="ga-label mt-5 block">How identity was verified</label><select id="referral-method" value={method} onChange={(event) => setMethod(event.target.value)} className="ga-input mt-2"><option value="IN_PERSON_AT_OFFICE">In person at the office</option><option value="REGISTERED_CONTACT_CALLBACK">Callback to registered contact</option></select><label className="mt-4 flex items-start gap-3 text-sm leading-6 text-copy"><input type="checkbox" checked={verified} onChange={(event) => setVerified(event.target.checked)} className="mt-1 size-4 accent-brand-blue" />I verified this requester and confirmed that this is the correct beneficiary record.</label><button type="button" disabled={busy || !verified || beneficiary.status !== 'ACTIVE'} onClick={() => onReferral(sessionId, { beneficiaryId: beneficiary.beneficiaryId, verificationMethod: method, identityVerified: true })} className="ga-btn-primary mt-4">{busy ? <LoadingLabel>Referring...</LoadingLabel> : 'Refer to barangay'}</button></div>}
  </section>
}

function ConversationDetail({ detail, loading, error, isAdmin, userId, token, busy, onReply, onResolve, onReferral, onSessionExpired, onRetry }) {
  const [reply, setReply] = useState('')
  const [resolution, setResolution] = useState('ANSWERED')
  if (loading) return <section className="ga-card p-5" role="status" aria-label="Loading conversation"><Skeleton className="h-8 w-56" /><Skeleton className="mt-5 h-24" /><Skeleton className="mt-3 h-24" /></section>
  if (error) return <section className="ga-card p-6" role="alert"><p className="font-bold text-ink">Conversation unavailable</p><p className="mt-2 text-sm text-muted-copy">{error}</p><button type="button" onClick={onRetry} className="ga-btn-secondary mt-4">Try again</button></section>
  if (!detail) return <section className="ga-card grid min-h-[31rem] place-items-center p-8 text-center"><div><span className="mx-auto grid size-12 place-items-center rounded-xl border border-blue-100 bg-info-soft text-brand-blue"><Icon name="helpCases" /></span><h2 className="mt-4 font-extrabold text-ink">Select a conversation</h2><p className="mt-2 max-w-xs text-sm leading-6 text-muted-copy">Review the transcript and ownership before replying or closing a case.</p></div></section>
  const { session, messages } = detail
  const canAct = session.status === 'ESCALATED' && (!session.assignedStaff || session.assignedStaff.userId === userId)
  return <section className="ga-card min-w-0 overflow-hidden" aria-label="Conversation details">
    <div className="border-b border-line p-5 sm:p-6"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="ga-eyebrow">Conversation record</p><h2 className="mt-1 text-xl font-extrabold text-ink">{session.beneficiary ? personName(session.beneficiary) : 'Unlinked public conversation'}</h2><p className="mt-1 text-sm text-muted-copy">{session.beneficiary?.barangayName || 'Administrator review'} · {session.language?.toUpperCase()}</p></div><Status value={session.status} /></div><dl className="mt-5 grid gap-3 border-t border-line pt-4 text-sm sm:grid-cols-2"><div><dt className="text-xs text-muted-copy">Owner</dt><dd className="mt-1 font-semibold text-ink">{session.assignedStaff?.fullName || 'Unassigned'}</dd></div><div><dt className="text-xs text-muted-copy">Last activity</dt><dd className="mt-1 font-semibold text-ink">{formatTime(session.lastActivityAt)}</dd></div><div><dt className="text-xs text-muted-copy">Beneficiary</dt><dd className="mt-1 font-semibold text-ink">{session.beneficiary ? session.beneficiary.beneficiaryId : 'Not linked'}</dd></div><div><dt className="text-xs text-muted-copy">Reason</dt><dd className="mt-1 font-semibold text-ink">{session.escalationReason?.replaceAll('_', ' ') || 'None recorded'}</dd></div></dl></div>
    <div className="border-b border-line bg-slate-50/60 p-4 sm:p-6"><h3 className="text-sm font-extrabold text-ink">Transcript</h3><ol className="mt-4 max-h-[32rem] space-y-3 overflow-y-auto pr-1" aria-label="Conversation transcript">{messages.map((message) => <li key={message.messageId} className={`max-w-[94%] rounded-xl border p-4 text-sm leading-6 ${message.senderType === 'STAFF' ? 'ml-auto border-blue-200 bg-info-soft' : 'border-line bg-white'}`}><div className="flex flex-wrap items-center justify-between gap-3 text-xs font-bold text-muted-copy"><span>{message.senderType === 'STAFF' ? message.staffUser?.fullName || 'Staff' : message.senderType === 'BOT' ? 'GarantiyAid Help' : 'Visitor'}</span><time dateTime={message.createdAt}>{formatTime(message.createdAt)}</time></div><p className="mt-2 whitespace-pre-wrap break-words text-ink">{message.messageText}</p></li>)}</ol>{messages.length === 0 && <p className="mt-4 text-sm text-muted-copy">No messages were recorded.</p>}</div>
    <div className="p-5 sm:p-6">{session.assignedStaff && !canAct && session.status === 'ESCALATED' && <p className="rounded-lg border border-line bg-slate-50 p-3 text-sm text-copy">This case is being handled by {session.assignedStaff.fullName}.</p>}
      {canAct && <><form onSubmit={(event) => { event.preventDefault(); onReply(session.sessionId, reply).then((sent) => { if (sent) setReply('') }) }}><label htmlFor="case-reply" className="ga-label">Staff reply</label><textarea id="case-reply" value={reply} onChange={(event) => setReply(event.target.value)} maxLength={1000} rows={3} required placeholder="Write a clear next step for the visitor" className="ga-input mt-2 min-h-28 resize-y" /><div className="mt-3 flex justify-end"><button type="submit" disabled={Boolean(busy) || !reply.trim()} className="ga-btn-primary">{busy === 'reply' ? <LoadingLabel>Sending...</LoadingLabel> : 'Send reply'}</button></div></form><div className="mt-6 border-t border-line pt-5"><label htmlFor="case-resolution" className="ga-label">Close case as</label><div className="mt-2 flex flex-col gap-2 sm:flex-row"><select id="case-resolution" value={resolution} onChange={(event) => setResolution(event.target.value)} className="ga-input flex-1">{resolutionOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><button type="button" disabled={Boolean(busy)} onClick={() => onResolve(session.sessionId, resolution)} className="ga-btn-secondary">{busy === 'resolve' ? <LoadingLabel>Closing...</LoadingLabel> : 'Close case'}</button></div></div></>}
      {isAdmin && session.isGeneric && canAct && <ReferralForm key={session.sessionId} token={token} sessionId={session.sessionId} onReferral={onReferral} onSessionExpired={onSessionExpired} busy={busy === 'refer'} />}
      <p className="mt-5 text-xs leading-5 text-muted-copy">Conversation text is retained only within the configured retention period. Do not request passwords, QR credentials, biometric data, or full identifiers in replies.</p>
    </div>
  </section>
}

function ChatbotOperationsPage({ session, onLogout, onNavigate, onSessionExpired }) {
  const isAdmin = session.user.role === 'SYSTEM_ADMIN'
  const [mode, setMode] = useState('inbox')
  const [status, setStatus] = useState('ESCALATED')
  const [assignedToMe, setAssignedToMe] = useState(false)
  const [page, setPage] = useState(1)
  const [list, setList] = useState(null)
  const [listError, setListError] = useState('')
  const [listLoading, setListLoading] = useState(true)
  const [selectedId, setSelectedId] = useState('')
  const [detail, setDetail] = useState(null)
  const [detailError, setDetailError] = useState('')
  const [detailLoading, setDetailLoading] = useState(false)
  const [reload, setReload] = useState(0)
  const [detailReload, setDetailReload] = useState(0)
  const [busy, setBusy] = useState('')
  const [liveStatus, setLiveStatus] = useState('connecting')
  const selectedRef = useRef(selectedId)
  const listRef = useRef(null)
  const detailRef = useRef(null)
  useEffect(() => { selectedRef.current = selectedId }, [selectedId])

  useEffect(() => {
    let active = true
    const request = mode === 'history'
      ? requestChatbotHistory(session.accessToken, { page, pageSize: 20, status })
      : requestChatbotEscalations(session.accessToken, { page, pageSize: 20, status, assignedToMe })
    request.then((data) => { if (active) { setList(data); setListError(''); setListLoading(false) } }).catch((error) => {
      if (!active) return
      if (isSessionExpiredError(error)) return onSessionExpired()
      setListError(getAuthErrorMessage(error)); setListLoading(false)
    })
    return () => { active = false }
  }, [assignedToMe, mode, onSessionExpired, page, reload, session.accessToken, status])

  useEffect(() => {
    if (!selectedId) return undefined
    let active = true
    requestChatbotConversation(session.accessToken, selectedId, mode === 'history').then((data) => {
      if (active) { setDetail(data); setDetailError('') }
    }).catch((error) => {
      if (!active) return
      if (isSessionExpiredError(error)) return onSessionExpired()
      setDetailError(getAuthErrorMessage(error))
    }).finally(() => { if (active) setDetailLoading(false) })
    return () => { active = false }
  }, [detailReload, mode, onSessionExpired, selectedId, session.accessToken])

  useEffect(() => {
    let active = true
    let connectedOnce = false
    let timer
    const refresh = () => { clearTimeout(timer); timer = setTimeout(() => setReload((value) => value + 1), 250) }
    const disconnect = connectChatbotRealtime(session.accessToken, {
      onReady: () => { if (!active) return; setLiveStatus('connected'); if (connectedOnce) refresh(); connectedOnce = true },
      onUpdate: (_, payload) => { if (!active) return; refresh(); if (payload?.data?.sessionId === selectedRef.current) setDetailReload((value) => value + 1) },
      onError: (error) => { if (!active) return; if (['AUTHENTICATION_REQUIRED', 'INVALID_TOKEN', 'INVALID_SESSION'].includes(error?.data?.code)) return onSessionExpired(); setLiveStatus('reconnecting') },
      onDisconnect: () => { if (active) setLiveStatus('reconnecting') },
    })
    return () => { active = false; clearTimeout(timer); disconnect() }
  }, [onSessionExpired, session.accessToken])

  const rows = list?.[mode === 'history' ? 'conversations' : 'escalations'] ?? []
  function switchMode(nextMode) { setMode(nextMode); setStatus(nextMode === 'history' ? '' : 'ESCALATED'); setPage(1); setSelectedId(''); setDetail(null); setDetailLoading(false); setList(null); setListLoading(true) }
  function selectCase(id) {
    setSelectedId(id); setDetail(null); setDetailError(''); setDetailLoading(true)
    if (window.innerWidth < 1280) requestAnimationFrame(() => { detailRef.current?.scrollIntoView({ block: 'start' }); detailRef.current?.focus({ preventScroll: true }) })
  }
  function report(error) { if (isSessionExpiredError(error)) return onSessionExpired(); toast.error(getAuthErrorMessage(error)) }
  async function reply(id, messageText) { setBusy('reply'); try { await replyToChatbotEscalation(session.accessToken, id, messageText); toast.success('Reply recorded.'); setReload((value) => value + 1); setDetailReload((value) => value + 1); return true } catch (error) { report(error); return false } finally { setBusy('') } }
  async function resolve(id, resolutionCode) { setBusy('resolve'); try { await resolveChatbotEscalation(session.accessToken, id, resolutionCode); toast.success('Case closed.'); if (mode === 'inbox') { setStatus('RESOLVED'); setPage(1) } setReload((value) => value + 1); setDetailReload((value) => value + 1) } catch (error) { report(error) } finally { setBusy('') } }
  async function refer(id, referral) { setBusy('refer'); try { await referChatbotEscalation(session.accessToken, id, referral); toast.success('Case referred to the assigned barangay.'); setReload((value) => value + 1); setDetailReload((value) => value + 1) } catch (error) { report(error) } finally { setBusy('') } }

  return <DashboardShell breadcrumbs={['Operations', 'Help cases']} currentPath="/help-cases" onLogout={onLogout} onNavigate={onNavigate} pageTitle="Help cases" user={session.user}>
    <header className="ga-page-header flex flex-col gap-4 border-b border-line pb-6 sm:flex-row sm:items-end sm:justify-between"><div><p className="ga-eyebrow">Public help follow-up</p><h1 className="ga-page-title mt-2">{isAdmin ? 'Help cases' : 'Help conversations'}</h1><p className="ga-page-copy">Review escalations, respond with a clear next step, and close cases within your assigned scope.</p></div><span role="status" className={`inline-flex w-fit items-center gap-2 rounded-full border px-3 py-2 text-xs font-bold ${liveStatus === 'connected' ? 'border-emerald-200 bg-success-soft text-brand-green' : 'border-amber-200 bg-warning-soft text-brand-amber'}`}><span aria-hidden="true" className="size-2 rounded-full bg-current" />{liveStatus === 'connected' ? 'Live updates' : 'Reconnecting'}</span></header>
    <div className="mt-6 flex flex-wrap items-center justify-between gap-3"><div className="flex rounded-lg border border-line bg-white p-1" aria-label="Conversation views"><button type="button" aria-pressed={mode === 'inbox'} onClick={() => switchMode('inbox')} className={`min-h-10 rounded-md px-4 text-sm font-bold ${mode === 'inbox' ? 'bg-brand-navy text-white' : 'text-copy hover:bg-slate-50'}`}>Escalation inbox</button>{isAdmin && <button type="button" aria-pressed={mode === 'history'} onClick={() => switchMode('history')} className={`min-h-10 rounded-md px-4 text-sm font-bold ${mode === 'history' ? 'bg-brand-navy text-white' : 'text-copy hover:bg-slate-50'}`}>Conversation history</button>}</div><button type="button" onClick={() => setReload((value) => value + 1)} className="ga-btn-secondary min-h-10 px-4 text-sm"><Icon name="reset" className="size-4" /> Refresh</button></div>
    <div className="ga-card mt-4 flex flex-wrap items-end gap-4 p-4"><div><label htmlFor="case-status" className="ga-label">Status</label><select id="case-status" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); setSelectedId(''); setDetail(null); setDetailLoading(false); setListLoading(true) }} className="ga-input mt-2 min-w-40">{mode === 'history' && <option value="">All statuses</option>}{(mode === 'history' ? ['ACTIVE', 'ESCALATED', 'RESOLVED', 'ENDED'] : ['ESCALATED', 'RESOLVED']).map((value) => <option key={value} value={value}>{value.toLowerCase().replace(/^./, (letter) => letter.toUpperCase())}</option>)}</select></div>{mode === 'inbox' && <label className="flex min-h-11 items-center gap-2 text-sm font-semibold text-copy"><input type="checkbox" checked={assignedToMe} onChange={(event) => { setAssignedToMe(event.target.checked); setPage(1); setListLoading(true) }} className="size-4 accent-brand-blue" />Assigned to me</label>}<p className="ml-auto max-w-md text-xs leading-5 text-muted-copy">Unlinked public conversations stay with the System Administrator until identity is verified and a barangay referral is recorded.</p></div>
    <div className="mt-5 grid min-w-0 gap-5 xl:grid-cols-[minmax(18rem,0.85fr)_minmax(0,1.65fr)]"><div ref={listRef} tabIndex={-1} className="min-w-0 scroll-mt-4 outline-none"><ConversationList rows={rows} selectedId={selectedId} onSelect={selectCase} loading={listLoading} error={listError} page={page} pagination={list?.pagination} onPageChange={(next) => { setPage(next); setListLoading(true) }} onRetry={() => { setListLoading(true); setReload((value) => value + 1) }} /></div><div ref={detailRef} tabIndex={-1} className="min-w-0 scroll-mt-4 outline-none">{selectedId && <button type="button" onClick={() => { listRef.current?.scrollIntoView({ block: 'start' }); listRef.current?.focus({ preventScroll: true }) }} className="mb-3 inline-flex min-h-11 items-center gap-2 text-sm font-bold text-brand-blue hover:underline xl:hidden"><Icon name="arrowLeft" className="size-4" />Back to conversations</button>}<ConversationDetail key={selectedId || 'empty'} detail={detail} loading={detailLoading} error={detailError} isAdmin={isAdmin} userId={session.user.userId} token={session.accessToken} busy={busy} onReply={reply} onResolve={resolve} onReferral={refer} onSessionExpired={onSessionExpired} onRetry={() => { setDetailLoading(true); setDetailReload((value) => value + 1) }} /></div></div>
  </DashboardShell>
}

export default ChatbotOperationsPage
