import { useEffect, useRef, useState } from 'react'
import { isSessionExpiredError, requestStaffImport, requestStaffImportResults, requestStaffImports, resumeStaffImport } from '../../auth/staffAuth.js'

const staffApi = { list: requestStaffImports, status: requestStaffImport, results: requestStaffImportResults, resume: resumeStaffImport }

const statusLabels = { QUEUED: 'Waiting to start', PROCESSING: 'Processing', COMPLETED: 'Completed', FAILED: 'Stopped' }
const date = value => new Date(value).toLocaleString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' })

export function ImportPagination({ page, total, onChange, label, disabled = false }) {
  const pages = Math.max(1, Math.ceil(total / 25))
  if (pages === 1) return null
  return <nav aria-label={label} className="flex flex-wrap items-center gap-3 text-sm">
    <button type="button" disabled={disabled || page === 0} onClick={() => onChange(page - 1)} className="ga-btn-secondary">Previous</button>
    <span>Page {page + 1} of {pages} · {total.toLocaleString('en-US')} records</span>
    <button type="button" disabled={disabled || page + 1 >= pages} onClick={() => onChange(page + 1)} className="ga-btn-secondary">Next</button>
  </nav>
}

export function StaffImportHistory({ accessToken, onOpen, onSessionExpired, disabled, api = staffApi, label = "staff" }) {
  const [imports, setImports] = useState([])
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  useEffect(() => {
    let active = true
    api.list(accessToken).then(items => { if (active) { setImports(items); setError('') } }).catch(error => {
      if (!active) return
      if (isSessionExpiredError(error)) onSessionExpired()
      else setError('Recent imports could not be loaded. Check them before submitting the same file again.')
    })
    return () => { active = false }
  }, [accessToken, reload, onSessionExpired, api])
  if (!imports.length && !error) return null
  return <section className="border-t border-line pt-5" aria-labelledby={`recent-${label}-imports`}>
    <h3 id={`recent-${label}-imports`} className="font-semibold">Your recent imports</h3>
    <p className="mt-1 text-sm leading-6 text-copy">Open an import to check progress or recover its results. Saved results are available for 24 hours after completion or a processing stop.</p>
    {error && <p role="alert" className="mt-3 text-sm text-brand-red">{error} <button type="button" disabled={disabled} onClick={() => setReload(value => value + 1)} className="min-h-11 underline">Retry loading imports</button></p>}
    <ul className="mt-3 divide-y divide-line">{imports.map(job => <li key={job.importId} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
      <div><p className="font-semibold">{job.totalCount.toLocaleString('en-US')} {label} · {statusLabels[job.status]}</p><p className="mt-1 text-copy">{date(job.createdAt)} · {job.processedCount} processed</p></div>
      <button type="button" disabled={disabled} onClick={() => onOpen(job)} className="ga-btn-secondary" aria-label={`Open import ${job.importId}`}>Open import</button>
    </li>)}</ul>
  </section>
}

export default function StaffImportProgress({ accessToken, initialJob, onResult, onSessionExpired, api = staffApi, label = "staff" }) {
  const [job, setJob] = useState(initialJob)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [reload, setReload] = useState(0)
  const callbacks = useRef({ onResult, onSessionExpired })
  useEffect(() => { callbacks.current = { onResult, onSessionExpired } }, [onResult, onSessionExpired])
  useEffect(() => {
    let active = true
    let timer
    async function poll() {
      let delay = 5000
      try {
        const updated = await api.status(accessToken, initialJob.importId)
        if (!active) return
        setJob(updated); setError('')
        if (updated.status === 'COMPLETED') {
          const result = await api.results(accessToken, updated.importId)
          if (active) callbacks.current.onResult(result)
          return
        }
        if (updated.status === 'FAILED') return
      } catch (error) {
        if (!active) return
        if (isSessionExpiredError(error)) { callbacks.current.onSessionExpired(); return }
        delay = error.status === 429 ? 60_000 : 10_000
        setError(error.status === 404 ? error.message : error.status === 429 ? 'Progress updates are temporarily limited. Retrying in one minute; processing continues on the server.' : 'Progress could not be refreshed. Reconnecting; your import may still be running.')
        if (error.status === 404) return
      }
      if (active) timer = setTimeout(poll, delay)
    }
    poll()
    return () => { active = false; clearTimeout(timer) }
  }, [accessToken, initialJob.importId, reload, api])

  async function action(resume) {
    if (busy) return
    setBusy(true); setError('')
    try {
      if (resume) { setJob(await api.resume(accessToken, job.importId)); setReload(value => value + 1) }
      else callbacks.current.onResult(await api.results(accessToken, job.importId))
    } catch (error) {
      if (isSessionExpiredError(error)) callbacks.current.onSessionExpired()
      else setError(error.message)
    } finally { setBusy(false) }
  }
  return <section className="space-y-5" aria-label={`Background ${label} import`}>
    <p className="text-sm leading-6 text-copy">You can close this window and return through Import {label} → Your recent imports. Processing continues on the GarantiyAid server.</p>
    <div role="status" aria-live="polite" aria-atomic="true"><p className="font-semibold">{statusLabels[job.status]} · {job.processedCount.toLocaleString('en-US')} of {job.totalCount.toLocaleString('en-US')} processed</p><p className="mt-2 text-sm">{job.createdCount} created · {job.failedCount} need correction</p></div>
    <progress aria-label={`${label} import progress`} max={job.totalCount} value={job.processedCount} className="h-3 w-full appearance-none overflow-hidden rounded-sm [&::-webkit-progress-bar]:bg-slate-200 [&::-webkit-progress-value]:bg-brand-blue [&::-moz-progress-bar]:bg-brand-blue" />
    {job.status === 'QUEUED' && <p className="text-sm text-copy">Waiting to start. Keep the GarantiyAid server running.</p>}
    {job.status === 'PROCESSING' && <p className="text-sm leading-6 text-copy">Progress updates after each batch of up to 50 records. Large imports may take several minutes. After a server restart, recovery may take up to two minutes.</p>}
    {error && <p role="alert" className="border-l-4 border-brand-red bg-danger-soft p-3 text-sm">{error}</p>}
    {job.status === 'FAILED' && <><p role="alert" className="border-l-4 border-brand-amber bg-warning-soft p-3 text-sm leading-6">{job.lastError}</p><div className="flex flex-wrap gap-3"><button type="button" disabled={busy} onClick={() => action(true)} className="ga-btn-primary">Resume remaining {label}</button>{job.processedCount > 0 && <button type="button" disabled={busy} onClick={() => action(false)} className="ga-btn-secondary">View saved results</button>}</div></>}
  </section>
}
