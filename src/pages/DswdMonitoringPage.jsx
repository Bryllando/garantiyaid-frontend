import { useEffect, useEffectEvent, useRef, useState } from 'react'
import DashboardShell from '../components/layout/DashboardShell.jsx'
import { Skeleton } from '../components/ui/skeleton.jsx'
import { Icon } from '../components/ui/icon.jsx'
import { getAuthErrorMessage, isSessionExpiredError, requestClaimDisputes, requestDistributionDashboard, requestDistributionList } from '../auth/staffAuth.js'
import { connectStaffRealtime } from '../realtime/staffRealtime.js'
import { eventWorkRows } from '../utils/eventOperations.js'
import { monitoringActionHref, monitoringLocation, readMonitoringLocation } from '../utils/monitoringLocation.js'
import { createLiveRefresh } from '../utils/liveRefresh.js'
import DistributionLiveStatus from '../components/distributions/DistributionLiveStatus.jsx'
import DistributionActivity from '../components/distributions/DistributionActivity.jsx'
import { useDistributionActivity } from '../hooks/useDistributionActivity.js'

const date = new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeZone: 'Asia/Manila' })
const timestamp = new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'medium', timeZone: 'Asia/Manila' })
const humanize = (value = '') => value.toLowerCase().replaceAll('_', ' ').replace(/^./, (letter) => letter.toUpperCase())

function EventSummarySkeleton() {
  return <div role="status" aria-label="Loading selected event">
    <div aria-hidden="true" className="space-y-5">
      <div className="ga-card border-t-4 border-t-brand-navy p-5">
        <div className="flex flex-wrap justify-between gap-3"><Skeleton className="h-7 w-56 max-w-full" /><Skeleton className="h-8 w-24 rounded-full" /></div>
        <div className="mt-4 grid grid-cols-2 gap-4">{[0, 1, 2, 3].map((index) => <div key={index} className="space-y-2"><Skeleton className="h-3 w-16 max-w-full" /><Skeleton className="h-4 w-32 max-w-full" /></div>)}</div>
        <div className="mt-4 grid grid-cols-3 gap-2 border-t border-line pt-3 sm:gap-4">{[0, 1, 2].map((index) => <div key={index} className="space-y-2"><Skeleton className="h-7 w-8" /><Skeleton className="h-4 w-28 max-w-full" /></div>)}</div>
        <Skeleton className="mt-4 h-4 w-56 max-w-full" />
      </div>
      <div className="ga-card divide-y divide-line"><div className="p-4"><Skeleton className="h-5 w-32" /></div><div className="p-4"><Skeleton className="h-4 w-60 max-w-full" /></div></div>
    </div>
  </div>
}

export default function DswdMonitoringPage(props) {
  if (!['SYSTEM_ADMIN', 'DSWD_STAFF'].includes(props.session.user.role)) return <DashboardShell breadcrumbs={['Operations', 'Restricted']} currentPath="/dswd/live-dashboard" pageTitle="Live monitoring" user={props.session.user} onLogout={props.onLogout} onNavigate={props.onNavigate}><h1 className="ga-page-title">Monitoring access required</h1><p className="ga-page-copy">Live monitoring is available to Admin and DSWD staff.</p></DashboardShell>
  return <MonitoringWorkspace {...props} />
}

