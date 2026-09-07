import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import DashboardShell from '../components/layout/DashboardShell.jsx'
import { ConfirmationDialog } from '../components/ui/confirmation-dialog.jsx'
import { PhilippineMobileField } from '../components/ui/philippine-mobile-field.jsx'
import { Skeleton } from '../components/ui/skeleton.jsx'
import { LoadingLabel } from '../components/ui/spinner.jsx'
import {
  createBeneficiary,
  downloadBeneficiaryDocument,
  getAuthErrorMessage,
  isSessionExpiredError,
  replaceBeneficiaryDocument,
  requestBarangays,
  requestBeneficiary,
  requestBeneficiaryDocuments,
  requestBeneficiaryList,
  requestPrograms,
  reviewBeneficiaryDocument,
  submitEnrollment,
  updateBeneficiary,
  uploadBeneficiaryDocument,
} from '../auth/staffAuth.js'

const beneficiaryStatuses = ['', 'ACTIVE', 'INACTIVE', 'SUSPENDED']
const documentTypes = ['VALID_ID', 'BIRTH_CERTIFICATE', 'BARANGAY_CERTIFICATE', 'PROOF_OF_RESIDENCY', 'MEDICAL_CERTIFICATE', 'PWD_ID', 'SENIOR_CITIZEN_ID', 'OTHER']
const emptyBeneficiaryForm = { firstName: '', middleName: '', lastName: '', birthDate: '', sex: '', address: '', sitioPurok: '', barangayId: '', contactNumber: '', email: '', philsysNumber: '', status: 'ACTIVE' }
const dateFormatter = new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeZone: 'Asia/Manila' })

const humanize = (value = '') => value.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase())
const fullName = (person) => [person?.firstName, person?.middleName, person?.lastName].filter(Boolean).join(' ')
const displayDate = (value) => value ? dateFormatter.format(new Date(value)) : 'Not recorded'

function StatusBadge({ value }) {
  const style = ['ACTIVE', 'ACCEPTED', 'APPROVED'].includes(value)
    ? 'ga-status-success'
    : ['SUSPENDED', 'REJECTED'].includes(value)
      ? 'ga-status-danger'
      : ['SUBMITTED', 'PENDING', 'FOR_VALIDATION'].includes(value)
        ? 'ga-status-warning'
        : 'border-line bg-slate-100 text-copy'
  return <span className={`inline-flex whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-bold ${style}`}>{humanize(value)}</span>
}

function PageSkeleton() {
  return <div className="mt-6 grid items-start gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(22rem,0.8fr)]" role="status" aria-label="Loading beneficiary records"><div className="ga-card p-5"><Skeleton className="h-12 w-full" />{Array.from({ length: 6 }, (_, index) => <Skeleton key={index} className="mt-4 h-16 w-full" />)}</div><div className="ga-card p-6"><Skeleton className="h-6 w-48" /><Skeleton className="mt-5 h-36 w-full" /><Skeleton className="mt-4 h-28 w-full" /></div></div>
}

