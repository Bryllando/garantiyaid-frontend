import ProgramImportDialog from '../components/programs/ProgramImportDialog.jsx'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import DashboardShell from '../components/layout/DashboardShell.jsx'
import { ConfirmationDialog } from '../components/ui/confirmation-dialog.jsx'
import { Icon } from '../components/ui/icon.jsx'
import { Skeleton } from '../components/ui/skeleton.jsx'
import { LoadingLabel } from '../components/ui/spinner.jsx'
import { otherDocumentNames, programDocumentRequirements } from '../utils/programDocuments.js'
import {
  activateProgram,
  cancelProgram,
  closeProgram,
  createProgram,
  createProgramCriterion,
  deleteProgramCriterion,
  getAuthErrorMessage,
  isSessionExpiredError,
  programCriterionExpectedValue,
  requestBarangayList,
  requestProgram,
  requestPrograms,
  updateProgram,
  updateProgramCriterion,
} from '../auth/staffAuth.js'

const statuses = ['', 'DRAFT', 'ACTIVE', 'CLOSED', 'CANCELLED']
const documentTypes = ['VALID_ID', 'BIRTH_CERTIFICATE', 'BARANGAY_CERTIFICATE', 'PROOF_OF_RESIDENCY', 'MEDICAL_CERTIFICATE', 'PWD_ID', 'SENIOR_CITIZEN_ID', 'OTHER']
const documentDescriptions = {
  VALID_ID: 'Identification document',
  BIRTH_CERTIFICATE: 'Birth and age record',
  BARANGAY_CERTIFICATE: 'Certification issued by the barangay',
  PROOF_OF_RESIDENCY: 'Document confirming the applicant’s address',
  MEDICAL_CERTIFICATE: 'Supporting document for a medical request',
  PWD_ID: 'Person with disability identification',
  SENIOR_CITIZEN_ID: 'Senior citizen identification',
  OTHER: 'Another supporting document type',
}
const criterionFields = ['AGE', 'SEX', 'BARANGAY_ID', 'DOCUMENT_TYPE', 'MANUAL_REVIEW']
const sexValues = ['MALE', 'FEMALE', 'OTHER', 'UNKNOWN']
const criterionOperators = {
  AGE: ['EQUALS', 'NOT_EQUALS', 'GREATER_THAN', 'GREATER_THAN_OR_EQUAL', 'LESS_THAN', 'LESS_THAN_OR_EQUAL', 'IN', 'NOT_IN'],
  SEX: ['EQUALS', 'NOT_EQUALS', 'IN', 'NOT_IN'],
  BARANGAY_ID: ['EQUALS', 'NOT_EQUALS', 'IN', 'NOT_IN'],
  DOCUMENT_TYPE: ['REQUIRED'],
  MANUAL_REVIEW: ['REQUIRED'],
}
const criterionDefaults = {
  AGE: { operator: 'GREATER_THAN_OR_EQUAL', expectedInput: '' },
  SEX: { operator: 'EQUALS', expectedInput: 'MALE' },
  BARANGAY_ID: { operator: 'EQUALS', expectedInput: '' },
  DOCUMENT_TYPE: { operator: 'REQUIRED', expectedInput: '' },
  MANUAL_REVIEW: { operator: 'REQUIRED', expectedInput: '' },
}
const criterionFieldLabels = { AGE: 'Age', SEX: 'Recorded sex', BARANGAY_ID: 'Barangay', DOCUMENT_TYPE: 'Document type', MANUAL_REVIEW: 'Manual review' }
const criterionFieldIcons = { AGE: 'calendar', SEX: 'profile', BARANGAY_ID: 'location', DOCUMENT_TYPE: 'reports', MANUAL_REVIEW: 'security' }
const criterionConditionLabels = { EQUALS: 'Equals (=)', NOT_EQUALS: 'Does not equal (≠)', GREATER_THAN: 'More than (>)', GREATER_THAN_OR_EQUAL: 'At least (≥)', LESS_THAN: 'Less than (<)', LESS_THAN_OR_EQUAL: 'At most (≤)', IN: 'One of the selected values', NOT_IN: 'None of the selected values', REQUIRED: 'Required' }
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const emptyProgram = { programName: '', programCode: '', programType: '', description: '', grantAmount: '', budgetAmount: '', applicationStartDate: '', applicationEndDate: '', requiredDocumentTypes: [], otherRequiredDocumentNames: [] }
const emptyCriterion = { criterionName: '', fieldName: 'AGE', operator: 'GREATER_THAN_OR_EQUAL', expectedInput: '', isRequired: true }
const dateFormatter = new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeZone: 'Asia/Manila' })
const moneyFormatter = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' })

const humanize = (value = '') => value.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase()).replace(/\bId\b/g, 'ID').replace(/\bPwd\b/g, 'PWD')
const dateOnly = (value) => value?.slice(0, 10) ?? ''
const displayDate = (value) => value ? dateFormatter.format(new Date(value)) : 'Not specified'
const displayMoney = (value) => value === null || value === undefined ? 'Not specified' : moneyFormatter.format(Number(value))