function MonitoringWorkspace({ session, onLogout, onNavigate, onSessionExpired }) {
  const [query, setQuery] = useState(() => readMonitoringLocation(window.location.search))
  const [draft, setDraft] = useState(query)
  const [filterError, setFilterError] = useState('')
  const [list, setList] = useState(null)
  const [listError, setListError] = useState(null)
  const [snapshot, setSnapshot] = useState(null)
  const [detailError, setDetailError] = useState(null)
  const [refresh, setRefresh] = useState(0)
  const [connection, setConnection] = useState('connecting')
  const [showEvents, setShowEvents] = useState(false)
  const detailRef = useRef(null)
  const focusSelection = useRef(false)
  const scope = JSON.stringify([query.search, query.status, query.dateFrom, query.dateTo, query.page])
  const currentList = list?.scope === scope ? list : null
  const currentListError = listError?.scope === scope && listError.version === refresh ? listError.message : ''
  const current = snapshot?.id === query.distribution ? snapshot : null
  const currentError = detailError?.id === query.distribution && detailError.version === refresh ? detailError.message : ''
  const listLoading = currentList?.version !== refresh && !currentListError
  const detailLoading = Boolean(query.distribution) && current?.version !== refresh && !currentError
  const event = current?.summary.distribution
  const [activity, recordActivity] = useDistributionActivity(query.distribution, event?.title)
  const receiveUpdate = useEffectEvent((name, payload, refreshRecords) => {
    if (name !== 'distribution.updated' && payload?.distributionId !== query.distribution) return
    recordActivity(name, payload)
    refreshRecords()
  })

  useEffect(() => { window.history.replaceState(window.history.state, '', monitoringLocation(query)) }, [query])

  useEffect(() => {
    let active = true, interrupted = false
    const update = createLiveRefresh(session.accessToken, () => { if (active) setRefresh(value => value + 1) }, { leading: true })
    const disconnect = connectStaffRealtime(session.accessToken, {
      onReady: () => { if (active) { setConnection('connected'); if (interrupted) update(); interrupted = false } },
      onUpdate: (name, payload) => { if (active) receiveUpdate(name, payload, update) },
      onDisconnect: () => { if (active) { interrupted = true; setConnection('disconnected') } },
      onError: (issue) => {
        if (!active) return
        if (['AUTHENTICATION_REQUIRED', 'INVALID_TOKEN', 'INVALID_SESSION'].includes(issue?.data?.code)) return onSessionExpired()
        interrupted = true
        setConnection('disconnected')
      },
    })
    const safetyRefresh = setInterval(() => { if (document.visibilityState === 'visible') update() }, 60_000)
    return () => { active = false; update.cancel(); clearInterval(safetyRefresh); disconnect() }
  }, [onSessionExpired, session.accessToken])

  useEffect(() => {
    let active = true
    requestDistributionList(session.accessToken, { search: query.search, status: query.status === 'ALL' ? '' : query.status, dateFrom: query.dateFrom, dateTo: query.dateTo, page: query.page, pageSize: 8 })
      .then((data) => {
        if (!active) return
        const lastPage = Math.max(1, data.pagination.totalPages)
        if (query.page > lastPage) { setQuery((value) => ({ ...value, page: lastPage })); return }
        setList({ ...data, scope, version: refresh })
        setListError(null)
        setQuery((value) => value.distribution || !data.distributions.length ? value : { ...value, distribution: data.distributions[0].distributionId })
      })
      .catch((issue) => {
        if (!active) return
        if (isSessionExpiredError(issue)) return onSessionExpired()
        setListError({ scope, version: refresh, message: getAuthErrorMessage(issue) })
      })
    return () => { active = false }
  }, [onSessionExpired, query.search, query.status, query.dateFrom, query.dateTo, query.page, refresh, scope, session.accessToken])

  useEffect(() => {
    if (!query.distribution) return undefined
    let active = true
    Promise.all([
      requestDistributionDashboard(session.accessToken, query.distribution),
      requestClaimDisputes(session.accessToken, query.distribution, { page: 1, pageSize: 1 }),
    ]).then(([summary, disputes]) => {
      if (!active) return
      setSnapshot({ id: query.distribution, summary, disputes: disputes.summary.countsByStatus, updatedAt: new Date(), version: refresh })
      setDetailError(null)
    }).catch((issue) => {
      if (!active) return
      if (isSessionExpiredError(issue)) return onSessionExpired()
      setDetailError({ id: query.distribution, version: refresh, message: getAuthErrorMessage(issue) })
    })
    return () => { active = false }
  }, [onSessionExpired, query.distribution, refresh, session.accessToken])

  useEffect(() => {
    if (!focusSelection.current) return
    detailRef.current?.focus({ preventScroll: true })
    if (window.matchMedia('(max-width: 1279px)').matches) detailRef.current?.scrollIntoView({ block: 'start', behavior: 'instant' })
    focusSelection.current = false
  }, [query.distribution])

  function applyFilters(event) {
    event.preventDefault()
    if (draft.dateFrom && draft.dateTo && draft.dateFrom > draft.dateTo) { setFilterError('Date to must be the same as or later than Date from.'); return }
    setFilterError('')
    setShowEvents(true)
    setQuery({ ...draft, search: draft.search.trim(), page: 1, distribution: '' })
  }
  function selectEvent(distributionId) {
    focusSelection.current = distributionId !== query.distribution
    setShowEvents(false)
    setQuery({ ...query, distribution: distributionId })
    if (!focusSelection.current) requestAnimationFrame(() => detailRef.current?.focus({ preventScroll: true }))
  }
  function actionLink(href, label, className = 'ga-admin-link') {
    const target = monitoringActionHref(href, query)
    return <a href={target} className={className} onClick={(event) => {
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return
      event.preventDefault()
      onNavigate(target)
    }}>{label}</a>
  }
  const rows = current ? eventWorkRows(event, current.summary.beneficiaries.scheduleStatusCounts, current.summary.beneficiaries.claimStatusCounts, current.disputes, session.user.role) : []
  const priority = ['OPEN', 'UNDER_REVIEW', 'REFERRED', 'release', 'verification', 'arrival', 'missed', 'rejected', 'voided']
  const work = rows.filter((row) => row.key !== 'completed').sort((a, b) => priority.indexOf(a.key) - priority.indexOf(b.key))
  const selectedOutsideList = event && currentList && !currentList.distributions.some((item) => item.distributionId === query.distribution)
  const physical = event?.deliveryMode === 'PHYSICAL_GOODS'
  const counts = current?.summary.beneficiaries
  const figures = counts ? [
    ['Awaiting check-in', counts.scheduleStatusCounts.SCHEDULED ?? 0],
    [physical ? 'Verified, awaiting handover' : 'Verified, awaiting simulated credit', counts.claimStatusCounts.VERIFIED ?? 0],
    [physical ? 'Handovers recorded' : 'Completed simulated claims', physical ? (counts.physicalHandoverCount ?? counts.claimedCount) : counts.claimedCount],
  ] : []

  return <DashboardShell breadcrumbs={['Operations', 'Distribution & funds', 'Live monitoring']} currentPath="/dswd/live-dashboard" pageTitle="Live monitoring" user={session.user} onLogout={onLogout} onNavigate={onNavigate} showAssistant={false}>
    <header className="ga-page-header ga-page-header-with-actions border-b border-line pb-4">
      <div className="ga-page-heading"><h1 className="ga-page-title">Real-time transparency dashboard</h1><p className="ga-page-copy">Monitor distribution progress and review claims that need attention.</p></div>
      <div className="ga-page-actions">
        <button type="button" aria-disabled={listLoading || detailLoading} onClick={() => { if (!listLoading && !detailLoading) setRefresh((value) => value + 1) }} className="ga-btn-secondary aria-disabled:opacity-60"><Icon name="reset" className="size-4" />Refresh data</button>
        {actionLink('/dswd/ledger?workspace=wallets', 'Open simulated wallets', 'ga-btn-secondary')}
        {query.distribution && <button type="button" aria-expanded={showEvents} aria-controls="monitor-event-list" onClick={() => setShowEvents((value) => !value)} className="ga-btn-secondary xl:hidden">{showEvents ? 'Hide events' : 'Choose event'}</button>}
      </div>
    </header>
    {connection === 'disconnected' && <p className="mt-3 text-sm leading-6 text-copy">The live connection is unavailable. Use Refresh data to check for changes.</p>}
    <div className="mt-5 grid items-start gap-5 xl:grid-cols-[minmax(17rem,0.72fr)_minmax(0,1.6fr)]">
      <section id="monitor-event-list" className={`ga-admin-register min-w-0 ${!showEvents && (query.distribution || listLoading) ? 'hidden xl:block' : ''}`} aria-labelledby="monitor-events-heading" aria-busy={listLoading}>
        <header><h2 id="monitor-events-heading"><Icon name="distributions" />Distribution events</h2><p className="mt-1 text-sm font-normal text-copy">{currentList ? `${currentList.pagination.total} matching events` : 'Search across authorized events'}</p></header>
        <form onSubmit={applyFilters} aria-label="Filter distribution events" className="border-b border-line p-4">
      <div className="grid gap-3">
        <div><label htmlFor="monitor-search" className="ga-label">Find event</label><input id="monitor-search" type="search" maxLength={100} value={draft.search} onChange={(event) => setDraft({ ...draft, search: event.target.value })} placeholder="Title or location" className="ga-input mt-2" /></div>
        <div><label htmlFor="monitor-status" className="ga-label">Event status</label><select id="monitor-status" value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value })} className="ga-input mt-2">{['OPEN', 'DRAFT', 'CLOSED', 'CANCELLED', 'ALL'].map((status) => <option key={status} value={status}>{status === 'ALL' ? 'All statuses' : humanize(status)}</option>)}</select></div>
        <details className="min-w-0" open={draft.dateFrom || draft.dateTo || filterError ? true : undefined}><summary className="ga-admin-link">Filter by date</summary>
          <div className="mt-2 grid gap-3">
            <div className="min-w-0"><label htmlFor="monitor-from" className="ga-label">Date from</label><input id="monitor-from" type="date" value={draft.dateFrom} onChange={(event) => setDraft({ ...draft, dateFrom: event.target.value })} className="ga-input mt-2" /></div>
            <div className="min-w-0"><label htmlFor="monitor-to" className="ga-label">Date to</label><input id="monitor-to" type="date" value={draft.dateTo} onChange={(event) => setDraft({ ...draft, dateTo: event.target.value })} aria-describedby={filterError ? 'monitor-filter-error' : undefined} aria-invalid={Boolean(filterError)} className="ga-input mt-2" /></div>
          </div>
        </details>
        <button type="submit" className="ga-btn-secondary">Apply filters</button>
      </div>
      {filterError && <p id="monitor-filter-error" role="alert" className="mt-3 text-sm text-brand-red">{filterError}</p>}
        </form>
        {currentListError && <div role="alert" className="border-b border-line bg-warning-soft p-4 text-sm leading-6"><p>Event list could not be refreshed. {currentList ? 'Showing the previous list.' : ''} {currentListError}</p><button type="button" onClick={() => setRefresh((value) => value + 1)} className="ga-admin-link">Retry event list</button></div>}
        {listLoading && !currentList && <div aria-hidden="true" className="divide-y divide-line">{[0, 1, 2].map((index) => <div key={index} className="space-y-3 p-4"><Skeleton className="h-4 w-44 max-w-full" /><Skeleton className="h-4 w-24" /><Skeleton className="h-3 w-32 max-w-full" /></div>)}</div>}
        {currentList && <>
          {currentList.distributions.length ? <ul className="divide-y divide-line">{currentList.distributions.map((item) => <li key={item.distributionId}><button type="button" aria-pressed={query.distribution === item.distributionId} onClick={() => selectEvent(item.distributionId)} className={`w-full border-l-4 p-4 text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-blue ${query.distribution === item.distributionId ? 'border-brand-blue bg-info-soft' : 'border-transparent hover:bg-slate-50'}`}>
            <span className="block break-words text-sm font-semibold text-ink">{item.title}</span><span className="mt-1 block text-sm leading-6 text-copy">{item.barangay?.barangayName || 'Barangay not recorded'}</span><span className="mt-2 block text-xs leading-5 text-muted-copy">{date.format(new Date(`${item.distributionDate}T00:00:00+08:00`))} · {humanize(item.status)}</span>
          </button></li>)}</ul> : <div className="p-5 text-sm leading-6"><h3 className="font-semibold">No matching events</h3><p className="mt-2 text-copy">Choose another status, date range, or search term.</p><button type="button" className="ga-admin-link" onClick={() => { const next = readMonitoringLocation('?status=ALL'); setDraft(next); setQuery(next); setFilterError('') }}>Show all events</button></div>}
          {currentList.pagination.total > 0 && <nav aria-label="Event list pages" className="flex flex-wrap items-center justify-between gap-2 border-t border-line p-3 text-xs"><span>Page {query.page} of {Math.max(1, currentList.pagination.totalPages)}</span><div className="flex gap-2"><button type="button" aria-label="Previous events" disabled={listLoading || query.page <= 1} onClick={() => setQuery({ ...query, page: query.page - 1, distribution: '' })} className="ga-btn-secondary min-h-11 px-3 text-xs">Previous</button><button type="button" aria-label="Next events" disabled={listLoading || query.page >= currentList.pagination.totalPages} onClick={() => setQuery({ ...query, page: query.page + 1, distribution: '' })} className="ga-btn-secondary min-h-11 px-3 text-xs">Next</button></div></nav>}
        </>}
      </section>
      <section ref={detailRef} tabIndex={-1} aria-label="Selected event monitoring" className={`min-w-0 scroll-mt-44 focus-visible:outline-2 focus-visible:outline-brand-blue ${query.distribution && showEvents ? 'hidden xl:block' : ''}`}>
        {(!query.distribution && listLoading) || (detailLoading && !current) ? <EventSummarySkeleton /> : !query.distribution ? <div className="ga-card p-6"><h2 className="ga-section-heading">Select an event</h2><p className="mb-3 mt-2 text-base text-copy">Event details and work remaining appear here.</p><DistributionLiveStatus connection={connection} /></div> : <>
          {currentError && <div role="alert" className="mb-4 border-l-2 border-brand-amber bg-warning-soft p-4 text-sm leading-6"><h2 className="font-semibold">Event update unavailable</h2><p>{current ? 'Showing the last successful update. Counts may have changed.' : 'The selected event could not be loaded.'} {currentError}</p><button type="button" onClick={() => setRefresh((value) => value + 1)} className="ga-admin-link">Retry event details</button></div>}
          {current && <>
            <div className="ga-card border-t-4 border-t-brand-navy p-5">
              <div className="flex flex-wrap items-start justify-between gap-3"><h2 className="min-w-0 break-words text-xl font-semibold text-ink">{event.title}</h2><div className="flex flex-wrap items-center gap-2"><span className="rounded border border-line bg-slate-50 px-2 py-1 text-sm font-semibold">{humanize(event.status)}</span><DistributionLiveStatus connection={connection} /></div></div>
              <dl className="mt-4 grid grid-cols-2 gap-4 text-sm">{[['Program', event.program?.programName || event.program?.programCode], ['Barangay', event.barangay?.barangayName], ['Event date', date.format(new Date(`${event.distributionDate}T00:00:00+08:00`))], ['Delivery', event.deliveryMode === 'PHYSICAL_GOODS' ? 'Physical release' : 'Simulated wallet credit']].map(([label, value]) => <div className="min-w-0" key={label}><dt className="text-xs text-muted-copy">{label}</dt><dd className="mt-1 break-words font-semibold">{value || 'Not recorded'}</dd></div>)}</dl>
              <dl aria-label="Distribution statistics" className="mt-4 grid grid-cols-3 gap-2 border-t border-line pt-3 sm:gap-4">
                {figures.map(([label, count]) => <div key={label} className="flex min-w-0 flex-col-reverse justify-end gap-1">
                  <dt className="text-sm leading-5 text-copy">{label}</dt>
                  <dd className="text-2xl font-bold tabular-nums text-ink">{count}</dd>
                </div>)}
              </dl>
              <p className="mt-3 text-sm leading-5 text-copy">Counts last synced <time dateTime={current.updatedAt.toISOString()}>{timestamp.format(current.updatedAt)} PHT</time></p>
              {selectedOutsideList && <p className="mt-2 text-sm text-copy">This event is outside the displayed list.</p>}
            </div>
            {event.status !== 'OPEN' && <p className="mt-4 border-l-2 border-brand-amber bg-warning-soft px-4 py-3 text-sm leading-6">{event.status === 'DRAFT' ? 'Admin must complete setup and open this event before release or credit. Counts below describe preparation records.' : 'This event is not open for release or credit. Review recorded claims and unresolved concerns.'}</p>}
            <div className="mt-5"><DistributionActivity entries={activity} claimLink={claimId => actionLink(`/claim-accountability?distribution=${encodeURIComponent(query.distribution)}&claim=${encodeURIComponent(claimId)}`, 'View claim')} /></div>
            <section className="ga-admin-register mt-5" aria-labelledby="monitor-work-heading">
              <header><div><h2 id="monitor-work-heading"><Icon name="monitoring" />Work remaining</h2><p className="mt-1 text-sm font-normal leading-6 text-copy">Open a record to confirm its current status. Disputes may overlap with claim counts.</p></div></header>
              <ul className="divide-y divide-line">{work.map((row) => <li key={row.key} className="grid gap-2 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-x-5">
                <div><h3 className="text-base font-semibold text-ink">{row.label} <span className="ml-2 inline-block min-w-7 rounded bg-slate-100 px-2 py-0.5 text-center tabular-nums">{row.count}</span></h3><p className="mt-1 text-sm leading-5 text-muted-copy">Responsible: {row.owner}</p><p className="mt-2 text-base leading-6 text-copy">{row.detail}</p></div>
                <div className="sm:self-center">{row.count > 0 ? actionLink(row.href, row.action || 'Review records') : <span className="text-xs text-muted-copy">None recorded in this stage</span>}</div>
              </li>)}</ul>
              {!rows.some((row) => ['OPEN', 'UNDER_REVIEW', 'REFERRED'].includes(row.key)) && <p className="border-t border-line p-4 text-sm text-copy">No active disputes recorded.</p>}
            </section>
            <details className="ga-admin-guide mt-4"><summary className="cursor-pointer">Verification exceptions</summary><div className="p-4"><dl className="grid grid-cols-2 gap-4 text-sm">{[['Duplicate QR attempts', current.summary.qrScans?.duplicateCount], ['Invalid QR attempts', current.summary.qrScans?.invalidCount], ['Face did not match', current.summary.biometrics?.noMatchCount], ['Liveness failures', current.summary.biometrics?.livenessFailedCount]].map(([label, value]) => <div key={label}><dt className="text-copy">{label}</dt><dd className="mt-1 font-semibold tabular-nums">{value ?? 'Unavailable'}</dd></div>)}</dl><p className="mt-4 text-xs leading-5 text-muted-copy">Attempt counts may include retries. Review the records before drawing conclusions.</p>{actionLink(`/reports?distribution=${encodeURIComponent(query.distribution)}&report=ANOMALIES`, 'Review verification attempts')}</div></details>
            <div className="ga-card mt-4 flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm"><p><strong className="font-semibold">{current.summary.beneficiaries.claimedCount} completed claims</strong><span className="mt-1 block text-xs leading-5 text-muted-copy">A completed claim does not close the distribution event.</span></p><div className="flex flex-wrap gap-x-5">{actionLink(`/claim-accountability?distribution=${encodeURIComponent(query.distribution)}&status=CLAIMED`, 'Review completed claims')}{event.deliveryMode === 'SIMULATED_WALLET' && actionLink(`/dswd/ledger?distribution=${encodeURIComponent(query.distribution)}`, 'View event ledger')}{actionLink(`/reports?distribution=${encodeURIComponent(query.distribution)}`, 'View event report')}</div></div>
          </>}
        </>}
      </section>
    </div>
  </DashboardShell>
}