function BeneficiaryFormDialog({ barangays, beneficiary, isFacilitator, onClose, onSave }) {
  const dialogRef = useRef(null)
  const [form, setForm] = useState(() => beneficiary ? {
    firstName: beneficiary.firstName ?? '', middleName: beneficiary.middleName ?? '', lastName: beneficiary.lastName ?? '',
    birthDate: beneficiary.birthDate?.slice(0, 10) ?? '', sex: beneficiary.sex ?? '', address: beneficiary.address ?? '',
    sitioPurok: beneficiary.sitioPurok ?? '', barangayId: beneficiary.barangayId ?? '', contactNumber: beneficiary.contactNumber ?? '', email: beneficiary.email ?? '',
    philsysNumber: beneficiary.philsysNumber ?? '', status: beneficiary.status ?? 'ACTIVE',
  } : emptyBeneficiaryForm)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    dialogRef.current?.showModal()
  }, [])

  function change(field, value) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  async function submit(event) {
    event.preventDefault()
    setIsSaving(true)
    const payload = { ...form }
    if (isFacilitator) delete payload.barangayId
    if (!beneficiary || isFacilitator) delete payload.status
    try {
      await onSave(payload)
      dialogRef.current?.close()
    } catch {
      // The page already reports the API error and keeps this form open.
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <dialog ref={dialogRef} onClose={onClose} className="m-auto max-h-[calc(100dvh-2rem)] w-[min(48rem,calc(100%-2rem))] overflow-y-auto rounded-2xl border border-line bg-white p-0 text-ink shadow-lg backdrop:bg-slate-950/55">
      <form onSubmit={submit} className="p-5 sm:p-7">
        <div className="flex items-start justify-between gap-5"><div><p className="ga-eyebrow">{beneficiary ? 'Record maintenance' : 'Beneficiary enrollment'}</p><h2 className="mt-2 text-2xl font-extrabold">{beneficiary ? 'Update beneficiary record' : 'Register a beneficiary'}</h2><p className="mt-2 text-sm leading-6 text-muted-copy">Enter only verified information from the beneficiary’s official documents.</p></div><button type="button" onClick={() => dialogRef.current?.close()} aria-label="Close beneficiary form" className="grid size-11 shrink-0 place-items-center rounded-lg border border-line text-xl text-copy hover:bg-slate-50">×</button></div>
        <div className="mt-6 grid gap-5 sm:grid-cols-2">
          <FormField label="First name" id="beneficiary-first-name" required value={form.firstName} onChange={(value) => change('firstName', value)} />
          <FormField label="Middle name" id="beneficiary-middle-name" value={form.middleName} onChange={(value) => change('middleName', value)} />
          <FormField label="Last name" id="beneficiary-last-name" required value={form.lastName} onChange={(value) => change('lastName', value)} />
          <div><label htmlFor="beneficiary-birth-date" className="ga-label">Birth date</label><input id="beneficiary-birth-date" type="date" required max={new Date().toISOString().slice(0, 10)} value={form.birthDate} onChange={(event) => change('birthDate', event.target.value)} className="ga-input mt-2" /></div>
          <div><label htmlFor="beneficiary-sex" className="ga-label">Sex</label><select id="beneficiary-sex" required value={form.sex} onChange={(event) => change('sex', event.target.value)} className="ga-input mt-2"><option value="">Select sex</option>{['FEMALE', 'MALE', 'OTHER', 'UNKNOWN'].map((value) => <option key={value} value={value}>{humanize(value)}</option>)}</select></div>
          {!isFacilitator && <div><label htmlFor="beneficiary-barangay" className="ga-label">Barangay</label><select id="beneficiary-barangay" required value={form.barangayId} onChange={(event) => change('barangayId', event.target.value)} className="ga-input mt-2"><option value="">Select barangay</option>{barangays.map((barangay) => <option key={barangay.barangayId} value={barangay.barangayId}>{barangay.barangayName}, {barangay.city}</option>)}</select></div>}
          <div><FormField label="Sitio / Purok" id="beneficiary-sitio-purok" maxLength="120" placeholder="e.g. Sitio Riverside" value={form.sitioPurok} onChange={(value) => change('sitioPurok', value)} /><p className="mt-2 text-xs leading-5 text-muted-copy">Needed when a large Barangay is scheduled by service area.</p></div>
          <PhilippineMobileField id="beneficiary-contact" label="Mobile number" value={form.contactNumber} onChange={(value) => change('contactNumber', value)} />
          <FormField label="Email address" id="beneficiary-email" type="email" value={form.email} onChange={(value) => change('email', value)} />
          <FormField label="PhilSys number" id="beneficiary-philsys" value={form.philsysNumber} onChange={(value) => change('philsysNumber', value)} />
          {beneficiary && !isFacilitator && <div><label htmlFor="beneficiary-status" className="ga-label">Record status</label><select id="beneficiary-status" value={form.status} onChange={(event) => change('status', event.target.value)} className="ga-input mt-2">{beneficiaryStatuses.slice(1).map((value) => <option key={value} value={value}>{humanize(value)}</option>)}</select></div>}
          <div className="sm:col-span-2"><label htmlFor="beneficiary-address" className="ga-label">Complete address</label><textarea id="beneficiary-address" required rows="3" maxLength="2000" value={form.address} onChange={(event) => change('address', event.target.value)} className="ga-input mt-2 min-h-24 resize-y py-3" /></div>
        </div>
        <div className="mt-7 flex flex-col-reverse gap-3 border-t border-line pt-5 sm:flex-row sm:justify-end"><button type="button" onClick={() => dialogRef.current?.close()} disabled={isSaving} className="ga-btn-secondary">Cancel</button><button type="submit" disabled={isSaving} className="ga-btn-primary">{isSaving ? <LoadingLabel>Saving...</LoadingLabel> : beneficiary ? 'Save changes' : 'Register beneficiary'}</button></div>
      </form>
    </dialog>
  )
}

