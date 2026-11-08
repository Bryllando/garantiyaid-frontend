import { enrollmentLocation, readEnrollmentLocation } from '../utils/enrollmentLocation.js'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import DashboardShell from '../components/layout/DashboardShell.jsx'
import BeneficiaryImportDialog from '../components/beneficiaries/BeneficiaryImportDialog.jsx'
import BeneficiaryWorkflowNav from '../components/beneficiaries/BeneficiaryWorkflowNav.jsx'
import BeneficiaryAssistanceProgress from '../components/beneficiaries/BeneficiaryAssistanceProgress.jsx'
import BeneficiaryDocumentPreview from '../components/beneficiaries/BeneficiaryDocumentPreview.jsx'
import { getBeneficiaryNextTask } from '../utils/beneficiaryNextTask.js'
import { missingProgramDocuments, otherDocumentNames } from '../utils/programDocuments.js'
import { ConfirmationDialog } from '../components/ui/confirmation-dialog.jsx'
import { Icon } from '../components/ui/icon.jsx'
import { PhilippineMobileField } from '../components/ui/philippine-mobile-field.jsx'
import { Skeleton } from '../components/ui/skeleton.jsx'
import { LoadingLabel } from '../components/ui/spinner.jsx'
import {
  createBeneficiary,
  downloadBeneficiaryDocument,
  getAuthErrorMessage,
  isSessionExpiredError,
  replaceBeneficiaryDocument,
  removeBeneficiaryDocument,
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

function BeneficiaryFormDialog({ assignedBarangay, barangays, beneficiary, isFacilitator, onClose, onSave }) {
  const dialogRef = useRef(null)
  const errorRef = useRef(null)
  const bodyRef = useRef(null)
  const [form, setForm] = useState(() => beneficiary ? {
    firstName: beneficiary.firstName ?? '', middleName: beneficiary.middleName ?? '', lastName: beneficiary.lastName ?? '',
    birthDate: beneficiary.birthDate?.slice(0, 10) ?? '', sex: beneficiary.sex ?? '', address: beneficiary.address ?? '',
    sitioPurok: beneficiary.sitioPurok ?? '', barangayId: beneficiary.barangayId ?? '', contactNumber: beneficiary.contactNumber ?? '', email: beneficiary.email ?? '',
    philsysNumber: beneficiary.philsysNumber ?? '', status: beneficiary.status ?? 'ACTIVE',
  } : emptyBeneficiaryForm)
  const [isSaving, setIsSaving] = useState(false)
  const [reviewing, setReviewing] = useState(false)
  const [formError, setFormError] = useState('')

  useEffect(() => {
    dialogRef.current?.showModal()
  }, [])
  useEffect(() => {
    const target = reviewing ? '#beneficiary-review-heading' : '#beneficiary-first-name'
    dialogRef.current?.querySelector(target)?.focus({ preventScroll: true })
    bodyRef.current?.scrollTo({ top: 0 })
  }, [reviewing])
  useEffect(() => { if (formError) errorRef.current?.focus() }, [formError])

  function change(field, value) {
    setForm((current) => ({ ...current, [field]: value }))
    setFormError('')
  }

  async function submit(event) {
    event.preventDefault()
    if (isSaving) return
    if (!reviewing) {
      const missing = [['firstName', 'first name'], ['lastName', 'last name'], ['address', 'complete address']].find(([field]) => !form[field].trim())
      if (missing) return setFormError(`Enter the beneficiary’s ${missing[1]}.`)
      setReviewing(true)
      return
    }
    setIsSaving(true)
    const payload = { ...form }
    if (isFacilitator) delete payload.barangayId
    if (!beneficiary || isFacilitator) delete payload.status
    try {
      await onSave(payload)
      dialogRef.current?.close()
    } catch (error) {
      setFormError(getAuthErrorMessage(error))
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <dialog ref={dialogRef} onCancel={event => { if (isSaving) event.preventDefault() }} onClose={onClose} aria-labelledby="beneficiary-form-title" aria-describedby="beneficiary-form-help" className="m-auto max-h-[calc(100dvh-2rem)] w-[min(48rem,calc(100%-2rem))] overflow-hidden rounded-lg border border-line bg-white p-0 text-ink shadow-lg backdrop:bg-slate-950/55">
      <form onSubmit={submit} aria-busy={isSaving} className="flex max-h-[calc(100dvh-2rem)] flex-col">
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-line px-4 py-5 sm:px-7"><div><p className="ga-eyebrow flex items-center gap-2"><Icon name="beneficiaries" className="size-4 shrink-0" />Step {reviewing ? '2' : '1'} of 2 · {reviewing ? 'Review and save' : 'Beneficiary details'}</p><h2 id="beneficiary-form-title" className="mt-2 text-2xl font-extrabold">{reviewing ? 'Check beneficiary details' : beneficiary ? 'Update beneficiary record' : 'Register a beneficiary'}</h2><p id="beneficiary-form-help" className="mt-2 text-sm leading-6 text-muted-copy">{reviewing ? 'Confirm the details below. Choose Change details to make a correction.' : 'Enter the verified details, then review before saving.'}</p></div><button type="button" disabled={isSaving} onClick={() => dialogRef.current?.close()} aria-label="Close beneficiary form" className="grid size-11 shrink-0 place-items-center rounded-lg border border-line text-copy hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-brand-blue"><Icon name="close" /></button></header>
        <div ref={bodyRef} onFocusCapture={event => { if (event.target.matches('input, select, textarea')) event.target.scrollIntoView({ block: 'nearest' }) }} className="min-h-0 flex-1 overflow-y-auto scroll-py-4 px-4 py-4 sm:px-7">
          {formError && <div ref={errorRef} tabIndex={-1} role="alert" className="mb-5 scroll-mt-4 rounded-lg border border-red-200 bg-danger-soft p-4 text-sm text-brand-red outline-none focus-visible:outline-2 focus-visible:outline-brand-red"><p className="font-semibold">Check the beneficiary details</p><p className="mt-1 leading-6">{formError}</p></div>}
          {reviewing ? <section aria-labelledby="beneficiary-review-heading"><h3 id="beneficiary-review-heading" tabIndex={-1} className="text-lg font-bold text-ink outline-none">Details to save</h3>{[
            ['Personal details', 'profile', [['Name', fullName(form)], ['Birth date', displayDate(form.birthDate)], ['Sex', humanize(form.sex)], ['PhilSys number', form.philsysNumber || 'Not provided']]],
            ['Address', 'location', [['Barangay', isFacilitator ? assignedBarangay?.barangayName ?? 'Your assigned barangay' : barangays.find(item => item.barangayId === form.barangayId)?.barangayName ?? 'Not selected'], ['Sitio / Purok', form.sitioPurok || 'Not provided'], ['Complete address', form.address]]],
            ['Contact details', 'mobile', [['Mobile number', form.contactNumber || 'Not provided'], ['Email address', form.email || 'Not provided']]],
            ...(beneficiary && !isFacilitator ? [['Record status', 'security', [['Status', humanize(form.status)]]]] : []),
          ].map(([title, icon, rows]) => <section key={title} className="mt-5 border-t border-line pt-4"><h4 className="flex items-center gap-2 text-sm font-semibold text-ink"><Icon name={icon} className="size-4 text-brand-blue" />{title}</h4><dl className="mt-2 divide-y divide-line text-sm">{rows.map(([label, value]) => <div key={label} className="grid min-w-0 gap-1 py-2.5 sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-4"><dt className="text-muted-copy">{label}</dt><dd className="[overflow-wrap:anywhere] font-semibold leading-6 text-ink">{value}</dd></div>)}</dl></section>)}<p className="mt-5 border-l-2 border-brand-blue bg-info-soft px-4 py-3 text-sm leading-6 text-copy">This saves the beneficiary record. Supporting documents and program enrollment are handled next.</p></section> : <fieldset disabled={isSaving} className="min-w-0 space-y-5">
            <p className="text-xs leading-5 text-muted-copy">Fields marked <span aria-hidden="true" className="text-brand-red">*</span><span className="sr-only">with an asterisk</span> are required. Leave optional fields blank if unavailable.</p>
            <fieldset className="min-w-0"><legend className="flex items-center gap-2 text-base font-bold text-ink"><Icon name="profile" className="size-5 text-brand-blue" />Personal details</legend><p className="mt-1 text-sm leading-6 text-muted-copy">Match the name and birth date to the beneficiary’s supporting records.</p><div className="mt-4 grid gap-x-4 gap-y-5 sm:grid-cols-2 md:grid-cols-3">
              <FormField label="First name" id="beneficiary-first-name" required placeholder="e.g. Juan" value={form.firstName} onChange={value => change('firstName', value)} />
              <FormField label="Middle name" id="beneficiary-middle-name" optional placeholder="If applicable" value={form.middleName} onChange={value => change('middleName', value)} />
              <FormField label="Last name" id="beneficiary-last-name" required placeholder="e.g. Dela Cruz" value={form.lastName} onChange={value => change('lastName', value)} />
              <div><label htmlFor="beneficiary-birth-date" className="ga-label inline-flex items-center gap-2"><Icon name="calendar" className="size-4 text-brand-blue" />Birth date</label><input id="beneficiary-birth-date" type="date" required max={new Date().toISOString().slice(0, 10)} value={form.birthDate} onChange={event => change('birthDate', event.target.value)} className="ga-input mt-2 min-w-0" /></div>
              <div><label htmlFor="beneficiary-sex" className="ga-label">Sex</label><select id="beneficiary-sex" required value={form.sex} onChange={event => change('sex', event.target.value)} className="ga-input mt-2"><option value="">Select sex</option>{['FEMALE', 'MALE', 'OTHER', 'UNKNOWN'].map(value => <option key={value} value={value}>{humanize(value)}</option>)}</select></div>
              <FormField label="PhilSys number" id="beneficiary-philsys" icon="idCard" optional maxLength="50" value={form.philsysNumber} onChange={value => change('philsysNumber', value)} />
            </div></fieldset>
            <fieldset className="min-w-0 border-t border-line pt-5"><legend className="float-left mb-4 flex w-full items-center gap-2 text-base font-bold text-ink"><Icon name="location" className="size-5 text-brand-blue" />Address</legend><div className="clear-both grid gap-x-4 gap-y-5 sm:grid-cols-2">
              {isFacilitator ? <div><p className="ga-label">Barangay</p><div className="mt-2 rounded-lg border border-line bg-slate-50 px-3 py-2.5"><p className="text-sm font-semibold text-ink">{assignedBarangay?.barangayName ?? 'Your assigned barangay'}</p><p className="mt-0.5 text-xs leading-5 text-muted-copy">Assigned to your staff account</p></div></div> : <div><label htmlFor="beneficiary-barangay" className="ga-label">Barangay</label><select id="beneficiary-barangay" required value={form.barangayId} onChange={event => change('barangayId', event.target.value)} className="ga-input mt-2"><option value="">Select barangay</option>{barangays.map(barangay => <option key={barangay.barangayId} value={barangay.barangayId}>{barangay.barangayName}, {barangay.city}</option>)}</select></div>}
              <div><FormField label="Sitio / Purok" id="beneficiary-sitio-purok" optional maxLength="120" placeholder="e.g. Sitio Riverside" value={form.sitioPurok} onChange={value => change('sitioPurok', value)} /><p className="mt-2 text-xs leading-5 text-muted-copy">For local distribution schedules.</p></div>
              <div className="sm:col-span-2"><label htmlFor="beneficiary-address" className="ga-label">Complete address</label><textarea id="beneficiary-address" required rows="3" maxLength="2000" placeholder="House or lot number, street, barangay, and city / municipality" value={form.address} onChange={event => change('address', event.target.value)} className="ga-input mt-2 min-h-24 resize-y py-3" /></div>
            </div></fieldset>
            <fieldset className="min-w-0 border-t border-line pt-5"><legend className="float-left mb-4 flex w-full items-center gap-2 text-base font-bold text-ink"><Icon name="mobile" className="size-5 text-brand-blue" />Contact details</legend><div className="clear-both grid gap-x-4 gap-y-5 sm:grid-cols-2">
              <PhilippineMobileField id="beneficiary-contact" label="Mobile number" icon="mobile" value={form.contactNumber} onChange={value => change('contactNumber', value)} />
              <FormField label="Email address" id="beneficiary-email" icon="email" optional type="email" maxLength="150" placeholder="e.g. juan@example.com" value={form.email} onChange={value => change('email', value)} />
            </div></fieldset>
            {beneficiary && !isFacilitator && <div className="border-t border-line pt-5"><label htmlFor="beneficiary-status" className="ga-label">Record status</label><select id="beneficiary-status" value={form.status} onChange={event => change('status', event.target.value)} className="ga-input mt-2">{beneficiaryStatuses.slice(1).map(value => <option key={value} value={value}>{humanize(value)}</option>)}</select></div>}
          </fieldset>}
        </div>
        <footer className="flex shrink-0 flex-col-reverse gap-3 border-t border-line bg-white px-4 py-4 sm:flex-row sm:justify-end sm:px-7"><button type="button" onClick={() => { if (reviewing) { setReviewing(false); setFormError('') } else dialogRef.current?.close() }} disabled={isSaving} className="ga-btn-secondary">{reviewing && <Icon name="arrowLeft" className="size-4" />}{reviewing ? 'Change details' : 'Cancel'}</button><button type="submit" disabled={isSaving} className="ga-btn-primary">{isSaving ? <LoadingLabel>Saving...</LoadingLabel> : <>{reviewing ? beneficiary ? 'Save changes' : 'Register beneficiary' : 'Review beneficiary details'}<Icon name={reviewing ? 'check' : 'arrowRight'} className="size-4" /></>}</button></footer>
      </form>
    </dialog>
  )
}

function FormField({ id, icon, label, maxLength = 100, onChange, optional = false, required, value, ...inputProps }) {
  return <div className="min-w-0"><label htmlFor={id} className="ga-label">{label}{required && <span aria-hidden="true" className="ml-1 text-brand-red after:content-['*']" />}{optional && <span className="ml-1 font-normal text-muted-copy">(optional)</span>}</label><div className="relative mt-2">{icon && <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted-copy"><Icon name={icon} className="size-5" /></span>}<input id={id} required={required} maxLength={maxLength} value={value} onChange={event => onChange(event.target.value)} className={`ga-input ${icon ? 'pl-11' : ''}`} {...inputProps} /></div></div>
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
  const [uploadingDocument, setUploadingDocument] = useState('')
  const uploadPending = useRef(false)
  const [selectedProgramId, setSelectedProgramId] = useState('')
  const [isEnrolling, setIsEnrolling] = useState(false)
  const [enrollmentError, setEnrollmentError] = useState('')
  const [submittedEnrollment, setSubmittedEnrollment] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingDetail, setIsLoadingDetail] = useState(() => Boolean(new URLSearchParams(window.location.search).get('beneficiary')))
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  const [formState, setFormState] = useState(null)
  const [importOpen, setImportOpen] = useState(false)
  const [reviewDialog, setReviewDialog] = useState(null)
  const [reviewError, setReviewError] = useState('')
  const [previewDocument, setPreviewDocument] = useState(null)
  const [removeDocument, setRemoveDocument] = useState(null)
  const [removeError, setRemoveError] = useState('')
  const [removingDocument, setRemovingDocument] = useState(false)
  const documentBusy = Boolean(uploadingDocument) || removingDocument
  const [uploadType, setUploadType] = useState('VALID_ID')
  const [uploadName, setUploadName] = useState('')
  const [uploadError, setUploadError] = useState(null)
  const [uploadNotice, setUploadNotice] = useState(null)
  const uploadFormRef = useRef(null)
  const detailRef = useRef(null)
  const role = session.user.role
  const reviewQuery = new URLSearchParams(window.location.search).get('review')
  const reviewReturn = reviewQuery !== null ? enrollmentLocation(readEnrollmentLocation(reviewQuery)) : null
  const isFacilitator = role === 'BARANGAY_FACILITATOR'
  const canManage = role === 'SYSTEM_ADMIN' || isFacilitator
  const canSubmit = canManage || role === 'DSWD_STAFF'

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
    if (beneficiaryId === selectedId && selected) return
    const url = new URL(window.location.href)
    url.searchParams.set('beneficiary', beneficiaryId)
    url.searchParams.delete('progressEnrollment')
    url.searchParams.delete('progressEvent')
    window.history.replaceState(window.history.state, '', url)
    if (beneficiaryId !== selectedId) {
      setSelected(null)
      setDocuments([])
      setSelectedProgramId('')
      setUploadType('VALID_ID')
      setUploadName('')
      setUploadError(null)
      setUploadNotice(null)
    }
    setIsLoadingDetail(true)
    setSelectedId(beneficiaryId)
    if (window.matchMedia('(max-width: 1279px)').matches) {
      requestAnimationFrame(() => {
        detailRef.current?.focus({ preventScroll: true })
        detailRef.current?.scrollIntoView({ block: 'start', behavior: 'instant' })
      })
    }
  }

  function returnToRecords() {
    setSelectedId('')
    setSelected(null)
    setDocuments([])
    setSelectedProgramId('')
    const url = new URL(window.location.href)
    url.searchParams.delete('beneficiary')
    url.searchParams.delete('progressEnrollment')
    url.searchParams.delete('progressEvent')
    window.history.replaceState({}, '', `${url.pathname}${url.search}`)
    requestAnimationFrame(() => document.getElementById('beneficiary-list-heading')?.focus())
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
    if (uploadPending.current) return
    const form = event.currentTarget
    const formData = new FormData(form)
    const file = formData.get('file')
    const type = replacement?.documentType ?? uploadType
    const documentName = replacement?.documentName ?? (type === 'OTHER' ? uploadName : null)
    const documentId = replacement?.documentId ?? 'new'
    function invalid(message, field) {
      setUploadError({ beneficiaryId: selectedId, documentId, message, field })
      form.elements.namedItem(field)?.focus()
    }
    setUploadError(null)
    setUploadNotice(null)
    if (!documentTypes.includes(type)) return invalid('Choose the type of document you are uploading.', 'documentType')
    if (!replacement && type === 'OTHER' && !documentName?.trim()) return invalid('Enter the document name, or choose a missing requirement below to fill it in.', 'documentName')
    if (documentName?.trim().length > 150) return invalid('Keep the document name within 150 characters.', 'documentName')
    if (!(file instanceof File) || file.size === 0) return invalid('Choose a PDF, JPG, or PNG file that is not empty.', 'file')
    if (file.size > 5 * 1024 * 1024) return invalid('The document must be 5 MB or smaller. Choose a smaller file.', 'file')
    if (!/\.(pdf|jpe?g|png)$/i.test(file.name) && !['application/pdf', 'image/jpeg', 'image/png'].includes(file.type)) return invalid('This file type is not supported. Choose a PDF, JPG, or PNG file.', 'file')
    uploadPending.current = true
    setUploadingDocument(documentId)
    try {
      if (replacement) await replaceBeneficiaryDocument(session.accessToken, selectedId, replacement.documentId, type, file, documentName)
      else await uploadBeneficiaryDocument(session.accessToken, selectedId, type, file, documentName)
      toast.success(replacement ? 'Rejected document replaced.' : 'Document uploaded for DSWD review.')
      form.reset()
      if (!replacement) { setUploadType('VALID_ID'); setUploadName('') }
      setUploadNotice({ beneficiaryId: selectedId, message: `${documentName?.trim() || humanize(type)} uploaded. Awaiting DSWD document review.` })
      setReload((value) => value + 1)
    } catch (requestError) {
      if (isSessionExpiredError(requestError)) return onSessionExpired()
      setUploadError({ beneficiaryId: selectedId, documentId, message: getAuthErrorMessage(requestError) })
    }
    finally { uploadPending.current = false; setUploadingDocument('') }
  }

  async function reviewDocument(reason) {
    const dialog = reviewDialog
    setReviewError('')
    if (!dialog) return
    try {
      await reviewBeneficiaryDocument(session.accessToken, selectedId, dialog.document.documentId, { decision: dialog.decision, ...(reason ? { reason } : {}) })
      toast.success(dialog.decision === 'ACCEPTED' ? 'Document accepted.' : 'Correction requested for document.')
      setReviewDialog(null)
      setReload((value) => value + 1)
    } catch (requestError) { setReviewError(getAuthErrorMessage(requestError)); handleError(requestError); throw requestError }
  }

  async function confirmDocumentRemoval() {
    if (!removeDocument || uploadPending.current) return
    uploadPending.current = true
    setRemovingDocument(true); setRemoveError('')
    try {
      await removeBeneficiaryDocument(session.accessToken, selectedId, removeDocument.documentId)
      setDocuments(current => current.filter(item => item.documentId !== removeDocument.documentId))
      setRemoveDocument(null)
      setUploadNotice({ beneficiaryId: selectedId, message: 'Upload removed. Any requirement it covered will need a new file.' })
      setReload(value => value + 1)
      requestAnimationFrame(() => document.getElementById('beneficiary-documents-heading')?.focus({ preventScroll: true }))
    } catch (failure) {
      if (isSessionExpiredError(failure)) onSessionExpired()
      else setRemoveError(getAuthErrorMessage(failure))
      throw failure
    } finally { uploadPending.current = false; setRemovingDocument(false) }
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
    if (isEnrolling) return
    setIsEnrolling(true)
    setEnrollmentError('')
    try {
      const enrollment = await submitEnrollment(session.accessToken, selectedProgramId, selectedId)
      toast.success('Enrollment submitted for review.', { description: `Status: ${humanize(enrollment.status)}` })
      setSubmittedEnrollment({ beneficiaryId: selectedId, enrollment })
      setSelectedProgramId('')
      setReload((value) => value + 1)
    } catch (requestError) {
      if (isSessionExpiredError(requestError)) return onSessionExpired()
      setEnrollmentError({ beneficiaryId: selectedId, message: getAuthErrorMessage(requestError) })
    } finally { setIsEnrolling(false) }
  }

  const selectedProgram = programs.find((program) => program.programId === selectedProgramId)
  const missingTypes = missingProgramDocuments(selectedProgram, documents, ['SUBMITTED', 'ACCEPTED'])
  const currentUploadError = uploadError?.beneficiaryId === selectedId ? uploadError : null
  const requiredUploadTypes = selectedProgram?.requiredDocumentTypes ?? []
  const uploadPrograms = (selectedProgram ? [selectedProgram] : programs).filter(program => program.requiredDocumentTypes?.includes('OTHER'))
  const uploadOtherNames = [...new Set(uploadPrograms.flatMap(otherDocumentNames))]
  const customOtherAllowed = uploadPrograms.some(program => !otherDocumentNames(program).length)
  const uploadSelection = uploadType === 'OTHER' && uploadOtherNames.includes(uploadName) ? `OTHER:${uploadName}` : uploadType

  function uploadRequirement(requirement) {
    setUploadType(requirement.documentType)
    setUploadName(requirement.documentName ?? '')
    setUploadError(null)
    setUploadNotice(null)
    requestAnimationFrame(() => {
      uploadFormRef.current?.scrollIntoView({ block: 'center', behavior: 'instant' })
      document.getElementById('new-document-file')?.focus({ preventScroll: true })
    })
  }
  const rows = data?.beneficiaries ?? []
  const nextTask = getBeneficiaryNextTask(selected, documents, role)

  return (
    <DashboardShell breadcrumbs={['Operations', 'Beneficiary services', 'Beneficiaries']} currentPath="/beneficiaries" onLogout={onLogout} onNavigate={onNavigate} pageTitle="Beneficiaries" showAssistant={!selectedId} user={session.user}>
      <header className={`ga-page-header flex-col gap-5 border-b border-line pb-6 sm:flex-row sm:items-end sm:justify-between ${selectedId ? 'hidden xl:flex' : 'flex'}`}><div><p className="ga-eyebrow">Beneficiary registration and documents</p><h1 className="ga-page-title">{role === 'SYSTEM_ADMIN' ? 'Beneficiary records' : 'Beneficiary management'}</h1><p className="ga-page-copy">{role === 'SYSTEM_ADMIN' ? 'Register records, check supporting documents, and submit beneficiaries to active assistance programs.' : 'Register, maintain, and review beneficiary records through the access allowed for your official role.'}</p></div>{canManage && <div className="flex flex-wrap gap-2"><button type="button" onClick={() => setImportOpen(true)} className="ga-btn-secondary shrink-0">Import beneficiaries</button><button type="button" onClick={() => setFormState({ beneficiary: null })} className="ga-btn-primary shrink-0">Register beneficiary</button></div>}</header>

      {(role === 'SYSTEM_ADMIN' || role === 'DSWD_STAFF' || isFacilitator) && reviewReturn && <a href={reviewReturn} onClick={(event) => { event.preventDefault(); onNavigate(reviewReturn) }} className="ga-admin-link mb-3">← Return to enrollment review</a>}
      {role === 'SYSTEM_ADMIN' && <div className={selectedId ? 'hidden xl:block' : ''}><BeneficiaryWorkflowNav currentPath="/beneficiaries" onNavigate={onNavigate} /></div>}

      {role !== 'SYSTEM_ADMIN' && <section className={`mt-6 flex-col gap-3 rounded-xl border border-blue-200 bg-info-soft p-4 text-sm leading-6 text-copy sm:flex-row sm:items-center sm:justify-between ${selectedId ? 'hidden xl:flex' : 'flex'}`}><p><strong className="text-ink">Privacy reminder:</strong> Open a record only when required for an assigned government-service task.</p><span className="shrink-0 font-bold text-brand-blue">Role-scoped access</span></section>}

      <form onSubmit={applyFilters} className={`ga-card mt-5 items-end gap-3 p-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_12rem_15rem_auto] sm:p-5 ${selectedId ? 'hidden xl:grid' : 'grid'}`} aria-label="Beneficiary filters">
        <div><label htmlFor="beneficiary-search" className="ga-label">Search records</label><input id="beneficiary-search" value={draft.search} onChange={(event) => setDraft((current) => ({ ...current, search: event.target.value }))} placeholder="Name, email, or PhilSys number" className="ga-input mt-2" /></div>
        <div><label htmlFor="beneficiary-filter-status" className="ga-label">Record status</label><select id="beneficiary-filter-status" value={draft.status} onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value }))} className="ga-input mt-2">{beneficiaryStatuses.map((value) => <option key={value || 'ALL'} value={value}>{value ? humanize(value) : 'All statuses'}</option>)}</select></div>
        {!isFacilitator && <div><label htmlFor="beneficiary-filter-barangay" className="ga-label">Barangay</label><select id="beneficiary-filter-barangay" value={draft.barangayId} onChange={(event) => setDraft((current) => ({ ...current, barangayId: event.target.value }))} className="ga-input mt-2"><option value="">All barangays</option>{barangays.map((barangay) => <option key={barangay.barangayId} value={barangay.barangayId}>{barangay.barangayName}</option>)}</select></div>}
        <button type="submit" className="ga-btn-primary">Apply filters</button>
      </form>

      {selectedId && <h1 className="sr-only xl:hidden">Beneficiary record{selected ? `: ${fullName(selected)}` : ''}</h1>}
      {isLoading ? <PageSkeleton /> : error ? <section className="mt-6 rounded-xl border border-amber-200 bg-white p-6" role="alert"><h2 className="font-extrabold">Beneficiary records could not be loaded</h2><p className="mt-2 text-sm text-muted-copy">{error}</p><button type="button" onClick={() => { setIsLoading(true); setReload((value) => value + 1) }} className="ga-btn-primary mt-4">Try again</button></section> : (
        <div className={`mt-6 grid items-start gap-5 ${selectedId ? 'xl:grid-cols-[20rem_minmax(0,1fr)]' : 'xl:grid-cols-[minmax(0,1.45fr)_minmax(24rem,0.75fr)]'}`}>
          <section className={`ga-card overflow-hidden ${selectedId ? 'hidden xl:block' : ''}`} aria-labelledby="beneficiary-list-heading"><div className="flex items-center justify-between border-b border-line px-5 py-4"><div><h2 id="beneficiary-list-heading" tabIndex={-1} className="ga-section-heading scroll-mt-36 focus:outline-none">Beneficiary records</h2><p className="mt-1 text-sm text-muted-copy">{data.pagination.total} matching {data.pagination.total === 1 ? 'record' : 'records'}</p></div><span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-copy">Page {data.pagination.page}</span></div>
            {rows.length === 0 ? <div className="p-10 text-center"><span aria-hidden="true" className="mx-auto grid size-12 place-items-center rounded-full bg-info-soft font-black text-brand-blue">0</span><h3 className="mt-4 font-extrabold">No beneficiary records found</h3><p className="mt-2 text-sm text-muted-copy">Adjust the filters or register the first beneficiary in this scope.</p></div> : <>
              <ul className={`divide-y divide-line ${selectedId ? '' : 'md:hidden'}`}>{rows.map((beneficiary) => <li key={beneficiary.beneficiaryId} className={selectedId === beneficiary.beneficiaryId ? 'bg-info-soft/60' : ''}><button type="button" aria-pressed={selectedId === beneficiary.beneficiaryId} onClick={() => openBeneficiary(beneficiary.beneficiaryId)} className="min-h-20 w-full px-5 py-4 text-left focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand-blue"><div className="flex items-start justify-between gap-3"><div><p className="font-extrabold text-ink">{fullName(beneficiary)}</p><p className="mt-1 text-sm text-muted-copy">{beneficiary.sitioPurok ? `${beneficiary.sitioPurok} · ` : ''}{beneficiary.barangay?.barangayName}</p></div><StatusBadge value={beneficiary.status} /></div></button></li>)}</ul>
              <div className={`overflow-x-auto ${selectedId ? 'hidden' : 'hidden md:block'}`}><table className="w-full min-w-[720px] text-left text-sm"><caption className="sr-only">Beneficiary records</caption><thead><tr className="border-b border-line bg-slate-50 text-xs uppercase tracking-[0.08em] text-muted-copy"><th className="px-5 py-3">Beneficiary</th><th className="px-5 py-3">Barangay / Sitio</th><th className="px-5 py-3">Contact</th><th className="px-5 py-3">Status</th><th className="px-5 py-3"><span className="sr-only">Action</span></th></tr></thead><tbody className="divide-y divide-line">{rows.map((beneficiary) => <tr key={beneficiary.beneficiaryId} className={`hover:bg-slate-50 ${selectedId === beneficiary.beneficiaryId ? 'bg-info-soft/60' : ''}`}><td className="px-5 py-4"><p className="font-bold text-ink">{fullName(beneficiary)}</p><p className="mt-1 text-xs text-muted-copy">Born {displayDate(beneficiary.birthDate)}</p></td><td className="px-5 py-4 text-copy"><p>{beneficiary.barangay?.barangayName}</p><p className="mt-1 text-xs text-muted-copy">{beneficiary.sitioPurok ?? 'Sitio/Purok not recorded'}</p></td><td className="px-5 py-4 text-copy">{beneficiary.contactNumber ?? beneficiary.email ?? 'Not recorded'}</td><td className="px-5 py-4"><StatusBadge value={beneficiary.status} /></td><td className="px-5 py-4 text-right"><button type="button" onClick={() => openBeneficiary(beneficiary.beneficiaryId)} className="min-h-11 rounded-lg px-3 font-bold text-brand-blue hover:bg-info-soft">Open record</button></td></tr>)}</tbody></table></div>
              <div className="flex items-center justify-between border-t border-line px-5 py-4"><p className="text-xs font-semibold text-muted-copy">Page {data.pagination.page} of {Math.max(data.pagination.totalPages, 1)}</p><div className="flex gap-2"><button type="button" disabled={page <= 1} onClick={() => { setIsLoading(true); setPage(page - 1) }} className="ga-btn-secondary min-h-11 px-4 text-sm">Previous</button><button type="button" disabled={page >= data.pagination.totalPages} onClick={() => { setIsLoading(true); setPage(page + 1) }} className="ga-btn-secondary min-h-11 px-4 text-sm">Next</button></div></div>
            </>}
          </section>

          <aside ref={detailRef} tabIndex={-1} className="self-start scroll-mt-36 focus:outline-2 focus:outline-offset-2 focus:outline-brand-blue" aria-label="Selected beneficiary record">
            {selectedId && <button type="button" onClick={returnToRecords} className="mb-3 inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm font-bold text-brand-blue focus-visible:outline-2 focus-visible:outline-brand-blue xl:hidden"><Icon name="arrowLeft" className="size-4" />Back to records</button>}
            {!selectedId ? <div className="ga-card-flat p-7 text-center"><span aria-hidden="true" className="mx-auto grid size-12 place-items-center rounded-full bg-info-soft text-xl text-brand-blue">→</span><h2 className="mt-4 text-lg font-extrabold">Select a beneficiary</h2><p className="mt-2 text-sm leading-6 text-muted-copy">Open a record to review identity details, documents, and program readiness.</p></div> : isLoadingDetail ? <div className="ga-card p-6"><Skeleton className="h-6 w-48" /><Skeleton className="mt-5 h-32 w-full" /><Skeleton className="mt-4 h-40 w-full" /></div> : selected && <div className="ga-card overflow-hidden">
              <div className="border-b border-line bg-brand-navy p-5 text-white"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.1em] text-blue-200">Selected record</p><h2 className="mt-2 text-xl font-extrabold">{fullName(selected)}</h2><p className="mt-1 text-sm text-blue-100">{selected.barangay?.barangayName}, {selected.barangay?.city}</p></div><StatusBadge value={selected.status} /></div></div>
              {nextTask && <section className="border-b border-line bg-info-soft p-5" aria-labelledby="beneficiary-next-task"><p className="text-sm font-bold text-brand-blue">Next task</p><h3 id="beneficiary-next-task" className="mt-1 text-lg font-bold text-ink">{nextTask.title}</h3><p className="mt-1 text-sm leading-6 text-copy">{nextTask.detail}</p><a href={nextTask.href} onClick={() => { if (nextTask.href === '#beneficiary-details-heading') { const details = detailRef.current?.querySelector('details'); if (details) details.open = true } }} className="mt-3 inline-flex min-h-11 items-center gap-2 font-bold text-brand-blue underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-brand-blue">{nextTask.action}<Icon name="arrowRight" className="size-4" /></a></section>}
              <BeneficiaryAssistanceProgress key={`${selected.beneficiaryId}:${reload}`} beneficiary={selected} token={session.accessToken} role={role} onNavigate={onNavigate} onSessionExpired={onSessionExpired} />
              {role === 'BARANGAY_FACILITATOR' && selected.status === 'ACTIVE' && <div className="border-b border-line p-5"><button type="button" className="ga-btn-secondary" onClick={() => onNavigate(`/burial-referrals?beneficiary=${selected.beneficiaryId}`)}>Prepare burial referral</button><p className="mt-2 text-sm text-muted-copy">Use this living applicant’s record to prepare a request concerning a deceased family member.</p></div>}
              <details className="border-b border-line"><summary id="beneficiary-details-heading" className="flex min-h-14 cursor-pointer scroll-mt-32 items-center justify-between gap-3 px-5 py-3 font-bold text-ink hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand-blue">Personal and contact details <Icon name="chevronDown" className="size-4" /></summary><div className="border-t border-line p-5"><dl className="grid grid-cols-2 gap-x-4 gap-y-5 text-sm"><div><dt className="text-muted-copy">Birth date</dt><dd className="mt-1 font-bold text-ink">{displayDate(selected.birthDate)}</dd></div><div><dt className="text-muted-copy">Sex</dt><dd className="mt-1 font-bold text-ink">{humanize(selected.sex)}</dd></div><div><dt className="text-muted-copy">Sitio / Purok</dt><dd className="mt-1 font-semibold text-copy">{selected.sitioPurok ?? 'Not recorded'}</dd></div><div className="col-span-2"><dt className="text-muted-copy">Address</dt><dd className="mt-1 font-semibold text-copy">{selected.address}</dd></div><div><dt className="text-muted-copy">Mobile</dt><dd className="mt-1 font-semibold text-copy">{selected.contactNumber ?? 'Not recorded'}</dd></div><div><dt className="text-muted-copy">PhilSys</dt><dd className="mt-1 font-semibold text-copy">{selected.philsysNumber ?? 'Not recorded'}</dd></div></dl>{canManage && <button type="button" onClick={() => setFormState({ beneficiary: selected })} className="ga-btn-secondary mt-5">Edit verified details</button>}</div></details>

              <section className="border-t border-line p-5" aria-labelledby="beneficiary-documents-heading"><div className="flex items-center justify-between"><div><h3 id="beneficiary-documents-heading" tabIndex={-1} className="scroll-mt-32 font-extrabold focus:outline-none">Supporting documents</h3><p className="mt-1 text-sm text-muted-copy">PDF, JPG, or PNG · maximum 5 MB</p></div><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold">{documents.length}</span></div>
                {canSubmit && <div className="mt-5 rounded-lg border border-line p-4"><label htmlFor="beneficiary-program" className="ga-label">Active program<span aria-hidden="true" className="ml-1 text-brand-red after:content-['*']" /></label><div className="relative mt-2"><Icon name="programs" className="pointer-events-none absolute left-3 top-3.5 size-5 text-muted-copy" /><select id="beneficiary-program" form="beneficiary-enrollment-form" disabled={isEnrolling || documentBusy} required value={selectedProgramId} onChange={event => { setSelectedProgramId(event.target.value); setUploadType(''); setUploadName(''); setUploadError(null); setUploadNotice(null) }} aria-describedby="beneficiary-program-help" className="ga-input min-w-0 appearance-none pl-11 pr-10"><option value="">Select a program to view its requirements</option>{programs.map(program => <option key={program.programId} value={program.programId}>{program.programCode} — {program.programName}</option>)}</select><Icon name="chevronDown" className="pointer-events-none absolute right-3 top-3.5 size-5 text-muted-copy" /></div><p id="beneficiary-program-help" className="mt-2 text-sm leading-6 text-copy">Choose the program first. Its named documents will appear in the document-type list below; each one needs its own file.</p></div>}
                {documents.length === 0 ? <p className="mt-4 rounded-lg border border-dashed border-line p-4 text-sm text-muted-copy">No documents have been uploaded.</p> : <ul className="mt-4 space-y-3">{documents.map((item) => <li key={item.documentId} className="rounded-lg border border-line p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-sm font-bold text-ink [overflow-wrap:anywhere]">{item.documentName ? `Other — ${item.documentName}` : humanize(item.documentType)}</p><p className="mt-1 text-xs text-muted-copy [overflow-wrap:anywhere]">{item.originalFileName}</p></div><StatusBadge value={item.reviewStatus} /></div>{item.reviewNotes && <p className="mt-3 rounded-md bg-danger-soft p-3 text-xs leading-5 text-brand-red">{item.reviewNotes}</p>}<div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => setPreviewDocument(item)} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-line px-3 text-sm font-semibold text-brand-blue hover:bg-info-soft focus-visible:outline-2 focus-visible:outline-brand-blue"><Icon name="eye" className="size-4" />Preview</button><button type="button" onClick={() => download(item)} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-line px-3 text-sm font-semibold text-brand-blue hover:bg-info-soft focus-visible:outline-2 focus-visible:outline-brand-blue"><Icon name="download" className="size-4" />Download</button>{canManage && ['SUBMITTED', 'REJECTED'].includes(item.reviewStatus) && <button type="button" disabled={documentBusy} onClick={() => { setRemoveError(''); setRemoveDocument(item) }} className="inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-semibold text-brand-red hover:bg-danger-soft focus-visible:outline-2 focus-visible:outline-brand-red disabled:opacity-50"><Icon name="trash" className="size-4" />Remove</button>}{role === 'DSWD_STAFF' && item.reviewStatus === 'SUBMITTED' && <><button type="button" onClick={() => { setReviewError(''); setReviewDialog({ document: item, decision: 'ACCEPTED' }) }} className="min-h-11 rounded-lg bg-brand-green px-3 text-xs font-bold text-white">Accept</button><button type="button" onClick={() => { setReviewError(''); setReviewDialog({ document: item, decision: 'REJECTED' }) }} className="min-h-11 rounded-lg border border-red-200 px-3 text-xs font-bold text-brand-red hover:bg-danger-soft">Reject</button></>}</div>{canManage && item.reviewStatus === 'REJECTED' && <form noValidate onSubmit={(event) => uploadDocument(event, item)} className="mt-3 border-t border-line pt-3"><label htmlFor={`replacement-${item.documentId}`} className="text-xs font-bold text-ink">Upload corrected {humanize(item.documentType)}</label><input id={`replacement-${item.documentId}`} name="file" type="file" disabled={documentBusy} required accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" className="mt-2 block w-full text-xs text-copy file:mr-3 file:rounded-lg file:border-0 file:bg-info-soft file:px-3 file:py-2 file:font-bold file:text-brand-blue" /><button type="submit" disabled={documentBusy} className="mt-3 min-h-11 rounded-lg bg-brand-blue px-4 text-xs font-bold text-white">{uploadingDocument === item.documentId ? <LoadingLabel>Replacing document...</LoadingLabel> : 'Replace document'}</button>{currentUploadError?.documentId === item.documentId && <p role="alert" className="mt-3 text-sm leading-6 text-brand-red">{currentUploadError.message} Your chosen file is kept.</p>}</form>}</li>)}</ul>}
                {canManage && <form key={selectedId} ref={uploadFormRef} aria-label="Upload supporting document" noValidate onSubmit={uploadDocument} className="mt-5 rounded-lg border border-line bg-slate-50 p-4 sm:p-5">
                  <h4 className="flex items-center gap-2 font-semibold"><Icon name="upload" className="size-5 text-brand-blue" />Upload a document</h4>
                  <p className="mt-2 text-sm leading-6 text-copy">Choose the document you are providing, then upload one file for DSWD review.</p>
                  <fieldset disabled={documentBusy} className="mt-4 min-w-0 space-y-4">
                    <div><label htmlFor="new-document-type" className="ga-label">Document type<span aria-hidden="true" className="ml-1 text-brand-red after:content-['*']" /></label><div className="relative mt-2"><Icon name="reports" className="pointer-events-none absolute left-3 top-3.5 size-5 text-muted-copy" /><select id="new-document-type" name="documentType" value={uploadSelection} onChange={event => { const value = event.target.value; setUploadType(value.startsWith('OTHER:') ? 'OTHER' : value); setUploadName(value.startsWith('OTHER:') ? value.slice(6) : ''); setUploadError(null); setUploadNotice(null) }} required aria-describedby="document-type-help" aria-invalid={currentUploadError?.documentId === 'new' && currentUploadError.field === 'documentType' || undefined} className="ga-input appearance-none pl-11 pr-10">
                      <option value="">Choose a document type</option>
                      {(requiredUploadTypes.length > 0 || uploadOtherNames.length > 0) && <optgroup label={selectedProgram ? 'Required by selected program' : 'Named documents from active programs'}>{documentTypes.filter(type => type !== 'OTHER' && requiredUploadTypes.includes(type)).map(type => <option key={type} value={type}>{humanize(type)}</option>)}{uploadOtherNames.map(name => <option key={name} value={`OTHER:${name}`}>{name}</option>)}</optgroup>}
                      <optgroup label={selectedProgram ? 'Other supporting document types' : 'Document types'}>{documentTypes.filter(type => type !== 'OTHER' && !requiredUploadTypes.includes(type)).map(type => <option key={type} value={type}>{humanize(type)}</option>)}{customOtherAllowed && <option value="OTHER">Other document — enter its name</option>}</optgroup>
                    </select><Icon name="chevronDown" className="pointer-events-none absolute right-3 top-3.5 size-5 text-muted-copy" /></div><p id="document-type-help" className="mt-2 text-sm leading-6 text-muted-copy">{selectedProgram ? 'The selected program’s named requirements appear directly in this list.' : 'Select an active program above to see its document requirements.'}</p></div>
                    {uploadType === 'OTHER' && !uploadOtherNames.includes(uploadName) && <div><label htmlFor="upload-document-name" className="ga-label">Other document name<span aria-hidden="true" className="ml-1 text-brand-red after:content-['*']" /></label><div className="relative mt-2"><Icon name="pen" className="pointer-events-none absolute left-3 top-3.5 size-5 text-muted-copy" /><input id="upload-document-name" name="documentName" required maxLength="150" value={uploadName} onChange={event => { setUploadName(event.target.value); setUploadError(null) }} placeholder="Name the document required by this program" aria-invalid={currentUploadError?.documentId === 'new' && currentUploadError.field === 'documentName' || undefined} className="ga-input pl-11" /></div></div>}
                    {uploadType === 'OTHER' && uploadOtherNames.includes(uploadName) && <p className="flex items-start gap-2 text-sm leading-6 text-copy"><Icon name="check" className="mt-0.5 size-5 shrink-0 text-brand-blue" /><span>This file will be listed as <strong>{uploadName}</strong>. Upload each named requirement separately.</span></p>}
                    <div className="rounded-lg border border-line bg-white p-4"><label htmlFor="new-document-file" className="ga-label flex items-center gap-2"><Icon name="upload" className="size-4 text-brand-blue" />Choose document<span aria-hidden="true" className="text-brand-red after:content-['*']" /></label><p id="document-file-help" className="mt-2 text-sm text-muted-copy">PDF, JPG or PNG · up to 5 MB per file</p><input id="new-document-file" name="file" type="file" required accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" onChange={() => { setUploadError(null); setUploadNotice(null) }} aria-describedby="document-file-help" aria-invalid={currentUploadError?.documentId === 'new' && currentUploadError.field === 'file' || undefined} className="mt-3 block w-full min-w-0 text-sm text-copy file:mr-3 file:min-h-11 file:cursor-pointer file:rounded-lg file:border-0 file:bg-info-soft file:px-4 file:font-semibold file:text-brand-blue" /></div>
                  </fieldset>
                  {currentUploadError?.documentId === 'new' && <div role="alert" className="mt-4 rounded-lg border border-red-200 bg-danger-soft p-3 text-sm leading-6 text-brand-red"><p className="font-semibold">Document not uploaded</p><p>{currentUploadError.message}</p><p className="mt-1">Your selection and chosen file are kept. Correct the issue, then try again.</p></div>}
                  {uploadNotice?.beneficiaryId === selectedId && <p role="status" className="mt-4 flex items-start gap-2 text-sm leading-6 text-brand-green"><Icon name="check" className="mt-0.5 size-5 shrink-0" />{uploadNotice.message}</p>}
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4"><p className="text-xs leading-5 text-muted-copy">Uploading a file does not submit an enrollment.</p><button type="submit" disabled={documentBusy} className="ga-btn-primary w-full sm:w-auto">{uploadingDocument === 'new' ? <LoadingLabel>Uploading document...</LoadingLabel> : <><Icon name="upload" className="size-4" />Upload for review</>}</button></div>
                </form>}
              </section>

              {canSubmit && <section className="border-t border-line p-5"><h3 id="beneficiary-enrollment-heading" className="scroll-mt-32 font-extrabold">Submit to assistance program</h3><p className="mt-1 text-sm leading-6 text-muted-copy">{selectedProgram ? selectedProgram.programName : 'Select an active program above to begin.'} A different authorized reviewer must assess an enrollment you submit.</p>
                <form id="beneficiary-enrollment-form" onSubmit={enroll} className="mt-4">
                  {selectedProgram && <section aria-label="Program document checklist" className="rounded-lg border border-line p-4 text-sm leading-6">
                    {missingTypes.length ? <><h4 className="font-semibold text-ink">Documents to upload ({missingTypes.length})</h4><p className="mt-1 text-copy">These program requirements do not have a submitted or accepted file yet.</p><ul className="mt-3 divide-y divide-line">{missingTypes.map(item => <li key={`${item.documentType}:${item.documentName ?? ''}`} className="flex flex-wrap items-center justify-between gap-x-3 py-2"><span className="min-w-0 [overflow-wrap:anywhere] font-medium">{item.documentName || item.label}</span>{canManage && <button type="button" disabled={documentBusy} onClick={() => uploadRequirement(item)} className="inline-flex min-h-11 items-center gap-2 rounded-lg px-3 font-semibold text-brand-blue hover:bg-info-soft focus-visible:outline-2 focus-visible:outline-brand-blue" aria-label={`Upload ${item.documentName || item.label}`}><Icon name="upload" className="size-4" />Upload</button>}</li>)}</ul></> : <p className="flex items-start gap-2 text-brand-green"><Icon name="check" className="mt-0.5 size-5 shrink-0" /><span><strong>Documents ready.</strong> You can submit this record for review. Uploaded files still need DSWD assessment.</span></p>}
                  </section>}
                  <button type="submit" disabled={isEnrolling || documentBusy || !selectedProgramId || missingTypes.length > 0 || selected.status !== 'ACTIVE'} className="ga-btn-primary mt-4 w-full">{isEnrolling ? 'Submitting enrollment...' : 'Submit enrollment'}</button>{enrollmentError?.beneficiaryId === selectedId && <p role="alert" className="mt-3 text-sm text-brand-red">{enrollmentError.message}</p>}
                </form>
                {submittedEnrollment?.beneficiaryId === selectedId && <div role="status" className="mt-4 border-l-2 border-brand-blue bg-info-soft p-3 text-sm"><p>Enrollment submitted. Another authorized reviewer must complete the assessment.</p><a href={`/enrollments?enrollment=${encodeURIComponent(submittedEnrollment.enrollment.enrollmentId)}`} onClick={(event) => { event.preventDefault(); onNavigate(event.currentTarget.getAttribute('href')) }} className="ga-admin-link mt-2">View submitted enrollment</a></div>}
              </section>}
              <details className="border-t border-line"><summary className="flex min-h-14 cursor-pointer items-center justify-between gap-3 px-5 py-3 font-bold text-ink hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand-blue">Other record services <Icon name="chevronDown" className="size-4" /></summary><div className="flex flex-col gap-2 border-t border-line p-5"><a href={`/biometrics?beneficiary=${encodeURIComponent(selected.beneficiaryId)}`} onClick={(event) => { event.preventDefault(); onNavigate(`/biometrics?beneficiary=${encodeURIComponent(selected.beneficiaryId)}`) }} className="inline-flex min-h-11 items-center gap-2 font-bold text-brand-blue underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue">Biometric consent and identity <Icon name="arrowRight" className="size-4" /></a>{(role === 'SYSTEM_ADMIN' || role === 'DSWD_STAFF') && <a href={`/dswd/ledger?workspace=wallets&beneficiary=${encodeURIComponent(selected.beneficiaryId)}`} onClick={(event) => { event.preventDefault(); onNavigate(`/dswd/ledger?workspace=wallets&beneficiary=${encodeURIComponent(selected.beneficiaryId)}`) }} className="inline-flex min-h-11 items-center gap-2 font-bold text-brand-blue underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue">View simulated wallet <Icon name="arrowRight" className="size-4" /></a>}</div></details>
            </div>}
          </aside>
        </div>
      )}

      {importOpen && <BeneficiaryImportDialog accessToken={session.accessToken} user={session.user} barangays={barangays} programs={programs} onClose={() => { setImportOpen(false); setReload(value => value + 1) }} onImported={() => setReload(value => value + 1)} onSessionExpired={onSessionExpired} onNavigate={onNavigate} />}
      {formState && <BeneficiaryFormDialog key={formState.beneficiary?.beneficiaryId ?? 'new'} beneficiary={formState.beneficiary} assignedBarangay={session.user.barangay ?? barangays.find(item => item.barangayId === session.user.barangayId)} barangays={barangays} isFacilitator={isFacilitator} onClose={() => setFormState(null)} onSave={saveBeneficiary} />}
      {reviewDialog && <ConfirmationDialog open error={reviewError} title={reviewDialog.decision === 'ACCEPTED' ? 'Accept this document?' : 'Reject this document?'} description={reviewDialog.decision === 'ACCEPTED' ? 'The document will count toward the program requirements for this beneficiary.' : 'The facilitator will see your reason and must upload a corrected replacement.'} actionLabel={reviewDialog.decision === 'ACCEPTED' ? 'Accept document' : 'Reject document'} destructive={reviewDialog.decision === 'REJECTED'} reasonLabel={reviewDialog.decision === 'REJECTED' ? 'Correction reason' : undefined} onCancel={() => setReviewDialog(null)} onConfirm={reviewDocument} />}
      {previewDocument && <BeneficiaryDocumentPreview key={previewDocument.documentId} document={previewDocument} beneficiaryId={selectedId} token={session.accessToken} onSessionExpired={onSessionExpired} onClose={() => setPreviewDocument(null)} />}
      {removeDocument && <ConfirmationDialog open destructive title="Remove this upload?" actionLabel="Remove upload" error={removeError} description="This upload will leave the current document list and stop counting toward program requirements. The stored file and audit history are retained. Accepted documents and files attached to burial referrals cannot be removed here." onCancel={() => setRemoveDocument(null)} onConfirm={confirmDocumentRemoval}><div className="mt-4 flex items-start gap-3 rounded-lg border border-line bg-slate-50 p-4"><Icon name="reports" className="mt-0.5 size-5 shrink-0 text-brand-blue" /><div className="min-w-0 text-sm leading-6"><p className="font-semibold [overflow-wrap:anywhere]">{removeDocument.documentName || humanize(removeDocument.documentType)}</p><p className="text-muted-copy [overflow-wrap:anywhere]">{removeDocument.originalFileName}</p></div></div></ConfirmationDialog>}
    </DashboardShell>
  )
}

export default BeneficiaryManagementPage
