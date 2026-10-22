import { useEffect, useRef, useState } from 'react'
import { startStaffImport, resumeStaffImport, isSessionExpiredError, previewStaffImport, STAFF_ROLE_LABELS } from '../../auth/staffAuth.js'
import { LoadingLabel } from '../ui/spinner.jsx'
import StaffImportProgress, { ImportPagination, StaffImportHistory } from './StaffImportProgress.jsx'
import { columnValues, downloadStaffCsv, mapStaffImportRows, readStaffImportFile, STAFF_IMPORT_FIELDS, STAFF_IMPORT_LIMIT, STAFF_IMPORT_FILE_LIMIT_MB, suggestStaffBarangay, suggestStaffColumns, suggestStaffRole, tableFromSheet } from '../../utils/staffImport.js'

const roleOptions = <><option value="">Choose a role</option><option value="DSWD_STAFF">DSWD Staff</option><option value="BARANGAY_FACILITATOR">Barangay Facilitator</option></>
const steps = ['Choose file', 'Match columns', 'Review accounts', 'Processing', 'Results']

export default function StaffImportDialog({ accessToken, barangays, onClose, onImported, onSessionExpired }) {
  const dialogRef = useRef(null)
  const headingRef = useRef(null)
  const savedRef = useRef(null)
  const busyRef = useRef(false)
  const [step, setStep] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [fileName, setFileName] = useState('')
  const [sheets, setSheets] = useState([])
  const [sheetIndex, setSheetIndex] = useState(0)
  const [table, setTable] = useState(null)
  const [columns, setColumns] = useState({})
  const [roles, setRoles] = useState({})
  const [assignments, setAssignments] = useState({})
  const [defaultRole, setDefaultRole] = useState('')
  const [defaultBarangay, setDefaultBarangay] = useState('')
  const [submittedRows, setSubmittedRows] = useState([])
  const [review, setReview] = useState(null)
  const [confirmed, setConfirmed] = useState(false)
  const [uncertain, setUncertain] = useState(false)
  const [result, setResult] = useState(null)
  const [credentialsSaved, setCredentialsSaved] = useState(false)
  const [showPasswords, setShowPasswords] = useState(false)
  const [job, setJob] = useState(null)
  const [reviewPage, setReviewPage] = useState(0)
  const [resultPage, setResultPage] = useState(0)
  const [rolePage, setRolePage] = useState(0)
  const [barangayPage, setBarangayPage] = useState(0)
  const [errorsOnly, setErrorsOnly] = useState(false)

  useEffect(() => { dialogRef.current?.showModal() }, [])
  useEffect(() => { headingRef.current?.focus() }, [step])
  useEffect(() => {
    if (!busy && !uncertain && (!result?.accounts.length || credentialsSaved)) return undefined
    const warn = event => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [busy, uncertain, result, credentialsSaved])

  function requestClose() {
    if (busyRef.current) return
    if (result?.accounts.length && !credentialsSaved) {
      setError('Save the credentials and confirm below before closing. They are not saved in your browser.')
      savedRef.current?.focus()
      return
    }
    dialogRef.current?.close()
  }

  async function run(action) {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    setError('')
    try { await action() } catch (requestError) {
      if (isSessionExpiredError(requestError)) onSessionExpired()
      else setError(requestError.message || 'The request could not be completed.')
    } finally { busyRef.current = false; setBusy(false) }
  }

  function chooseSheet(index, workbook = sheets) {
    setSheetIndex(index)
    setTable(null)
    setReview(null)
    const selected = workbook[index]
    if (selected.tooLarge) throw new Error(`Choose a worksheet with up to ${STAFF_IMPORT_LIMIT.toLocaleString('en-US')} staff and no more than 100,000 physical rows.`)
    const nextTable = tableFromSheet(selected.data)
    const nextColumns = suggestStaffColumns(nextTable.headers)
    setTable(nextTable)
    setColumns(nextColumns)
    setRoles(Object.fromEntries(columnValues(nextTable, nextColumns.role).map(value => [value, suggestStaffRole(value)])))
    setAssignments(Object.fromEntries(columnValues(nextTable, nextColumns.barangayId).map(value => [value, suggestStaffBarangay(value, barangays)])))
    setDefaultRole('')
    setDefaultBarangay('')
    setRolePage(0); setBarangayPage(0)
  }

  function changeColumn(field, value) {
    setColumns(current => ({ ...current, [field]: value }))
    setRolePage(0); setBarangayPage(0)
    if (field === 'role') setRoles(Object.fromEntries(columnValues(table, value).map(source => [source, suggestStaffRole(source)])))
    if (field === 'barangayId') setAssignments(Object.fromEntries(columnValues(table, value).map(source => [source, suggestStaffBarangay(source, barangays)])))
  }

  async function reviewRows(rows) {
    const checked = await previewStaffImport(accessToken, rows)
    setSubmittedRows(rows)
    setReview(checked)
    setConfirmed(false)
    setUncertain(false)
    setReviewPage(0)
    setErrorsOnly(false)
    setStep(2)
    headingRef.current?.focus()
  }

  async function createAccounts() {
    try {
      const started = await startStaffImport(accessToken, submittedRows, review.approvalId)
      setJob(started)
      setUncertain(false)
      setStep(3)
    } catch (requestError) {
      // Preserve the exact approval and rows when the response may have been lost.
      setUncertain(!requestError.status || requestError.status >= 500 || requestError.code === 'STAFF_IMPORT_CONCURRENT')
      throw requestError
    }
  }

  function showResult(completed) {
    setResult(completed)
    setCredentialsSaved(false)
    setResultPage(0)
    setStep(4)
    onImported()
  }

  const hasFacilitators = defaultRole === 'BARANGAY_FACILITATOR' || Object.values(roles).includes('BARANGAY_FACILITATOR')
  const facilitatorRows = table?.rows.filter(row => (Number(columns.role) < 0 ? defaultRole : roles[row.values[Number(columns.role)] ?? '']) === 'BARANGAY_FACILITATOR') ?? []
  const reviewRowsShown = review?.rows.filter(row => !errorsOnly || row.issues.length) ?? []
  const roleValues = table ? columnValues(table, columns.role) : []
  const barangayValues = columnValues({ rows: facilitatorRows }, columns.barangayId)
  const barangayOptions = <><option value="">Choose an active barangay</option>{barangays.map(barangay => <option key={barangay.barangayId} value={barangay.barangayId}>{barangay.barangayName}, {barangay.city}{barangay.barangayCode ? ` · ${barangay.barangayCode}` : ''}</option>)}</>

  return <dialog ref={dialogRef} onClose={onClose} onCancel={event => { event.preventDefault(); requestClose() }} aria-labelledby="staff-import-title" aria-describedby="staff-import-description" className="m-auto max-h-[calc(100dvh-2rem)] w-[min(64rem,calc(100%-2rem))] overflow-y-auto rounded border border-line bg-white p-0 text-ink backdrop:bg-slate-950/55">
    <header className="flex items-start justify-between gap-4 border-b border-line p-5 sm:px-7">
      <div><p className="text-sm text-copy">Staff accounts · {steps[step]}</p><h2 ref={headingRef} tabIndex={-1} id="staff-import-title" className="mt-1 text-2xl font-semibold outline-none">{step === 4 ? 'Staff import results' : 'Import staff'}</h2><p id="staff-import-description" className="mt-2 text-sm leading-6 text-copy">{step === 4 ? 'Save the sign-in credentials and give each staff member their own details privately.' : 'Create accounts from an existing staff list. Existing accounts will not be updated.'}</p></div>
      <button type="button" disabled={busy} onClick={requestClose} aria-label="Close staff import" className="grid size-11 shrink-0 place-items-center rounded border border-line text-xl hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-brand-blue">×</button>
    </header>
    <div className="p-5 sm:p-7">
      <ol aria-label="Import progress" className="mb-6 flex flex-wrap gap-x-6 gap-y-2 border-b border-line pb-4 text-sm">{steps.map((label, index) => <li key={label} aria-current={index === step ? 'step' : undefined} className={index === step ? 'font-semibold text-brand-blue' : 'text-copy'}>{index + 1}. {label}</li>)}</ol>
      {error && <p role="alert" className="mb-5 border-l-4 border-brand-red bg-danger-soft p-3 text-sm leading-6 text-brand-red">{error}</p>}
      <div role="status" className="sr-only">{busy ? 'Processing staff import. Please wait.' : ''}</div>

      {step === 0 && <div className="max-w-2xl space-y-5">
        <StaffImportHistory accessToken={accessToken} disabled={busy} onSessionExpired={onSessionExpired} onOpen={existing => { setJob(existing); setStep(3); setError('') }} />
        <p className="text-sm leading-6 text-copy">Use a CSV (.csv) or Excel (.xlsx) file up to {STAFF_IMPORT_FILE_LIMIT_MB} MB, with up to {STAFF_IMPORT_LIMIT.toLocaleString('en-US')} staff in the selected worksheet. Put column headings in the first row.</p>
        <div className="border-y border-line py-4 text-sm leading-6"><p><strong>Required:</strong> Full name, email and a GarantiyAid role.</p><p className="mt-1">Barangay Facilitators also need a username and an active barangay assignment. You can match role and barangay names in the next step.</p><p className="mt-1">Staff IDs and temporary passwords are generated here. Do not include passwords from the other system.</p></div>
        <button type="button" disabled={busy} onClick={() => run(() => downloadStaffCsv('garantiyaid-staff-template.csv', [STAFF_IMPORT_FIELDS.map(([, label]) => label)]))} className="min-h-11 text-sm font-semibold text-brand-blue underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-brand-blue">Download CSV template</button>
        <div><label htmlFor="staff-import-file" className="ga-label">Staff list file</label><input id="staff-import-file" type="file" accept=".csv,.xlsx" disabled={busy} className="ga-input mt-2 py-2 file:mr-3 file:rounded file:border-0 file:bg-info-soft file:px-3 file:py-2 file:font-semibold file:text-brand-blue" onChange={event => {
          const file = event.target.files?.[0]
          if (!file) return
          setTable(null); setSheets([]); setFileName(file.name)
          run(async () => { const workbook = await readStaffImportFile(file); setSheets(workbook); chooseSheet(0, workbook) })
        }} /></div>
        {sheets.length > 1 && <div><label htmlFor="staff-import-sheet" className="ga-label">Worksheet</label><select id="staff-import-sheet" value={sheetIndex} disabled={busy} onChange={event => run(() => chooseSheet(Number(event.target.value)))} className="ga-input mt-2">{sheets.map((sheet, index) => <option key={index} value={index}>{sheet.sheet}</option>)}</select></div>}
        {table && <p className="text-sm text-copy">{fileName} · {table.rows.length} staff {table.rows.length === 1 ? 'row' : 'rows'} · {table.headers.length} columns</p>}
        <button type="button" disabled={busy || !table} onClick={() => { setError(''); setStep(1) }} className="ga-btn-primary">Continue to column matching</button>
      </div>}

      {step === 1 && <div className="space-y-6">
        <p className="text-sm text-copy">Match the file’s columns to the staff information below. Unmapped columns are ignored.</p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{STAFF_IMPORT_FIELDS.map(([field, label, required]) => <div key={field}><label htmlFor={`import-column-${field}`} className="ga-label">{label}{required ? ' (required)' : ''}</label><select id={`import-column-${field}`} value={columns[field]} disabled={busy} onChange={event => changeColumn(field, event.target.value)} className="ga-input mt-2"><option value="-1">{required ? 'Choose a column' : 'Not in this file'}</option>{table.headers.map((header, index) => <option key={index} value={String(index)}>{header}</option>)}</select>{Number(columns[field]) >= 0 && <p className="mt-1 break-words text-xs leading-5 text-copy">Example: {table.rows[0].values[Number(columns[field])] || '(empty)'}</p>}</div>)}</div>
        <fieldset className="border-t border-line pt-4"><legend className="pr-3 font-semibold">Confirm staff roles</legend><p className="mb-3 text-sm leading-6 text-copy">Choose the access each role in the file should receive. System Administrator accounts cannot be imported.</p><div className="grid gap-4 sm:grid-cols-2">{Number(columns.role) < 0 ? <div><label htmlFor="import-default-role" className="ga-label">Role for all staff in this file</label><select id="import-default-role" value={defaultRole} disabled={busy} onChange={event => setDefaultRole(event.target.value)} className="ga-input mt-2">{roleOptions}</select></div> : roleValues.slice(rolePage * 25, rolePage * 25 + 25).map((value, index) => <div key={value}><label htmlFor={`import-role-${index}`} className="ga-label">{value || '(empty role)'}</label><select id={`import-role-${index}`} value={roles[value] ?? ''} disabled={busy} onChange={event => setRoles(current => ({ ...current, [value]: event.target.value }))} className="ga-input mt-2">{roleOptions}</select></div>)}</div></fieldset>
        <ImportPagination page={rolePage} total={roleValues.length} onChange={setRolePage} label="Role mapping pages" disabled={busy} />
        {hasFacilitators && <fieldset className="border-t border-line pt-4"><legend className="pr-3 font-semibold">Confirm barangay assignments</legend><p className="mb-3 text-sm leading-6 text-copy">Assignments apply to Barangay Facilitators only. Check the city or municipality when barangays share a name.</p><div className="grid gap-4 sm:grid-cols-2">{Number(columns.barangayId) < 0 ? <div><label htmlFor="import-default-barangay" className="ga-label">Barangay for all facilitators</label><select id="import-default-barangay" value={defaultBarangay} disabled={busy} onChange={event => setDefaultBarangay(event.target.value)} className="ga-input mt-2">{barangayOptions}</select></div> : barangayValues.slice(barangayPage * 25, barangayPage * 25 + 25).map((value, index) => <div key={value}><label htmlFor={`import-barangay-${index}`} className="ga-label">{value || '(empty barangay)'}</label><select id={`import-barangay-${index}`} value={assignments[value] ?? ''} disabled={busy} onChange={event => setAssignments(current => ({ ...current, [value]: event.target.value }))} className="ga-input mt-2">{barangayOptions}</select></div>)}</div></fieldset>}
        {hasFacilitators && <ImportPagination page={barangayPage} total={barangayValues.length} onChange={setBarangayPage} label="Barangay mapping pages" disabled={busy} />}
        <div className="flex flex-wrap gap-3"><button type="button" disabled={busy} onClick={() => { setStep(0); setError('') }} className="ga-btn-secondary">Back to file</button><button type="button" disabled={busy} onClick={() => run(() => reviewRows(mapStaffImportRows(table, columns, { roles, barangays: assignments, defaultRole, defaultBarangay })))} className="ga-btn-primary">{busy ? <LoadingLabel>Checking records...</LoadingLabel> : 'Review staff accounts'}</button></div>
      </div>}

      {step === 2 && review && <div className="space-y-5">
        <p className="text-sm leading-6"><strong>{review.validCount} ready to create</strong> · {review.invalidCount} need correction. No accounts have been created by this review.</p>
        {review.invalidCount > 0 && <p className="border-l-4 border-brand-amber bg-warning-soft p-3 text-sm leading-6">Correct the file or column choices, then review again. You may also exclude individual rows below. Only the remaining reviewed rows will be imported.</p>}
        {review.invalidCount > 0 && <div className="flex flex-wrap items-center gap-4"><label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={errorsOnly} onChange={event => { setErrorsOnly(event.target.checked); setReviewPage(0) }} className="size-5 accent-brand-blue" />Show rows needing correction only</label><button type="button" disabled={busy || uncertain || !review.validCount} className="ga-btn-secondary" onClick={() => run(() => { const invalid = new Set(review.rows.filter(row => row.issues.length).map(row => row.sourceRow)); setErrorsOnly(false); return reviewRows(submittedRows.filter(row => !invalid.has(row.sourceRow))) })}>Exclude {review.invalidCount} {review.invalidCount === 1 ? 'row' : 'rows'} needing correction</button></div>}
        <ImportPagination page={reviewPage} total={reviewRowsShown.length} onChange={setReviewPage} label="Review pages" disabled={busy || uncertain} />
        {uncertain && <p role="alert" className="border-l-4 border-brand-amber bg-warning-soft p-3 text-sm leading-6">The result could not be confirmed. Retry this same confirmation to retrieve the result without creating duplicate accounts. If you leave, check the staff list before starting another import.</p>}
        <p className="text-xs text-copy lg:hidden">Scroll the table sideways to check roles, barangays and any errors.</p>
        <div className="max-h-[22rem] overflow-auto rounded border border-line" tabIndex={0} role="region" aria-label="Staff import review"><table className="w-full min-w-[780px] text-left text-sm"><thead className="sticky top-0 bg-slate-50"><tr>{['Row', 'Staff member', 'Role and assignment', 'Review', ''].map((label, index) => <th key={index} scope="col" className="p-3 font-semibold">{label || <span className="sr-only">Actions</span>}</th>)}</tr></thead><tbody className="divide-y divide-line">{reviewRowsShown.slice(reviewPage * 25, reviewPage * 25 + 25).map(row => <tr key={row.sourceRow}><td className="p-3 align-top">{row.sourceRow}</td><td className="max-w-64 break-words p-3 align-top"><p className="font-semibold">{row.record.fullName || 'Missing name'}</p><p>{row.record.email || 'Missing email'}</p>{row.record.username && <p className="text-xs">Username: {row.record.username}</p>}{row.record.contactNumber && <p className="text-xs">{row.record.contactNumber}</p>}</td><td className="max-w-52 p-3 align-top">{STAFF_ROLE_LABELS[row.record.role] || 'Choose a role'}<p className="mt-1 text-xs">{row.barangayLabel || (row.record.role === 'BARANGAY_FACILITATOR' ? 'Barangay required' : 'No barangay assignment')}</p></td><td className="max-w-72 p-3 align-top">{row.issues.length ? <ul className="list-disc space-y-1 pl-4 text-brand-red">{row.issues.map((issue, index) => <li key={index}>{issue}</li>)}</ul> : <span className="font-semibold text-brand-green">Ready</span>}</td><td className="p-3 align-top"><button type="button" disabled={busy || uncertain || submittedRows.length === 1} onClick={() => run(() => reviewRows(submittedRows.filter(item => item.sourceRow !== row.sourceRow)))} className="min-h-11 text-brand-blue underline underline-offset-4" aria-label={`Exclude row ${row.sourceRow}`}>Exclude</button></td></tr>)}</tbody></table></div>
        {!review.invalidCount && <><p className="text-sm leading-6 text-copy">These will be active staff accounts with new GarantiyAid Staff IDs and individual temporary passwords. Staff must change the password and set up an authenticator at first sign-in.</p><label className="flex min-h-11 items-start gap-3 text-sm leading-6"><input type="checkbox" checked={confirmed} disabled={busy || uncertain} onChange={event => setConfirmed(event.target.checked)} className="mt-1 size-5 shrink-0 accent-brand-blue" />I have checked the staff details, roles and barangay assignments.</label></>}
        <div className="flex flex-wrap gap-3"><button type="button" disabled={busy || uncertain} onClick={() => { setStep(1); setError(''); setReview(null) }} className="ga-btn-secondary">Back to column matching</button>{!uncertain && review.invalidCount > 0 && <button type="button" disabled={busy} onClick={() => run(() => downloadStaffCsv('staff-import-corrections.csv', [['Source row', 'Full name', 'Email', 'Role', 'Username', 'Contact number', 'Barangay', 'Corrections'], ...review.rows.filter(row => row.issues.length).map(row => [row.sourceRow, row.record.fullName, row.record.email, STAFF_ROLE_LABELS[row.record.role] ?? '', row.record.username ?? '', row.record.contactNumber ?? '', row.barangayLabel ?? '', row.issues.join(' ')])]))} className="ga-btn-secondary">Download corrections</button>}<button type="button" disabled={busy || review.invalidCount > 0 || !confirmed} onClick={() => run(createAccounts)} className="ga-btn-primary">{busy ? <LoadingLabel>Submitting import...</LoadingLabel> : uncertain ? 'Retry confirmation' : `Import ${review.validCount.toLocaleString('en-US')} staff ${review.validCount === 1 ? 'account' : 'accounts'}`}</button></div>
      </div>}

      {step === 3 && job && <StaffImportProgress accessToken={accessToken} initialJob={job} onResult={showResult} onSessionExpired={onSessionExpired} />}

      {step === 4 && result && <div className="space-y-5">
        <p className="text-sm leading-6 text-copy">Saved results are available until {new Date(result.expiresAt).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })} PHT. Reopen them from Your recent imports if needed.</p>
        {result.status === 'FAILED' && <div className="border-l-4 border-brand-amber bg-warning-soft p-3 text-sm leading-6"><p>{result.totalCount - result.processedCount} staff remain unprocessed. Completed accounts are retained.</p><button type="button" disabled={busy} onClick={() => run(async () => { setJob(await resumeStaffImport(accessToken, result.importId)); setResult(null); setStep(3) })} className="ga-btn-secondary mt-3">Resume remaining staff</button></div>}
        {result.failures.length > 0 && <div className="border-l-4 border-brand-amber bg-warning-soft p-3 text-sm leading-6"><p>{result.failures.length} {result.failures.length === 1 ? 'row could' : 'rows could'} not be created. Download the corrections, fix these rows and import them in a new file.</p><button type="button" disabled={busy} className="ga-btn-secondary mt-3" onClick={() => run(() => downloadStaffCsv('staff-import-failed-rows.csv', [['Source row', 'Full name', 'Email', 'Role', 'Username', 'Contact number', 'Barangay', 'Corrections'], ...result.failures.map(row => [row.sourceRow, row.record.fullName, row.record.email, STAFF_ROLE_LABELS[row.record.role] ?? '', row.record.username ?? '', row.record.contactNumber ?? '', row.barangayLabel ?? row.record.barangayId ?? '', row.issues.join(' ')])]))}>Download failed rows</button></div>}
        <ImportPagination page={resultPage} total={result.accounts.length} onChange={setResultPage} label="Credential pages" />
        <p role="status" className="text-base font-semibold">{result.createdCount} staff {result.createdCount === 1 ? 'account' : 'accounts'} created · {result.failedCount} need correction.</p>
        <p className="text-sm leading-6 text-copy">Download the credentials before closing. Keep the file private, share each row only with that staff member, and remove your copy after handover. Account emails contain setup instructions, never passwords; check Email history for delivery status.</p>
        <button type="button" disabled={busy || !result.accounts.length} onClick={() => run(() => downloadStaffCsv('garantiyaid-staff-credentials.csv', [['Full name', 'Email', 'Staff ID', 'Username', 'Role', 'Temporary password'], ...result.accounts.map(({ user, temporaryPassword }) => [user.fullName, user.email, user.employeeId, user.username ?? '', STAFF_ROLE_LABELS[user.role], temporaryPassword])]))} className="ga-btn-primary">Download sign-in credentials</button>
        <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={showPasswords} onChange={event => setShowPasswords(event.target.checked)} className="size-5 accent-brand-blue" />Show temporary passwords</label>
        <div className="max-h-[22rem] overflow-auto rounded border border-line" tabIndex={0} role="region" aria-label="Imported staff credentials"><table className="w-full min-w-[620px] text-left text-sm"><thead className="sticky top-0 bg-slate-50"><tr><th scope="col" className="p-3">Staff member</th><th scope="col" className="p-3">Staff ID / username</th><th scope="col" className="p-3">Temporary password</th></tr></thead><tbody className="divide-y divide-line">{result.accounts.slice(resultPage * 25, resultPage * 25 + 25).map(({ user, temporaryPassword }) => <tr key={user.userId}><td className="p-3">{user.fullName}</td><td className="p-3">{user.employeeId}{user.username && <p>{user.username}</p>}</td><td className="p-3 font-mono">{showPasswords ? temporaryPassword : <span aria-label="Password hidden">••••••••••••</span>}</td></tr>)}</tbody></table></div>
        <label className="flex min-h-11 items-start gap-3 text-sm leading-6"><input ref={savedRef} type="checkbox" checked={credentialsSaved} onChange={event => { setCredentialsSaved(event.target.checked); setError('') }} className="mt-1 size-5 shrink-0 accent-brand-blue" />I have saved the credentials for private handover to these staff members.</label>
        <button type="button" disabled={busy} onClick={requestClose} className="ga-btn-secondary">Done</button>
      </div>}
    </div>
  </dialog>
}
