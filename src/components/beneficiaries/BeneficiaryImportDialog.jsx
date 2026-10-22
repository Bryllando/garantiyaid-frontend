import { useEffect, useRef, useState } from 'react'
import { isSessionExpiredError, previewBeneficiaryImport, startBeneficiaryImport, requestBeneficiaryImports, requestBeneficiaryImport, requestBeneficiaryImportResults, resumeBeneficiaryImport } from '../../auth/staffAuth.js'
import ImportProgress, { ImportPagination, StaffImportHistory as ImportHistory } from '../admin/StaffImportProgress.jsx'
import { columnValues, downloadStaffCsv, suggestStaffBarangay, STAFF_IMPORT_LIMIT, STAFF_IMPORT_FILE_LIMIT_MB } from '../../utils/staffImport.js'
import { BENEFICIARY_IMPORT_FIELDS, beneficiaryTableFromSheet, readBeneficiaryImportFile, suggestBeneficiaryColumns, suggestImportProgram, mapBeneficiaryImportRows, beneficiaryCorrectionsCsv } from '../../utils/beneficiaryImport.js'

const api = { list: requestBeneficiaryImports, status: requestBeneficiaryImport, results: requestBeneficiaryImportResults, resume: resumeBeneficiaryImport }
const steps = ['Choose file', 'Match columns', 'Review records', 'Processing', 'Results']
const name = person => [person.firstName, person.middleName, person.lastName].filter(Boolean).join(' ')
const applicationLabel = status => status === 'NEEDS_CORRECTION' ? 'Needs documents — resubmit after upload' : status === 'PENDING' ? 'Pending staff review' : 'Record only'

