import { useEffect, useRef, useState } from 'react'
import { confirmBarangayImport, isSessionExpiredError, previewBarangayImport } from '../../auth/staffAuth.js'
import { downloadStaffCsv, importTemplateRows, readStaffImportFile, STAFF_IMPORT_FILE_LIMIT_MB } from '../../utils/staffImport.js'
import { BARANGAY_IMPORT_FIELDS, BARANGAY_IMPORT_LIMIT, barangayCorrectionsCsv, barangayTableFromSheet, barangayTemplateGuide, mapBarangayImportRows, suggestBarangayColumns } from '../../utils/barangayImport.js'
import ImportTemplateGuide from '../ui/ImportTemplateGuide.jsx'
import { templateFileName } from '../../utils/importTemplateGuides.js'
import { LoadingLabel } from '../ui/spinner.jsx'
import { ImportPagination } from './StaffImportProgress.jsx'

const steps = ['Choose file', 'Match columns', 'Review barangays', 'Results']

export default function BarangayImportDialog({ accessToken, onClose, onImported, onSessionExpired }) {
  const dialogRef = useRef(null)
  const headingRef = useRef(null)
  const errorRef = useRef(null)
  const busyRef = useRef(false)
  const [step, setStep] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [fileName, setFileName] = useState('')
  const [sheets, setSheets] = useState([])
  const [sheetIndex, setSheetIndex] = useState(0)
  const [table, setTable] = useState(null)
  const [columns, setColumns] = useState({})
  const [rows, setRows] = useState([])
  const [review, setReview] = useState(null)
  const [confirmed, setConfirmed] = useState(false)
  const [uncertain, setUncertain] = useState(false)
  const [result, setResult] = useState(null)
  const [page, setPage] = useState(0)
  const [errorsOnly, setErrorsOnly] = useState(false)

  useEffect(() => {
    const trigger = document.activeElement
    dialogRef.current?.showModal()
    return () => trigger?.focus()
  }, [])
  useEffect(() => { headingRef.current?.focus() }, [step])
  useEffect(() => { if (error) errorRef.current?.focus() }, [error])
  useEffect(() => {
    if (!busy && !uncertain) return undefined
    const warn = event => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [busy, uncertain])

  function close() {
    if (busyRef.current) return
    if (uncertain) onImported()
    dialogRef.current?.close()
  }

  async function run(action) {
    if (busyRef.current) return
    busyRef.current = true; setBusy(true); setError('')
    try { await action() } catch (requestError) {
      if (isSessionExpiredError(requestError)) onSessionExpired()
      else setError(requestError.message || 'The request could not be completed. Try again.')
    } finally { busyRef.current = false; setBusy(false) }
  }

  function chooseSheet(index, workbook = sheets) {
    setSheetIndex(index); setTable(null); setReview(null)
    if (workbook[index].tooLarge) throw new Error(`Import up to ${BARANGAY_IMPORT_LIMIT} barangays per file. Split this worksheet into smaller files.`)
    const next = barangayTableFromSheet(workbook[index].data)
    setTable(next); setColumns(suggestBarangayColumns(next.headers))
  }

  async function checkRows(nextRows) {
    const checked = await previewBarangayImport(accessToken, nextRows)
    setRows(nextRows); setReview(checked); setConfirmed(false); setUncertain(false)
    setPage(0); setErrorsOnly(false); setStep(2)
  }

  async function save() {
    try {
      const saved = await confirmBarangayImport(accessToken, rows, review.approvalId)
      setResult(saved); setUncertain(false); setPage(0); setStep(3); onImported()
    } catch (requestError) {
      setUncertain(!requestError.status || requestError.status >= 500 || requestError.code === 'BARANGAY_IMPORT_CONCURRENT')
      throw requestError
    }
  }

  const shownRows = review?.rows.filter(row => !errorsOnly || row.issues.length) ?? []
  const pageRows = shownRows.slice(page * 25, page * 25 + 25)
  return <dialog ref={dialogRef} onClose={onClose} onCancel={event => { event.preventDefault(); close() }} aria-labelledby="barangay-import-title" aria-describedby="barangay-import-description" className="m-auto max-h-[calc(100dvh-2rem)] w-[min(62rem,calc(100%-2rem))] overflow-y-auto rounded border border-line bg-white p-0 text-ink backdrop:bg-slate-950/55">
    <header className="flex items-start justify-between gap-4 border-b border-line p-5 sm:px-7">
      <div className="min-w-0"><p className="text-sm text-copy">Barangay registry · {steps[step]}</p><h2 ref={headingRef} tabIndex={-1} id="barangay-import-title" className="mt-1 text-2xl font-semibold outline-none">{step === 3 ? 'Barangay import results' : 'Import barangays'}</h2><p id="barangay-import-description" className="mt-2 text-sm leading-6 text-copy">Add official barangay records from a list. Existing records and staff assignments stay unchanged.</p></div>
      <button type="button" disabled={busy} onClick={close} aria-label="Close barangay import" className="grid size-11 shrink-0 place-items-center rounded border border-line text-xl hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-brand-blue">×</button>
    </header>
    <div className="space-y-5 p-5 sm:p-7">
      <ol aria-label="Import steps" className="flex flex-wrap gap-x-6 gap-y-2 border-b border-line pb-4 text-sm">{steps.map((label, index) => <li key={label} aria-current={step === index ? 'step' : undefined} className={step === index ? 'font-semibold text-brand-blue' : 'text-copy'}>{index + 1}. {label}</li>)}</ol>
      {error && <p ref={errorRef} tabIndex={-1} role="alert" className="border-l-4 border-brand-red bg-danger-soft p-3 text-sm leading-6 text-brand-red">{error}</p>}
      <div role="status" className="sr-only">{busy ? 'Processing barangay import. Please wait.' : ''}</div>

      {step === 0 && <div className="space-y-5">
        <p className="text-sm leading-6 text-copy">CSV (.csv) or Excel (.xlsx), up to {STAFF_IMPORT_FILE_LIMIT_MB} MB and {BARANGAY_IMPORT_LIMIT} barangays per file. Existing files with headings in the first row are also supported.</p>
        <ImportTemplateGuide title="Barangay import template" fields={barangayTemplateGuide} excelFile={templateFileName('barangays')} disabled={busy} onDownload={() => run(() => downloadStaffCsv('garantiyaid-barangay-template.csv', importTemplateRows('barangays', BARANGAY_IMPORT_FIELDS)))} />
        <p className="text-sm leading-6 text-copy">Required: barangay name, city or municipality, and province. The code is optional. New records will be active and available for staff assignments.</p>
        <div><label htmlFor="barangay-import-file" className="ga-label">Barangay list file</label><input id="barangay-import-file" type="file" accept=".csv,.xlsx" disabled={busy} className="ga-input mt-2 py-2 file:mr-3 file:rounded file:border-0 file:bg-info-soft file:px-3 file:py-2 file:font-semibold file:text-brand-blue" onChange={event => {
          const file = event.target.files?.[0]; if (!file) return
          setTable(null); setSheets([]); setFileName(file.name)
          run(async () => { const workbook = await readStaffImportFile(file, { label: 'barangay' }); setSheets(workbook); chooseSheet(0, workbook) })
        }} /></div>
        {sheets.length > 1 && <div><label htmlFor="barangay-import-sheet" className="ga-label">Worksheet</label><select id="barangay-import-sheet" className="ga-input mt-2" value={sheetIndex} disabled={busy} onChange={event => run(() => chooseSheet(Number(event.target.value)))}>{sheets.map((sheet, index) => <option key={index} value={index}>{sheet.sheet}</option>)}</select></div>}
        {table && <p className="break-words text-sm text-copy">{fileName} · {table.rows.length} barangay {table.rows.length === 1 ? 'row' : 'rows'} · {table.headers.length} columns</p>}
        <button type="button" disabled={busy || !table} onClick={() => { setError(''); setStep(1) }} className="ga-btn-primary">Continue to column matching</button>
      </div>}

      {step === 1 && <div className="space-y-5">
        <p className="text-sm leading-6 text-copy">Match each column to its barangay detail. Check the city or municipality and province when barangays share a name.</p>
        <div className="grid gap-4 sm:grid-cols-2">{BARANGAY_IMPORT_FIELDS.map(([field, label, required]) => <div key={field}><label htmlFor={`barangay-column-${field}`} className="ga-label">{label}{required ? ' (required)' : ' (optional)'}</label><select id={`barangay-column-${field}`} className="ga-input mt-2" value={columns[field]} disabled={busy} onChange={event => setColumns(current => ({ ...current, [field]: event.target.value }))}><option value="-1">{required ? 'Choose a column' : 'Not in this file'}</option>{table.headers.map((header, index) => <option key={index} value={index}>{header}</option>)}</select>{Number(columns[field]) >= 0 && <p className="mt-1 break-words text-xs leading-5 text-copy">Example: {table.rows[0].values[Number(columns[field])] || '(empty)'}</p>}</div>)}</div>
        <div className="flex flex-wrap gap-3"><button type="button" disabled={busy} onClick={() => { setError(''); setStep(0) }} className="ga-btn-secondary">Back to file</button><button type="button" disabled={busy} onClick={() => run(() => checkRows(mapBarangayImportRows(table, columns)))} className="ga-btn-primary">{busy ? <LoadingLabel>Checking barangays…</LoadingLabel> : 'Review barangays'}</button></div>
      </div>}

      {step === 2 && review && <div className="space-y-5">
        <p className="text-sm leading-6"><strong>{review.validCount} ready</strong> · {review.invalidCount} need correction. Check the rows below before adding barangays.</p>
        {review.invalidCount > 0 && <div className="flex flex-wrap items-center gap-3"><label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={errorsOnly} onChange={event => { setErrorsOnly(event.target.checked); setPage(0) }} className="size-5" />Show rows needing correction only</label><button type="button" disabled={busy} className="ga-btn-secondary" onClick={() => run(() => downloadStaffCsv('barangay-import-corrections.csv', barangayCorrectionsCsv(review.rows.filter(row => row.issues.length))))}>Download corrections</button><button type="button" disabled={busy || !review.validCount || uncertain} className="ga-btn-secondary" onClick={() => run(() => { const invalid = new Set(review.rows.filter(row => row.issues.length).map(row => row.sourceRow)); return checkRows(rows.filter(row => !invalid.has(row.sourceRow))) })}>Exclude rows needing correction</button></div>}
        <div className="hidden overflow-x-auto rounded border border-line sm:block"><table className="w-full text-left text-sm"><caption className="sr-only">Barangays to import and row corrections</caption><thead className="bg-slate-50 text-copy"><tr>{['Row', 'Barangay', 'City / Municipality', 'Province', 'Review'].map(label => <th scope="col" key={label} className="px-4 py-3 font-semibold">{label}</th>)}</tr></thead><tbody className="divide-y divide-line">{pageRows.map(row => <tr key={row.sourceRow}><td className="px-4 py-3 align-top">{row.sourceRow}</td><td className="px-4 py-3 align-top"><p className="font-semibold">{row.record.barangayName || 'Missing name'}</p><p className="mt-1 text-xs text-copy">{row.record.barangayCode || 'No code'}</p></td><td className="px-4 py-3 align-top">{row.record.city || 'Missing city / municipality'}</td><td className="px-4 py-3 align-top">{row.record.province || 'Missing province'}</td><td className="min-w-48 px-4 py-3 align-top">{row.issues.length ? <ul className="space-y-1 text-brand-red">{row.issues.map(issue => <li key={issue}>{issue}</li>)}</ul> : <span className="font-semibold text-brand-green">Ready to add</span>}</td></tr>)}</tbody></table></div>
        <ul aria-label="Barangays to review" className="divide-y divide-line rounded border border-line sm:hidden">{pageRows.map(row => <li key={row.sourceRow} className="min-w-0 p-4 text-sm leading-6">
          <p className="text-xs text-copy">Source row {row.sourceRow}</p><h3 className="mt-1 break-words font-semibold">{row.record.barangayName || 'Missing name'}</h3>
          <p className="break-words text-copy">{row.record.city || 'Missing city / municipality'}, {row.record.province || 'Missing province'}</p><p className="break-words text-xs text-copy">Code: {row.record.barangayCode || 'Not provided'}</p>
          {row.issues.length ? <ul className="mt-2 space-y-1 border-t border-line pt-2 text-brand-red">{row.issues.map(issue => <li key={issue}>{issue}</li>)}</ul> : <p className="mt-2 font-semibold text-brand-green">Ready to add</p>}
        </li>)}</ul>
        <ImportPagination page={page} total={shownRows.length} onChange={setPage} disabled={busy} label="Barangay review pages" />
        {uncertain && <p role="status" className="border-l-4 border-brand-amber bg-warning-soft p-3 text-sm leading-6">The result has not been confirmed. Retry the same import to retrieve its result without adding duplicate barangays.</p>}
        {!review.invalidCount && <label className="flex items-start gap-3 text-sm leading-6"><input type="checkbox" className="mt-1 size-5 shrink-0" checked={confirmed} disabled={busy || uncertain} onChange={event => setConfirmed(event.target.checked)} /><span>I checked the names and locations. Add {review.validCount} active {review.validCount === 1 ? 'barangay' : 'barangays'}.</span></label>}
        <div className="flex flex-wrap gap-3"><button type="button" disabled={busy || uncertain} onClick={() => { setError(''); setStep(1); setConfirmed(false) }} className="ga-btn-secondary">Back to columns</button><button type="button" disabled={busy || !confirmed || review.invalidCount > 0 || !review.approvalId} onClick={() => run(save)} className="ga-btn-primary">{busy ? <LoadingLabel>Adding barangays…</LoadingLabel> : uncertain ? 'Retry same import' : `Import ${review.validCount} ${review.validCount === 1 ? 'barangay' : 'barangays'}`}</button></div>
      </div>}

      {step === 3 && result && <div className="space-y-5">
        <div role="status"><h3 className="text-xl font-semibold">{result.createdCount} {result.createdCount === 1 ? 'barangay added' : 'barangays added'}</h3><p className="mt-2 text-sm leading-6 text-copy">The registry is updated. You can now assign Barangay Facilitators to these areas.</p></div>
        <ul className="divide-y divide-line rounded border border-line">{result.barangays.slice(page * 25, page * 25 + 25).map(({ sourceRow, barangay }) => <li key={barangay.barangayId} className="px-4 py-3"><p className="break-words font-semibold">{barangay.barangayName}</p><p className="mt-1 break-words text-sm text-copy">{barangay.city}, {barangay.province} · Source row {sourceRow} · Active</p></li>)}</ul>
        <ImportPagination page={page} total={result.barangays.length} onChange={setPage} disabled={busy} label="Barangay result pages" />
        <div className="flex flex-wrap gap-3"><button type="button" disabled={busy} onClick={() => run(() => downloadStaffCsv('barangay-import-results.csv', [['Source row', ...BARANGAY_IMPORT_FIELDS.map(([, label]) => label), 'Status'], ...result.barangays.map(({ sourceRow, barangay }) => [sourceRow, ...BARANGAY_IMPORT_FIELDS.map(([field]) => barangay[field] ?? ''), 'Active'])]))} className="ga-btn-secondary">Download import results</button><button type="button" disabled={busy} onClick={close} className="ga-btn-primary">Done</button></div>
      </div>}
    </div>
  </dialog>
}
