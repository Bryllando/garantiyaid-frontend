import { useEffect, useRef, useState } from 'react'
import { ConfirmationDialog } from '../ui/confirmation-dialog.jsx'
import { Icon } from '../ui/icon.jsx'
import { LoadingLabel } from '../ui/spinner.jsx'
import { getAuthErrorMessage, isSessionExpiredError, requestBeneficiaryList, requestMobileAccounts, reviewMobileAccount } from '../../auth/staffAuth.js'

const fullName = person => [person.firstName, person.middleName, person.lastName].filter(Boolean).join(' ')
const date = value => new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(value))

function LinkReview({ account, token, onSessionExpired, onReviewed, onOpenRecord }) {
  const [search, setSearch] = useState(account.lastName)
  const [filters, setFilters] = useState({ search: account.lastName, page: 1 })
  const [results, setResults] = useState(null)
  const [selected, setSelected] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [decision, setDecision] = useState(null)
  const [decisionError, setDecisionError] = useState('')
  const [identityChecked, setIdentityChecked] = useState(false)

  useEffect(() => {
    if (account.status !== 'PENDING') return
    let active = true
    requestBeneficiaryList(token, { ...filters, pageSize: 10, barangayId: account.barangayId, status: 'ACTIVE' })
      .then(data => { if (active) { setResults(data); setLoading(false) } })
      .catch(failure => { if (!active) return; if (isSessionExpiredError(failure)) onSessionExpired(); else { setError(getAuthErrorMessage(failure)); setLoading(false) } })
    return () => { active = false }
  }, [account.status, account.barangayId, token, filters, onSessionExpired])

  function findRecords(event) {
    event.preventDefault()
    setError(''); setLoading(true); setSelected(null)
    setFilters({ search: search.trim(), page: 1 })
  }

  async function confirm(note) {
    setDecisionError('')
    try {
      await reviewMobileAccount(token, account.accountId, {
        decision: decision.type, revision: account.revision, note,
        ...(decision.type === 'LINK' ? { beneficiaryId: decision.person.beneficiaryId, confirmedIdentity: true } : {}),
      })
      setDecision(null)
      onReviewed(decision.type === 'LINK' ? 'Mobile account linked to the existing beneficiary.' : 'Request returned for correction.')
    } catch (failure) {
      if (isSessionExpiredError(failure)) onSessionExpired()
      else setDecisionError(`${getAuthErrorMessage(failure)} Close this confirmation and refresh the requests if the record changed.`)
      throw failure
    }
  }

  return <section aria-labelledby="mobile-request-review-title" className="min-w-0 p-5 sm:p-6">
    <p className="text-xs font-semibold uppercase tracking-wide text-muted-copy">Submitted from mobile · {account.status.toLowerCase()}</p>
    <h3 id="mobile-request-review-title" className="mt-2 text-lg font-bold text-ink">{fullName(account)}</h3>
    <p className="mt-1 text-sm text-copy">Birth date: <strong>{date(account.birthDate)}</strong></p>
    <p className="mt-3 text-sm leading-6 text-muted-copy">The submitted name is a claim of identity. Check official records and confirm account ownership before linking.</p>
    {account.status !== 'PENDING' ? <div className="mt-5 rounded-lg border border-line p-4">
      <h4 className="font-semibold">{account.status === 'LINKED' ? 'Linked beneficiary record' : 'Correction requested'}</h4>
      {account.beneficiary && <><p className="mt-2 text-sm">{fullName(account.beneficiary)} · {date(account.beneficiary.birthDate)}</p><button type="button" className="ga-btn-secondary mt-3" onClick={() => onOpenRecord(account.beneficiaryId)}>Open beneficiary record<Icon name="arrowRight" className="size-4" /></button></>}
      <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-copy">{account.reviewNote}</p>
    </div> : <>
      <form className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-end" onSubmit={findRecords}>
        <div className="min-w-0 flex-1"><label htmlFor="mobile-match-search" className="ga-label">Find an existing beneficiary in this barangay</label><div className="relative mt-2"><Icon name="search" className="pointer-events-none absolute left-3 top-3.5 size-4 text-muted-copy" /><input id="mobile-match-search" className="ga-input pl-10" maxLength={100} value={search} onChange={event => setSearch(event.target.value)} placeholder="Last name, email, or PhilSys number" /></div></div>
        <button type="submit" className="ga-btn-secondary" disabled={loading}>Search records</button>
      </form>
      {error && <p role="alert" className="mt-4 text-sm text-brand-red">{error} Search again to retry.</p>}
      {loading ? <p role="status" className="mt-5 text-sm text-copy"><LoadingLabel>Finding records…</LoadingLabel></p> : !error && results && <>
        <p className="mt-4 text-xs leading-5 text-muted-copy">{results.pagination.total} matching records. Select only after comparing the details. A name match does not prove identity.</p>
        <ul className="mt-3 divide-y divide-line rounded-lg border border-line">
          {results.beneficiaries.map(person => <li key={person.beneficiaryId} className="p-3">
            <label className={`flex cursor-pointer items-start gap-3 rounded-md p-2 ${selected?.beneficiaryId === person.beneficiaryId ? 'bg-info-soft' : 'hover:bg-slate-50'}`}>
              <input type="radio" name="mobile-beneficiary-match" className="mt-1 size-4 shrink-0 accent-brand-blue" checked={selected?.beneficiaryId === person.beneficiaryId} disabled={person.mobileAccount?.status === 'LINKED'} onChange={() => setSelected(person)} />
              <span className="min-w-0 text-sm"><strong className="block break-words">{fullName(person)}</strong><span className="mt-1 block text-copy">{date(person.birthDate)} · {person.barangay?.barangayName}</span><span className="mt-1 block break-words text-muted-copy">{person.address}</span>{person.mobileAccount?.status === 'LINKED' && <span className="mt-1 block font-medium text-muted-copy">Already linked to a mobile account</span>}</span>
            </label>
          </li>)}
          {results.beneficiaries.length === 0 && <li className="p-4 text-sm leading-6 text-copy">No records found. Try another spelling or check the imported records. If this is a new person, register one verified beneficiary record first, then return here to link it.</li>}
        </ul>
        {results.pagination.totalPages > 1 && <div className="mt-3 flex items-center justify-between gap-2 text-xs"><span>Page {results.pagination.page} of {results.pagination.totalPages}</span><div className="flex gap-2">{[-1, 1].map(direction => <button type="button" className="ga-btn-secondary" key={direction} disabled={direction < 0 ? filters.page <= 1 : filters.page >= results.pagination.totalPages} onClick={() => { setLoading(true); setSelected(null); setFilters(current => ({ ...current, page: current.page + direction })) }}>{direction < 0 ? 'Previous' : 'Next'}</button>)}</div></div>}
      </>}
      <div className="mt-5 flex flex-col gap-2 border-t border-line pt-4 sm:flex-row sm:justify-between">
        <button type="button" className="ga-btn-secondary" onClick={() => { setDecisionError(''); setDecision({ type: 'REJECT' }) }}>Request correction</button>
        <button type="button" className="ga-btn-primary" disabled={!selected || loading || Boolean(error)} onClick={() => { setIdentityChecked(false); setDecisionError(''); setDecision({ type: 'LINK', person: selected }) }}><Icon name="mobile" className="size-4" />Review account link</button>
      </div>
    </>}
    <ConfirmationDialog open={Boolean(decision)} onCancel={() => setDecision(null)} onConfirm={confirm} error={decisionError}
      title={decision?.type === 'LINK' ? 'Link this mobile account?' : 'Request an identity correction'}
      description={decision?.type === 'LINK' ? `Link ${fullName(account)} to ${fullName(decision.person)}, born ${date(decision.person.birthDate)}. This uses the existing record and keeps its documents and applications.` : 'Explain which identity details or evidence the account owner must correct. They can resubmit from the mobile app.'}
      reasonLabel={decision?.type === 'LINK' ? 'Evidence checked and account ownership confirmed' : 'Correction needed'}
      actionLabel={decision?.type === 'LINK' ? 'Confirm account link' : 'Send correction request'}
      confirmDisabled={decision?.type === 'LINK' && !identityChecked}>
      {decision?.type === 'LINK' && <label className="mt-4 flex items-start gap-3 text-sm leading-6"><input type="checkbox" className="mt-1 size-4 shrink-0 accent-brand-blue" checked={identityChecked} onChange={event => setIdentityChecked(event.target.checked)} /><span>I verified that this mobile account belongs to the person in this beneficiary record.</span></label>}
    </ConfirmationDialog>
  </section>
}

