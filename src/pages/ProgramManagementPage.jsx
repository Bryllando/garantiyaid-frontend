import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import DashboardShell from '../components/layout/DashboardShell.jsx'
import { ConfirmationDialog } from '../components/ui/confirmation-dialog.jsx'
import { Skeleton } from '../components/ui/skeleton.jsx'
import { LoadingLabel } from '../components/ui/spinner.jsx'
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
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const emptyProgram = { programName: '', programCode: '', programType: '', description: '', grantAmount: '', budgetAmount: '', applicationStartDate: '', applicationEndDate: '', requiredDocumentTypes: [] }
const emptyCriterion = { criterionName: '', fieldName: 'AGE', operator: 'GREATER_THAN_OR_EQUAL', expectedInput: '', isRequired: true }
const dateFormatter = new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeZone: 'Asia/Manila' })
const moneyFormatter = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' })

const humanize = (value = '') => value.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase())
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
  const [form, setForm] = useState(() => program ? {
    programName: program.programName ?? '', programCode: program.programCode ?? '', programType: program.programType ?? '',
    description: program.description ?? '', grantAmount: program.grantAmount ?? '', budgetAmount: program.budgetAmount ?? '',
    applicationStartDate: dateOnly(program.applicationStartDate), applicationEndDate: dateOnly(program.applicationEndDate),
    requiredDocumentTypes: program.requiredDocumentTypes ?? [],
  } : emptyProgram)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => { dialogRef.current?.showModal() }, [])

  function change(field, value) { setForm((current) => ({ ...current, [field]: value })) }
  function toggleDocument(value) {
    setForm((current) => ({ ...current, requiredDocumentTypes: current.requiredDocumentTypes.includes(value) ? current.requiredDocumentTypes.filter((item) => item !== value) : [...current.requiredDocumentTypes, value] }))
  }
  async function submit(event) {
    event.preventDefault()
    if (form.applicationStartDate && form.applicationEndDate && form.applicationEndDate < form.applicationStartDate) return toast.error('Application end date must be on or after the start date.')
    if (form.grantAmount && form.budgetAmount && Number(form.budgetAmount) < Number(form.grantAmount)) return toast.error('Program budget cannot be lower than the grant per beneficiary.')
    setIsSaving(true)
    try {
      await onSave({ ...form, programCode: form.programCode.trim().toUpperCase(), programType: form.programType.trim().toUpperCase() })
      dialogRef.current?.close()
    } catch {
      // The page reports the API error and leaves this form open.
    } finally { setIsSaving(false) }
  }

  return (
    <dialog ref={dialogRef} onClose={onClose} className="m-auto max-h-[calc(100dvh-2rem)] w-[min(54rem,calc(100%-2rem))] overflow-y-auto rounded-2xl border border-line bg-white p-0 text-ink shadow-lg backdrop:bg-slate-950/55">
      <form onSubmit={submit} className="p-5 sm:p-7">
        <div className="flex items-start justify-between gap-5"><div><p className="ga-eyebrow">Program configuration</p><h2 className="mt-2 text-2xl font-extrabold">{program ? 'Edit draft program' : 'Create assistance program'}</h2><p className="mt-2 text-sm leading-6 text-muted-copy">Define the assistance, application period, budget, and documentary requirements.</p></div><button type="button" onClick={() => dialogRef.current?.close()} aria-label="Close program form" className="grid size-11 shrink-0 place-items-center rounded-lg border border-line text-xl text-copy hover:bg-slate-50">×</button></div>
        <div className="mt-6 grid gap-5 sm:grid-cols-2">
          <Field id="program-name" label="Program name" required maxLength="150" value={form.programName} onChange={(value) => change('programName', value)} />
          <Field id="program-code" label="Program code" required maxLength="30" pattern="[A-Za-z0-9-]{3,30}" placeholder="e.g. AICS-2026" value={form.programCode} onChange={(value) => change('programCode', value)} />
          <Field id="program-type" label="Program type" required maxLength="20" pattern="[A-Za-z0-9_]{2,20}" placeholder="e.g. CASH_ASSISTANCE" value={form.programType} onChange={(value) => change('programType', value)} />
          <Field id="program-grant" label="Grant per beneficiary" type="number" min="0" step="0.01" placeholder="0.00" value={form.grantAmount} onChange={(value) => change('grantAmount', value)} />
          <Field id="program-budget" label="Total program budget" type="number" min="0" step="0.01" placeholder="0.00" value={form.budgetAmount} onChange={(value) => change('budgetAmount', value)} />
          <div className="hidden sm:block" />
          <Field id="program-start" label="Application start" type="date" value={form.applicationStartDate} onChange={(value) => change('applicationStartDate', value)} />
          <Field id="program-end" label="Application end" type="date" min={form.applicationStartDate} value={form.applicationEndDate} onChange={(value) => change('applicationEndDate', value)} />
          <div className="sm:col-span-2"><label htmlFor="program-description" className="ga-label">Public-service description</label><textarea id="program-description" rows="4" maxLength="5000" value={form.description} onChange={(event) => change('description', event.target.value)} className="ga-input mt-2 min-h-28 resize-y py-3" /></div>
        </div>
        <fieldset className="mt-6 rounded-xl border border-line bg-slate-50 p-4"><legend className="px-1 text-sm font-bold text-ink">Required documents</legend><p className="mb-4 mt-1 text-sm text-muted-copy">Select only documents necessary to establish eligibility.</p><div className="grid gap-2 sm:grid-cols-2">{documentTypes.map((type) => <label key={type} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-transparent px-3 py-2 text-sm font-semibold text-copy hover:border-blue-200 hover:bg-info-soft"><input type="checkbox" checked={form.requiredDocumentTypes.includes(type)} onChange={() => toggleDocument(type)} className="size-4 accent-brand-blue" /><span>{humanize(type)}</span></label>)}</div></fieldset>
        <div className="mt-7 flex flex-col-reverse gap-3 border-t border-line pt-5 sm:flex-row sm:justify-end"><button type="button" onClick={() => dialogRef.current?.close()} disabled={isSaving} className="ga-btn-secondary">Cancel</button><button type="submit" disabled={isSaving} className="ga-btn-primary">{isSaving ? <LoadingLabel>Saving...</LoadingLabel> : program ? 'Save program' : 'Create draft program'}</button></div>
      </form>
    </dialog>
  )
}

function Field({ id, label, onChange, ...inputProps }) {
  return <div><label htmlFor={id} className="ga-label">{label}</label><input id={id} onChange={(event) => onChange(event.target.value)} className="ga-input mt-2" {...inputProps} /></div>
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
  const [form, setForm] = useState(() => criterion ? {
    criterionName: criterion.criterionName,
    fieldName: criterion.fieldName,
    operator: criterionOperators[criterion.fieldName]?.includes(criterion.operator) ? criterion.operator : criterionDefaults[criterion.fieldName].operator,
    expectedInput: criterionInputValue(criterion),
    isRequired: criterion.fieldName === 'MANUAL_REVIEW' ? true : criterion.isRequired,
  } : emptyCriterion)
  const [isSaving, setIsSaving] = useState(false)
  useEffect(() => { dialogRef.current?.showModal() }, [])
  function change(field, value) { setForm((current) => ({ ...current, [field]: value })) }
  function changeField(fieldName) {
    setForm((current) => ({
      ...current,
      fieldName,
      ...criterionDefaults[fieldName],
      ...(fieldName === 'MANUAL_REVIEW' ? { isRequired: true } : {}),
    }))
  }
  function changeOperator(operator) {
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
  function toggleSexValue(value) {
    const selected = new Set(form.expectedInput.split(',').map((item) => item.trim()).filter(Boolean))
    if (selected.has(value)) selected.delete(value)
    else selected.add(value)
    change('expectedInput', sexValues.filter((item) => selected.has(item)).join(', '))
  }
  async function submit(event) {
    event.preventDefault()
    let expectedValue
    try { expectedValue = criterionValue(form, barangays) } catch (error) { return toast.error(error.message) }
    setIsSaving(true)
    try {
      await onSave({ criterionName: form.criterionName, fieldName: form.fieldName, operator: form.operator, expectedValue, isRequired: form.isRequired })
      dialogRef.current?.close()
    } catch {
      // The page reports the API error and leaves this form open.
    } finally { setIsSaving(false) }
  }
  return (
    <dialog ref={dialogRef} onClose={onClose} className="m-auto w-[min(38rem,calc(100%-2rem))] rounded-2xl border border-line bg-white p-0 text-ink shadow-lg backdrop:bg-slate-950/55">
      <form onSubmit={submit} className="p-5 sm:p-7">
        <div className="flex items-start justify-between gap-5"><div><p className="ga-eyebrow">Eligibility rule</p><h2 className="mt-2 text-2xl font-extrabold">{criterion ? 'Edit criterion' : 'Add criterion'}</h2></div><button type="button" onClick={() => dialogRef.current?.close()} aria-label="Close criterion form" className="grid size-11 place-items-center rounded-lg border border-line text-xl hover:bg-slate-50">×</button></div>
        <div className="mt-6 grid gap-5 sm:grid-cols-2">
          <div className="sm:col-span-2"><Field id="criterion-name" label="Criterion name" required maxLength="100" value={form.criterionName} onChange={(value) => change('criterionName', value)} /></div>
          <div><label htmlFor="criterion-field" className="ga-label">Data field</label><select id="criterion-field" value={form.fieldName} onChange={(event) => changeField(event.target.value)} className="ga-input mt-2">{criterionFields.map((value) => <option key={value} value={value}>{humanize(value)}</option>)}</select></div>
          <div><label htmlFor="criterion-operator" className="ga-label">Condition</label><select id="criterion-operator" value={form.operator} onChange={(event) => changeOperator(event.target.value)} disabled={criterionOperators[form.fieldName].length === 1} aria-describedby="criterion-operator-help" className="ga-input mt-2">{criterionOperators[form.fieldName].map((value) => <option key={value} value={value}>{humanize(value)}</option>)}</select><p id="criterion-operator-help" className="mt-2 text-xs leading-5 text-muted-copy">Only conditions supported for {humanize(form.fieldName).toLowerCase()} are available.</p></div>

          {form.fieldName === 'AGE' && <div className="sm:col-span-2"><Field id="criterion-value" label={['IN', 'NOT_IN'].includes(form.operator) ? 'Ages (comma separated)' : 'Age in completed years'} type={['IN', 'NOT_IN'].includes(form.operator) ? 'text' : 'number'} inputMode="numeric" min="0" max="150" step="1" pattern={['IN', 'NOT_IN'].includes(form.operator) ? '[0-9]+(\\s*,\\s*[0-9]+)*' : undefined} placeholder={['IN', 'NOT_IN'].includes(form.operator) ? 'e.g. 18, 60' : 'e.g. 18'} required value={form.expectedInput} onChange={(value) => change('expectedInput', value)} aria-describedby="criterion-value-help" /><p id="criterion-value-help" className="mt-2 text-xs leading-5 text-muted-copy">Use whole numbers from 0 to 150. Rules use the beneficiary’s completed age on the enrollment date.</p></div>}

          {form.fieldName === 'SEX' && ['EQUALS', 'NOT_EQUALS'].includes(form.operator) && <div className="sm:col-span-2"><label htmlFor="criterion-value" className="ga-label">Recorded sex</label><select id="criterion-value" required value={form.expectedInput} onChange={(event) => change('expectedInput', event.target.value)} aria-describedby="criterion-value-help" className="ga-input mt-2">{sexValues.map((value) => <option key={value} value={value}>{humanize(value)}</option>)}</select><p id="criterion-value-help" className="mt-2 text-xs leading-5 text-muted-copy">Compared with the value in the beneficiary record.</p></div>}

          {form.fieldName === 'SEX' && ['IN', 'NOT_IN'].includes(form.operator) && <fieldset className="sm:col-span-2" aria-describedby="criterion-value-help"><legend className="ga-label">Recorded sex values</legend><div className="mt-2 grid gap-2 sm:grid-cols-2">{sexValues.map((value) => <label key={value} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-line px-3 py-2 text-sm font-semibold text-copy hover:border-blue-200 hover:bg-info-soft"><input type="checkbox" checked={form.expectedInput.split(',').map((item) => item.trim()).includes(value)} onChange={() => toggleSexValue(value)} className="size-4 accent-brand-blue" /><span>{humanize(value)}</span></label>)}</div><p id="criterion-value-help" className="mt-2 text-xs leading-5 text-muted-copy">Select at least one value from the beneficiary record.</p></fieldset>}

          {form.fieldName === 'BARANGAY_ID' && <div className="sm:col-span-2"><label htmlFor="criterion-value" className="ga-label">{['IN', 'NOT_IN'].includes(form.operator) ? 'Covered Barangays' : 'Covered Barangay'}</label>{barangays.length > 0 ? ['IN', 'NOT_IN'].includes(form.operator) ? <select id="criterion-value" multiple required size={Math.min(Math.max(barangays.length, 3), 7)} value={form.expectedInput.split(',').map((item) => item.trim()).filter(Boolean)} onChange={(event) => change('expectedInput', [...event.target.selectedOptions].map((option) => option.value).join(', '))} aria-describedby="criterion-value-help" className="ga-input mt-2 min-h-32 py-2">{barangays.map((barangay) => <option key={barangay.barangayId} value={barangay.barangayId}>{barangay.barangayName} — {barangay.city}</option>)}</select> : <select id="criterion-value" required value={form.expectedInput} onChange={(event) => change('expectedInput', event.target.value)} aria-describedby="criterion-value-help" className="ga-input mt-2"><option value="">Select an active Barangay</option>{barangays.map((barangay) => <option key={barangay.barangayId} value={barangay.barangayId}>{barangay.barangayName} — {barangay.city}</option>)}</select> : <input id="criterion-value" required value={form.expectedInput} onChange={(event) => change('expectedInput', event.target.value)} aria-describedby="criterion-value-help" className="ga-input mt-2 font-mono" placeholder="xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx" />}<p id="criterion-value-help" className="mt-2 text-xs leading-5 text-muted-copy">{barangays.length > 0 ? ['IN', 'NOT_IN'].includes(form.operator) ? 'Hold Ctrl or Command to select more than one active Barangay.' : 'Only active Barangay records can be used.' : 'Barangay choices could not be loaded. Enter an active Barangay UUID.'}</p></div>}

          {form.fieldName === 'DOCUMENT_TYPE' && <div className="sm:col-span-2"><label htmlFor="criterion-value" className="ga-label">Required document type</label><select id="criterion-value" required value={form.expectedInput} onChange={(event) => change('expectedInput', event.target.value)} aria-describedby="criterion-value-help" className="ga-input mt-2"><option value="">Select a document type</option>{documentTypes.map((value) => <option key={value} value={value}>{humanize(value)}</option>)}</select><p id="criterion-value-help" className="mt-2 text-xs leading-5 text-muted-copy">DSWD must accept this document type before the criterion passes.</p></div>}

          {form.fieldName === 'MANUAL_REVIEW' && <div className="sm:col-span-2 rounded-xl border border-blue-200 bg-info-soft p-4 text-sm leading-6 text-copy" role="note"><p className="font-bold text-ink">Manual decision required</p><p className="mt-1">A DSWD reviewer must record whether this criterion is satisfied and provide remarks during enrollment review.</p></div>}
        </div>
        <label className={`mt-5 flex min-h-11 items-center gap-3 rounded-lg bg-slate-50 px-4 text-sm font-semibold text-copy ${form.fieldName === 'MANUAL_REVIEW' ? '' : 'cursor-pointer'}`}><input type="checkbox" checked={form.isRequired} disabled={form.fieldName === 'MANUAL_REVIEW'} onChange={(event) => change('isRequired', event.target.checked)} className="size-4 accent-brand-blue" />This is a mandatory eligibility criterion</label>
        <div className="mt-6 flex flex-col-reverse gap-3 border-t border-line pt-5 sm:flex-row sm:justify-end"><button type="button" onClick={() => dialogRef.current?.close()} disabled={isSaving} className="ga-btn-secondary">Cancel</button><button type="submit" disabled={isSaving || (form.fieldName === 'SEX' && ['IN', 'NOT_IN'].includes(form.operator) && !form.expectedInput)} className="ga-btn-primary">{isSaving ? <LoadingLabel>Saving...</LoadingLabel> : criterion ? 'Save criterion' : 'Add criterion'}</button></div>
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
  const [selected, setSelected] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingDetail, setIsLoadingDetail] = useState(true)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  const [programForm, setProgramForm] = useState(null)
  const [criterionForm, setCriterionForm] = useState(null)
  const [confirmation, setConfirmation] = useState(null)
  const canRead = ['SYSTEM_ADMIN', 'DSWD_STAFF', 'BARANGAY_FACILITATOR'].includes(session.user.role)
  const canManage = session.user.role === 'DSWD_STAFF'

  const reportError = useCallback((requestError) => {
    if (isSessionExpiredError(requestError)) return onSessionExpired()
    toast.error(getAuthErrorMessage(requestError))
  }, [onSessionExpired])

  useEffect(() => {
    if (!canRead) return undefined
    let active = true
    requestPrograms(session.accessToken, { page, pageSize: 20, ...filters })
      .then((result) => { if (active) { setData(result); setError(''); if (!result.programs.length) setIsLoadingDetail(false); setSelectedId((current) => result.programs.some((program) => program.programId === current) ? current : result.programs[0]?.programId || '') } })
      .catch((requestError) => { if (active) { if (isSessionExpiredError(requestError)) return onSessionExpired(); setError(getAuthErrorMessage(requestError)) } })
      .finally(() => { if (active) setIsLoading(false) })
    return () => { active = false }
  }, [canRead, filters, onSessionExpired, page, reload, session.accessToken])

  useEffect(() => {
    if (!selectedId || !canRead) return undefined
    let active = true
    requestProgram(session.accessToken, selectedId)
      .then((program) => { if (active) setSelected(program) })
      .catch((requestError) => { if (active) { reportError(requestError); setSelected(null) } })
      .finally(() => { if (active) setIsLoadingDetail(false) })
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

  function applyFilters(event) { event.preventDefault(); setPage(1); setIsLoading(true); setFilters({ search: draft.search.trim(), status: draft.status }) }
  async function saveProgram(payload) {
    try {
      const saved = programForm?.program ? await updateProgram(session.accessToken, programForm.program.programId, payload) : await createProgram(session.accessToken, payload)
      toast.success(programForm?.program ? 'Program details updated.' : 'Draft assistance program created.')
      setProgramForm(null); setSelectedId(saved.programId); setIsLoadingDetail(true); setReload((value) => value + 1)
    } catch (error) { reportError(error); throw error }
  }
  async function saveCriterion(payload) {
    try {
      if (criterionForm?.criterion) await updateProgramCriterion(session.accessToken, selectedId, criterionForm.criterion.criterionId, payload)
      else await createProgramCriterion(session.accessToken, selectedId, payload)
      toast.success(criterionForm?.criterion ? 'Eligibility criterion updated.' : 'Eligibility criterion added.')
      setCriterionForm(null); setIsLoadingDetail(true); setReload((value) => value + 1)
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
      setConfirmation(null); setIsLoadingDetail(true); setReload((value) => value + 1)
    } catch (error) { reportError(error); throw error }
  }

  const rows = data?.programs ?? []
  return (
    <DashboardShell breadcrumbs={['Operations', 'Assistance services', 'Programs']} currentPath="/programs" onLogout={onLogout} onNavigate={onNavigate} pageTitle="Assistance programs" user={session.user}>
      <header className="flex flex-col gap-5 border-b border-line pb-6 sm:flex-row sm:items-end sm:justify-between"><div><p className="ga-eyebrow">Assistance service directory</p><h1 className="ga-page-title">{canManage ? 'Assistance program management' : 'Assistance program browser'}</h1><p className="ga-page-copy">Review program scope, eligibility rules, documentary requirements, grant values, and application periods.</p></div>{canManage && <button type="button" onClick={() => setProgramForm({ program: null })} className="ga-btn-primary shrink-0">Create program</button>}</header>
      {!canRead ? <section className="ga-card mt-6 p-8 text-center" role="alert"><h2 className="ga-section-heading">Program access unavailable</h2><p className="mt-2 text-muted-copy">Your staff account is not authorized to view assistance programs.</p></section> : <>
        <section className="mt-6 rounded-xl border border-blue-200 bg-info-soft p-4 text-sm leading-6 text-copy">{canManage ? <><strong className="text-ink">Publishing control:</strong> programs remain in draft until eligibility rules are complete and DSWD Staff activates them.</> : <><strong className="text-ink">Reference access:</strong> program details are read-only. DSWD Staff manages rules, requirements, and publishing.</>}</section>
        <form onSubmit={applyFilters} className="ga-card mt-5 grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_13rem_auto] sm:p-5" aria-label="Program filters"><div><label htmlFor="program-search" className="sr-only">Search programs</label><input id="program-search" value={draft.search} onChange={(event) => setDraft((current) => ({ ...current, search: event.target.value }))} className="ga-input" placeholder="Search program name, code, or type" /></div><div><label htmlFor="program-status" className="sr-only">Program status</label><select id="program-status" value={draft.status} onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value }))} className="ga-input">{statuses.map((value) => <option key={value || 'ALL'} value={value}>{value ? humanize(value) : 'All statuses'}</option>)}</select></div><button className="ga-btn-primary">Apply filters</button></form>
        {isLoading ? <LoadingState /> : error ? <section className="mt-6 rounded-xl border border-amber-200 bg-white p-6" role="alert"><h2 className="font-extrabold">Programs could not be loaded</h2><p className="mt-2 text-sm text-muted-copy">{error}</p><button type="button" onClick={() => { setIsLoading(true); setReload((value) => value + 1) }} className="ga-btn-primary mt-4">Try again</button></section> : <div className="mt-6 grid items-start gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(26rem,0.9fr)]">
          <section className="ga-card overflow-hidden"><div className="flex items-center justify-between border-b border-line px-5 py-4"><div><h2 className="ga-section-heading">Program registry</h2><p className="mt-1 text-sm text-muted-copy">{data.pagination.total} matching {data.pagination.total === 1 ? 'program' : 'programs'}</p></div><span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold">Page {data.pagination.page}</span></div>
            {rows.length === 0 ? <div className="p-10 text-center"><span className="mx-auto grid size-12 place-items-center rounded-full bg-info-soft font-black text-brand-blue">0</span><h3 className="mt-4 font-extrabold">No programs found</h3><p className="mt-2 text-sm text-muted-copy">Adjust the search or status filter.</p></div> : <div className="divide-y divide-line">{rows.map((program) => <button key={program.programId} type="button" onClick={() => { setIsLoadingDetail(true); setSelectedId(program.programId) }} aria-pressed={selectedId === program.programId} className={`block min-h-24 w-full cursor-pointer px-5 py-4 text-left transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-brand-blue ${selectedId === program.programId ? 'bg-info-soft' : 'bg-white'}`}><div className="flex items-start justify-between gap-4"><div className="min-w-0"><p className="truncate font-extrabold text-ink">{program.programName}</p><p className="mt-1 text-sm font-semibold text-brand-blue">{program.programCode} · {humanize(program.programType)}</p></div><StatusBadge value={program.status} /></div><div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-copy"><span>{displayMoney(program.grantAmount)} per beneficiary</span><span>{program.criteria.length} {program.criteria.length === 1 ? 'criterion' : 'criteria'}</span></div></button>)}</div>}
            {data.pagination.totalPages > 1 && <div className="flex items-center justify-between border-t border-line px-5 py-4 text-sm"><span>Page {page} of {data.pagination.totalPages}</span><div className="flex gap-2"><button type="button" disabled={page === 1} onClick={() => { setIsLoading(true); setPage((value) => value - 1) }} className="ga-btn-secondary min-h-11 px-4 text-sm">Previous</button><button type="button" disabled={page === data.pagination.totalPages} onClick={() => { setIsLoading(true); setPage((value) => value + 1) }} className="ga-btn-secondary min-h-11 px-4 text-sm">Next</button></div></div>}
          </section>
          <section className="ga-card overflow-hidden" aria-live="polite">{isLoadingDetail ? <div className="p-6"><Skeleton className="h-7 w-3/4" /><Skeleton className="mt-5 h-32 w-full" /><Skeleton className="mt-4 h-44 w-full" /></div> : !selected ? <div className="p-10 text-center"><h2 className="ga-section-heading">Select a program</h2><p className="mt-2 text-sm text-muted-copy">Choose a registry item to review its configuration.</p></div> : <>
            <div className="border-b border-line p-5 sm:p-6"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="ga-eyebrow">{selected.programCode}</p><h2 className="mt-2 text-2xl font-extrabold">{selected.programName}</h2></div><StatusBadge value={selected.status} /></div><p className="mt-3 text-sm leading-6 text-muted-copy">{selected.description || 'No program description recorded.'}</p><dl className="mt-5 grid grid-cols-2 gap-4 text-sm"><div><dt className="text-muted-copy">Grant amount</dt><dd className="mt-1 font-bold">{displayMoney(selected.grantAmount)}</dd></div><div><dt className="text-muted-copy">Program budget</dt><dd className="mt-1 font-bold">{displayMoney(selected.budgetAmount)}</dd></div><div><dt className="text-muted-copy">Applications open</dt><dd className="mt-1 font-bold">{displayDate(selected.applicationStartDate)}</dd></div><div><dt className="text-muted-copy">Applications close</dt><dd className="mt-1 font-bold">{displayDate(selected.applicationEndDate)}</dd></div></dl></div>
            <div className="border-b border-line p-5 sm:p-6"><div className="flex items-center justify-between gap-4"><div><h3 className="font-extrabold">Eligibility criteria</h3><p className="mt-1 text-sm text-muted-copy">Rules evaluated during enrollment review.</p></div>{canManage && selected.status === 'DRAFT' && <button type="button" onClick={() => setCriterionForm({ criterion: null })} className="ga-btn-secondary min-h-11 px-4 text-sm">Add criterion</button>}</div>{selected.criteria.length === 0 ? <div className="mt-4 rounded-lg border border-amber-200 bg-warning-soft p-4 text-sm text-brand-amber">No eligibility criterion has been recorded.</div> : <ul className="mt-4 space-y-3">{selected.criteria.map((criterion) => <li key={criterion.criterionId} className="rounded-lg border border-line p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-bold">{criterion.criterionName}</p><p className="mt-1 text-sm text-muted-copy">{humanize(criterion.fieldName)} · {humanize(criterion.operator)} · {Array.isArray(criterion.expectedValue) ? criterion.expectedValue.join(', ') : String(criterion.expectedValue)}</p></div>{criterion.isRequired && <span className="rounded-full bg-info-soft px-2.5 py-1 text-xs font-bold text-brand-blue">Required</span>}</div>{canManage && selected.status === 'DRAFT' && <div className="mt-3 flex gap-2"><button type="button" onClick={() => setCriterionForm({ criterion })} className="min-h-11 rounded-lg px-3 text-sm font-bold text-brand-blue hover:bg-info-soft">Edit</button><button type="button" onClick={() => setConfirmation({ kind: 'delete-criterion', criterion, success: 'Eligibility criterion removed.', title: 'Remove this criterion?', description: 'The rule will no longer be used when determining program eligibility.', actionLabel: 'Remove criterion', destructive: true })} className="min-h-11 rounded-lg px-3 text-sm font-bold text-brand-red hover:bg-danger-soft">Remove</button></div>}</li>)}</ul>}</div>
            <div className="p-5 sm:p-6"><h3 className="font-extrabold">Required documents</h3><div className="mt-3 flex flex-wrap gap-2">{selected.requiredDocumentTypes.length ? selected.requiredDocumentTypes.map((type) => <span key={type} className="rounded-full border border-line bg-slate-50 px-3 py-1.5 text-xs font-bold text-copy">{humanize(type)}</span>) : <span className="text-sm text-muted-copy">No documentary requirements configured.</span>}</div>{canManage && <div className="mt-6 flex flex-wrap gap-3">{selected.status === 'DRAFT' && <><button type="button" onClick={() => setProgramForm({ program: selected })} className="ga-btn-secondary">Edit details</button><button type="button" disabled={selected.criteria.length === 0} onClick={() => setConfirmation({ kind: 'activate', success: 'Program activated for enrollment.', title: 'Activate this program?', description: 'Its eligibility rules and requirements will become available to staff handling enrollments.', actionLabel: 'Activate program' })} className="ga-btn-primary">Activate program</button></>}{selected.status === 'ACTIVE' && <button type="button" onClick={() => setConfirmation({ kind: 'close', success: 'Program closed to new enrollments.', title: 'Close this program?', description: 'New enrollments will stop. Existing records remain available for official processing.', actionLabel: 'Close program' })} className="ga-btn-primary">Close enrollment</button>}{['DRAFT', 'ACTIVE'].includes(selected.status) && <button type="button" onClick={() => setConfirmation({ kind: 'cancel', success: 'Program cancelled.', title: 'Cancel this program?', description: 'Cancellation is permanent and should only be used when the assistance program will not proceed.', actionLabel: 'Cancel program', destructive: true })} className="ga-btn-danger">Cancel program</button>}</div>}</div>
          </>}</section>
        </div>}
      </>}
      {canManage && programForm && <ProgramFormDialog program={programForm.program} onClose={() => setProgramForm(null)} onSave={saveProgram} />}
      {canManage && criterionForm && <CriterionDialog barangays={barangays} criterion={criterionForm.criterion} onClose={() => setCriterionForm(null)} onSave={saveCriterion} />}
      <ConfirmationDialog open={Boolean(confirmation)} title={confirmation?.title} description={confirmation?.description} actionLabel={confirmation?.actionLabel} destructive={confirmation?.destructive} onCancel={() => setConfirmation(null)} onConfirm={confirmAction} />
    </DashboardShell>
  )
}

export default ProgramManagementPage