export default function BeneficiaryImportDialog({ accessToken, user, barangays, programs, onClose, onImported, onSessionExpired, onNavigate }) {
  const dialogRef = useRef(null)
  const headingRef = useRef(null)
  const errorRef = useRef(null)
  const busyRef = useRef(false)
  const [step, setStep] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [sheets, setSheets] = useState([])
  const [sheetIndex, setSheetIndex] = useState(0)
  const [table, setTable] = useState(null)
  const [columns, setColumns] = useState({})
  const [assignments, setAssignments] = useState({})
  const [programAssignments, setProgramAssignments] = useState({})
  const [defaultBarangay, setDefaultBarangay] = useState('')
  const [defaultProgram, setDefaultProgram] = useState('')
  const [includeProgram, setIncludeProgram] = useState(false)
  const [dateFormat, setDateFormat] = useState('YMD')
  const [submittedRows, setSubmittedRows] = useState([])
  const [review, setReview] = useState(null)
  const [confirmed, setConfirmed] = useState(false)
  const [uncertain, setUncertain] = useState(false)
  const [job, setJob] = useState(null)
  const [result, setResult] = useState(null)
  const [reviewPage, setReviewPage] = useState(0)
  const [resultPage, setResultPage] = useState(0)
  const [barangayPage, setBarangayPage] = useState(0)
  const [programPage, setProgramPage] = useState(0)
  const [errorsOnly, setErrorsOnly] = useState(false)
  const isFacilitator = user.role === 'BARANGAY_FACILITATOR'
  const availableBarangays = barangays.filter(item => item.isActive && (!isFacilitator || item.barangayId === user.barangayId))

  useEffect(() => { dialogRef.current?.showModal() }, [])
  useEffect(() => { headingRef.current?.focus() }, [step])
  useEffect(() => { if (error) errorRef.current?.focus() }, [error])
  useEffect(() => {
    if (!busy && !uncertain) return
    const warn = event => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [busy, uncertain])

  function close() { if (!busyRef.current) dialogRef.current?.close() }
  async function run(action) {
    if (busyRef.current) return
    busyRef.current = true; setBusy(true); setError('')
    try { await action() } catch (error) {
      if (isSessionExpiredError(error)) onSessionExpired()
      else setError(error.message || 'The request could not be completed. Try again.')
    } finally { busyRef.current = false; setBusy(false) }
  }
  function chooseSheet(index, workbook = sheets) {
    setSheetIndex(index); setTable(null); setReview(null)
    if (workbook[index].tooLarge) throw new Error('Choose a worksheet with up to 5,000 beneficiaries and no more than 100,000 physical rows.')
    const next = beneficiaryTableFromSheet(workbook[index].data)
    const mapping = suggestBeneficiaryColumns(next.headers)
    setTable(next); setColumns(mapping); setDateFormat('YMD')
    setAssignments(Object.fromEntries(columnValues(next, mapping.barangayId).map(value => [value, suggestStaffBarangay(value, availableBarangays)])))
    setProgramAssignments(Object.fromEntries(columnValues(next, mapping.programId).map(value => [value, suggestImportProgram(value, programs)])))
    setDefaultBarangay(''); setDefaultProgram(''); setBarangayPage(0); setProgramPage(0)
  }
  function changeColumn(field, value) {
    setColumns(current => ({ ...current, [field]: value }))
    if (field === 'barangayId') { setBarangayPage(0); setAssignments(Object.fromEntries(columnValues(table, value).map(source => [source, suggestStaffBarangay(source, availableBarangays)]))) }
    if (field === 'programId') { setProgramPage(0); setProgramAssignments(Object.fromEntries(columnValues(table, value).map(source => [source, suggestImportProgram(source, programs)]))) }
  }
  async function checkRows(rows) {
    const checked = await previewBeneficiaryImport(accessToken, rows)
    setSubmittedRows(rows); setReview(checked); setConfirmed(false); setUncertain(false); setReviewPage(0); setErrorsOnly(false); setStep(2)
  }
  async function start() {
    try { setJob(await startBeneficiaryImport(accessToken, submittedRows, review.approvalId)); setUncertain(false); setStep(3) }
    catch (error) { setUncertain(!error.status || error.status >= 500 || error.code === 'BENEFICIARY_IMPORT_CONCURRENT'); throw error }
  }
  function showResult(completed) { setResult(completed); setResultPage(0); setStep(4); onImported() }
  function navigate(path) { close(); onNavigate(path) }
  const visibleRows = review?.rows.filter(row => !errorsOnly || row.issues.length) ?? []
  const barangayValues = table ? columnValues(table, columns.barangayId) : []
  const programValues = table ? columnValues(table, columns.programId) : []
  const barangayOptions = <><option value="">Choose an active barangay</option>{availableBarangays.map(item => <option key={item.barangayId} value={item.barangayId}>{item.barangayName}, {item.city} · {item.barangayCode}</option>)}</>
  const programOptions = <><option value="">Choose an active program</option>{programs.map(item => <option key={item.programId} value={item.programId}>{item.programCode} — {item.programName}</option>)}</>

  return <dialog ref={dialogRef} onClose={onClose} onCancel={event => { event.preventDefault(); close() }} aria-labelledby="beneficiary-import-title" aria-describedby="beneficiary-import-description" className="m-auto max-h-[calc(100dvh-2rem)] w-[min(68rem,calc(100%-2rem))] overflow-y-auto rounded border border-line bg-white p-0 text-ink backdrop:bg-slate-950/55">
    <header className="flex items-start justify-between gap-4 border-b border-line p-5 sm:px-7">
      <div><p className="text-sm text-copy">Beneficiary records · {steps[step]}</p><h2 id="beneficiary-import-title" ref={headingRef} tabIndex={-1} className="mt-1 text-2xl font-semibold outline-none">{step === 4 ? 'Beneficiary import results' : 'Import beneficiaries'}</h2><p id="beneficiary-import-description" className="mt-2 text-sm leading-6 text-copy">Import an existing list. Check the records before saving them in GarantiyAid.</p></div>
      <button type="button" disabled={busy} onClick={close} aria-label="Close beneficiary import" className="grid size-11 shrink-0 place-items-center rounded border border-line text-xl hover:bg-slate-50">×</button>
    </header>
    <div className="space-y-5 p-5 sm:p-7">
      <ol aria-label="Import steps" className="flex flex-wrap gap-x-6 gap-y-2 border-b border-line pb-4 text-sm">{steps.map((label, index) => <li key={label} aria-current={step === index ? 'step' : undefined} className={step === index ? 'font-semibold text-brand-blue' : 'text-copy'}>{index + 1}. {label}</li>)}</ol>
      {error && <p ref={errorRef} tabIndex={-1} role="alert" className="border-l-4 border-brand-red bg-danger-soft p-3 text-sm leading-6 text-brand-red">{error}</p>}
      <div role="status" className="sr-only">{busy ? 'Checking beneficiary import. Please wait.' : ''}</div>

      {step === 0 && <div className="max-w-3xl space-y-5">
        <ImportHistory accessToken={accessToken} api={api} label="beneficiaries" disabled={busy} onSessionExpired={onSessionExpired} onOpen={existing => { setJob(existing); setStep(3); setError('') }} />
        <p className="text-sm leading-6 text-copy">CSV (.csv) or Excel (.xlsx), up to {STAFF_IMPORT_FILE_LIMIT_MB} MB and {STAFF_IMPORT_LIMIT.toLocaleString('en-US')} beneficiaries per worksheet. Use column headings in the first row.</p>
        <div className="border-y border-line py-4 text-sm leading-6"><p><strong>Required:</strong> First name, last name, birth date, sex, address and barangay.</p><p className="mt-1">Use one row per beneficiary and separate name columns. Keep mobile numbers and PhilSys numbers as text to preserve leading zeroes. Existing records will be flagged for checking.</p><p className="mt-1">This creates beneficiary records. Passwords, biometric data, approvals and payment history from another system are not imported.</p></div>
        <fieldset><legend className="mb-2 font-semibold">What to import</legend><label className="flex min-h-11 items-center gap-3 text-sm"><input type="radio" name="beneficiary-import-mode" checked={!includeProgram} disabled={busy} onChange={() => setIncludeProgram(false)} />Beneficiary records only</label><label className="flex min-h-11 items-center gap-3 text-sm"><input type="radio" name="beneficiary-import-mode" checked={includeProgram} disabled={busy} onChange={() => setIncludeProgram(true)} />Beneficiary records and program applications</label>{includeProgram && <p className="mt-2 border-l-4 border-brand-blue bg-info-soft p-3 text-sm leading-6">Match each program in the next step. Applications still need supporting documents and staff review. An approval in the old file will not count as approval in GarantiyAid.</p>}</fieldset>
        <button type="button" disabled={busy} onClick={() => run(() => downloadStaffCsv('garantiyaid-beneficiary-template.csv', [BENEFICIARY_IMPORT_FIELDS.filter(([field]) => includeProgram || field !== 'programId').map(([, label]) => label)]))} className="min-h-11 text-sm font-semibold text-brand-blue underline underline-offset-4">Download CSV template</button>
        <div><label htmlFor="beneficiary-import-file" className="ga-label">Beneficiary list file</label><input id="beneficiary-import-file" type="file" accept=".csv,.xlsx" disabled={busy} className="ga-input mt-2 py-2 file:mr-3 file:rounded file:border-0 file:bg-info-soft file:px-3 file:py-2 file:font-semibold file:text-brand-blue" onChange={event => {
          const file = event.target.files?.[0]; if (!file) return
          setTable(null); setSheets([])
          run(async () => { const workbook = await readBeneficiaryImportFile(file); setSheets(workbook); chooseSheet(0, workbook) })
        }} /></div>
        {sheets.length > 1 && <div><label htmlFor="beneficiary-import-sheet" className="ga-label">Worksheet</label><select id="beneficiary-import-sheet" value={sheetIndex} disabled={busy} onChange={event => run(() => chooseSheet(Number(event.target.value)))} className="ga-input mt-2">{sheets.map((sheet, index) => <option key={index} value={index}>{sheet.sheet}</option>)}</select></div>}
        {table && <p className="text-sm text-copy">{table.rows.length.toLocaleString('en-US')} beneficiary rows · {table.headers.length} columns</p>}
        <button type="button" disabled={busy || !table} onClick={() => { setStep(1); setError('') }} className="ga-btn-primary">Continue to column matching</button>
      </div>}

      {step === 1 && <div className="space-y-6">
        <p className="text-sm leading-6 text-copy">Match the file columns below. Columns you do not select are ignored.</p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{BENEFICIARY_IMPORT_FIELDS.filter(([field]) => includeProgram || field !== 'programId').map(([field, label, required]) => <div key={field}><label htmlFor={`beneficiary-column-${field}`} className="ga-label">{label}{required ? ' (required)' : ''}</label><select id={`beneficiary-column-${field}`} disabled={busy} value={columns[field]} onChange={event => changeColumn(field, event.target.value)} className="ga-input mt-2"><option value="-1">{required ? 'Choose a column' : 'Not in this file'}</option>{table.headers.map((header, index) => <option key={index} value={String(index)}>{header}</option>)}</select>{Number(columns[field]) >= 0 && <p className="mt-1 break-words text-xs leading-5 text-copy">Example: {table.rows[0].values[Number(columns[field])] || '(empty)'}</p>}</div>)}</div>
        <div className="max-w-sm"><label htmlFor="beneficiary-date-format" className="ga-label">Birth date format in the file</label><select id="beneficiary-date-format" value={dateFormat} disabled={busy} onChange={event => setDateFormat(event.target.value)} className="ga-input mt-2"><option value="YMD">YYYY-MM-DD (1990-12-31)</option><option value="MDY">MM/DD/YYYY (12/31/1990)</option><option value="DMY">DD/MM/YYYY (31/12/1990)</option></select><p className="mt-2 text-xs leading-5 text-copy">Real Excel date cells are read automatically. For text dates, choose the format used in your file.</p></div>
        <fieldset className="border-t border-line pt-4"><legend className="pr-3 font-semibold">Confirm barangays</legend>{isFacilitator && <p className="mb-3 text-sm text-copy">Only your assigned barangay is available.</p>}<div className="grid gap-4 sm:grid-cols-2">{Number(columns.barangayId) < 0 ? isFacilitator ? <p className="text-sm">All records use your assigned barangay.</p> : <div><label htmlFor="beneficiary-default-barangay" className="ga-label">Barangay for all records</label><select id="beneficiary-default-barangay" value={defaultBarangay} disabled={busy} onChange={event => setDefaultBarangay(event.target.value)} className="ga-input mt-2">{barangayOptions}</select></div> : barangayValues.slice(barangayPage * 25, barangayPage * 25 + 25).map((value, index) => <div key={value}><label htmlFor={`beneficiary-map-barangay-${index}`} className="ga-label">{value || '(empty barangay)'}</label><select id={`beneficiary-map-barangay-${index}`} value={assignments[value] ?? ''} disabled={busy} onChange={event => setAssignments(current => ({ ...current, [value]: event.target.value }))} className="ga-input mt-2">{barangayOptions}</select></div>)}</div></fieldset>
        <ImportPagination page={barangayPage} total={barangayValues.length} onChange={setBarangayPage} label="Barangay mapping pages" disabled={busy} />
        {includeProgram && <fieldset className="border-t border-line pt-4"><legend className="pr-3 font-semibold">Confirm assistance programs</legend><p className="mb-3 text-sm leading-6 text-copy">Choose the matching GarantiyAid program. Imported applications need documents and review before approval.</p><div className="grid gap-4 sm:grid-cols-2">{Number(columns.programId) < 0 ? <div><label htmlFor="beneficiary-default-program" className="ga-label">Program for all records</label><select id="beneficiary-default-program" value={defaultProgram} disabled={busy} onChange={event => setDefaultProgram(event.target.value)} className="ga-input mt-2">{programOptions}</select></div> : programValues.slice(programPage * 25, programPage * 25 + 25).map((value, index) => <div key={value}><label htmlFor={`beneficiary-map-program-${index}`} className="ga-label">{value || '(empty program)'}</label><select id={`beneficiary-map-program-${index}`} value={programAssignments[value] ?? ''} disabled={busy} onChange={event => setProgramAssignments(current => ({ ...current, [value]: event.target.value }))} className="ga-input mt-2">{programOptions}</select></div>)}</div><ImportPagination page={programPage} total={programValues.length} onChange={setProgramPage} label="Program mapping pages" disabled={busy} /></fieldset>}
        <div className="flex flex-wrap gap-3"><button type="button" disabled={busy} onClick={() => { setStep(0); setError('') }} className="ga-btn-secondary">Back to file</button><button type="button" disabled={busy} onClick={() => run(() => checkRows(mapBeneficiaryImportRows(table, columns, { barangays: assignments, defaultBarangay, assignedBarangay: isFacilitator ? user.barangayId : '', dateFormat, includeProgram, programs: programAssignments, defaultProgram })))} className="ga-btn-primary">{busy ? 'Checking records…' : 'Review beneficiaries'}</button></div>
      </div>}

      {step === 2 && review && <div className="space-y-5">
        <p className="text-sm"><strong>{review.validCount.toLocaleString('en-US')} ready to import</strong> · {review.invalidCount} need correction. Nothing has been saved by this review.</p>
        {uncertain && <p role="alert" className="border-l-4 border-brand-amber bg-warning-soft p-3 text-sm leading-6">The confirmation response was lost. Retry the same confirmation to retrieve the import safely, or reopen it from Your recent imports.</p>}
        {review.invalidCount > 0 && <div className="flex flex-wrap items-center gap-4"><label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={errorsOnly} onChange={event => { setErrorsOnly(event.target.checked); setReviewPage(0) }} className="size-5" />Show rows needing correction only</label><button type="button" disabled={busy || uncertain || !review.validCount} onClick={() => run(() => { const invalid = new Set(review.rows.filter(row => row.issues.length).map(row => row.sourceRow)); return checkRows(submittedRows.filter(row => !invalid.has(row.sourceRow))) })} className="ga-btn-secondary">Exclude rows needing correction</button><button type="button" disabled={busy} onClick={() => run(() => downloadStaffCsv('beneficiary-import-corrections.csv', beneficiaryCorrectionsCsv(review.rows.filter(row => row.issues.length))))} className="ga-btn-secondary">Download corrections</button></div>}
        <ImportPagination page={reviewPage} total={visibleRows.length} onChange={setReviewPage} label="Review pages" disabled={busy || uncertain} />
        <p className="text-xs leading-5 text-copy lg:hidden">Scroll the table sideways to check the barangay, program and corrections.</p>
        <div tabIndex={0} role="region" aria-label="Beneficiary import review" className="max-h-[24rem] overflow-auto border border-line"><table className="w-full min-w-[800px] text-left text-sm"><thead className="sticky top-0 bg-slate-50"><tr>{['Row', 'Beneficiary details', 'Barangay / program', 'Review', 'Actions'].map(label => <th key={label} scope="col" className="p-3">{label}</th>)}</tr></thead><tbody className="divide-y divide-line">{visibleRows.slice(reviewPage * 25, reviewPage * 25 + 25).map(row => <tr key={row.sourceRow}><td className="p-3 align-top">{row.sourceRow}</td><td className="max-w-64 break-words p-3 align-top"><p className="font-semibold">{name(row.record) || 'Missing name'}</p><p>{row.record.birthDate?.slice(0, 10)} · {row.record.sex}</p><p className="mt-1 text-xs">{row.record.address}</p>{row.record.contactNumber && <p className="text-xs">{row.record.contactNumber}</p>}{row.record.email && <p className="text-xs">{row.record.email}</p>}</td><td className="max-w-56 p-3 align-top">{row.barangayLabel || 'Barangay required'}<p className="mt-1 text-xs">{row.programLabel || 'Record only'}</p>{row.programId && <p className="mt-1 text-xs">{applicationLabel(row.enrollmentStatus)}</p>}</td><td className="max-w-72 p-3 align-top">{row.issues.length ? <ul className="list-disc space-y-1 pl-4 text-brand-red">{row.issues.map((issue, index) => <li key={index}>{issue}</li>)}</ul> : <span className="font-semibold text-brand-green">Ready to import</span>}</td><td className="p-3 align-top"><button type="button" disabled={busy || uncertain || submittedRows.length === 1} onClick={() => run(() => checkRows(submittedRows.filter(item => item.sourceRow !== row.sourceRow)))} className="min-h-11 text-brand-blue underline" aria-label={`Exclude row ${row.sourceRow}`}>Exclude</button></td></tr>)}</tbody></table></div>
        {!review.invalidCount && <label className="flex min-h-11 items-start gap-3 text-sm leading-6"><input type="checkbox" checked={confirmed} disabled={busy || uncertain} onChange={event => setConfirmed(event.target.checked)} className="mt-1 size-5 shrink-0" />I have checked the beneficiary details, barangays and selected programs. Program applications still require review.</label>}
        <div className="flex flex-wrap gap-3"><button type="button" disabled={busy || uncertain} onClick={() => { setStep(1); setReview(null); setError('') }} className="ga-btn-secondary">Back to column matching</button><button type="button" disabled={busy || review.invalidCount > 0 || !confirmed} onClick={() => run(start)} className="ga-btn-primary">{busy ? 'Submitting import…' : uncertain ? 'Retry confirmation' : `Import ${review.validCount.toLocaleString('en-US')} beneficiaries`}</button></div>
      </div>}

      {step === 3 && job && <ImportProgress api={api} label="beneficiaries" accessToken={accessToken} initialJob={job} onResult={showResult} onSessionExpired={onSessionExpired} />}
      {step === 4 && result && <div className="space-y-5">
        <p role="status" className="font-semibold">{result.createdCount.toLocaleString('en-US')} beneficiary records created · {result.failedCount} need correction.</p>
        <p className="text-sm leading-6 text-copy">Saved results are available until {new Date(result.expiresAt).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })} PHT. The beneficiary records remain in the system.</p>
        {result.status === 'FAILED' && <div className="border-l-4 border-brand-amber bg-warning-soft p-3 text-sm"><p>{result.totalCount - result.processedCount} records remain unprocessed.</p><button type="button" disabled={busy} onClick={() => run(async () => { setJob(await api.resume(accessToken, result.importId)); setStep(3) })} className="ga-btn-secondary mt-3">Resume remaining beneficiaries</button></div>}
        {result.failures.length > 0 && <button type="button" disabled={busy} onClick={() => run(() => downloadStaffCsv('beneficiary-import-failed-rows.csv', beneficiaryCorrectionsCsv(result.failures)))} className="ga-btn-secondary">Download failed rows</button>}
        {result.beneficiaries.some(row => row.enrollment) && <div className="border-l-4 border-brand-blue bg-info-soft p-3 text-sm leading-6"><p>Program applications appear in Enrollment review. For “Needs correction”, upload the required documents and resubmit. Pending applications await an independent reviewer.</p><button type="button" onClick={() => navigate('/enrollments')} className="mt-2 min-h-11 font-semibold text-brand-blue underline">Open enrollment review</button></div>}
        <button type="button" disabled={busy || !result.beneficiaries.length} onClick={() => run(() => downloadStaffCsv('beneficiary-import-results.csv', [['Source row', 'Beneficiary ID', 'Full name', 'Barangay', 'Program', 'Application status'], ...result.beneficiaries.map(row => [row.sourceRow, row.beneficiary.beneficiaryId, name(row.beneficiary), row.barangayLabel, row.programLabel ?? '', applicationLabel(row.enrollment?.status)])]))} className="ga-btn-secondary">Download import results</button>
        <ImportPagination page={resultPage} total={result.beneficiaries.length} onChange={setResultPage} label="Result pages" />
        <div tabIndex={0} role="region" aria-label="Imported beneficiaries" className="max-h-[22rem] overflow-auto border border-line"><table className="w-full min-w-[620px] text-left text-sm"><thead className="sticky top-0 bg-slate-50"><tr>{['Beneficiary', 'Barangay', 'Program application', 'Action'].map(label => <th key={label} scope="col" className="p-3">{label}</th>)}</tr></thead><tbody className="divide-y divide-line">{result.beneficiaries.slice(resultPage * 25, resultPage * 25 + 25).map(row => <tr key={row.sourceRow}><td className="p-3">{name(row.beneficiary)}</td><td className="p-3">{row.barangayLabel}</td><td className="p-3">{row.programLabel}<p className="text-xs">{applicationLabel(row.enrollment?.status)}</p></td><td className="p-3"><button type="button" onClick={() => navigate(`/beneficiaries?beneficiary=${encodeURIComponent(row.beneficiary.beneficiaryId)}`)} className="min-h-11 text-brand-blue underline">Open record</button></td></tr>)}</tbody></table></div>
        <button type="button" onClick={close} className="ga-btn-primary">Done</button>
      </div>}
    </div>
  </dialog>
}