function FormField({ id, inputMode, label, onChange, placeholder, required, type = 'text', value }) {
  return <div><label htmlFor={id} className="ga-label">{label}</label><input id={id} type={type} inputMode={inputMode} required={required} maxLength="150" placeholder={placeholder} value={value} onChange={(event) => onChange(event.target.value)} className="ga-input mt-2" /></div>
}

function BeneficiaryManagementPage({ session, onLogout, onNavigate, onSessionExpired }) {
  const [draft, setDraft] = useState({ search: '', status: '', barangayId: '' })
  const [filters, setFilters] = useState(draft)
  const [page, setPage] = useState(1)
  const [data, setData] = useState(null)
  const [barangays, setBarangays] = useState([])
  const [programs, setPrograms] = useState([])
  const [selectedId, setSelectedId] = useState(() => new URLSearchParams(window.location.search).get('beneficiary') ?? '')
  const [selected, setSelected] = useState(null)
  const [documents, setDocuments] = useState([])
  const [selectedProgramId, setSelectedProgramId] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingDetail, setIsLoadingDetail] = useState(() => Boolean(new URLSearchParams(window.location.search).get('beneficiary')))
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  const [formState, setFormState] = useState(null)
  const [reviewDialog, setReviewDialog] = useState(null)
  const role = session.user.role
  const isFacilitator = role === 'BARANGAY_FACILITATOR'
  const canManage = role === 'SYSTEM_ADMIN' || isFacilitator

  function handleError(requestError) {
    if (isSessionExpiredError(requestError)) return onSessionExpired()
    toast.error(getAuthErrorMessage(requestError))
  }

  useEffect(() => {
    let active = true
    Promise.all([requestBarangays(session.accessToken), requestPrograms(session.accessToken, { pageSize: 100, status: 'ACTIVE' })])
      .then(([barangayItems, programData]) => { if (active) { setBarangays(barangayItems); setPrograms(programData.programs) } })
      .catch((requestError) => {
        if (isSessionExpiredError(requestError)) return onSessionExpired()
        toast.error(getAuthErrorMessage(requestError))
      })
    return () => { active = false }
  }, [onSessionExpired, session.accessToken])

  useEffect(() => {
    let active = true
    requestBeneficiaryList(session.accessToken, { page, pageSize: 20, ...filters })
      .then((result) => { if (active) { setData(result); setError('') } })
      .catch((requestError) => { if (active) { if (isSessionExpiredError(requestError)) return onSessionExpired(); setError(getAuthErrorMessage(requestError)) } })
      .finally(() => { if (active) setIsLoading(false) })
    return () => { active = false }
  }, [filters, onSessionExpired, page, reload, session.accessToken])

  useEffect(() => {
    if (!selectedId) return undefined
    let active = true
    Promise.all([requestBeneficiary(session.accessToken, selectedId), requestBeneficiaryDocuments(session.accessToken, selectedId)])
      .then(([beneficiary, documentItems]) => { if (active) { setSelected(beneficiary); setDocuments(documentItems) } })
      .catch((requestError) => { if (active) { if (isSessionExpiredError(requestError)) onSessionExpired(); else toast.error(getAuthErrorMessage(requestError)); setSelected(null); setDocuments([]); setSelectedId('') } })
      .finally(() => { if (active) setIsLoadingDetail(false) })
    return () => { active = false }
  }, [onSessionExpired, selectedId, reload, session.accessToken])

  function applyFilters(event) {
    event.preventDefault()
    setIsLoading(true)
    setPage(1)
    setFilters({ search: draft.search.trim(), status: draft.status, barangayId: draft.barangayId })
  }

  function openBeneficiary(beneficiaryId) {
    setIsLoadingDetail(true)
    setSelectedId(beneficiaryId)
  }

  async function saveBeneficiary(payload) {
    try {
      const saved = formState?.beneficiary
        ? await updateBeneficiary(session.accessToken, formState.beneficiary.beneficiaryId, payload)
        : await createBeneficiary(session.accessToken, payload)
      toast.success(formState?.beneficiary ? 'Beneficiary record updated.' : 'Beneficiary registered.', { description: `${fullName(saved)} is ready for document processing.` })
      setFormState(null)
      openBeneficiary(saved.beneficiaryId)
      setReload((value) => value + 1)
    } catch (requestError) {
      handleError(requestError)
      throw requestError
    }
  }

  async function uploadDocument(event, replacement) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    const file = formData.get('file')
    const type = replacement?.documentType ?? formData.get('documentType')
    if (!(file instanceof File) || file.size === 0) return toast.error('Choose a PDF, JPG, or PNG document.')
    if (file.size > 5 * 1024 * 1024) return toast.error('The document must be 5 MB or smaller.')
    try {
      if (replacement) await replaceBeneficiaryDocument(session.accessToken, selectedId, replacement.documentId, type, file)
      else await uploadBeneficiaryDocument(session.accessToken, selectedId, type, file)
      toast.success(replacement ? 'Rejected document replaced.' : 'Document uploaded for DSWD review.')
      event.currentTarget.reset()
      setReload((value) => value + 1)
    } catch (requestError) { handleError(requestError) }
  }

  async function reviewDocument(reason) {
    const dialog = reviewDialog
    if (!dialog) return
    try {
      await reviewBeneficiaryDocument(session.accessToken, selectedId, dialog.document.documentId, { decision: dialog.decision, ...(reason ? { reason } : {}) })
      toast.success(dialog.decision === 'ACCEPTED' ? 'Document accepted.' : 'Correction requested for document.')
      setReviewDialog(null)
      setReload((value) => value + 1)
    } catch (requestError) { handleError(requestError); throw requestError }
  }

  async function download(documentItem) {
    try {
      const blob = await downloadBeneficiaryDocument(session.accessToken, selectedId, documentItem.documentId)
      const url = URL.createObjectURL(blob)
      const link = window.document.createElement('a')
      link.href = url
      link.download = documentItem.originalFileName
      link.click()
      URL.revokeObjectURL(url)
    } catch (requestError) { handleError(requestError) }
  }

  async function enroll(event) {
    event.preventDefault()
    try {
      const enrollment = await submitEnrollment(session.accessToken, selectedProgramId, selectedId)
      toast.success('Enrollment submitted to DSWD.', { description: `Status: ${humanize(enrollment.status)}` })
      setSelectedProgramId('')
    } catch (requestError) { handleError(requestError) }
  }

  const selectedProgram = programs.find((program) => program.programId === selectedProgramId)
  const availableTypes = new Set(documents.filter((item) => ['SUBMITTED', 'ACCEPTED'].includes(item.reviewStatus)).map((item) => item.documentType))
  const missingTypes = selectedProgram?.requiredDocumentTypes.filter((type) => !availableTypes.has(type)) ?? []
  const rows = data?.beneficiaries ?? []

  return (
    <DashboardShell breadcrumbs={['Operations', 'Beneficiary services', 'Beneficiaries']} currentPath="/beneficiaries" onLogout={onLogout} onNavigate={onNavigate} pageTitle="Beneficiaries" user={session.user}>
      <header className="flex flex-col gap-5 border-b border-line pb-6 sm:flex-row sm:items-end sm:justify-between"><div><p className="ga-eyebrow">Verified household records</p><h1 className="ga-page-title">Beneficiary management</h1><p className="ga-page-copy">Register, maintain, and review beneficiary records through the access allowed for your official role.</p></div>{canManage && <button type="button" onClick={() => setFormState({ beneficiary: null })} className="ga-btn-primary shrink-0">Register beneficiary</button>}</header>

      <section className="mt-6 flex flex-col gap-3 rounded-xl border border-blue-200 bg-info-soft p-4 text-sm leading-6 text-copy sm:flex-row sm:items-center sm:justify-between"><p><strong className="text-ink">Privacy reminder:</strong> Open a record only when required for an assigned government-service task.</p><span className="shrink-0 font-bold text-brand-blue">Role-scoped access</span></section>

      <form onSubmit={applyFilters} className="ga-card mt-5 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_12rem_15rem_auto] sm:p-5" aria-label="Beneficiary filters">
        <div><label htmlFor="beneficiary-search" className="sr-only">Search beneficiaries</label><input id="beneficiary-search" value={draft.search} onChange={(event) => setDraft((current) => ({ ...current, search: event.target.value }))} placeholder="Search name, email, or PhilSys number" className="ga-input" /></div>
        <div><label htmlFor="beneficiary-filter-status" className="sr-only">Record status</label><select id="beneficiary-filter-status" value={draft.status} onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value }))} className="ga-input">{beneficiaryStatuses.map((value) => <option key={value || 'ALL'} value={value}>{value ? humanize(value) : 'All statuses'}</option>)}</select></div>
        {!isFacilitator && <div><label htmlFor="beneficiary-filter-barangay" className="sr-only">Barangay</label><select id="beneficiary-filter-barangay" value={draft.barangayId} onChange={(event) => setDraft((current) => ({ ...current, barangayId: event.target.value }))} className="ga-input"><option value="">All barangays</option>{barangays.map((barangay) => <option key={barangay.barangayId} value={barangay.barangayId}>{barangay.barangayName}</option>)}</select></div>}
        <button type="submit" className="ga-btn-primary">Apply filters</button>
      </form>

      {isLoading ? <PageSkeleton /> : error ? <section className="mt-6 rounded-xl border border-amber-200 bg-white p-6" role="alert"><h2 className="font-extrabold">Beneficiary records could not be loaded</h2><p className="mt-2 text-sm text-muted-copy">{error}</p><button type="button" onClick={() => { setIsLoading(true); setReload((value) => value + 1) }} className="ga-btn-primary mt-4">Try again</button></section> : (
        <div className="mt-6 grid items-start gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(24rem,0.75fr)]">
          <section className="ga-card overflow-hidden" aria-labelledby="beneficiary-list-heading"><div className="flex items-center justify-between border-b border-line px-5 py-4"><div><h2 id="beneficiary-list-heading" className="ga-section-heading">Beneficiary records</h2><p className="mt-1 text-sm text-muted-copy">{data.pagination.total} matching {data.pagination.total === 1 ? 'record' : 'records'}</p></div><span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-copy">Page {data.pagination.page}</span></div>
            {rows.length === 0 ? <div className="p-10 text-center"><span aria-hidden="true" className="mx-auto grid size-12 place-items-center rounded-full bg-info-soft font-black text-brand-blue">0</span><h3 className="mt-4 font-extrabold">No beneficiary records found</h3><p className="mt-2 text-sm text-muted-copy">Adjust the filters or register the first beneficiary in this scope.</p></div> : <>
              <ul className="divide-y divide-line md:hidden">{rows.map((beneficiary) => <li key={beneficiary.beneficiaryId} className={selectedId === beneficiary.beneficiaryId ? 'bg-info-soft/60' : ''}><button type="button" onClick={() => openBeneficiary(beneficiary.beneficiaryId)} className="min-h-20 w-full px-5 py-4 text-left"><div className="flex items-start justify-between gap-3"><div><p className="font-extrabold text-ink">{fullName(beneficiary)}</p><p className="mt-1 text-sm text-muted-copy">{beneficiary.sitioPurok ? `${beneficiary.sitioPurok} · ` : ''}{beneficiary.barangay?.barangayName}</p></div><StatusBadge value={beneficiary.status} /></div></button></li>)}</ul>
              <div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[720px] text-left text-sm"><caption className="sr-only">Beneficiary records</caption><thead><tr className="border-b border-line bg-slate-50 text-xs uppercase tracking-[0.08em] text-muted-copy"><th className="px-5 py-3">Beneficiary</th><th className="px-5 py-3">Barangay / Sitio</th><th className="px-5 py-3">Contact</th><th className="px-5 py-3">Status</th><th className="px-5 py-3"><span className="sr-only">Action</span></th></tr></thead><tbody className="divide-y divide-line">{rows.map((beneficiary) => <tr key={beneficiary.beneficiaryId} className={`hover:bg-slate-50 ${selectedId === beneficiary.beneficiaryId ? 'bg-info-soft/60' : ''}`}><td className="px-5 py-4"><p className="font-bold text-ink">{fullName(beneficiary)}</p><p className="mt-1 text-xs text-muted-copy">Born {displayDate(beneficiary.birthDate)}</p></td><td className="px-5 py-4 text-copy"><p>{beneficiary.barangay?.barangayName}</p><p className="mt-1 text-xs text-muted-copy">{beneficiary.sitioPurok ?? 'Sitio/Purok not recorded'}</p></td><td className="px-5 py-4 text-copy">{beneficiary.contactNumber ?? beneficiary.email ?? 'Not recorded'}</td><td className="px-5 py-4"><StatusBadge value={beneficiary.status} /></td><td className="px-5 py-4 text-right"><button type="button" onClick={() => openBeneficiary(beneficiary.beneficiaryId)} className="min-h-11 rounded-lg px-3 font-bold text-brand-blue hover:bg-info-soft">Open record</button></td></tr>)}</tbody></table></div>
              <div className="flex items-center justify-between border-t border-line px-5 py-4"><p className="text-xs font-semibold text-muted-copy">Page {data.pagination.page} of {Math.max(data.pagination.totalPages, 1)}</p><div className="flex gap-2"><button type="button" disabled={page <= 1} onClick={() => { setIsLoading(true); setPage(page - 1) }} className="ga-btn-secondary min-h-11 px-4 text-sm">Previous</button><button type="button" disabled={page >= data.pagination.totalPages} onClick={() => { setIsLoading(true); setPage(page + 1) }} className="ga-btn-secondary min-h-11 px-4 text-sm">Next</button></div></div>
            </>}
          </section>

          <aside className="self-start xl:sticky xl:top-28" aria-label="Selected beneficiary record">
            {!selectedId ? <div className="ga-card-flat p-7 text-center"><span aria-hidden="true" className="mx-auto grid size-12 place-items-center rounded-full bg-info-soft text-xl text-brand-blue">→</span><h2 className="mt-4 text-lg font-extrabold">Select a beneficiary</h2><p className="mt-2 text-sm leading-6 text-muted-copy">Open a record to review identity details, documents, and program readiness.</p></div> : isLoadingDetail ? <div className="ga-card p-6"><Skeleton className="h-6 w-48" /><Skeleton className="mt-5 h-32 w-full" /><Skeleton className="mt-4 h-40 w-full" /></div> : selected && <div className="ga-card overflow-hidden"><div className="border-b border-line bg-brand-navy p-5 text-white"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.1em] text-blue-200">Selected record</p><h2 className="mt-2 text-xl font-extrabold">{fullName(selected)}</h2><p className="mt-1 text-sm text-blue-100">{selected.barangay?.barangayName}, {selected.barangay?.city}</p></div><StatusBadge value={selected.status} /></div>{canManage && <button type="button" onClick={() => setFormState({ beneficiary: selected })} className="mt-4 min-h-11 rounded-lg bg-white px-4 text-sm font-bold text-brand-navy hover:bg-blue-50">Edit verified details</button>}</div>
              <div className="p-5"><dl className="grid grid-cols-2 gap-x-4 gap-y-5 text-sm"><div><dt className="text-muted-copy">Birth date</dt><dd className="mt-1 font-bold text-ink">{displayDate(selected.birthDate)}</dd></div><div><dt className="text-muted-copy">Sex</dt><dd className="mt-1 font-bold text-ink">{humanize(selected.sex)}</dd></div><div><dt className="text-muted-copy">Sitio / Purok</dt><dd className="mt-1 font-semibold text-copy">{selected.sitioPurok ?? 'Not recorded'}</dd></div><div className="col-span-2"><dt className="text-muted-copy">Address</dt><dd className="mt-1 font-semibold text-copy">{selected.address}</dd></div><div><dt className="text-muted-copy">Mobile</dt><dd className="mt-1 font-semibold text-copy">{selected.contactNumber ?? 'Not recorded'}</dd></div><div><dt className="text-muted-copy">PhilSys</dt><dd className="mt-1 font-semibold text-copy">{selected.philsysNumber ?? 'Not recorded'}</dd></div></dl></div>

              <section className="border-t border-line p-5" aria-labelledby="beneficiary-documents-heading"><div className="flex items-center justify-between"><div><h3 id="beneficiary-documents-heading" className="font-extrabold">Supporting documents</h3><p className="mt-1 text-xs text-muted-copy">PDF, JPG, or PNG · maximum 5 MB</p></div><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold">{documents.length}</span></div>
                {documents.length === 0 ? <p className="mt-4 rounded-lg border border-dashed border-line p-4 text-sm text-muted-copy">No documents have been uploaded.</p> : <ul className="mt-4 space-y-3">{documents.map((item) => <li key={item.documentId} className="rounded-lg border border-line p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-bold text-ink">{humanize(item.documentType)}</p><p className="mt-1 truncate text-xs text-muted-copy">{item.originalFileName}</p></div><StatusBadge value={item.reviewStatus} /></div>{item.reviewNotes && <p className="mt-3 rounded-md bg-danger-soft p-3 text-xs leading-5 text-brand-red">{item.reviewNotes}</p>}<div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => download(item)} className="min-h-11 rounded-lg border border-line px-3 text-xs font-bold text-brand-blue hover:bg-info-soft">Download</button>{role === 'DSWD_STAFF' && item.reviewStatus === 'SUBMITTED' && <><button type="button" onClick={() => setReviewDialog({ document: item, decision: 'ACCEPTED' })} className="min-h-11 rounded-lg bg-brand-green px-3 text-xs font-bold text-white">Accept</button><button type="button" onClick={() => setReviewDialog({ document: item, decision: 'REJECTED' })} className="min-h-11 rounded-lg border border-red-200 px-3 text-xs font-bold text-brand-red hover:bg-danger-soft">Reject</button></>}</div>{isFacilitator && item.reviewStatus === 'REJECTED' && <form onSubmit={(event) => uploadDocument(event, item)} className="mt-3 border-t border-line pt-3"><label htmlFor={`replacement-${item.documentId}`} className="text-xs font-bold text-ink">Upload corrected {humanize(item.documentType)}</label><input id={`replacement-${item.documentId}`} name="file" type="file" required accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" className="mt-2 block w-full text-xs text-copy file:mr-3 file:rounded-lg file:border-0 file:bg-info-soft file:px-3 file:py-2 file:font-bold file:text-brand-blue" /><button type="submit" className="mt-3 min-h-11 rounded-lg bg-brand-blue px-4 text-xs font-bold text-white">Replace document</button></form>}</li>)}</ul>}
                {isFacilitator && <form onSubmit={uploadDocument} className="mt-4 grid gap-3 rounded-lg bg-slate-50 p-4"><div><label htmlFor="new-document-type" className="ga-label">Document type</label><select id="new-document-type" name="documentType" required className="ga-input mt-2">{documentTypes.map((type) => <option key={type} value={type}>{humanize(type)}</option>)}</select></div><div><label htmlFor="new-document-file" className="ga-label">Choose document</label><input id="new-document-file" name="file" type="file" required accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" className="mt-2 block w-full text-sm text-copy file:mr-3 file:min-h-11 file:rounded-lg file:border-0 file:bg-info-soft file:px-4 file:font-bold file:text-brand-blue" /></div><button type="submit" className="ga-btn-primary">Upload for review</button></form>}
              </section>

              {isFacilitator && <section className="border-t border-line p-5"><h3 className="font-extrabold">Submit to assistance program</h3><p className="mt-1 text-xs leading-5 text-muted-copy">Required documents must be submitted or accepted before DSWD review begins.</p><form onSubmit={enroll} className="mt-4"><label htmlFor="beneficiary-program" className="ga-label">Active program</label><select id="beneficiary-program" required value={selectedProgramId} onChange={(event) => setSelectedProgramId(event.target.value)} className="ga-input mt-2"><option value="">Select program</option>{programs.map((program) => <option key={program.programId} value={program.programId}>{program.programCode} — {program.programName}</option>)}</select>{selectedProgram && <div className={`mt-3 rounded-lg border p-3 text-xs leading-5 ${missingTypes.length ? 'border-amber-200 bg-warning-soft text-brand-amber' : 'border-emerald-200 bg-success-soft text-brand-green'}`}>{missingTypes.length ? <>Still required: <strong>{missingTypes.map(humanize).join(', ')}</strong></> : <><strong>Document-ready.</strong> This record can be submitted for DSWD review.</>}</div>}<button type="submit" disabled={!selectedProgramId || missingTypes.length > 0 || selected.status !== 'ACTIVE'} className="ga-btn-primary mt-4 w-full">Submit enrollment</button></form></section>}
            </div>}
          </aside>
        </div>
      )}

      {formState && <BeneficiaryFormDialog key={formState.beneficiary?.beneficiaryId ?? 'new'} beneficiary={formState.beneficiary} barangays={barangays} isFacilitator={isFacilitator} onClose={() => setFormState(null)} onSave={saveBeneficiary} />}
      {reviewDialog && <ConfirmationDialog open title={reviewDialog.decision === 'ACCEPTED' ? 'Accept this document?' : 'Reject this document?'} description={reviewDialog.decision === 'ACCEPTED' ? 'The document will count toward the program requirements for this beneficiary.' : 'The facilitator will see your reason and must upload a corrected replacement.'} actionLabel={reviewDialog.decision === 'ACCEPTED' ? 'Accept document' : 'Reject document'} destructive={reviewDialog.decision === 'REJECTED'} reasonLabel={reviewDialog.decision === 'REJECTED' ? 'Correction reason' : undefined} onCancel={() => setReviewDialog(null)} onConfirm={reviewDocument} />}
    </DashboardShell>
  )
}

export default BeneficiaryManagementPage