function StatusBadge({ value }) {
  const style = value === 'ACTIVE' ? 'ga-status-success' : value === 'DRAFT' ? 'ga-status-warning' : value === 'CANCELLED' ? 'ga-status-danger' : 'border-line bg-slate-100 text-copy'
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${style}`}>{humanize(value)}</span>
}

function LoadingState() {
  return <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(26rem,0.9fr)]" role="status" aria-label="Loading assistance programs"><div className="ga-card p-5"><Skeleton className="h-12 w-full" />{Array.from({ length: 5 }, (_, index) => <Skeleton key={index} className="mt-4 h-24 w-full" />)}</div><div className="ga-card p-6"><Skeleton className="h-7 w-3/4" /><Skeleton className="mt-5 h-28 w-full" /><Skeleton className="mt-4 h-48 w-full" /></div></div>
}

function ProgramFormDialog({ program, onClose, onSave }) {
  const dialogRef = useRef(null)
  const errorRef = useRef(null)
  const [form, setForm] = useState(() => program ? {
    programName: program.programName ?? '', programCode: program.programCode ?? '', programType: program.programType ?? '',
    description: program.description ?? '', grantAmount: program.grantAmount ?? '', budgetAmount: program.budgetAmount ?? '',
    applicationStartDate: dateOnly(program.applicationStartDate), applicationEndDate: dateOnly(program.applicationEndDate),
    requiredDocumentTypes: program.requiredDocumentTypes ?? [],
    otherRequiredDocumentNames: otherDocumentNames(program),
  } : emptyProgram)
  const [isSaving, setIsSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [documentDraft, setDocumentDraft] = useState('')
  const [documentError, setDocumentError] = useState('')

  useEffect(() => { dialogRef.current?.showModal(); dialogRef.current?.querySelector('#program-name')?.focus() }, [])
  useEffect(() => { if (formError) errorRef.current?.focus() }, [formError])

  function change(field, value) { setForm((current) => ({ ...current, [field]: value })); setFormError('') }
  function toggleDocument(value) {
    setForm((current) => ({ ...current, requiredDocumentTypes: current.requiredDocumentTypes.includes(value) ? current.requiredDocumentTypes.filter((item) => item !== value) : [...current.requiredDocumentTypes, value] }))
  }
  function addOtherDocument() {
    const name = documentDraft.trim()
    let issue = !name ? 'Enter a document name before adding it.' : ''
    if (form.otherRequiredDocumentNames.some(value => value.toLowerCase().replace(/\s+/g, ' ') === name.toLowerCase().replace(/\s+/g, ' '))) issue = 'This document is already in the list.'
    if (form.otherRequiredDocumentNames.length >= 20) issue = 'You can add up to 20 other documents.'
    if (issue) setDocumentError(issue)
    else { change('otherRequiredDocumentNames', [...form.otherRequiredDocumentNames, name]); setDocumentDraft(''); setDocumentError('') }
    document.getElementById('program-other-document')?.focus()
  }
  async function submit(event) {
    event.preventDefault()
    if (isSaving) return
    const names = form.requiredDocumentTypes.includes('OTHER') ? [...form.otherRequiredDocumentNames, ...(documentDraft.trim() ? [documentDraft.trim()] : [])] : []
    let issue = ''
    if (form.applicationStartDate && form.applicationEndDate && form.applicationEndDate < form.applicationStartDate) issue = 'Application end date must be on or after the start date.'
    else if (form.grantAmount && form.budgetAmount && Number(form.budgetAmount) < Number(form.grantAmount)) issue = 'Program budget cannot be lower than the grant per beneficiary.'
    else if (form.requiredDocumentTypes.includes('OTHER') && !names.length) issue = 'Add at least one other required document.'
    else if (names.length > 20) issue = 'You can add up to 20 other documents.'
    else if (new Set(names.map(name => name.toLowerCase().replace(/\s+/g, ' '))).size !== names.length) issue = 'Remove duplicate document names before saving.'
    if (issue) { setFormError(issue); return }
    setIsSaving(true)
    try {
      await onSave({ ...form, programCode: form.programCode.trim().toUpperCase(), programType: form.programType.trim().toUpperCase(), otherRequiredDocumentNames: names })
      dialogRef.current?.close()
    } catch (error) {
      setFormError(getAuthErrorMessage(error))
    } finally { setIsSaving(false) }
  }

  return (
    <dialog ref={dialogRef} onClose={onClose} onCancel={(event) => { if (isSaving) event.preventDefault() }} aria-labelledby="program-form-title" aria-describedby="program-form-description" className="m-auto max-h-[calc(100dvh-2rem)] w-[min(54rem,calc(100%-2rem))] overflow-hidden rounded-2xl border border-line bg-white p-0 text-ink shadow-lg backdrop:bg-slate-950/55">
      <form onSubmit={submit} aria-busy={isSaving} className="flex max-h-[calc(100dvh-3rem)] flex-col">
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-line px-4 py-4 sm:px-7 sm:py-5"><div className="min-w-0"><p className="text-xs font-semibold text-brand-blue">Program configuration · Draft</p><h2 id="program-form-title" className="mt-1 text-xl font-extrabold sm:text-2xl">{program ? 'Edit draft program' : 'Create assistance program'}</h2><p id="program-form-description" className="mt-2 text-sm leading-6 text-muted-copy">Set the assistance details and documents staff need for enrollment.</p></div><button type="button" onClick={() => dialogRef.current?.close()} disabled={isSaving} aria-label="Close program form" className="ga-btn-secondary size-11 shrink-0 p-0"><Icon name="close" /></button></header>
        <div className="min-h-0 overflow-y-auto overscroll-contain px-4 py-5 sm:px-7 sm:py-6">
          {formError && <div ref={errorRef} tabIndex={-1} role="alert" className="mb-6 rounded-lg border border-red-200 bg-danger-soft p-4 text-sm font-semibold leading-6 text-brand-red focus:outline-2 focus:outline-brand-red"><p className="font-extrabold">Check the program details</p><p className="mt-1">{formError}</p></div>}
          <fieldset disabled={isSaving} className="min-w-0 space-y-6">
            <legend className="sr-only">Program details and requirements</legend>
            <section aria-labelledby="program-details-heading" className="border-b border-line pb-6">
              <h3 id="program-details-heading" className="flex items-center gap-2 font-bold"><Icon name="programs" className="size-5 text-brand-blue" />Program details</h3>
              <p className="mt-1 text-sm text-muted-copy">Fields marked <span className="font-bold text-brand-red">*</span> are required.</p>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <Field id="program-name" label="Program name" required maxLength="150" placeholder="e.g. Community food assistance" value={form.programName} onChange={(value) => change('programName', value)} />
                <Field id="program-code" label="Program code" required maxLength="30" pattern="(?:[A-Za-z0-9]|-){3,30}" placeholder="e.g. FOOD-2026" value={form.programCode} onChange={(value) => change('programCode', value)} />
                <div className="sm:col-span-2"><Field id="program-type" label="Program type" required maxLength="20" pattern="[A-Za-z0-9_]{2,20}" placeholder="e.g. FOOD_ASSISTANCE" aria-describedby="program-type-help" value={form.programType} onChange={(value) => change('programType', value)} /><p id="program-type-help" className="mt-2 text-xs leading-5 text-muted-copy">Use letters, numbers, or underscores for the program type.</p></div>
                <div className="sm:col-span-2"><label htmlFor="program-description" className="ga-label">Public-service description</label><textarea id="program-description" rows="3" maxLength="5000" placeholder="Describe the assistance, intended applicants, and any specific documentary instructions." value={form.description} onChange={(event) => change('description', event.target.value)} className="ga-input mt-2 min-h-24 resize-y py-3" /></div>
              </div>
            </section>
            <section aria-labelledby="program-funding-heading" className="border-b border-line pb-6">
              <h3 id="program-funding-heading" className="flex items-center gap-2 font-bold"><Icon name="calendar" className="size-5 text-brand-blue" />Funding and application period</h3>
              <p className="mt-1 text-sm leading-6 text-muted-copy">Amounts are in Philippine pesos (PHP). Leave amounts or dates blank if not yet set.</p>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <Field id="program-grant" label="Grant per beneficiary" type="number" min="0" step="0.01" placeholder="0.00" value={form.grantAmount} onChange={(value) => change('grantAmount', value)} />
                <Field id="program-budget" label="Total program budget" type="number" min="0" step="0.01" placeholder="0.00" value={form.budgetAmount} onChange={(value) => change('budgetAmount', value)} />
                <Field id="program-start" label="Application start" type="date" value={form.applicationStartDate} onChange={(value) => change('applicationStartDate', value)} />
                <Field id="program-end" label="Application end" type="date" min={form.applicationStartDate} value={form.applicationEndDate} onChange={(value) => change('applicationEndDate', value)} />
              </div>
            </section>
            <fieldset aria-describedby="program-documents-help" className="min-w-0">
              <legend className="flex items-center gap-2 font-bold"><Icon name="reports" className="size-5 text-brand-blue" />Required documents</legend>
              <div className="mt-2 flex flex-wrap items-start justify-between gap-3"><p id="program-documents-help" className="max-w-xl text-sm leading-6 text-muted-copy">Staff must attach each selected document type before submitting an enrollment. Select only the requirements specified for this program.</p><p role="status" aria-atomic="true" className="rounded-md border border-line bg-slate-50 px-2.5 py-1 text-xs font-semibold text-copy">{form.requiredDocumentTypes.length} of {documentTypes.length} selected</p></div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">{documentTypes.map((type) => {
                const selected = form.requiredDocumentTypes.includes(type)
                return <label key={type} className={`flex min-h-16 cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand-blue ${selected ? 'border-brand-blue bg-info-soft' : 'border-line bg-white hover:border-slate-400 hover:bg-slate-50'}`}><input type="checkbox" checked={selected} onChange={() => toggleDocument(type)} aria-labelledby={`program-document-${type}-label`} aria-describedby={`program-document-${type}-help`} className="mt-0.5 size-5 shrink-0 cursor-pointer accent-brand-blue" /><span className="min-w-0"><span id={`program-document-${type}-label`} className="block text-sm font-semibold text-ink">{humanize(type)}</span><span id={`program-document-${type}-help`} className="mt-1 block text-xs leading-5 text-muted-copy">{documentDescriptions[type]}</span></span></label>
              })}</div>
              {form.requiredDocumentTypes.includes('OTHER') && <div id="program-other-documents" className="mt-4 scroll-mt-4 rounded-lg border border-blue-200 bg-info-soft p-4"><label htmlFor="program-other-document" className="ga-label">Other document name</label><div className="mt-2 flex flex-col gap-2 sm:flex-row"><input id="program-other-document" autoFocus onFocus={() => document.getElementById('program-other-documents')?.scrollIntoView({ block: 'start' })} required={form.otherRequiredDocumentNames.length === 0} maxLength="150" placeholder="e.g. Request letter" aria-invalid={Boolean(documentError)} aria-describedby="program-other-document-help program-other-document-error" value={documentDraft} onChange={event => { setDocumentDraft(event.target.value); setDocumentError('') }} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); addOtherDocument() } }} className="ga-input min-w-0 flex-1" /><button type="button" onClick={addOtherDocument} disabled={form.otherRequiredDocumentNames.length >= 20} className="ga-btn-secondary shrink-0"><Icon name="plus" className="size-4" />Add document</button></div><p id="program-other-document-help" className="mt-2 text-sm leading-6 text-muted-copy">Add each required document separately. Each one needs its own upload and review. Up to 20 documents.</p><p id="program-other-document-error" role={documentError ? 'alert' : undefined} className="mt-2 text-sm font-semibold text-brand-red">{documentError}</p>{form.otherRequiredDocumentNames.length > 0 && <ul className="mt-3 divide-y divide-line rounded-lg border border-line bg-white">{form.otherRequiredDocumentNames.map((name, index) => <li key={name} className="flex items-center justify-between gap-3 px-3 py-1"><span className="min-w-0 break-words text-sm font-semibold text-ink">{name}</span><button type="button" onClick={() => { change('otherRequiredDocumentNames', form.otherRequiredDocumentNames.filter((_, i) => i !== index)); document.getElementById('program-other-document')?.focus() }} aria-label={`Remove ${name}`} className="grid size-11 shrink-0 place-items-center rounded-lg text-copy hover:bg-danger-soft hover:text-brand-red focus-visible:outline-2 focus-visible:outline-brand-blue"><Icon name="close" className="size-4" /></button></li>)}</ul>}</div>}
              <p className="mt-3 text-sm leading-6 text-muted-copy">{form.requiredDocumentTypes.length === 0 ? 'No document types selected. You can update this list while the program is a draft.' : 'Selected document types will appear in the enrollment checklist.'}</p>
            </fieldset>
          </fieldset>
        </div>
        <footer className="flex shrink-0 flex-col-reverse gap-3 border-t border-line bg-white px-4 py-4 sm:flex-row sm:justify-end sm:px-7"><button type="button" onClick={() => dialogRef.current?.close()} disabled={isSaving} className="ga-btn-secondary">Cancel</button><button type="submit" disabled={isSaving} className="ga-btn-primary">{isSaving ? <LoadingLabel>Saving...</LoadingLabel> : <><Icon name={program ? 'check' : 'plus'} className="size-4" />{program ? 'Save program' : 'Create draft program'}</>}</button></footer>
      </form>
    </dialog>
  )
}

function Field({ id, label, icon, onChange, ...inputProps }) {
  return <div><label htmlFor={id} className="ga-label">{label}{inputProps.required && <span aria-hidden="true" className="ml-1 text-brand-red after:content-['*']" />}</label><div className="relative mt-2">{icon && <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted-copy"><Icon name={icon} className="size-5" /></span>}<input id={id} onChange={(event) => onChange(event.target.value)} className={`ga-input ${icon ? 'pl-11' : ''}`} {...inputProps} /></div></div>
}

function criterionInputValue(criterion) {
  if (criterion.fieldName === 'MANUAL_REVIEW') return ''
  if (criterion.fieldName === 'DOCUMENT_TYPE' && !documentTypes.includes(criterion.expectedValue)) return ''
  return Array.isArray(criterion.expectedValue)
    ? criterion.expectedValue.join(', ')
    : typeof criterion.expectedValue === 'object'
      ? JSON.stringify(criterion.expectedValue)
      : String(criterion.expectedValue ?? '')
}

function criterionValue(form, barangays) {
  if (form.fieldName === 'MANUAL_REVIEW') return true
  if (form.fieldName === 'DOCUMENT_TYPE') {
    if (!documentTypes.includes(form.expectedInput)) throw new Error('Select a valid required document type.')
    return form.expectedInput
  }

  const value = programCriterionExpectedValue(form.fieldName, form.operator, form.expectedInput)
  const values = Array.isArray(value) ? value : [value]
  if (form.fieldName === 'AGE' && values.some((item) => !Number.isInteger(item) || item < 0 || item > 150)) {
    throw new Error('Age criteria must use whole numbers from 0 to 150.')
  }
  if (form.fieldName === 'SEX' && values.some((item) => !sexValues.includes(item))) {
    throw new Error('Select one or more valid sex values.')
  }
  if (form.fieldName === 'BARANGAY_ID' && values.some((item) => !uuidPattern.test(item))) {
    throw new Error('Use a valid barangay UUID. Separate multiple UUIDs with commas.')
  }
  if (form.fieldName === 'BARANGAY_ID' && barangays.length > 0 && values.some((item) => !barangays.some((barangay) => barangay.barangayId === item))) {
    throw new Error('Select only active Barangay records.')
  }
  if (new Set(values).size !== values.length) throw new Error('Remove duplicate criterion values.')
  return value
}

function CriterionDialog({ barangays, criterion, onClose, onSave }) {
  const dialogRef = useRef(null)
  const errorRef = useRef(null)
  const [form, setForm] = useState(() => criterion ? {
    criterionName: criterion.criterionName,
    fieldName: criterion.fieldName,
    operator: criterionOperators[criterion.fieldName]?.includes(criterion.operator) ? criterion.operator : criterionDefaults[criterion.fieldName].operator,
    expectedInput: criterionInputValue(criterion),
    isRequired: criterion.fieldName === 'MANUAL_REVIEW' ? true : criterion.isRequired,
  } : emptyCriterion)
  const [isSaving, setIsSaving] = useState(false)
  const [formError, setFormError] = useState('')
  useEffect(() => { dialogRef.current?.showModal(); dialogRef.current?.querySelector('#criterion-name')?.focus() }, [])
  useEffect(() => { if (formError) errorRef.current?.focus() }, [formError])
  function change(field, value) { setForm((current) => ({ ...current, [field]: value })); setFormError('') }
  function changeField(fieldName) {
    setFormError('')
    setForm((current) => ({
      ...current,
      fieldName,
      ...criterionDefaults[fieldName],
      ...(fieldName === 'MANUAL_REVIEW' ? { isRequired: true } : {}),
    }))
  }
  function changeOperator(operator) {
    setFormError('')
    setForm((current) => {
      const values = current.expectedInput.split(',').map((item) => item.trim()).filter(Boolean)
      return {
        ...current,
        operator,
        expectedInput: current.fieldName === 'SEX' && !['IN', 'NOT_IN'].includes(operator)
          ? (sexValues.find((item) => values.includes(item)) ?? 'MALE')
          : !['IN', 'NOT_IN'].includes(operator) && values.length > 1
            ? values[0]
            : current.expectedInput,
      }
    })
  }
  function toggleValue(value) {
    const selected = new Set(form.expectedInput.split(',').map((item) => item.trim()).filter(Boolean))
    if (selected.has(value)) selected.delete(value)
    else selected.add(value)
    change('expectedInput', [...selected].join(', '))
  }
  async function submit(event) {
    event.preventDefault()
    if (isSaving) return
    if (!form.criterionName.trim()) return setFormError('Enter a clear name for this criterion.')
    let expectedValue
    try { expectedValue = criterionValue(form, barangays) } catch (error) { return setFormError(error.message) }
    setFormError('')
    setIsSaving(true)
    try {
      await onSave({ criterionName: form.criterionName.trim(), fieldName: form.fieldName, operator: form.operator, expectedValue, isRequired: form.isRequired })
      dialogRef.current?.close()
    } catch (error) {
      setFormError(getAuthErrorMessage(error))
    } finally { setIsSaving(false) }
  }
  const multiple = ['IN', 'NOT_IN'].includes(form.operator)
  const selectedValues = form.expectedInput.split(',').map(value => value.trim()).filter(Boolean)
  const previewValues = selectedValues.map(value => form.fieldName === 'BARANGAY_ID'
    ? barangays.find(barangay => barangay.barangayId === value)?.barangayName ?? value
    : form.fieldName === 'AGE' ? value : humanize(value)).join(', ')
  return (
    <dialog ref={dialogRef} aria-labelledby="criterion-dialog-title" aria-describedby="criterion-dialog-help" onCancel={event => { if (isSaving) event.preventDefault() }} onClose={onClose} className="m-auto max-h-[calc(100dvh-2rem)] w-[min(40rem,calc(100%-2rem))] overflow-hidden rounded-lg border border-line bg-white p-0 text-ink shadow-lg backdrop:bg-slate-950/55">
      <form onSubmit={submit} className="flex max-h-[calc(100dvh-2rem)] flex-col">
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-line px-4 py-5 sm:px-7"><div><p className="ga-eyebrow flex items-center gap-2"><Icon name="security" className="size-4" />Eligibility rule</p><h2 id="criterion-dialog-title" className="mt-2 text-2xl font-extrabold">{criterion ? 'Edit criterion' : 'Add criterion'}</h2><p id="criterion-dialog-help" className="mt-2 text-sm leading-6 text-muted-copy">Choose what to check and the condition applicants must meet.</p></div><button type="button" disabled={isSaving} onClick={() => dialogRef.current?.close()} aria-label="Close criterion form" className="grid size-11 shrink-0 place-items-center rounded-lg border border-line hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-brand-blue"><Icon name="close" /></button></header>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-7">
          {formError && <div ref={errorRef} tabIndex={-1} role="alert" className="mb-5 scroll-mt-4 rounded-lg border border-red-200 bg-danger-soft p-4 text-sm text-brand-red outline-none focus-visible:outline-2 focus-visible:outline-brand-red"><p className="font-bold">Check the criterion</p><p className="mt-1 leading-6">{formError}</p></div>}
          <fieldset disabled={isSaving} className="min-w-0 space-y-5">
            <div><Field id="criterion-name" label="Criterion name" icon="pen" required maxLength="100" placeholder="e.g. Adult applicant" aria-describedby="criterion-name-help" value={form.criterionName} onChange={value => change('criterionName', value)} /><p id="criterion-name-help" className="mt-2 text-xs leading-5 text-muted-copy">Use a short name staff can recognize during enrollment review.</p></div>
            <div className="grid gap-5 sm:grid-cols-2">
              <div><label htmlFor="criterion-field" className="ga-label inline-flex items-center gap-2"><Icon name={criterionFieldIcons[form.fieldName]} className="size-4 text-brand-blue" />Data field</label><select id="criterion-field" value={form.fieldName} onChange={event => changeField(event.target.value)} aria-describedby="criterion-field-help" className="ga-input mt-2">{criterionFields.map(value => <option key={value} value={value}>{criterionFieldLabels[value]}</option>)}</select><p id="criterion-field-help" className="mt-2 text-xs leading-5 text-muted-copy">The information this rule checks.</p></div>
              <div><label htmlFor="criterion-operator" className="ga-label inline-flex items-center gap-2"><Icon name="queue" className="size-4 text-brand-blue" />Condition</label><select id="criterion-operator" value={form.operator} onChange={event => changeOperator(event.target.value)} disabled={criterionOperators[form.fieldName].length === 1} aria-describedby="criterion-operator-help" className="ga-input mt-2">{criterionOperators[form.fieldName].map(value => <option key={value} value={value}>{criterionConditionLabels[value]}</option>)}</select><p id="criterion-operator-help" className="mt-2 text-xs leading-5 text-muted-copy">{criterionOperators[form.fieldName].length === 1 ? 'This field uses a required check.' : 'Choose how to compare the value.'}</p></div>
            </div>

            {form.fieldName === 'AGE' && <div><Field id="criterion-value" label={multiple ? 'Ages (comma separated)' : 'Age in completed years'} icon="calendar" type={multiple ? 'text' : 'number'} inputMode={multiple ? 'text' : 'numeric'} min="0" max="150" step="1" pattern={multiple ? '[0-9]+(\\s*,\\s*[0-9]+)*' : undefined} placeholder={multiple ? 'e.g. 18, 60' : 'e.g. 18'} required value={form.expectedInput} onChange={value => change('expectedInput', value)} aria-describedby="criterion-value-help" /><p id="criterion-value-help" className="mt-2 text-xs leading-5 text-muted-copy">Use whole numbers from 0 to 150. Age is calculated on the enrollment date.</p></div>}

            {form.fieldName === 'SEX' && !multiple && <div><label htmlFor="criterion-value" className="ga-label inline-flex items-center gap-2"><Icon name="profile" className="size-4 text-brand-blue" />Recorded sex</label><select id="criterion-value" required value={form.expectedInput} onChange={event => change('expectedInput', event.target.value)} aria-describedby="criterion-value-help" className="ga-input mt-2">{sexValues.map(value => <option key={value} value={value}>{humanize(value)}</option>)}</select><p id="criterion-value-help" className="mt-2 text-xs leading-5 text-muted-copy">Compared with the value in the beneficiary record.</p></div>}

            {form.fieldName === 'SEX' && multiple && <fieldset aria-describedby="criterion-value-help"><legend className="ga-label"><span className="inline-flex items-center gap-2"><Icon name="profile" className="size-4 text-brand-blue" />Recorded sex values</span></legend><div className="mt-2 grid gap-2 sm:grid-cols-2">{sexValues.map(value => <label key={value} className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-3 py-3 text-sm font-semibold text-copy has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-brand-blue ${selectedValues.includes(value) ? 'border-brand-blue bg-info-soft' : 'border-line hover:bg-slate-50'}`}><input type="checkbox" checked={selectedValues.includes(value)} onChange={() => toggleValue(value)} className="size-5 shrink-0 accent-brand-blue" /><span>{humanize(value)}</span></label>)}</div><p id="criterion-value-help" className="mt-2 text-xs leading-5 text-muted-copy">Select at least one value from the beneficiary record.</p></fieldset>}

            {form.fieldName === 'BARANGAY_ID' && <div>{barangays.length > 0 && multiple ? <fieldset aria-describedby="criterion-value-help"><legend className="ga-label"><span className="inline-flex items-center gap-2"><Icon name="location" className="size-4 text-brand-blue" />Covered Barangays</span></legend><div className="mt-2 space-y-2">{barangays.map(barangay => <label key={barangay.barangayId} className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-3 py-3 text-sm text-copy has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-brand-blue ${selectedValues.includes(barangay.barangayId) ? 'border-brand-blue bg-info-soft' : 'border-line hover:bg-slate-50'}`}><input type="checkbox" checked={selectedValues.includes(barangay.barangayId)} onChange={() => toggleValue(barangay.barangayId)} className="size-5 shrink-0 accent-brand-blue" /><span className="min-w-0 break-words"><span className="block font-semibold">{barangay.barangayName}</span><span className="mt-0.5 block text-xs text-muted-copy">{barangay.city}</span></span></label>)}</div></fieldset> : <><label htmlFor="criterion-value" className="ga-label inline-flex items-center gap-2"><Icon name="location" className="size-4 text-brand-blue" />{multiple ? 'Covered Barangays' : 'Covered Barangay'}</label>{barangays.length > 0 ? <select id="criterion-value" required value={form.expectedInput} onChange={event => change('expectedInput', event.target.value)} aria-describedby="criterion-value-help" className="ga-input mt-2"><option value="">Select an active Barangay</option>{barangays.map(barangay => <option key={barangay.barangayId} value={barangay.barangayId}>{barangay.barangayName} — {barangay.city}</option>)}</select> : <input id="criterion-value" required value={form.expectedInput} onChange={event => change('expectedInput', event.target.value)} aria-describedby="criterion-value-help" className="ga-input mt-2 font-mono" placeholder="xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx" />}</>}<p id="criterion-value-help" className="mt-2 text-xs leading-5 text-muted-copy">{barangays.length > 0 ? multiple ? 'Select each active Barangay included in this rule.' : 'Only active Barangay records can be used.' : 'Barangay choices could not be loaded. Enter an active Barangay UUID.'}</p></div>}

            {form.fieldName === 'DOCUMENT_TYPE' && <div><label htmlFor="criterion-value" className="ga-label inline-flex items-center gap-2"><Icon name="reports" className="size-4 text-brand-blue" />Required document type</label><select id="criterion-value" required value={form.expectedInput} onChange={event => change('expectedInput', event.target.value)} aria-describedby="criterion-value-help" className="ga-input mt-2"><option value="">Select a document type</option>{documentTypes.map(value => <option key={value} value={value}>{humanize(value)}</option>)}</select><p id="criterion-value-help" className="mt-2 text-xs leading-5 text-muted-copy">DSWD must accept this document type before the criterion passes.</p></div>}

            {form.fieldName === 'MANUAL_REVIEW' && <div className="flex items-start gap-3 rounded-lg border border-line bg-slate-50 p-4 text-sm leading-6 text-copy" role="note"><Icon name="security" className="mt-0.5 size-5 shrink-0 text-brand-blue" /><div><p className="font-semibold text-ink">Manual decision required</p><p className="mt-1">A DSWD reviewer records whether this criterion is satisfied and provides remarks during enrollment review.</p></div></div>}

            <label className={`flex min-h-11 items-start gap-3 rounded-lg border border-line bg-slate-50 p-4 text-sm text-copy ${form.fieldName === 'MANUAL_REVIEW' ? '' : 'cursor-pointer'}`}><input type="checkbox" checked={form.isRequired} disabled={form.fieldName === 'MANUAL_REVIEW'} onChange={event => change('isRequired', event.target.checked)} className="mt-0.5 size-5 shrink-0 accent-brand-blue" /><span><span className="block font-semibold text-ink">Required for enrollment approval</span><span className="mt-1 block text-xs leading-5 text-muted-copy">{form.fieldName === 'MANUAL_REVIEW' ? 'Manual review always requires a recorded decision.' : 'Clear this to record an informational check that does not block approval.'}</span></span></label>
          </fieldset>
          <section aria-label="Rule preview" className="mt-5 border-l-2 border-brand-blue bg-info-soft px-4 py-3"><p className="flex items-center gap-2 text-xs font-semibold text-brand-blue"><Icon name="info" className="size-4" />Rule preview</p><p className="mt-2 break-words text-sm font-semibold leading-6 text-ink">{form.fieldName === 'MANUAL_REVIEW' ? 'Manual review · DSWD decision and remarks' : previewValues ? `${criterionFieldLabels[form.fieldName]} · ${criterionConditionLabels[form.operator]} · ${previewValues}${form.fieldName === 'AGE' ? ' years' : ''}` : 'Enter or select a value to preview this rule.'}</p><p className="mt-1 text-xs leading-5 text-copy">{form.isRequired ? 'This criterion must pass before enrollment can be approved.' : 'Informational only. This criterion does not block approval.'}</p></section>
        </div>
        <footer className="flex shrink-0 flex-col-reverse gap-3 border-t border-line bg-white px-4 py-4 sm:flex-row sm:justify-end sm:px-7"><button type="button" onClick={() => dialogRef.current?.close()} disabled={isSaving} className="ga-btn-secondary">Cancel</button><button type="submit" disabled={isSaving || (multiple && ['SEX', 'BARANGAY_ID'].includes(form.fieldName) && !form.expectedInput)} className="ga-btn-primary">{isSaving ? <LoadingLabel>Saving...</LoadingLabel> : <><Icon name={criterion ? 'check' : 'plus'} className="size-4" />{criterion ? 'Save criterion' : 'Add criterion'}</>}</button></footer>
      </form>
    </dialog>
  )
}

function ProgramManagementPage({ session, onLogout, onNavigate, onSessionExpired }) {
  const [draft, setDraft] = useState({ search: '', status: '' })
  const [filters, setFilters] = useState(draft)
  const [page, setPage] = useState(1)
  const [data, setData] = useState(null)
  const [barangays, setBarangays] = useState([])
  const [selectedId, setSelectedId] = useState('')
  const [detail, setDetail] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  const [programForm, setProgramForm] = useState(null)
  const [importOpen, setImportOpen] = useState(false)
  const [criterionForm, setCriterionForm] = useState(null)
  const [confirmation, setConfirmation] = useState(null)
  const detailRef = useRef(null)
  const canRead = ['SYSTEM_ADMIN', 'DSWD_STAFF', 'BARANGAY_FACILITATOR'].includes(session.user.role)
  const canManage = ['SYSTEM_ADMIN', 'DSWD_STAFF'].includes(session.user.role)
  const isLoadingDetail = Boolean(selectedId) && (detail?.programId !== selectedId || detail?.reload !== reload)
  const selected = !isLoadingDetail && detail?.programId === selectedId ? detail.program : null
  const detailError = !isLoadingDetail && detail?.programId === selectedId ? detail.error : ''

  const reportError = useCallback((requestError) => {
    if (isSessionExpiredError(requestError)) return onSessionExpired()
    toast.error(getAuthErrorMessage(requestError))
  }, [onSessionExpired])

  useEffect(() => {
    if (!canRead) return undefined
    let active = true
    requestPrograms(session.accessToken, { page, pageSize: 20, ...filters })
      .then((result) => { if (active) { setData(result); setError(''); setSelectedId((current) => result.programs.some((program) => program.programId === current) ? current : result.programs[0]?.programId || '') } })
      .catch((requestError) => { if (active) { if (isSessionExpiredError(requestError)) return onSessionExpired(); setError(getAuthErrorMessage(requestError)) } })
      .finally(() => { if (active) setIsLoading(false) })
    return () => { active = false }
  }, [canRead, filters, onSessionExpired, page, reload, session.accessToken])

  useEffect(() => {
    if (!selectedId || !canRead) return undefined
    let active = true
    requestProgram(session.accessToken, selectedId)
      .then((program) => { if (active) setDetail({ programId: selectedId, reload, program, error: '' }) })
      .catch((requestError) => { if (active) { reportError(requestError); setDetail({ programId: selectedId, reload, program: null, error: getAuthErrorMessage(requestError) }) } })
    return () => { active = false }
  }, [canRead, reload, reportError, selectedId, session.accessToken])

  useEffect(() => {
    if (!canManage) return undefined
    let active = true
    requestBarangayList(session.accessToken, { activeOnly: true })
      .then((result) => { if (active) setBarangays(result) })
      .catch((requestError) => { if (active) { if (isSessionExpiredError(requestError)) return onSessionExpired(); toast.error('Active Barangay choices could not be loaded.') } })
    return () => { active = false }
  }, [canManage, onSessionExpired, session.accessToken])

  function openProgram(programId) {
    setSelectedId(programId)
    if (window.matchMedia('(max-width: 1279px)').matches) {
      requestAnimationFrame(() => {
        const scrollTarget = document.getElementById('program-return') ?? detailRef.current
        detailRef.current?.focus({ preventScroll: true })
        scrollTarget?.scrollIntoView({ block: 'start', behavior: 'instant' })
      })
    }
  }

  function applyFilters(event) { event.preventDefault(); setPage(1); setIsLoading(true); setFilters({ search: draft.search.trim(), status: draft.status }) }
  async function saveProgram(payload) {
    try {
      const saved = programForm?.program ? await updateProgram(session.accessToken, programForm.program.programId, payload) : await createProgram(session.accessToken, payload)
      toast.success(programForm?.program ? 'Program details updated.' : 'Draft assistance program created.')
      setProgramForm(null); setSelectedId(saved.programId); setReload((value) => value + 1)
    } catch (error) { if (isSessionExpiredError(error)) onSessionExpired(); throw error }
  }
  async function saveCriterion(payload) {
    try {
      if (criterionForm?.criterion) await updateProgramCriterion(session.accessToken, selectedId, criterionForm.criterion.criterionId, payload)
      else await createProgramCriterion(session.accessToken, selectedId, payload)
      toast.success(criterionForm?.criterion ? 'Eligibility criterion updated.' : 'Eligibility criterion added.')
      setCriterionForm(null); setReload((value) => value + 1)
    } catch (error) { reportError(error); throw error }
  }
  async function confirmAction() {
    const action = confirmation
    if (!action) return
    try {
      if (action.kind === 'delete-criterion') await deleteProgramCriterion(session.accessToken, selectedId, action.criterion.criterionId)
      else if (action.kind === 'activate') await activateProgram(session.accessToken, selectedId)
      else if (action.kind === 'close') await closeProgram(session.accessToken, selectedId)
      else await cancelProgram(session.accessToken, selectedId)
      toast.success(action.success)
      setConfirmation(null); setReload((value) => value + 1)
    } catch (error) { reportError(error); throw error }
  }

  const rows = data?.programs ?? []
  return (
    <DashboardShell breadcrumbs={['Operations', 'Assistance services', 'Programs']} currentPath="/programs" onLogout={onLogout} onNavigate={onNavigate} pageTitle="Assistance programs" user={session.user}>
      <header className="ga-page-header flex flex-col gap-5 border-b border-line pb-6 sm:flex-row sm:items-end sm:justify-between"><div><p className="ga-eyebrow">Assistance service directory</p><h1 className="ga-page-title">{session.user.role === 'SYSTEM_ADMIN' ? 'Assistance programs' : canManage ? 'Assistance program management' : 'Assistance program browser'}</h1><p className="ga-page-copy">{session.user.role === 'SYSTEM_ADMIN' ? 'Define eligibility, documents, grant values, and application periods before planning a distribution.' : canManage ? 'Maintain eligibility, documents, grant values, and application periods for assistance programs.' : 'Review published assistance program details and requirements.'}</p></div>{canManage && <div className="flex shrink-0 flex-wrap gap-3"><button type="button" onClick={() => setImportOpen(true)} className="ga-btn-secondary">Import programs</button><button type="button" onClick={() => setProgramForm({ program: null })} className="ga-btn-primary">Create program</button></div>}</header>
      {!canRead ? <section className="ga-card mt-6 p-8 text-center" role="alert"><h2 className="ga-section-heading">Program access unavailable</h2><p className="mt-2 text-muted-copy">Your staff account is not authorized to view assistance programs.</p></section> : <>
        {session.user.role !== 'SYSTEM_ADMIN' && <section className="mt-6 rounded-xl border border-blue-200 bg-info-soft p-4 text-sm leading-6 text-copy">{canManage ? <><strong className="text-ink">Publishing control:</strong> programs remain in draft until eligibility rules are complete and an authorized administrator or DSWD staff member activates them.</> : <><strong className="text-ink">Reference access:</strong> program details are read-only. Authorized administrators and DSWD staff manage rules, requirements, and publishing.</>}</section>}
        <form onSubmit={applyFilters} className="ga-card mt-5 grid items-end gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_13rem_auto] sm:p-5" aria-label="Program filters"><div><label htmlFor="program-search" className="ga-label">Search programs</label><input id="program-search" value={draft.search} onChange={(event) => setDraft((current) => ({ ...current, search: event.target.value }))} className="ga-input mt-2" placeholder="Name, code, or type" /></div><div><label htmlFor="program-status" className="ga-label">Program status</label><select id="program-status" value={draft.status} onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value }))} className="ga-input mt-2">{statuses.map((value) => <option key={value || 'ALL'} value={value}>{value ? humanize(value) : 'All statuses'}</option>)}</select></div><button className="ga-btn-primary">Apply filters</button></form>
        {isLoading ? <LoadingState /> : error ? <section className="mt-6 rounded-xl border border-amber-200 bg-white p-6" role="alert"><h2 className="font-extrabold">Programs could not be loaded</h2><p className="mt-2 text-sm text-muted-copy">{error}</p><button type="button" onClick={() => { setIsLoading(true); setReload((value) => value + 1) }} className="ga-btn-primary mt-4">Try again</button></section> : <div className="mt-6 grid items-start gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(26rem,0.9fr)]">
          <section className="ga-card overflow-hidden"><div className="flex items-center justify-between border-b border-line px-5 py-4"><div><h2 id="program-registry-heading" className="ga-section-heading scroll-mt-36">Program registry</h2><p className="mt-1 text-sm text-muted-copy">{data.pagination.total} matching {data.pagination.total === 1 ? 'program' : 'programs'}</p></div><span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold">Page {data.pagination.page}</span></div>
            {rows.length === 0 ? <div className="p-10 text-center"><span className="mx-auto grid size-12 place-items-center rounded-full bg-info-soft font-black text-brand-blue">0</span><h3 className="mt-4 font-extrabold">No programs found</h3><p className="mt-2 text-sm text-muted-copy">Adjust the search or status filter.</p></div> : <div className="divide-y divide-line">{rows.map((program) => <button key={program.programId} type="button" onClick={() => openProgram(program.programId)} aria-pressed={selectedId === program.programId} className={`block min-h-24 w-full cursor-pointer px-5 py-4 text-left transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-brand-blue ${selectedId === program.programId ? 'bg-info-soft' : 'bg-white'}`}><div className="flex items-start justify-between gap-4"><div className="min-w-0"><p className="truncate font-extrabold text-ink">{program.programName}</p><p className="mt-1 text-sm font-semibold text-brand-blue">{program.programCode} · {humanize(program.programType)}</p></div><StatusBadge value={program.status} /></div><div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-copy"><span>{displayMoney(program.grantAmount)} per beneficiary</span><span>{program.criteria.length} {program.criteria.length === 1 ? 'criterion' : 'criteria'}</span></div></button>)}</div>}
            {data.pagination.totalPages > 1 && <div className="flex items-center justify-between border-t border-line px-5 py-4 text-sm"><span>Page {page} of {data.pagination.totalPages}</span><div className="flex gap-2"><button type="button" disabled={page === 1} onClick={() => { setIsLoading(true); setPage((value) => value - 1) }} className="ga-btn-secondary min-h-11 px-4 text-sm">Previous</button><button type="button" disabled={page === data.pagination.totalPages} onClick={() => { setIsLoading(true); setPage((value) => value + 1) }} className="ga-btn-secondary min-h-11 px-4 text-sm">Next</button></div></div>}
          </section>
          {selectedId && <a id="program-return" href="#program-registry-heading" className="-mb-3 inline-flex min-h-11 scroll-mt-36 items-center gap-2 self-start rounded-lg px-2 text-sm font-bold text-brand-blue focus-visible:outline-2 focus-visible:outline-brand-blue xl:hidden">Back to program registry</a>}
          <section ref={detailRef} tabIndex={-1} className="ga-card scroll-mt-36 overflow-hidden focus:outline-2 focus:outline-offset-2 focus:outline-brand-blue" aria-label="Selected program" aria-live="polite" aria-busy={isLoadingDetail}>{isLoadingDetail ? <div className="p-6" role="status"><span className="sr-only">Loading program details...</span><Skeleton className="h-7 w-3/4" /><Skeleton className="mt-5 h-32 w-full" /><Skeleton className="mt-4 h-44 w-full" /></div> : detailError ? <div className="p-5 sm:p-6" role="alert"><h2 className="ga-section-heading">Program details could not be loaded</h2><p className="mt-2 text-sm leading-6 text-copy">{detailError}</p><button type="button" onClick={() => setReload(value => value + 1)} className="ga-btn-primary mt-4">Try again</button></div> : !selected ? <div className="p-10 text-center"><h2 className="ga-section-heading">Select a program</h2><p className="mt-2 text-sm text-muted-copy">Choose a registry item to review its configuration.</p></div> : <>
            <div className="border-b border-line p-5 sm:p-6"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="ga-eyebrow">{selected.programCode}</p><h2 className="mt-2 text-2xl font-extrabold">{selected.programName}</h2></div><StatusBadge value={selected.status} /></div><p className="mt-3 text-sm leading-6 text-muted-copy">{selected.description || 'No program description recorded.'}</p><dl className="mt-5 grid grid-cols-2 gap-4 text-sm"><div><dt className="text-muted-copy">Grant amount</dt><dd className="mt-1 font-bold">{displayMoney(selected.grantAmount)}</dd></div><div><dt className="text-muted-copy">Program budget</dt><dd className="mt-1 font-bold">{displayMoney(selected.budgetAmount)}</dd></div><div><dt className="text-muted-copy">Applications open</dt><dd className="mt-1 font-bold">{displayDate(selected.applicationStartDate)}</dd></div><div><dt className="text-muted-copy">Applications close</dt><dd className="mt-1 font-bold">{displayDate(selected.applicationEndDate)}</dd></div></dl></div>
            {canManage && selected.status === 'DRAFT' && <div className="border-b border-line bg-warning-soft/50 p-5 text-sm leading-6 sm:p-6"><p className="font-bold text-ink">Next step: {selected.criteria.length ? 'review and activate the program' : 'add an eligibility criterion'}</p><p className="mt-1 text-copy">{selected.criteria.length ? 'Confirm the budget, requirements, and rules below before opening this program for enrollment.' : 'A draft needs at least one rule before it can be activated for enrollment.'}</p></div>}
            {session.user.role === 'SYSTEM_ADMIN' && selected.status === 'ACTIVE' && <div className="flex flex-col gap-4 border-b border-blue-200 bg-info-soft p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6"><div><p className="text-xs font-bold uppercase tracking-wide text-brand-blue">Ready for distribution planning</p><p className="mt-1 text-sm leading-6 text-copy">Use this active program to create a distribution draft. Service sessions and beneficiaries are added in the next workspace.</p></div><a href={`/distributions/manage?program=${encodeURIComponent(selected.programId)}&create=1`} onClick={(event) => { event.preventDefault(); onNavigate(`/distributions/manage?program=${encodeURIComponent(selected.programId)}&create=1`) }} className="ga-btn-primary shrink-0">Plan distribution</a></div>}
            <div className="border-b border-line p-5 sm:p-6"><div className="flex items-center justify-between gap-4"><div><h3 className="font-extrabold">Eligibility criteria</h3><p className="mt-1 text-sm text-muted-copy">Rules evaluated during enrollment review.</p></div>{canManage && selected.status === 'DRAFT' && <button type="button" onClick={() => setCriterionForm({ criterion: null })} className="ga-btn-secondary min-h-11 px-4 text-sm">Add criterion</button>}</div>{selected.criteria.length === 0 ? <div className="mt-4 rounded-lg border border-amber-200 bg-warning-soft p-4 text-sm text-brand-amber">No eligibility criterion has been recorded.</div> : <ul className="mt-4 space-y-3">{selected.criteria.map((criterion) => <li key={criterion.criterionId} className="rounded-lg border border-line p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-bold">{criterion.criterionName}</p><p className="mt-1 text-sm text-muted-copy">{humanize(criterion.fieldName)} · {humanize(criterion.operator)} · {Array.isArray(criterion.expectedValue) ? criterion.expectedValue.join(', ') : String(criterion.expectedValue)}</p></div>{criterion.isRequired && <span className="rounded-full bg-info-soft px-2.5 py-1 text-xs font-bold text-brand-blue">Required</span>}</div>{canManage && selected.status === 'DRAFT' && <div className="mt-3 flex gap-2"><button type="button" onClick={() => setCriterionForm({ criterion })} className="min-h-11 rounded-lg px-3 text-sm font-bold text-brand-blue hover:bg-info-soft">Edit</button><button type="button" onClick={() => setConfirmation({ kind: 'delete-criterion', criterion, success: 'Eligibility criterion removed.', title: 'Remove this criterion?', description: 'The rule will no longer be used when determining program eligibility.', actionLabel: 'Remove criterion', destructive: true })} className="min-h-11 rounded-lg px-3 text-sm font-bold text-brand-red hover:bg-danger-soft">Remove</button></div>}</li>)}</ul>}</div>
            <div className="p-5 sm:p-6"><h3 className="font-extrabold">Required documents</h3><div className="mt-3 flex flex-wrap gap-2">{selected.requiredDocumentTypes.length ? programDocumentRequirements(selected).map((requirement) => <span key={requirement.label} className="rounded-full border border-line bg-slate-50 px-3 py-1.5 text-xs font-bold text-copy">{requirement.documentType === 'OTHER' ? requirement.label : humanize(requirement.documentType)}</span>) : <span className="text-sm text-muted-copy">No documentary requirements configured.</span>}</div>{canManage && <div className="mt-6 flex flex-wrap gap-3">{selected.status === 'DRAFT' && <><button type="button" onClick={() => setProgramForm({ program: selected })} className="ga-btn-secondary">Edit details</button><button type="button" disabled={selected.criteria.length === 0} onClick={() => setConfirmation({ kind: 'activate', success: 'Program activated for enrollment.', title: 'Activate this program?', description: 'Its eligibility rules and requirements will become available to staff handling enrollments.', actionLabel: 'Activate program' })} className="ga-btn-primary">Activate program</button></>}{selected.status === 'ACTIVE' && <button type="button" onClick={() => setConfirmation({ kind: 'close', success: 'Program closed to new enrollments.', title: 'Close this program?', description: 'New enrollments will stop. Existing records remain available for official processing.', actionLabel: 'Close program' })} className="ga-btn-secondary">Close enrollment</button>}{['DRAFT', 'ACTIVE'].includes(selected.status) && <button type="button" onClick={() => setConfirmation({ kind: 'cancel', success: 'Program cancelled.', title: 'Cancel this program?', description: 'Cancellation is permanent and should only be used when the assistance program will not proceed.', actionLabel: 'Cancel program', destructive: true })} className="ga-btn-danger">Cancel program</button>}</div>}</div>
          </>}</section>
        </div>}
      </>}
      {canManage && importOpen && <ProgramImportDialog accessToken={session.accessToken} onClose={() => setImportOpen(false)} onImported={() => setReload(value => value + 1)} onSessionExpired={onSessionExpired} onOpenProgram={program => { const next = { search: program.programCode, status: '' }; setDraft(next); setFilters(next); setPage(1); setIsLoading(true); openProgram(program.programId) }} />}
      {canManage && programForm && <ProgramFormDialog program={programForm.program} onClose={() => setProgramForm(null)} onSave={saveProgram} />}
      {canManage && criterionForm && <CriterionDialog barangays={barangays} criterion={criterionForm.criterion} onClose={() => setCriterionForm(null)} onSave={saveCriterion} />}
      <ConfirmationDialog open={Boolean(confirmation)} title={confirmation?.title} description={confirmation?.description} actionLabel={confirmation?.actionLabel} destructive={confirmation?.destructive} onCancel={() => setConfirmation(null)} onConfirm={confirmAction} />
    </DashboardShell>
  )
}

export default ProgramManagementPage
