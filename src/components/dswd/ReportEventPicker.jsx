import { useEffect, useState } from 'react'
import { getAuthErrorMessage, isSessionExpiredError, requestDistributionList } from '../../auth/staffAuth.js'
import { LoadingLabel } from '../ui/spinner.jsx'

export default function ReportEventPicker({ token, value, selected, allowAll, disabled, onSelect, onSessionExpired }) {
  const [draft, setDraft] = useState('')
  const [query, setQuery] = useState({ search: '', page: 1 })
  const [retry, setRetry] = useState(0)
  const [result, setResult] = useState(null)
  const key = `${query.search}/${query.page}/${retry}`
  const current = result?.key === key ? result : null
  useEffect(() => {
    let active = true
    requestDistributionList(token, { ...query, pageSize: 8 }).then((data) => {
      if (!active) return
      if (query.page > Math.max(1, data.pagination.totalPages)) { setQuery({ ...query, page: Math.max(1, data.pagination.totalPages) }); return }
      setResult({ key, data })
    }).catch((issue) => {
      if (!active) return
      if (isSessionExpiredError(issue)) onSessionExpired()
      else setResult({ key, error: getAuthErrorMessage(issue) })
    })
    return () => { active = false }
  }, [key, onSessionExpired, query, token])
  const rows = current?.data?.distributions || []
  const options = value && !rows.some((item) => item.distributionId === value)
    ? [{ distributionId: value, title: selected?.title || 'Selected event', distributionDate: selected?.distributionDate }, ...rows] : rows
  function search() { if (!disabled) setQuery({ search: draft.trim(), page: 1 }) }
  return <div className="min-w-0">
    <label htmlFor="report-distribution" className="ga-label">Distribution event</label>
    <select id="report-distribution" value={value} onChange={(event) => onSelect(event.target.value)} disabled={disabled} className="ga-input mt-2 cursor-pointer font-semibold" aria-describedby="report-event-help">
      <option value="">{allowAll ? 'All authorized distributions' : 'Select a distribution event'}</option>
      {options.map((item) => <option key={item.distributionId} value={item.distributionId}>{item.title}{item.distributionDate ? ` · ${item.distributionDate}` : ''}</option>)}
    </select>
    <p id="report-event-help" className="mt-2 text-xs leading-5 text-muted-copy">{current?.data ? `${rows.length} of ${current.data.pagination.total} matching events in this list.` : current?.error ? 'The event list is unavailable. You can retry below.' : 'Loading event choices…'} Your selected event stays available while browsing.</p>
    <details className="mt-1 text-sm">
      <summary className="min-h-11 cursor-pointer py-3 font-semibold text-brand-blue">Find another event</summary>
      <div className="border-l-2 border-line pl-3">
        <label htmlFor="report-event-search" className="ga-label">Find event by title or location</label>
        <div className="mt-2 flex flex-wrap gap-2"><input id="report-event-search" type="search" maxLength={100} value={draft} disabled={disabled} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); search() } }} className="ga-input min-w-0 flex-1 basis-40" /><button type="button" onClick={search} disabled={disabled} className="ga-btn-secondary">Search events</button></div>
        {!current && <p role="status" className="mt-3 text-sm"><LoadingLabel>Loading event choices...</LoadingLabel></p>}
        {current?.error && <div role="alert" className="mt-3 text-sm leading-6"><p>{current.error}</p><button type="button" disabled={disabled} onClick={() => setRetry((value) => value + 1)} className="ga-admin-link min-h-11">Retry event list</button></div>}
        {current?.data && <>
          <p className="mt-3 text-sm leading-6 text-copy">{rows.length ? 'Choose a matching event from the Distribution event field above.' : 'No matching events. Try another title or location.'}</p>
          {current.data.pagination.totalPages > 1 && <nav aria-label="Report event pages" className="mt-3 flex flex-wrap items-center justify-between gap-2"><p className="text-xs text-muted-copy">Page {query.page} of {current.data.pagination.totalPages}</p><div className="flex gap-2"><button type="button" disabled={disabled || query.page === 1} onClick={() => setQuery({ ...query, page: query.page - 1 })} className="ga-btn-secondary px-3 text-sm">Previous events</button><button type="button" disabled={disabled || query.page >= current.data.pagination.totalPages} onClick={() => setQuery({ ...query, page: query.page + 1 })} className="ga-btn-secondary px-3 text-sm">Next events</button></div></nav>}
        </>}
      </div>
    </details>
    {current?.error && <button type="button" disabled={disabled} onClick={() => setRetry((value) => value + 1)} className="ga-admin-link min-h-11">Reload event choices</button>}
  </div>
}
