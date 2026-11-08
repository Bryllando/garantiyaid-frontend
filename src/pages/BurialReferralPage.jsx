import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import DashboardShell from '../components/layout/DashboardShell.jsx'
import BurialReferralLetter from '../components/beneficiaries/BurialReferralLetter.jsx'
import { Icon } from '../components/ui/icon.jsx'
import { LoadingLabel } from '../components/ui/spinner.jsx'
import { requestBurialReferrals, requestBurialReferral, saveBurialReferral, requestBeneficiary, requestBeneficiaryDocuments, uploadBeneficiaryDocument, reviewBeneficiaryDocument, downloadBeneficiaryDocument, isSessionExpiredError, getAuthErrorMessage } from '../auth/staffAuth.js'

const labels = { DRAFT: 'Draft', IN_REVIEW: 'Awaiting review', NEEDS_CORRECTION: 'Needs correction', READY: 'Ready for signature', ISSUED: 'Issued · awaiting response', CLOSED: 'Response recorded' }
const fields = [
  ['deceasedName', 'Deceased person’s full name', 150, 'profile', 'Full name shown in the supporting record'], ['deathDate', 'Date of death', 10, 'calendar'], ['relationship', 'Applicant’s relationship to the deceased', 100, 'people', 'e.g. Spouse, child, parent or sibling'],
  ['sendingOffice', 'Sending office', 150, 'office', 'Official name of the sending office'], ['receivingOffice', 'Receiving office', 150, 'office', 'Official name of the office receiving this request'], ['receivingAddress', 'Receiving office address', 300, 'location', 'Street, barangay, and city / municipality'],
  ['signatoryName', 'Authorized signatory’s name', 150, 'pen', 'Full name of the designated signing officer'], ['signatoryPosition', 'Signatory’s position', 150, 'idCard', 'Official position / designation'], ['purpose', 'Purpose of referral', 1500, 'reports', 'Briefly state the request and why it is being referred.'],
]
const personName = person => [person?.firstName, person?.middleName, person?.lastName].filter(Boolean).join(' ')
const details = referral => Object.fromEntries(fields.map(([key]) => [key, key === 'deathDate' ? referral?.[key]?.slice(0, 10) ?? '' : referral?.[key] ?? '']))
const when = value => value ? new Date(value).toLocaleString('en-PH', { timeZone: 'Asia/Manila' }) : 'Not recorded'

function ReferralField({ field, value, today, onChange }) {
  const [key, title, max, icon, placeholder] = field
  return <div className={['deceasedName', 'receivingAddress', 'purpose'].includes(key) ? 'min-w-0 sm:col-span-2' : 'min-w-0'}><label htmlFor={`burial-${key}`} className="ga-label">{title}<span aria-hidden="true" className="ml-1 text-brand-red after:content-['*']" /></label><div className="relative mt-2"><Icon name={icon} className="pointer-events-none absolute left-3 top-3.5 size-5 text-muted-copy" />{key === 'purpose' ? <textarea id={`burial-${key}`} required maxLength={max} rows={3} placeholder={placeholder} value={value} onChange={event => onChange(key, event.target.value)} className="ga-input min-h-28 resize-y py-3 pl-11" /> : <input id={`burial-${key}`} type={key === 'deathDate' ? 'date' : 'text'} max={key === 'deathDate' ? today : undefined} required maxLength={max} placeholder={placeholder} value={value} onChange={event => onChange(key, event.target.value)} className="ga-input min-w-0 pl-11" />}</div></div>
}

