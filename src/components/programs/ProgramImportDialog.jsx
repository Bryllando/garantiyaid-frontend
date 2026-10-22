import { useEffect, useRef, useState } from 'react'
import { isSessionExpiredError, previewProgramImport, startProgramImport, requestProgramImports, requestProgramImport, requestProgramImportResults, resumeProgramImport } from '../../auth/staffAuth.js'
import ImportProgress, { ImportPagination, StaffImportHistory as ImportHistory } from '../admin/StaffImportProgress.jsx'
import { downloadStaffCsv, STAFF_IMPORT_LIMIT, STAFF_IMPORT_FILE_LIMIT_MB } from '../../utils/staffImport.js'
import { PROGRAM_IMPORT_FIELDS, programTableFromSheet, readProgramImportFile, suggestProgramColumns, PROGRAM_DOCUMENT_TYPES, sourceDocumentTypes, suggestProgramDocument, mapProgramImportRows, programCorrectionsCsv } from '../../utils/programImport.js'

const api = { list: requestProgramImports, status: requestProgramImport, results: requestProgramImportResults, resume: resumeProgramImport }
const steps = ['Choose file', 'Match columns', 'Review records', 'Processing', 'Results']
const documentLabel = value => value.replaceAll('_', ' ').toLowerCase()

export default function ProgramImportDialog({ accessToken, onClose, onImported, onSessionExpired, onOpenProgram }) {
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
  const [documents, setDocuments] = useState({})
  const [documentPage, setDocumentPage] = useState(0)
  const [dateFormat, setDateFormat] = useState('YMD')
  const [submittedRows, setSubmittedRows] = useState([])
  const [review, setReview] = useState(null)
  const [confirmed, setConfirmed] = useState(false)
  const [uncertain, setUncertain] = useState(false)
  const [job, setJob] = useState(null)
  const [result, setResult] = useState(null)
  const [reviewPage, setReviewPage] = useState(0)
  const [resultPage, setResultPage] = useState(0)
  const [errorsOnly, setErrorsOnly] = useState(false)

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
    if (workbook[index].tooLarge) throw new Error('Choose a worksheet with up to 5,000 programs and no more than 100,000 physical rows.')
    const next = programTableFromSheet(workbook[index].data)
    const mapping = suggestProgramColumns(next.headers)
    setTable(next); setColumns(mapping); setDateFormat('YMD')
    matchDocuments(next, mapping.requiredDocumentTypes)
  }
  function matchDocuments(next, column) {
    setDocumentPage(0)
    setDocuments(Object.fromEntries(sourceDocumentTypes(next, column).map(value => [value, suggestProgramDocument(value)])))
  }
  function changeColumn(field, value) {
    setColumns(current => ({ ...current, [field]: value }))
    if (field === 'requiredDocumentTypes') matchDocuments(table, value)
  }

  async function checkRows(rows) {
    const checked = await previewProgramImport(accessToken, rows)
    setSubmittedRows(rows); setReview(checked); setConfirmed(false); setUncertain(false); setReviewPage(0); setErrorsOnly(false); setStep(2)
  }
  async function start() {
    try { setJob(await startProgramImport(accessToken, submittedRows, review.approvalId)); setUncertain(false); setStep(3) }
    catch (error) { setUncertain(!error.status || error.status >= 500 || error.code === 'PROGRAM_IMPORT_CONCURRENT'); throw error }
  }
  function showResult(completed) { setResult(completed); setResultPage(0); setStep(4); onImported() }
  function openDraft(program) { close(); onOpenProgram(program) }
  const visibleRows = review?.rows.filter(row => !errorsOnly || row.issues.length) ?? []
  const documentValues = table ? sourceDocumentTypes(table, columns.requiredDocumentTypes) : []

  return <dialog ref={dialogRef} onClose={onClose} onCancel={event => { event.preventDefault(); close() }} aria-labelledby="program-import-title" aria-describedby="program-import-description" className="m-auto max-h-[calc(100dvh-2rem)] w-[min(68rem,calc(100%-2rem))] overflow-y-auto rounded border border-line bg-white p-0 text-ink backdrop:bg-slate-950/55">
    <header className="flex items-start justify-between gap-4 border-b border-line p-5 sm:px-7">
      <div><p className="text-sm text-copy">Assistance programs · {steps[step]}</p><h2 id="program-import-title" ref={headingRef} tabIndex={-1} className="mt-1 text-2xl font-semibold outline-none">{step === 4 ? 'Program import results' : 'Import programs'}</h2><p id="program-import-description" className="mt-2 text-sm leading-6 text-copy">Create draft programs from an existing list. Existing programs will not be updated.</p></div>
      <button type="button" disabled={busy} onClick={close} aria-label="Close program import" className="grid size-11 shrink-0 place-items-center rounded border border-line text-xl hover:bg-slate-50">×</button>
    </header>
    <div className="space-y-5 p-5 sm:p-7">
      <ol aria-label="Import steps" className="flex flex-wrap gap-x-6 gap-y-2 border-b border-line pb-4 text-sm">{steps.map((label, index) => <li key={label} aria-current={step === index ? 'step' : undefined} className={step === index ? 'font-semibold text-brand-blue' : 'text-copy'}>{index + 1}. {label}</li>)}</ol>
      {error && <p ref={errorRef} tabIndex={-1} role="alert" className="border-l-4 border-brand-red bg-danger-soft p-3 text-sm leading-6 text-brand-red">{error}</p>}
      <div role="status" className="sr-only">{busy ? 'Checking program import. Please wait.' : ''}</div>

      {step === 0 && <div className="max-w-3xl space-y-5">
        <ImportHistory accessToken={accessToken} api={api} label="programs" disabled={busy} onSessionExpired={onSessionExpired} onOpen={existing => { setJob(existing); setStep(3); setError('') }} />
        <p className="text-sm leading-6 text-copy">CSV (.csv) or Excel (.xlsx), up to {STAFF_IMPORT_FILE_LIMIT_MB} MB and {STAFF_IMPORT_LIMIT.toLocaleString('en-US')} programs per worksheet. Use column headings in the first row.</p>
        <div className="border-y border-line py-4 text-sm leading-6"><p><strong>Required:</strong> Program name, unique program code and program type.</p><p className="mt-1">You may also include descriptions, grant and budget amounts, application dates and required documents. Separate document names with semicolons.</p><p className="mt-1"><strong>All imported programs are saved as Draft.</strong> Review each draft and add eligibility rules before activation. Beneficiaries, approvals, payments and eligibility rules from the old system are not imported here.</p></div>
        <button type="button" disabled={busy} onClick={() => run(() => downloadStaffCsv('garantiyaid-program-template.csv', [PROGRAM_IMPORT_FIELDS.map(([, label]) => label)]))} className="min-h-11 text-sm font-semibold text-brand-blue underline underline-offset-4">Download CSV template</button>
        <div><label htmlFor="program-import-file" className="ga-label">Program list file</label><input id="program-import-file" type="file" accept=".csv,.xlsx" disabled={busy} className="ga-input mt-2 py-2 file:mr-3 file:rounded file:border-0 file:bg-info-soft file:px-3 file:py-2 file:font-semibold file:text-brand-blue" onChange={event => {
          const file = event.target.files?.[0]; if (!file) return
          setTable(null); setSheets([])
          run(async () => { const workbook = await readProgramImportFile(file); setSheets(workbook); chooseSheet(0, workbook) })
        }} /></div>
        {sheets.length > 1 && <div><label htmlFor="program-import-sheet" className="ga-label">Worksheet</label><select id="program-import-sheet" value={sheetIndex} disabled={busy} onChange={event => run(() => chooseSheet(Number(event.target.value)))} className="ga-input mt-2">{sheets.map((sheet, index) => <option key={index} value={index}>{sheet.sheet}</option>)}</select></div>}
        {table && <p className="text-sm text-copy">{table.rows.length.toLocaleString('en-US')} program rows · {table.headers.length} columns</p>}
        <button type="button" disabled={busy || !table} onClick={() => { setStep(1); setError('') }} className="ga-btn-primary">Continue to column matching</button>
      </div>}

      {step === 1 && <div className="space-y-6">
        <p className="text-sm leading-6 text-copy">Match the file columns below. Columns you do not select are ignored.</p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{PROGRAM_IMPORT_FIELDS.map(([field, label, required]) => <div key={field}><label htmlFor={`program-column-${field}`} className="ga-label">{label}{required ? ' (required)' : ''}</label><select id={`program-column-${field}`} disabled={busy} value={columns[field]} onChange={event => changeColumn(field, event.target.value)} className="ga-input mt-2"><option value="-1">{required ? 'Choose a column' : 'Not in this file'}</option>{table.headers.map((header, index) => <option key={index} value={String(index)}>{header}</option>)}</select>{Number(columns[field]) >= 0 && <p className="mt-1 break-words text-xs leading-5 text-copy">Example: {table.rows[0].values[Number(columns[field])] || '(empty)'}</p>}</div>)}</div>
        <div className="max-w-sm"><label htmlFor="program-date-format" className="ga-label">Application date format in the file</label><select id="program-date-format" value={dateFormat} disabled={busy} onChange={event => setDateFormat(event.target.value)} className="ga-input mt-2"><option value="YMD">YYYY-MM-DD (2026-12-31)</option><option value="MDY">MM/DD/YYYY (12/31/2026)</option><option value="DMY">DD/MM/YYYY (31/12/2026)</option></select><p className="mt-2 text-xs leading-5 text-copy">Real Excel date cells are read automatically. For text dates, choose the format used in your file.</p></div>
        <p className="text-sm leading-6 text-copy">Amounts are in Philippine pesos. Use up to two decimal places, for example 1,500.00. Program types are converted to uppercase with underscores, for example CASH_ASSISTANCE.</p>
        {documentValues.length > 0 && <fieldset className="border-t border-line pt-4"><legend className="pr-3 font-semibold">Match required documents</legend><p className="mb-3 text-sm leading-6 text-copy">Confirm the document type for each name in your file. Unmatched requirements must be corrected before import.</p><div className="grid gap-4 sm:grid-cols-2">{documentValues.slice(documentPage * 25, documentPage * 25 + 25).map((value, index) => <div key={value}><label htmlFor={`program-map-document-${index}`} className="ga-label">{value}</label><select id={`program-map-document-${index}`} value={documents[value] ?? ''} disabled={busy} onChange={event => setDocuments(current => ({ ...current, [value]: event.target.value }))} className="ga-input mt-2"><option value="">Choose document type</option>{PROGRAM_DOCUMENT_TYPES.map(type => <option key={type} value={type}>{documentLabel(type)}</option>)}</select></div>)}</div><ImportPagination page={documentPage} total={documentValues.length} onChange={setDocumentPage} label="Document mapping pages" disabled={busy} /></fieldset>}
        <div className="flex flex-wrap gap-3"><button type="button" disabled={busy} onClick={() => { setStep(0); setError('') }} className="ga-btn-secondary">Back to file</button><button type="button" disabled={busy} onClick={() => run(() => checkRows(mapProgramImportRows(table, columns, { dateFormat, documents })))} className="ga-btn-primary">{busy ? 'Checking programs...' : 'Review programs'}</button></div>

      </div>}

      {step === 2 && review && <div className="space-y-5">
        <p className="text-sm"><strong>{review.validCount.toLocaleString('en-US')} ready to import</strong> · {review.invalidCount} need correction. Nothing has been saved by this review.</p>
        {uncertain && <p role="alert" className="border-l-4 border-brand-amber bg-warning-soft p-3 text-sm leading-6">The confirmation response was lost. Retry the same confirmation to retrieve the import safely, or reopen it from Your recent imports.</p>}
        {review.invalidCount > 0 && <div className="flex flex-wrap items-center gap-4"><label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={errorsOnly} onChange={event => { setErrorsOnly(event.target.checked); setReviewPage(0) }} className="size-5" />Show rows needing correction only</label><button type="button" disabled={busy || uncertain || !review.validCount} onClick={() => run(() => { const invalid = new Set(review.rows.filter(row => row.issues.length).map(row => row.sourceRow)); return checkRows(submittedRows.filter(row => !invalid.has(row.sourceRow))) })} className="ga-btn-secondary">Exclude rows needing correction</button><button type="button" disabled={busy} onClick={() => run(() => downloadStaffCsv('program-import-corrections.csv', programCorrectionsCsv(review.rows.filter(row => row.issues.length))))} className="ga-btn-secondary">Download corrections</button></div>}
        <ImportPagination page={reviewPage} total={visibleRows.length} onChange={setReviewPage} label="Review pages" disabled={busy || uncertain} />
        <p className="text-xs leading-5 text-copy lg:hidden">Scroll the table sideways to check amounts, requirements and corrections.</p>
        <div tabIndex={0} role="region" aria-label="Program import review" className="max-h-[24rem] overflow-auto border border-line"><table className="w-full min-w-[840px] text-left text-sm"><thead className="sticky top-0 bg-slate-50"><tr>{['Row', 'Program details', 'Amounts / requirements', 'Review', 'Actions'].map(label => <th key={label} scope="col" className="p-3">{label}</th>)}</tr></thead><tbody className="divide-y divide-line">{visibleRows.slice(reviewPage * 25, reviewPage * 25 + 25).map(row => <tr key={row.sourceRow}><td className="p-3 align-top">{row.sourceRow}</td><td className="max-w-64 break-words p-3 align-top"><p className="font-semibold">{row.record.programName || 'Missing name'}</p><p>{row.record.programCode} · {row.record.programType}</p><p className="mt-1 text-xs">Start: {row.record.applicationStartDate?.slice(0, 10) || 'Not set'}</p><p className="text-xs">End: {row.record.applicationEndDate?.slice(0, 10) || 'Not set'}</p>{row.record.description && <details className="mt-2"><summary className="min-h-11 cursor-pointer text-brand-blue">Description</summary><p className="whitespace-pre-wrap text-xs leading-5">{row.record.description}</p></details>}</td><td className="max-w-56 p-3 align-top"><p>Grant: {row.record.grantAmount == null || row.record.grantAmount === '' ? 'Not set' : `PHP ${row.record.grantAmount}`}</p><p>Budget: {row.record.budgetAmount == null || row.record.budgetAmount === '' ? 'Not set' : `PHP ${row.record.budgetAmount}`}</p><p className="mt-2 text-xs">{row.record.requiredDocumentTypes?.length ? row.record.requiredDocumentTypes.map(documentLabel).join(', ') : 'No required documents set'}</p></td><td className="max-w-72 p-3 align-top">{row.issues.length ? <ul className="list-disc space-y-1 pl-4 text-brand-red">{row.issues.map((issue, index) => <li key={index}>{issue}</li>)}</ul> : <><span className="font-semibold text-brand-green">Ready to save as Draft</span><p className="mt-1 text-xs text-copy">Add eligibility rules after import.</p></>}</td><td className="p-3 align-top"><button type="button" disabled={busy || uncertain || submittedRows.length === 1} onClick={() => run(() => checkRows(submittedRows.filter(item => item.sourceRow !== row.sourceRow)))} className="min-h-11 text-brand-blue underline" aria-label={`Exclude row ${row.sourceRow}`}>Exclude</button></td></tr>)}</tbody></table></div>
        {!review.invalidCount && <label className="flex min-h-11 items-start gap-3 text-sm leading-6"><input type="checkbox" checked={confirmed} disabled={busy || uncertain} onChange={event => setConfirmed(event.target.checked)} className="mt-1 size-5 shrink-0" />I have checked these programs. They will be saved as Draft and require eligibility rules and review before activation.</label>}

        <div className="flex flex-wrap gap-3"><button type="button" disabled={busy || uncertain} onClick={() => { setStep(1); setReview(null); setError('') }} className="ga-btn-secondary">Back to column matching</button><button type="button" disabled={busy || review.invalidCount > 0 || !confirmed} onClick={() => run(start)} className="ga-btn-primary">{busy ? 'Submitting import…' : uncertain ? 'Retry confirmation' : `Import ${review.validCount.toLocaleString('en-US')} programs`}</button></div>
      </div>}

      {step === 3 && job && <ImportProgress api={api} label="programs" accessToken={accessToken} initialJob={job} onResult={showResult} onSessionExpired={onSessionExpired} />}
      {step === 4 && result && <div className="space-y-5">
        <p role="status" className="font-semibold">{result.createdCount.toLocaleString('en-US')} draft programs created · {result.failedCount} need correction.</p>
        <p className="text-sm leading-6 text-copy">Saved results are available until {new Date(result.expiresAt).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })} PHT. The programs remain in the system.</p>
        {result.status === 'FAILED' && <div className="border-l-4 border-brand-amber bg-warning-soft p-3 text-sm"><p>{result.totalCount - result.processedCount} records remain unprocessed.</p><button type="button" disabled={busy} onClick={() => run(async () => { setJob(await api.resume(accessToken, result.importId)); setStep(3) })} className="ga-btn-secondary mt-3">Resume remaining programs</button></div>}
        {result.failures.length > 0 && <button type="button" disabled={busy} onClick={() => run(() => downloadStaffCsv('program-import-failed-rows.csv', programCorrectionsCsv(result.failures)))} className="ga-btn-secondary">Download failed rows</button>}
        <p className="border-l-4 border-brand-blue bg-info-soft p-3 text-sm leading-6">Next: open each draft, check its details and required documents, then add eligibility rules. Activate the program only after review.</p>
        <button type="button" disabled={busy || !result.programs.length} onClick={() => run(() => downloadStaffCsv('program-import-results.csv', [['Source row', 'Program ID', 'Program code', 'Program name', 'Status at import'], ...result.programs.map(row => [row.sourceRow, row.program.programId, row.program.programCode, row.program.programName, row.program.status])]))} className="ga-btn-secondary">Download import results</button>
        <ImportPagination page={resultPage} total={result.programs.length} onChange={setResultPage} label="Result pages" />
        <div tabIndex={0} role="region" aria-label="Imported programs" className="max-h-[22rem] overflow-auto border border-line"><table className="w-full min-w-[620px] text-left text-sm"><thead className="sticky top-0 bg-slate-50"><tr>{['Program', 'Code', 'Status at import', 'Action'].map(label => <th key={label} scope="col" className="p-3">{label}</th>)}</tr></thead><tbody className="divide-y divide-line">{result.programs.slice(resultPage * 25, resultPage * 25 + 25).map(row => <tr key={row.sourceRow}><td className="p-3">{row.program.programName}</td><td className="p-3">{row.program.programCode}</td><td className="p-3">Draft</td><td className="p-3"><button type="button" onClick={() => openDraft(row.program)} className="min-h-11 text-brand-blue underline">Open program</button></td></tr>)}</tbody></table></div>
        <button type="button" onClick={close} className="ga-btn-primary">Done</button>
      </div>}
    </div>
  </dialog>
}