export default function MobileAccountRequestsDialog({ token, barangays, onClose, onNavigate, onSessionExpired }) {
  const dialogRef = useRef(null)
  const [status, setStatus] = useState('PENDING')
  const [page, setPage] = useState(1)
  const [reload, setReload] = useState(0)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedId, setSelectedId] = useState('')
  const [notice, setNotice] = useState('')
  useEffect(() => { dialogRef.current.showModal() }, [])
  useEffect(() => {
    let active = true
    requestMobileAccounts(token, { status, page })
      .then(result => { if (active) { setData(result); setLoading(false) } })
      .catch(failure => { if (!active) return; if (isSessionExpiredError(failure)) onSessionExpired(); else { setError(getAuthErrorMessage(failure)); setLoading(false) } })
    return () => { active = false }
  }, [token, status, page, reload, onSessionExpired])
  function refresh() { setError(''); setLoading(true); setSelectedId(''); setReload(value => value + 1) }
  const selected = !loading && !error && data?.accounts.find(account => account.accountId === selectedId)
  return <dialog ref={dialogRef} aria-labelledby="mobile-requests-title" onCancel={onClose} className="m-auto max-h-[calc(100dvh-2rem)] w-[min(66rem,calc(100%-2rem))] overflow-y-auto rounded-xl border border-line bg-white p-0 text-ink shadow-lg backdrop:bg-slate-950/55">
    <header className="flex items-start justify-between gap-4 border-b border-line p-5 sm:p-6"><div><h2 id="mobile-requests-title" className="flex items-center gap-2 text-xl font-bold"><Icon name="mobile" className="size-5 text-brand-blue" />Mobile account requests</h2><p className="mt-2 text-sm leading-6 text-copy">Connect an account to one verified beneficiary record.</p></div><button type="button" aria-label="Close mobile account requests" className="ga-btn-secondary shrink-0 px-3" onClick={onClose}><Icon name="close" className="size-5" /></button></header>
    <div className="flex flex-wrap items-end gap-3 border-b border-line px-5 py-4 sm:px-6"><div><label htmlFor="mobile-request-status" className="ga-label">Request status</label><select id="mobile-request-status" value={status} onChange={event => { setStatus(event.target.value); setPage(1); setLoading(true); setSelectedId(''); setError('') }} className="ga-input mt-2"><option value="PENDING">Needs review</option><option value="LINKED">Linked accounts</option><option value="REJECTED">Correction requested</option></select></div><button type="button" className="ga-btn-secondary" onClick={refresh} disabled={loading}><Icon name="reset" className="size-4" />Refresh</button></div>
    {notice && <p role="status" className="border-b border-line bg-emerald-50 px-6 py-3 text-sm text-emerald-800">{notice}</p>}
    {loading ? <p role="status" className="p-6"><LoadingLabel>Loading requests…</LoadingLabel></p> : error ? <div role="alert" className="p-6"><p className="text-sm text-brand-red">{error}</p><button type="button" className="ga-btn-secondary mt-4" onClick={refresh}>Try again</button></div> : data && <>
      {!data.mobileAuthenticationConfigured && <p className="border-b border-line bg-slate-50 px-6 py-3 text-sm leading-6 text-copy">Mobile integration is not connected yet. Requests will appear after your mobile backend is configured.</p>}
      {data.accounts.length === 0 ? <div className="px-6 py-10 text-center"><Icon name="mobile" className="mx-auto size-8 text-muted-copy" /><h3 className="mt-3 font-semibold">{status === 'PENDING' ? 'No accounts waiting for review' : 'No requests in this status'}</h3><p className="mt-2 text-sm leading-6 text-muted-copy">Existing imported beneficiaries stay in the beneficiary register. Mobile registration will request a link rather than create a second person.</p></div> : <div className="grid min-w-0 md:grid-cols-[16rem_minmax(0,1fr)]">
        <nav aria-label="Mobile account requests" className={`border-b border-line md:border-b-0 md:border-r ${selected ? 'hidden md:block' : ''}`}><ul className="divide-y divide-line">{data.accounts.map(account => <li key={account.accountId}><button type="button" aria-current={selectedId === account.accountId ? 'true' : undefined} onClick={() => setSelectedId(account.accountId)} className={`w-full p-5 text-left hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-brand-blue ${selectedId === account.accountId ? 'bg-info-soft' : ''}`}><strong className="block break-words text-sm">{fullName(account)}</strong><span className="mt-1 block text-xs text-muted-copy">{date(account.birthDate)} · {barangays.find(item => item.barangayId === account.barangayId)?.barangayName ?? 'Service barangay'}</span><span className="mt-3 inline-flex items-center gap-2 text-xs font-semibold text-brand-blue">Review request<Icon name="chevronRight" className="size-3" /></span></button></li>)}</ul></nav>
        <div className="min-w-0">{selected ? <><button type="button" onClick={() => setSelectedId('')} className="ga-btn-secondary m-5 mb-0 md:hidden"><Icon name="arrowLeft" className="size-4" />All requests</button><LinkReview key={`${selected.accountId}:${selected.revision}`} account={selected} token={token} onSessionExpired={onSessionExpired} onReviewed={message => { setNotice(message); refresh() }} onOpenRecord={beneficiaryId => { onClose(); onNavigate(`/beneficiaries?beneficiary=${beneficiaryId}`) }} /></> : <p className="p-6 text-sm leading-6 text-muted-copy">Choose a request to compare its submitted identity with existing beneficiary records.</p>}</div>
      </div>}
      {data.pagination.totalPages > 1 && <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-6 py-4 text-sm"><span>Page {page} of {data.pagination.totalPages}</span><div className="flex gap-2">{[-1, 1].map(direction => <button type="button" key={direction} className="ga-btn-secondary" disabled={direction < 0 ? page <= 1 : page >= data.pagination.totalPages} onClick={() => { setPage(page + direction); setLoading(true); setSelectedId('') }}>{direction < 0 ? 'Previous' : 'Next'}</button>)}</div></footer>}
    </>}
  </dialog>
}