function ReferralEditor({ applicant, referral, documents, busy, onSave, onUpload, onCancel }) {
  const [form, setForm] = useState(() => ({ ...details(referral), sendingOffice: referral?.sendingOffice ?? `Barangay ${applicant.barangay.barangayName}, ${applicant.barangay.city}`, attachments: referral?.attachments ?? [] }))
  const [documentId, setDocumentId] = useState('')
  const [label, setLabel] = useState('')
  const [uploadLabel, setUploadLabel] = useState('')
  const [source, setSource] = useState(() => documents.some(item => ['SUBMITTED', 'ACCEPTED'].includes(item.reviewStatus) && !referral?.attachments?.some(link => link.documentId === item.documentId)) ? 'existing' : 'upload')
  const [documentError, setDocumentError] = useState('')
  const [uploading, setUploading] = useState(false)
  const [today] = useState(() => new Date(Date.now() + 28800000).toISOString().slice(0, 10))
  const available = documents.filter(item => ['SUBMITTED', 'ACCEPTED'].includes(item.reviewStatus) && !form.attachments.some(link => link.documentId === item.documentId))
  function change(key, value) { setForm(current => ({ ...current, [key]: value })) }
  function attach(id, name) {
    if (!id || !name.trim()) return
    setForm(current => current.attachments.length >= 12 || current.attachments.some(item => item.documentId === id) ? current : { ...current, attachments: [...current.attachments, { documentId: id, label: name.trim() }] })
    setDocumentError('')
  }
  async function upload(event) {
    event.preventDefault()
    if (busy || !uploadLabel.trim()) return
    const element = event.currentTarget
    const file = element.elements.file.files[0]
    if (!file?.size) return setDocumentError('Choose a PDF, JPG or PNG document that is not empty.')
    if (file.size > 5 * 1024 * 1024) return setDocumentError('Choose a document that is 5 MB or smaller.')
    setDocumentError('')
    setUploading(true)
    try {
      const item = await onUpload(file)
      if (item) { attach(item.documentId, uploadLabel); setUploadLabel(''); element.reset() }
      else setDocumentError('The document was not attached. Your description and file are kept; check the upload error before retrying.')
    } catch (failure) { setDocumentError(getAuthErrorMessage(failure)) }
    finally { setUploading(false) }
  }
  return <section aria-labelledby="referral-form-title" className="mx-auto w-full max-w-5xl overflow-hidden rounded-lg border border-line bg-white">
    <header className="border-b border-line px-4 py-5 sm:px-7"><p className="ga-eyebrow flex items-center gap-2"><Icon name="reports" className="size-4" />Referral preparation</p><h2 id="referral-form-title" className="mt-2 text-xl font-semibold">{referral ? 'Edit referral details' : 'Prepare burial referral'}</h2><p className="mt-2 text-sm leading-6 text-copy">Complete the request details and list the documents that will accompany the letter.</p></header>
    <div className="px-4 py-5 sm:px-7">
      <div className="flex items-start gap-3 rounded-lg border border-line bg-slate-50 p-4"><Icon name="profile" className="mt-0.5 size-5 shrink-0 text-brand-blue" /><div className="min-w-0"><p className="text-xs text-muted-copy">Living applicant</p><p className="mt-1 break-words font-semibold text-ink">{personName(applicant)}</p><p className="mt-1 text-xs leading-5 text-copy">Enter the deceased person’s details below, not the applicant’s.</p></div></div>
      <form id="burial-details" onSubmit={event => { event.preventDefault(); if (!busy) void onSave(form) }} className="mt-6 space-y-6">
        {[
          ['Deceased person', 'profile', ['deceasedName', 'deathDate', 'relationship']],
          ['Offices and destination', 'office', ['sendingOffice', 'receivingOffice', 'receivingAddress']],
          ['Signatory and purpose', 'pen', ['signatoryName', 'signatoryPosition', 'purpose']],
        ].map(([title, icon, keys], index) => <fieldset key={title} className={`min-w-0 ${index ? 'border-t border-line pt-5' : ''}`}><legend className="float-left mb-4 flex w-full items-center gap-2 text-base font-semibold text-ink"><Icon name={icon} className="size-5 text-brand-blue" />{title}</legend><div className="clear-both grid gap-x-4 gap-y-5 sm:grid-cols-2">{keys.map(key => <ReferralField key={key} field={fields.find(item => item[0] === key)} value={form[key]} onChange={change} today={today} />)}</div></fieldset>)}
      </form>
      <fieldset disabled={busy} className="mt-6 min-w-0 border-t border-line pt-5">
        <legend className="float-left mb-3 flex w-full items-center gap-2 text-base font-semibold"><Icon name="reports" className="size-5 text-brand-blue" />Supporting documents for this request</legend>
        <p className="clear-both text-sm leading-6 text-copy">Attach files for this deceased person and request. The receiving office confirms the checklist; examples include applicant ID, a death certificate or accepted alternative, and funeral documents.</p>
        <p role="status" className="mt-4 text-sm font-semibold text-ink">{form.attachments.length} {form.attachments.length === 1 ? 'document' : 'documents'} attached <span className="font-normal text-muted-copy">· maximum 12</span></p>
        {form.attachments.length > 0 && <ul className="mt-2 divide-y divide-line rounded-lg border border-line px-3">{form.attachments.map(item => {
          const document = documents.find(document => document.documentId === item.documentId)
          return <li key={item.documentId} className="flex items-center justify-between gap-3 py-3"><div className="flex min-w-0 items-start gap-3"><Icon name="reports" className="mt-0.5 size-5 shrink-0 text-brand-blue" /><div className="min-w-0"><p className="break-words text-sm font-semibold">{item.label}</p><p className="mt-1 break-words text-xs leading-5 text-muted-copy">{document?.originalFileName ?? 'Document unavailable'}{document ? ` · ${document.reviewStatus === 'ACCEPTED' ? 'Accepted' : 'Awaiting document review'}` : ''}</p></div></div><button type="button" onClick={() => change('attachments', form.attachments.filter(link => link.documentId !== item.documentId))} className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-lg px-3 text-sm font-semibold text-brand-red hover:bg-danger-soft focus-visible:outline-2 focus-visible:outline-brand-red" aria-label={`Remove ${item.label}`}><Icon name="trash" className="size-4" />Remove</button></li>
        })}</ul>}
        {form.attachments.length < 12 ? <div className="mt-4 rounded-lg border border-line bg-slate-50 p-4">
          <fieldset><legend className="text-sm font-semibold text-ink">How would you like to add a document?</legend><div className="mt-3 flex flex-wrap gap-x-5 gap-y-3">{[['existing', 'Use an existing document'], ['upload', 'Upload a new document']].map(([value, title]) => <label key={value} className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-sm font-medium text-copy"><input type="radio" name="burial-document-source" checked={source === value} onChange={() => { setSource(value); setDocumentError('') }} className="size-4 accent-brand-blue" />{title}</label>)}</div></fieldset>
          <form aria-label="Attach an existing document" onSubmit={event => { event.preventDefault(); if (!busy && available.some(item => item.documentId === documentId)) { attach(documentId, label); setDocumentId(''); setLabel('') } }} className={`${source === 'existing' ? 'grid' : 'hidden'} mt-3 gap-4 sm:grid-cols-2`}>
            <div><label htmlFor="burial-existing-doc" className="ga-label">Existing applicant document</label><div className="relative mt-2"><Icon name="reports" className="pointer-events-none absolute left-3 top-3.5 size-5 text-muted-copy" /><select id="burial-existing-doc" required value={documentId} onChange={event => setDocumentId(event.target.value)} className="ga-input pl-11"><option value="">{available.length ? 'Choose a document' : 'No available documents'}</option>{available.map(item => <option key={item.documentId} value={item.documentId}>{item.originalFileName} ({item.reviewStatus.toLowerCase()})</option>)}</select></div>{!available.length && <p className="mt-2 text-xs leading-5 text-copy">Upload a new file, or remove a listed attachment to choose it again.</p>}</div>
            <div><label htmlFor="burial-doc-label" className="ga-label">Document description for the letter</label><div className="relative mt-2"><Icon name="pen" className="pointer-events-none absolute left-3 top-3.5 size-5 text-muted-copy" /><input id="burial-doc-label" required maxLength={100} placeholder="e.g. Applicant’s valid ID" value={label} onChange={event => setLabel(event.target.value)} className="ga-input pl-11" /></div></div><div className="sm:col-span-2"><button className="ga-btn-secondary w-full sm:w-auto" disabled={!documentId || !label.trim() || !available.length}><Icon name="plus" className="size-4" />Add to this referral</button></div>
          </form>
          <form aria-label="Upload a supporting document" onSubmit={upload} className={`${source === 'upload' ? 'grid' : 'hidden'} mt-3 gap-4 sm:grid-cols-2`}>
            <div><label htmlFor="burial-upload-label" className="ga-label">New document description</label><div className="relative mt-2"><Icon name="pen" className="pointer-events-none absolute left-3 top-3.5 size-5 text-muted-copy" /><input id="burial-upload-label" required maxLength={100} placeholder="e.g. Death certificate" value={uploadLabel} onChange={event => { setUploadLabel(event.target.value); setDocumentError('') }} className="ga-input pl-11" /></div></div><div><label htmlFor="burial-upload-file" className="ga-label">PDF, JPG or PNG · up to 5 MB</label><input id="burial-upload-file" name="file" type="file" accept=".pdf,.jpg,.jpeg,.png" required onChange={() => setDocumentError('')} className="mt-2 block w-full min-w-0 text-sm" /></div><div className="sm:col-span-2"><button className="ga-btn-secondary w-full sm:w-auto" disabled={uploading || !uploadLabel.trim()}>{uploading ? <LoadingLabel>Uploading...</LoadingLabel> : <><Icon name="upload" className="size-4" />Upload and attach</>}</button></div>
          </form>
          {documentError && <p role="alert" className="mt-3 text-sm leading-6 text-brand-red">{documentError}</p>}
        </div> : <p className="mt-3 text-sm leading-6 text-copy">The 12-document limit is reached. Remove an attachment before adding another.</p>}
        <p className="mt-3 text-xs leading-5 text-muted-copy">Each description appears in the letter. Only added documents are included; selecting a file alone does not attach it.</p>
      </fieldset>
    </div>
    <footer className="flex flex-col-reverse gap-3 border-t border-line bg-slate-50 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-7"><p className="text-xs leading-5 text-muted-copy">Saving a draft does not submit it for review.</p><div className="flex flex-col-reverse gap-3 sm:flex-row"><button type="button" className="ga-btn-secondary" onClick={onCancel} disabled={busy}>Cancel editing</button><button type="submit" form="burial-details" className="ga-btn-primary" disabled={busy}>{busy && !uploading ? <LoadingLabel>Saving...</LoadingLabel> : <><Icon name="check" className="size-4" />Save draft</>}</button></div></footer>
  </section>
}

export default function BurialReferralPage({ session, onLogout, onNavigate, onSessionExpired }) {
  const query = new URLSearchParams(window.location.search)
  const id = query.get('referral') ?? ''
  const applicantId = query.get('beneficiary') ?? ''
  const isBarangay = session.user.role === 'BARANGAY_FACILITATOR'
  const isReviewer = session.user.role === 'DSWD_STAFF'
  const [list, setList] = useState(null)
  const [referral, setReferral] = useState(null)
  const [applicant, setApplicant] = useState(null)
  const [documents, setDocuments] = useState([])
  const [filters, setFilters] = useState({ search: '', status: '', page: 1 })
  const [search, setSearch] = useState('')
  const [reload, setReload] = useState(0)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [retryPending, setRetryPending] = useState(false)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(Boolean(applicantId && !id && isBarangay))
  const [preview, setPreview] = useState(false)
  const [note, setNote] = useState('')
  const [reference, setReference] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [outcome, setOutcome] = useState('')
  const previewButton = useRef(null)
  const searchInput = useRef(null)
  const pending = useRef(null)
  const busyRef = useRef(false)
  function navigate(path) { if (!busyRef.current && !pending.current) onNavigate(path) }
  useEffect(() => {
    if (!retryPending && !busy) return
    const warn = event => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [retryPending, busy])
  const report = error => { if (isSessionExpiredError(error)) onSessionExpired(); else setError(getAuthErrorMessage(error)) }

  useEffect(() => {
    let active = true
    async function load() {
      setLoading(true); setError('')
      try {
        if (id || applicantId) {
          const record = id ? await requestBurialReferral(session.accessToken, id) : null
          const person = record?.beneficiary ?? await requestBeneficiary(session.accessToken, applicantId)
          const docs = await requestBeneficiaryDocuments(session.accessToken, person.beneficiaryId)
          if (active) { setReferral(record); setApplicant(person); setDocuments(docs) }
        } else {
          const data = await requestBurialReferrals(session.accessToken, filters)
          if (active) setList(data)
        }
      } catch (failure) { if (active) { if (isSessionExpiredError(failure)) onSessionExpired(); else setError(getAuthErrorMessage(failure)) } }
      finally { if (active) setLoading(false) }
    }
    void load()
    return () => { active = false }
  }, [id, applicantId, session.accessToken, filters, reload, onSessionExpired])

  async function mutate(body, action = false) {
    if (busyRef.current) return
    const signature = JSON.stringify({ id, body, action })
    if (pending.current && retryPending && pending.current.signature !== signature) {
      setError('The previous request may already be saved. Retry that request before changing its details.')
      return
    }
    busyRef.current = true; setBusy(true); setError('')
    if (pending.current?.signature !== signature) pending.current = { signature, key: crypto.randomUUID(), body, action }
    try {
      const saved = await saveBurialReferral(session.accessToken, id, body, pending.current.key, action)
      pending.current = null
      setRetryPending(false)
      setReferral(saved); setApplicant(saved.beneficiary); setEditing(false); setNote(''); setReference(''); setConfirmed(false)
      toast.success('Referral record saved.')
      if (!id) onNavigate(`/burial-referrals?referral=${saved.referralId}`)
    } catch (failure) {
      if (!failure.status || failure.status >= 500 || failure.code === 'REFERRAL_CONCURRENT_CHANGE') setRetryPending(true)
      else { pending.current = null; setRetryPending(false) }
      report(failure)
    }
    finally { busyRef.current = false; setBusy(false) }
  }
  async function documentTask(operation) {
    if (busyRef.current) return null
    busyRef.current = true; setBusy(true); setError('')
    try {
      const result = await operation()
      const docs = await requestBeneficiaryDocuments(session.accessToken, applicant.beneficiaryId)
      setDocuments(docs)
      return result
    } catch (failure) { report(failure); return null }
    finally { busyRef.current = false; setBusy(false) }
  }
  async function download(item) {
    try {
      const blob = await downloadBeneficiaryDocument(session.accessToken, applicant.beneficiaryId, item.documentId)
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a'); link.href = url; link.download = item.originalFileName; link.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (failure) { report(failure) }
  }
  async function previewLetter() {
    setBusy(true); setError('')
    try {
      const current = await requestBurialReferral(session.accessToken, id)
      setReferral(current)
      if (!['READY', 'ISSUED', 'CLOSED'].includes(current.status) || !current.letterSnapshot) throw new Error('The letter is no longer ready for signature. Review the updated referral.')
      setPreview(true)
    } catch (failure) { report(failure) }
    finally { setBusy(false) }
  }
  const action = (name, extra = {}) => mutate({ action: name, version: referral.version, ...extra }, true)
  const linked = referral?.attachments.map(item => ({ ...documents.find(doc => doc.documentId === item.documentId), ...item })) ?? []
  const readyDocuments = linked.length > 0 && linked.every(item => item.reviewStatus === 'ACCEPTED')
  const hasFilters = Boolean(filters.search || filters.status)
  function clearFilters() {
    setSearch('')
    setFilters({ search: '', status: '', page: 1 })
    searchInput.current?.focus()
  }

  return <DashboardShell breadcrumbs={['Beneficiary services', 'Burial referrals']} currentPath="/burial-referrals" pageTitle="Burial referrals" onLogout={onLogout} onNavigate={navigate} user={session.user}>
    <div className={id || applicantId ? 'mx-auto w-full max-w-5xl' : undefined}>
    <header className="ga-page-header flex flex-wrap items-end justify-between gap-4 border-b border-line pb-5"><div><h1 className="ga-page-title">Burial referrals</h1><p className="ga-page-copy">Prepare a letter for the receiving office and track its response. A referral is not an assistance approval or payment.</p></div><div className="flex flex-wrap gap-2">{(id || applicantId) && <button className="ga-btn-secondary" disabled={busy || retryPending} onClick={() => onNavigate('/burial-referrals')}><Icon name="arrowLeft" className="size-4" />Back to referrals</button>}<button className="ga-btn-secondary" disabled={loading || busy || retryPending || editing} onClick={() => setReload(value => value + 1)}><Icon name="reset" className="size-4" />Refresh</button>{!id && !applicantId && isBarangay && <button className="ga-btn-primary" onClick={() => onNavigate('/beneficiaries')}><Icon name="people" className="size-4" />Choose applicant</button>}</div></header>
    {error && <div role="alert" className="my-4 border-l-4 border-brand-red bg-danger-soft p-4 text-sm text-brand-red">{error}<p className="mt-2">{id || applicantId ? 'Your entered details are kept. Retry the same action after a connection failure; refresh if another staff member changed the record.' : 'Your search and status selection are kept. Refresh to try again.'}</p></div>}
    {retryPending && <div role="status" className="my-4 border border-line bg-white p-4 text-sm"><p>The last save has an uncertain result. Its original request is kept for a safe retry.</p><button className="ga-btn-secondary mt-3" disabled={busy} onClick={() => mutate(pending.current.body, pending.current.action)}>Retry last save</button></div>}
    {!id && !applicantId ? <>
      <form aria-label="Find burial referrals" className="ga-card my-5 grid gap-4 p-4 sm:grid-cols-[minmax(0,1fr)_14rem] sm:p-5 xl:grid-cols-[minmax(0,1fr)_14rem_auto]" onSubmit={event => { event.preventDefault(); setFilters(current => ({ ...current, search: search.trim(), page: 1 })) }}>
        <div className="min-w-0">
          <label htmlFor="burial-search" className="ga-label">Applicant or deceased name</label>
          <div className="relative mt-2">
            <Icon name="search" className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-copy" />
            <input ref={searchInput} id="burial-search" type="search" autoComplete="off" placeholder="Enter a name to search" value={search} maxLength={150} onChange={event => setSearch(event.target.value)} className="ga-input pl-11" />
          </div>
        </div>
        <div className="min-w-0"><label htmlFor="burial-status" className="ga-label">Status</label><select id="burial-status" value={filters.status} onChange={event => setFilters(current => ({ ...current, status: event.target.value, page: 1 }))} className="ga-input mt-2"><option value="">All statuses</option>{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
        <div className="flex flex-wrap items-center gap-2 sm:col-span-2 xl:col-span-1 xl:self-end">
          <button type="submit" disabled={loading} className="ga-btn-primary"><Icon name="search" className="size-4" />Search</button>
          {hasFilters && <button type="button" onClick={clearFilters} className="ga-btn-secondary"><Icon name="close" className="size-4" />Clear filters</button>}
        </div>
      </form>
      <section aria-label="Burial referral list" aria-busy={loading} className="ga-card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-4"><h2 className="font-semibold">Referral records</h2><p role="status" className="text-sm tabular-nums text-muted-copy">{loading ? 'Loading referrals…' : error ? 'Results unavailable' : `${list?.pagination.total ?? 0} ${(list?.pagination.total ?? 0) === 1 ? 'referral' : 'referrals'}`}</p></div>
        {loading ? <div className="p-6 text-sm text-copy"><LoadingLabel>Loading referral records...</LoadingLabel></div> : error ? <p className="p-6 text-sm text-copy">Refresh to reload the referral records.</p> : !list?.referrals.length ? <div className="flex items-start gap-4 px-5 py-8 sm:p-8">
          <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-info-soft text-brand-blue"><Icon name={hasFilters ? 'search' : 'audit'} className="size-5" /></span>
          <div className="min-w-0"><h3 className="font-semibold text-ink">{hasFilters ? 'No matching referrals' : 'No burial referrals yet'}</h3><p className="mt-2 max-w-xl text-sm leading-6 text-copy">{hasFilters ? 'Try another applicant or deceased name, or clear the filters to see all referrals.' : isBarangay ? 'Choose an applicant from the beneficiary records, then select “Prepare burial referral” to start a request.' : isReviewer ? 'Barangay staff prepare referral requests. Submitted requests will appear here for your review.' : 'Referrals prepared by Barangay staff will appear here for read-only oversight.'}</p></div>
        </div> : <>
          <ul className="divide-y divide-line">{list.referrals.map(item => <li key={item.referralId} className="flex flex-wrap items-center justify-between gap-4 p-5"><div className="min-w-0"><p className="break-words font-semibold">{personName(item.beneficiary)}</p><p className="mt-1 break-words text-sm text-copy">For {item.deceasedName} · {item.receivingOffice}</p><p className="mt-2 text-sm font-semibold text-brand-blue">{labels[item.status]}</p></div><button className="ga-btn-secondary" onClick={() => onNavigate(`/burial-referrals?referral=${item.referralId}`)}>Open referral<Icon name="arrowRight" className="size-4" /></button></li>)}</ul>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-4 text-sm"><span>Page {filters.page} of {Math.max(1, list.pagination.totalPages)}</span>{list.pagination.totalPages > 1 && <div className="flex flex-wrap gap-2"><button className="ga-btn-secondary" disabled={filters.page === 1} onClick={() => setFilters(current => ({ ...current, page: current.page - 1 }))}><Icon name="chevronLeft" className="size-4" />Previous</button><button className="ga-btn-secondary" disabled={filters.page >= list.pagination.totalPages} onClick={() => setFilters(current => ({ ...current, page: current.page + 1 }))}>Next<Icon name="chevronRight" className="size-4" /></button></div>}</div>
        </>}
      </section>
    </> : loading ? <p role="status" className="py-8">Loading referrals...</p> : applicant && <fieldset disabled={busy || retryPending} className="mt-6 min-w-0">
      {editing && isBarangay ? <ReferralEditor applicant={applicant} referral={referral} documents={documents} busy={busy} onSave={form => mutate({ ...form, ...(id ? { version: referral.version } : { beneficiaryId: applicant.beneficiaryId }) })} onUpload={file => documentTask(() => uploadBeneficiaryDocument(session.accessToken, applicant.beneficiaryId, 'OTHER', file))} onCancel={() => referral ? setEditing(false) : onNavigate('/burial-referrals')} /> : referral ? <>
        <section className="border border-line bg-white p-5 sm:p-7"><div className="flex flex-wrap justify-between gap-3"><div><h2 className="text-xl font-semibold">{personName(applicant)}</h2><p className="mt-1 text-copy">Request concerning {referral.deceasedName}</p><p className="mt-2 break-all text-xs text-muted-copy">BR-{referral.referralId.toUpperCase()}</p></div><p className="text-sm font-semibold text-brand-blue">{labels[referral.status]}</p></div>
          {referral.reviewNote && <p className="mt-4 border-l-4 border-brand-amber bg-warning-soft p-3 text-sm">Correction requested: {referral.reviewNote}</p>}
          <dl className="mt-5 grid gap-5 border-t border-line pt-5 sm:grid-cols-2">{fields.map(([key, label]) => <div key={key} className={key === 'purpose' ? 'sm:col-span-2' : ''}><dt className="text-sm text-muted-copy">{label}</dt><dd className="mt-1 whitespace-pre-wrap break-words font-medium">{key === 'deathDate' ? referral[key].slice(0, 10) : referral[key]}</dd></div>)}</dl>
          <h3 className="mt-6 border-t border-line pt-5 font-semibold">Listed attachments</h3><p className="mt-1 text-sm text-copy">Review these files against the request and the receiving office’s checklist.</p><ul className="mt-3 divide-y divide-line">{linked.map(item => <li key={item.documentId} className="flex flex-wrap items-center justify-between gap-3 py-3"><div className="min-w-0"><p className="break-words font-medium">{item.label}</p><p className="mt-1 break-words text-sm text-muted-copy">{item.originalFileName ?? 'Document unavailable'} · {item.reviewStatus ?? 'Unavailable'}</p></div><div className="flex flex-wrap gap-2"><button className="ga-btn-secondary" disabled={!item.originalFileName || busy} onClick={() => download(item)}>Download</button>{isReviewer && referral.status === 'IN_REVIEW' && item.reviewStatus === 'SUBMITTED' && <button className="ga-btn-secondary" disabled={busy} onClick={() => documentTask(() => reviewBeneficiaryDocument(session.accessToken, applicant.beneficiaryId, item.documentId, { decision: 'ACCEPTED' }))}>Accept document</button>}</div></li>)}</ul>
          {['READY', 'ISSUED', 'CLOSED'].includes(referral.status) && referral.letterSnapshot && <button ref={previewButton} className="ga-btn-primary mt-5" disabled={busy} onClick={previewLetter}>Preview letter</button>}
          <dl className="mt-6 grid gap-3 border-t border-line pt-4 text-sm sm:grid-cols-2"><div><dt className="text-muted-copy">Prepared by</dt><dd>{referral.createdBy.fullName} · {when(referral.createdAt)}</dd></div>{referral.reviewedAt && <div><dt className="text-muted-copy">Reviewed for signature</dt><dd>{referral.reviewedBy?.fullName} · {when(referral.reviewedAt)}</dd></div>}{referral.issuedAt && <div><dt className="text-muted-copy">Issuance recorded by</dt><dd>{referral.issuedBy?.fullName} · {when(referral.issuedAt)}<br />{referral.issueReference}</dd></div>}{referral.closedAt && <div><dt className="text-muted-copy">Response recorded by</dt><dd>{referral.closedBy?.fullName} · {when(referral.closedAt)}<br />{referral.responseOutcome.replaceAll('_', ' ')}<br />{referral.responseReference}<br />{referral.responseNote}</dd></div>}</dl>
        </section>
        {session.user.role === 'SYSTEM_ADMIN' && <p className="mt-4 text-sm text-copy">Read-only oversight. Barangay staff prepare referrals; DSWD staff review them.</p>}
        {isBarangay && ['DRAFT', 'NEEDS_CORRECTION'].includes(referral.status) && <div className="mt-5 flex flex-wrap gap-3"><button className="ga-btn-secondary" disabled={busy} onClick={() => setEditing(true)}>Edit details</button><button className="ga-btn-primary" disabled={busy || !linked.length} onClick={() => action('submit')}>Submit for review</button></div>}
        {isReviewer && ['IN_REVIEW', 'READY'].includes(referral.status) && <section className="mt-5 border border-line bg-white p-5"><h3 className="font-semibold">Reviewer decision</h3>{referral.status === 'IN_REVIEW' && <form className="mt-4" onSubmit={event => { event.preventDefault(); void action('prepare', { confirmed }) }}><label className="flex items-start gap-3 text-sm leading-6"><input type="checkbox" required checked={confirmed} onChange={event => setConfirmed(event.target.checked)} className="mt-1 size-4 shrink-0" />I checked the applicant, deceased person, listed attachments, receiving office, and designated signatory. This clears the letter for signature, not financial assistance.</label>{!readyDocuments && <p className="mt-2 text-sm text-brand-amber">Accept all listed documents before preparing the letter, or return the request for correction.</p>}<button className="ga-btn-primary mt-4" disabled={busy || !confirmed || !readyDocuments}>Prepare letter for signature</button></form>}<form className="mt-5 border-t border-line pt-4" onSubmit={event => { event.preventDefault(); void action('return', { note }) }}><label htmlFor="burial-correction" className="ga-label">What needs correction?</label><textarea id="burial-correction" required maxLength={1500} value={note} onChange={event => setNote(event.target.value)} className="ga-input mt-2 py-3" /><button className="ga-btn-secondary mt-3" disabled={busy}>Return for correction</button></form></section>}
        {(isBarangay || isReviewer) && referral.status === 'READY' && <form className="mt-5 border border-line bg-white p-5" onSubmit={event => { event.preventDefault(); void action('issue', { confirmed, reference }) }}><h3 className="font-semibold">Record issuance after signing</h3><p className="mt-2 text-sm leading-6 text-copy">Print the reviewed letter, obtain the designated officer’s signature, and hand it to the applicant or dispatch it to the receiving office. This does not confirm receipt by that office.</p><label htmlFor="burial-issue-reference" className="ga-label mt-4 block">Signed-original / dispatch reference</label><input id="burial-issue-reference" required maxLength={300} value={reference} onChange={event => setReference(event.target.value)} className="ga-input mt-2" /><label className="mt-4 flex items-start gap-3 text-sm leading-6"><input type="checkbox" required checked={confirmed} onChange={event => setConfirmed(event.target.checked)} className="mt-1 size-4 shrink-0" />The named officer signed the reviewed letter and it was handed over or dispatched. The signed original is retained under the reference above.</label><button className="ga-btn-primary mt-4" disabled={busy || !confirmed}>Record signed issuance</button></form>}
        {(isBarangay || isReviewer) && referral.status === 'ISSUED' && <form className="mt-5 border border-line bg-white p-5" onSubmit={event => { event.preventDefault(); void action('close', { outcome, reference, note }) }}><h3 className="font-semibold">Record receiving-office response</h3><p className="mt-2 text-sm text-copy">Record the actual response or withdrawal. This creates no payment or distribution claim.</p><label htmlFor="burial-outcome" className="ga-label mt-4 block">Reported outcome</label><select id="burial-outcome" required value={outcome} onChange={event => setOutcome(event.target.value)} className="ga-input mt-2"><option value="">Choose the recorded outcome</option>{['APPROVED_BY_OFFICE', 'DECLINED_BY_OFFICE', 'WITHDRAWN', 'OTHER'].map(value => <option key={value} value={value}>{value.replaceAll('_', ' ')}</option>)}</select><label htmlFor="burial-response-reference" className="ga-label mt-4 block">Response / withdrawal document reference</label><input id="burial-response-reference" required maxLength={300} value={reference} onChange={event => setReference(event.target.value)} className="ga-input mt-2" /><label htmlFor="burial-response-note" className="ga-label mt-4 block">Response details and responding office</label><textarea id="burial-response-note" required maxLength={1500} value={note} onChange={event => setNote(event.target.value)} className="ga-input mt-2 py-3" /><button className="ga-btn-primary mt-4" disabled={busy}>Save response and close referral</button></form>}
      </> : <p className="text-copy">Only Barangay staff prepare new referrals. Open an existing referral from the list.</p>}
    </fieldset>}
    </div>
    {preview && referral && <BurialReferralLetter returnFocusRef={previewButton} referral={referral} onClose={() => setPreview(false)} />}
  </DashboardShell>
}
