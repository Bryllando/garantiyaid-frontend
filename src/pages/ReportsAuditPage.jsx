import { useEffect, useRef, useState } from 'react'
import DashboardShell from '../components/layout/DashboardShell.jsx'
import ReportEventPicker from '../components/dswd/ReportEventPicker.jsx'
import { readReportScope, reportDateHelp, reportLocation, reportStatuses, reportTypes } from '../utils/reportScope.js'
import { Icon } from '../components/ui/icon.jsx'
import { Skeleton } from '../components/ui/skeleton.jsx'
import { LoadingLabel } from '../components/ui/spinner.jsx'
import {
  getAuthErrorMessage,
  isSessionExpiredError,
  requestAuditLogs,
  requestDistribution,
  requestDistributionCsv,
  requestDistributionReport,
  requestFundUtilizationReport,
} from '../auth/staffAuth.js'

const authorizedRoles = new Set(['SYSTEM_ADMIN', 'DSWD_STAFF'])
const numberFormatter = new Intl.NumberFormat('en-PH')
const moneyFormatter = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' })
const dateFormatter = new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Manila' })

function OversightNavigation({ onNavigate, role }) {
  if (role !== 'SYSTEM_ADMIN') return null
  return <nav className="mt-5 flex flex-wrap gap-2" aria-label="Related oversight tools">{[
    window.location.pathname === '/reports' ? ['Audit logs', '/audit-logs'] : ['Reports', '/reports'],
    ['Live monitoring', '/dswd/live-dashboard'],
  ].map(([label, href]) => <a key={href} href={href} onClick={(event) => { event.preventDefault(); onNavigate(href) }} className="inline-flex min-h-11 items-center rounded-lg border border-line bg-white px-4 text-sm font-bold text-brand-blue hover:border-blue-200 hover:bg-info-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue">{label}</a>)}</nav>
}

function humanize(value = '') {
  return value.toLowerCase().replaceAll('_', ' ').replace(/^./, (letter) => letter.toUpperCase()).replace(/\bQr\b/g, 'QR')
}

function formatDate(value) {
  if (!value) return 'Not recorded'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : dateFormatter.format(date)
}

function formatMoney(value) {
  return moneyFormatter.format(Number(value ?? 0))
}

function reportLabel(type) {
  return reportTypes.find(([value]) => value === type)?.[1] ?? 'Report'
}

function ReportSkeleton() {
  return (
    <div className="mt-6" role="status" aria-label="Loading report data" aria-busy="true">
      <span className="sr-only">Loading report data…</span>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => <div key={index} className="ga-card-flat p-5"><Skeleton className="h-4 w-28" /><Skeleton className="mt-4 h-8 w-24" /></div>)}
      </div>
      <div className="mt-5 overflow-hidden rounded-xl border border-line bg-white p-5"><Skeleton className="h-5 w-52" />{Array.from({ length: 6 }, (_, index) => <Skeleton key={index} className="mt-4 h-11 w-full" />)}</div>
    </div>
  )
}

function AccessDenied({ session, onLogout, onNavigate }) {
  return (
    <DashboardShell breadcrumbs={['Operations', 'Restricted']} currentPath={window.location.pathname} onLogout={onLogout} onNavigate={onNavigate} pageTitle="Reports and audit logs" user={session.user}>
      <section className="ga-card mx-auto max-w-lg p-7 text-center">
        <span aria-hidden="true" className="mx-auto grid size-12 place-items-center rounded-full bg-warning-soft font-black text-brand-amber">!</span>
        <h1 className="mt-4 text-2xl font-extrabold text-ink">Oversight access required</h1>
        <p className="mt-3 text-sm leading-6 text-muted-copy">Detailed reports and global audit logs are restricted to System Administrators and DSWD Staff.</p>
        <button type="button" onClick={() => onNavigate('/dashboard')} className="ga-btn-primary mt-6">Return to dashboard</button>
      </section>
    </DashboardShell>
  )
}

function ReportsPage({ session, onLogout, onNavigate, onSessionExpired }) {
  const [scope, setScope] = useState(() => readReportScope(window.location.search))
  const [eventResult, setEventResult] = useState(null)
  const [eventRetry, setEventRetry] = useState(0)
  const [snapshot, setSnapshot] = useState(null)
  const [failure, setFailure] = useState(null)
  const [fieldError, setFieldError] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [exportFeedback, setExportFeedback] = useState(null)
  const requestSerial = useRef(0)
  const scopeKey = reportLocation(scope)
  const eventKey = `${scope.distributionId}/${eventRetry}`
  const currentEvent = eventResult?.key === eventKey ? eventResult : null
  const selected = currentEvent?.data
  const busy = isGenerating || isExporting
  const eventReady = !scope.distributionId || Boolean(selected)
  const current = snapshot?.key === scopeKey ? snapshot : null
  const currentFailure = failure?.key === scopeKey ? failure : null
  const formRef = useRef(null)

  useEffect(() => {
    window.history.replaceState(window.history.state, '', reportLocation(scope, window.location.search))
  }, [scope])
  useEffect(() => () => { requestSerial.current++ }, [])
  useEffect(() => {
    if (!scope.distributionId) return undefined
    let active = true
    requestDistribution(session.accessToken, scope.distributionId).then((data) => {
      if (data.distributionId !== scope.distributionId) throw new Error('The returned event does not match your selection.')
      if (active) setEventResult({ key: eventKey, data })
    }).catch((issue) => {
      if (!active) return
      if (isSessionExpiredError(issue)) onSessionExpired()
      else setEventResult({ key: eventKey, error: getAuthErrorMessage(issue) })
    })
    return () => { active = false }
  }, [eventKey, onSessionExpired, scope.distributionId, session.accessToken])

  function changeScope(changes) {
    if (busy) return
    setScope((previous) => ({ ...previous, ...changes }))
    setFieldError('')
    setFailure(null)
    setExportFeedback(null)
  }

  async function loadReport(page = 1) {
    if (busy || !eventReady) return
    if (scope.type !== 'FUNDS' && !scope.distributionId) {
      setFieldError('Select a distribution event before generating this report.')
      formRef.current?.elements.namedItem('report-distribution')?.focus()
      return
    }
    if (scope.dateFrom && scope.dateTo && scope.dateFrom > scope.dateTo) {
      setFieldError('Date to must be the same as or later than Date from.')
      formRef.current?.elements.namedItem('report-date-to')?.focus()
      return
    }
    const serial = ++requestSerial.current
    setFieldError('')
    setFailure(null)
    setIsGenerating(true)
    const fetchPage = (nextPage) => {
      const filters = { page: nextPage, pageSize: 20, status: scope.status, dateFrom: scope.dateFrom, dateTo: scope.dateTo }
      return scope.type === 'FUNDS'
        ? requestFundUtilizationReport(session.accessToken, { ...filters, distributionId: scope.distributionId })
        : requestDistributionReport(session.accessToken, scope.distributionId, scope.type, scope.type === 'SUMMARY' ? {} : filters)
    }
    try {
      let generated = await fetchPage(page)
      const pages = generated.data.pagination
      if (pages && page > Math.max(1, pages.totalPages)) generated = await fetchPage(Math.max(1, pages.totalPages))
      if (generated.distributionId && generated.distributionId !== scope.distributionId) throw new Error('The returned report does not match the selected event. Try generating it again.')
      if (serial === requestSerial.current) setSnapshot({ key: scopeKey, scope, event: selected, report: generated })
    } catch (issue) {
      if (serial !== requestSerial.current) return
      if (isSessionExpiredError(issue)) onSessionExpired()
      else setFailure({ key: scopeKey, page, message: getAuthErrorMessage(issue) })
    } finally { if (serial === requestSerial.current) setIsGenerating(false) }
  }

  async function exportCsv() {
    if (busy || !selected) return
    const serial = ++requestSerial.current
    setIsExporting(true)
    setExportFeedback(null)
    try {
      const exported = await requestDistributionCsv(session.accessToken, scope.distributionId)
      if (serial !== requestSerial.current) return
      const url = URL.createObjectURL(new Blob([exported.csv], { type: 'text/csv;charset=utf-8' }))
      const link = document.createElement('a')
      link.href = url
      link.download = exported.filename
      link.click()
      URL.revokeObjectURL(url)
      setExportFeedback({ message: `Download started: ${exported.filename}. Export recorded in the audit log.` })
    } catch (issue) {
      if (serial !== requestSerial.current) return
      if (isSessionExpiredError(issue)) onSessionExpired()
      else setExportFeedback({ error: getAuthErrorMessage(issue) })
    } finally { if (serial === requestSerial.current) setIsExporting(false) }
  }

  return (
    <DashboardShell breadcrumbs={['Operations', 'Reports & review', 'Reports']} currentPath="/reports" onLogout={onLogout} onNavigate={onNavigate} pageTitle="Reports" user={session.user} showAssistant={false}>
      <header className="ga-page-header border-b border-line pb-5"><h1 className="ga-page-title">Operational reports</h1><p className="ga-page-copy">Select the records to review, then generate a report for that coverage.</p></header>
      <OversightNavigation onNavigate={onNavigate} role={session.user.role} />
      {selected && <nav aria-label="Selected event review" className="mt-3 flex flex-wrap gap-x-5">{[
        ...(session.user.role === 'SYSTEM_ADMIN' ? [['Return to event review', `/distributions/manage?event=${encodeURIComponent(scope.distributionId)}`]] : []),
        [selected.deliveryMode === 'PHYSICAL_GOODS' ? 'Review physical release records' : 'Review reconciliation', selected.deliveryMode === 'PHYSICAL_GOODS' ? `/claim-accountability?distribution=${encodeURIComponent(scope.distributionId)}` : `/dswd/ledger?distribution=${encodeURIComponent(scope.distributionId)}`],
      ].map(([label, href]) => <a key={href} href={href} onClick={(event) => { event.preventDefault(); onNavigate(href) }} className="ga-admin-link min-h-11">{label}</a>)}</nav>}

      <form ref={formRef} noValidate onSubmit={(event) => { event.preventDefault(); loadReport(1) }} className="mt-5 border border-line bg-white p-5 sm:p-6" aria-label="Report generator">
        <h2 className="text-lg font-bold text-ink">Report coverage</h2>
        <div className="mt-4 grid items-start gap-5 lg:grid-cols-2">
          <div><label htmlFor="report-type" className="ga-label">Report type</label><select id="report-type" value={scope.type} disabled={busy} onChange={(event) => changeScope({ type: event.target.value, status: '', ...(event.target.value === 'SUMMARY' ? { dateFrom: '', dateTo: '' } : {}) })} className="ga-input mt-2 cursor-pointer font-semibold">{reportTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><p className="mt-2 text-sm leading-6 text-muted-copy">{scope.type === 'SUMMARY' ? 'Overview of the whole selected event. Date and status filters do not apply.' : scope.type === 'FUNDS' ? 'Compare allocations and simulated credits for one event or all authorized distributions.' : 'Review recorded details within the selected event.'}</p></div>
          <ReportEventPicker token={session.accessToken} value={scope.distributionId} selected={selected} allowAll={scope.type === 'FUNDS'} disabled={busy} onSelect={(distributionId) => changeScope({ distributionId })} onSessionExpired={onSessionExpired} />
        </div>
        {scope.distributionId && !currentEvent && <p role="status" className="mt-3 text-sm"><LoadingLabel>Checking selected event...</LoadingLabel></p>}
        {currentEvent?.error && <div role="alert" className="mt-3 border-l-2 border-brand-amber bg-warning-soft p-3 text-sm leading-6"><p className="font-bold">Selected event could not be loaded</p><p>{currentEvent.error}</p><p className="mt-1">Retry or choose another event. Your selected event has not been replaced.</p><button type="button" disabled={busy} onClick={() => setEventRetry((value) => value + 1)} className="ga-admin-link min-h-11">Retry selected event</button></div>}
        {selected && <div className="mt-3 border-y border-line bg-slate-50 px-4 py-3 text-sm leading-6"><p className="break-words font-bold text-ink">{selected.title}</p><p className="break-words text-copy">{selected.program?.programName || 'Program not recorded'} / {selected.barangay?.barangayName || 'Barangay not recorded'} / {selected.distributionDate}</p></div>}
        {scope.type !== 'SUMMARY' && <div className="mt-5">
          <div className="grid gap-4 sm:grid-cols-3">
            {reportStatuses[scope.type] && <div><label htmlFor="report-status" className="ga-label">Status</label><select id="report-status" value={scope.status} disabled={busy} onChange={(event) => changeScope({ status: event.target.value })} className="ga-input mt-2"><option value="">All statuses</option>{reportStatuses[scope.type].map((status) => <option key={status} value={status}>{humanize(status)}</option>)}</select></div>}
            <div><label htmlFor="report-date-from" className="ga-label">Date from</label><input id="report-date-from" type="date" value={scope.dateFrom} disabled={busy} onChange={(event) => changeScope({ dateFrom: event.target.value })} aria-describedby="report-date-help" className="ga-input mt-2" /></div>
            <div><label htmlFor="report-date-to" className="ga-label">Date to</label><input id="report-date-to" type="date" value={scope.dateTo} disabled={busy} onChange={(event) => changeScope({ dateTo: event.target.value })} aria-invalid={Boolean(fieldError && scope.dateFrom && scope.dateTo && scope.dateFrom > scope.dateTo)} aria-describedby="report-date-help report-form-error" className="ga-input mt-2" /></div>
          </div><p id="report-date-help" className="mt-2 text-xs leading-5 text-muted-copy">{reportDateHelp[scope.type]} Leave dates blank to include all dates.</p>
        </div>}
        {fieldError && <p id="report-form-error" role="alert" className="mt-4 text-sm font-semibold text-brand-red">{fieldError}</p>}
        <div className="mt-5 flex flex-col gap-3 border-t border-line pt-4 sm:flex-row sm:items-center sm:justify-between"><p className="text-sm leading-6 text-muted-copy">{current ? 'Generate again to check for updated records.' : 'The report is generated only when you select Generate report.'}</p><button type="submit" disabled={busy || !eventReady} className="ga-btn-primary shrink-0">{isGenerating ? <LoadingLabel>Generating report...</LoadingLabel> : 'Generate report'}</button></div>
      </form>

      <details className="mt-4 border border-line bg-white p-4 sm:px-6">
        <summary className="min-h-11 cursor-pointer py-2.5 text-sm font-bold text-brand-blue">Download full-event CSV</summary>
        <div className="border-t border-line pt-4 text-sm leading-6">
          {selected ? <><p className="font-bold text-ink">{selected.title}</p><p className="mt-1 text-muted-copy">{selected.program?.programName} / {selected.barangay?.barangayName}</p></> : <p>Choose one distribution event to download its CSV.</p>}
          <p className="mt-3 text-copy">One row per allocated beneficiary, including schedule, claim, release, and simulated credit details. The download uses current event records.</p>
          <p className="mt-2 font-semibold text-ink">Report type, date, and status filters do not apply to this CSV.</p>
          <p className="mt-2 text-xs text-muted-copy">Government identifiers, contact details, and biometric templates are excluded.</p>
          <button type="button" onClick={exportCsv} disabled={busy || !selected} className="ga-btn-secondary mt-4">{isExporting ? <LoadingLabel>Preparing CSV...</LoadingLabel> : 'Export selected event CSV'}</button>
          {exportFeedback?.error && <div role="alert" className="mt-3 text-sm text-brand-red"><p>CSV download could not be prepared. {exportFeedback.error}</p><p className="mt-1">Select Export selected event CSV to retry.</p></div>}
          {exportFeedback?.message && <div role="status" className="mt-3 text-sm text-copy"><p>{exportFeedback.message}</p><a href="/audit-logs?entity=REPORT" onClick={(event) => { event.preventDefault(); onNavigate('/audit-logs?entity=REPORT') }} className="ga-admin-link min-h-11">Review export in audit logs</a></div>}
        </div>
      </details>

      {currentFailure && <section role="alert" className="mt-5 border-l-4 border-brand-amber bg-warning-soft p-4 text-sm leading-6"><h2 className="font-bold">{current ? 'Report could not be refreshed' : 'Report could not be generated'}</h2><p>{currentFailure.message}</p>{current && <p className="mt-2">Showing the last successful report below. It may not include the latest changes.</p>}<button type="button" disabled={busy || !eventReady} onClick={() => loadReport(currentFailure.page)} className="ga-btn-secondary mt-3">Retry report</button></section>}
      {isGenerating && <p role="status" className="mt-5 text-sm"><LoadingLabel>{current ? 'Refreshing report. The previous result remains visible.' : 'Generating the selected report...'}</LoadingLabel></p>}
      {current ? <ReportResult snapshot={current} onPage={loadReport} disabled={busy} /> : !isGenerating && !currentFailure && <section className="mt-5 border border-line bg-white p-5"><h2 className="font-bold text-ink">{snapshot ? 'Coverage changed' : 'No report generated yet'}</h2><p className="mt-2 text-sm leading-6 text-copy">{snapshot ? 'Generate a report for the selected coverage. The previous result is hidden because it uses different filters.' : 'Choose your report coverage above, then generate the records for review.'}</p></section>}
      <p className="mt-5 border-t border-line pt-4 text-xs leading-5 text-muted-copy">Capstone prototype. Reports are not COA-certified; wallet amounts are simulated.</p>
    </DashboardShell>
  )
}

function ReportResult({ snapshot, onPage, disabled }) {
  const { report, scope, event } = snapshot
  const definition = reportDefinition(scope.type, report.data)
  return (
    <section className="mt-6 min-w-0" aria-labelledby="report-result-heading" aria-busy={disabled}>
      <header className="border border-line border-t-4 border-t-brand-navy bg-white p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold text-muted-copy">Generated report</p><h2 id="report-result-heading" className="mt-1 text-xl font-bold text-ink">{reportLabel(scope.type)}</h2></div><p className="text-xs leading-5 text-muted-copy">Generated {formatDate(report.generatedAt)} / {report.timeZone}</p></div>
        <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">{[
          ['Event', event?.title || 'All authorized distributions'],
          ['Program / barangay', event ? `${event.program?.programName || 'Not recorded'} / ${event.barangay?.barangayName || 'Not recorded'}` : 'All authorized programs and barangays'],
          ['Date coverage', scope.type === 'SUMMARY' || (!scope.dateFrom && !scope.dateTo) ? 'All dates' : `${scope.dateFrom || 'Start of records'} to ${scope.dateTo || 'Latest records'}`],
          ['Status coverage', scope.status ? humanize(scope.status) : 'All statuses'],
        ].map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-muted-copy">{label}</dt><dd className="mt-1 break-words font-semibold leading-6 text-ink">{value}</dd></div>)}</dl>
        {reportDateHelp[scope.type] && <p className="mt-3 text-xs leading-5 text-muted-copy">{reportDateHelp[scope.type]}</p>}
      </header>
      <dl className={`ga-admin-summary mt-4 grid lg:grid-cols-4 ${scope.type === 'FUNDS' ? 'grid-cols-1 min-[400px]:grid-cols-2 max-[399px]:[&>div]:border-l-0 max-[399px]:[&>div+div]:border-t max-[399px]:[&>div+div]:border-line' : 'grid-cols-2'}`}>{definition.metrics.map(([label, value]) => <div key={label}><dt>{label}</dt><dd className="text-2xl font-semibold tabular-nums text-ink">{value}</dd></div>)}</dl>
      {scope.status && ['CLAIMS', 'SCHEDULES'].includes(scope.type) && <p className="mt-3 text-xs leading-5 text-muted-copy">Status totals cover all statuses within the date range. Matching records below follow your selected status.</p>}
      {definition.notice && <p className="mt-4 border-l-2 border-line pl-4 text-sm leading-6 text-copy">{definition.notice}</p>}
      {definition.rows && <DataTable caption={`${reportLabel(scope.type)} results`} columns={definition.columns} rows={definition.rows} empty="No records matched the selected report filters." />}
      {definition.pagination && <Pagination pagination={definition.pagination} onPage={onPage} disabled={disabled} />}
    </section>
  )
}

function reportDefinition(type, data) {
  if (type === 'SUMMARY') return {
    metrics: [
      ['Allocated beneficiaries', numberFormatter.format(data.beneficiaries.allocatedCount)],
      ...(data.physicalPackage ? [['Recorded handovers', data.physicalPackage.handoverCount == null ? 'Not recorded' : numberFormatter.format(data.physicalPackage.handoverCount)], ['Recorded package units', `${data.physicalPackage.recordedQuantity} ${data.physicalPackage.unit ?? 'known units'}`], ['Units on voided claims', numberFormatter.format(data.physicalPackage.voidedClaimQuantity)], ['Handovers without quantity', numberFormatter.format(data.physicalPackage.quantityNotRecordedCount)]] : []),
      ['Claim completion', `${data.beneficiaries.claimCompletionPercentage}%`, 'success'],
      ['Queue utilization', `${data.slots.capacityUtilizationPercentage}%`, 'pending'],
      ['Verification exceptions', numberFormatter.format(data.qrScans.duplicateCount + data.qrScans.invalidCount + data.biometrics.noMatchCount), 'danger'],
    ],
    notice: data.distribution.deliveryMode === 'PHYSICAL_GOODS'
      ? `${data.distribution.title} · ${data.distribution.program.programName} · ${data.distribution.barangay.barangayName}. Physical assistance release; wallet credits are not required. Recorded handovers and quantities include voided claims; voiding does not record returned goods.`
      : `${data.distribution.title} · ${data.distribution.program.programName} · ${data.distribution.barangay.barangayName}. Simulated net credited: ${formatMoney(data.fundUtilization.netCreditedAmount)}; real funds moved: No.`,
  }
  if (type === 'CLAIMS') return {
    metrics: [['Matching claims', numberFormatter.format(data.summary.matchingClaimCount)], ['Claimed', numberFormatter.format(data.summary.statusCounts.CLAIMED ?? 0), 'success'], ['Verified', numberFormatter.format(data.summary.statusCounts.VERIFIED ?? 0)], ['Rejected or voided', numberFormatter.format((data.summary.statusCounts.REJECTED ?? 0) + (data.summary.statusCounts.VOIDED ?? 0)), 'danger']],
    rows: data.claims,
    columns: [['Recorded', (row) => formatDate(row.recordedAt)], ['Beneficiary', (row) => row.beneficiaryName], ['Queue', (row) => row.queueNumber], ['Verification', (row) => humanize(row.verificationMethod)], ['Delivery', (row) => humanize(row.deliveryMode)], ['Released', (row) => row.releasedAt ? <><span className="font-semibold text-ink">{formatDate(row.releasedAt)}</span><span className="mt-1 block text-xs text-muted-copy">{row.releasedBy?.fullName ?? 'Staff not recorded'} · {row.releaseEvidenceReference ?? 'No evidence reference'}</span></> : 'Not recorded'], ['Package handed over', (row) => row.releasedQuantity != null ? `${row.releasedPackageName}: ${row.releasedQuantity} ${row.releasedPackageUnit}` : row.deliveryMode === 'PHYSICAL_GOODS' ? 'Quantity not recorded' : 'Not applicable'], ['Allocated', (row) => formatMoney(row.allocatedAmount)], ['Status', (row) => <StatusBadge value={row.claimStatus} />]],
    pagination: data.pagination,
  }
  if (type === 'SCHEDULES') return {
    metrics: [['Matching schedules', numberFormatter.format(data.summary.matchingScheduleCount)], ['Scheduled', numberFormatter.format(data.summary.statusCounts.SCHEDULED ?? 0), 'pending'], ['Checked in', numberFormatter.format(data.summary.statusCounts.CHECKED_IN ?? 0), 'success'], ['Missed', numberFormatter.format(data.summary.statusCounts.MISSED ?? 0)]],
    rows: data.schedules,
    columns: [['Slot start', (row) => formatDate(row.slotStart)], ['Beneficiary', (row) => row.beneficiaryName], ['Queue', (row) => row.queueNumber], ['Assignment', (row) => row.assignedByAi ? 'Automated rules' : 'Staff assigned'], ['Schedule', (row) => <StatusBadge value={row.scheduleStatus} />], ['Claim', (row) => row.claimStatus ? humanize(row.claimStatus) : 'No claim']],
    pagination: data.pagination,
  }
  if (type === 'ANOMALIES') return {
    metrics: [['Total anomalies', numberFormatter.format(data.summary.total), 'danger'], ['QR anomalies', numberFormatter.format(data.summary.qrAnomalyCount), 'danger'], ['Biometric anomalies', numberFormatter.format(data.summary.biometricAnomalyCount)], ['Transaction anomalies', numberFormatter.format(data.summary.transactionAnomalyCount), 'danger']],
    rows: data.anomalies,
    columns: [['Occurred', (row) => formatDate(row.occurredAt)], ['Category', (row) => humanize(row.category)], ['Result', (row) => humanize(row.result)], ['Severity', (row) => <StatusBadge value={row.severity} />], ['Reference', (row) => <span className="font-mono text-xs">{row.anomalyId}</span>]],
    pagination: data.pagination,
  }
  return {
    metrics: [['Allocated', formatMoney(data.totals.allocatedAmount)], ['Net simulated credit', formatMoney(data.totals.netCreditedAmount), 'success'], ['Remaining', formatMoney(data.totals.remainingAmount), 'pending'], ['Real funds moved', 'No']],
    notice: 'Closed-loop prototype ledger only. This report is not connected to banking, payment, or government disbursement rails.',
    rows: data.distributions,
    columns: [['Distribution', (row) => row.distribution.title], ['Date', (row) => row.distribution.distributionDate], ['Program / barangay', (row) => `${row.distribution.program.programCode} · ${row.distribution.barangay.barangayName}`], ['Allocated', (row) => formatMoney(row.utilization.allocatedAmount)], ['Net credited', (row) => formatMoney(row.utilization.netCreditedAmount)], ['Remaining', (row) => formatMoney(row.utilization.remainingAmount)]],
    pagination: data.pagination,
  }
}

function DataTable({ caption, columns, rows, empty }) {
  const rowKey = (row, index) => row.auditId ?? row.claimId ?? row.scheduleId ?? row.anomalyId ?? row.distribution?.distributionId ?? index
  return (
    <div className="ga-card mt-5 overflow-hidden">
      {rows.length === 0 ? <div className="p-8 text-center"><h3 className="font-extrabold text-ink">No records found</h3><p className="mt-2 text-sm text-muted-copy">{empty}</p></div> : <>
        <ul className="divide-y divide-line md:hidden" aria-label={caption}>
          {rows.map((row, rowIndex) => <li key={rowKey(row, rowIndex)} className="space-y-3 p-5">{columns.map(([label, render]) => <dl key={label} className="grid grid-cols-[7rem_minmax(0,1fr)] gap-3 text-sm"><dt className="text-muted-copy">{label}</dt><dd className="min-w-0 break-words text-copy">{render(row)}</dd></dl>)}</li>)}
        </ul>
        <div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[820px] border-collapse text-left text-sm"><caption className="sr-only">{caption}</caption><thead><tr className="border-b border-line bg-slate-50 text-xs uppercase tracking-[0.08em] text-muted-copy">{columns.map(([label]) => <th key={label} scope="col" className="px-5 py-3 font-bold">{label}</th>)}</tr></thead><tbody className="divide-y divide-line">{rows.map((row, rowIndex) => <tr key={rowKey(row, rowIndex)} className="align-top hover:bg-slate-50/70">{columns.map(([label, render]) => <td key={label} className="px-5 py-4 text-copy">{render(row)}</td>)}</tr>)}</tbody></table></div>
      </>}
    </div>
  )
}

function StatusBadge({ value }) {
  const success = ['COMPLETED', 'CLAIMED', 'CHECKED_IN', 'LOW'].includes(value)
  const danger = ['HIGH', 'FAILED', 'REJECTED', 'VOIDED'].includes(value)
  const style = success ? 'border-emerald-200 bg-success-soft text-brand-green' : danger ? 'border-red-200 bg-danger-soft text-brand-red' : 'border-amber-200 bg-warning-soft text-brand-amber'
  return <span className={`inline-flex whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-bold ${style}`}>{humanize(value)}</span>
}

function Pagination({ pagination, onPage, disabled = false }) {
  const totalPages = Math.max(pagination.totalPages, 1)
  return <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-white px-5 py-3"><p className="text-xs font-semibold text-muted-copy">Page {pagination.page} of {totalPages} · {numberFormatter.format(pagination.total)} records</p><div className="flex gap-2"><button type="button" disabled={disabled || pagination.page <= 1} onClick={() => onPage(pagination.page - 1)} className="min-h-11 cursor-pointer rounded-lg border border-line px-4 text-sm font-bold text-copy disabled:cursor-not-allowed disabled:opacity-50">Previous</button><button type="button" disabled={disabled || pagination.page >= totalPages} onClick={() => onPage(pagination.page + 1)} className="min-h-11 cursor-pointer rounded-lg border border-line px-4 text-sm font-bold text-copy disabled:cursor-not-allowed disabled:opacity-50">Next</button></div></div>
}

function AuditLogsPage({ session, onLogout, onNavigate, onSessionExpired }) {
  const emptyFilters = { action: '', entityAffected: '', dateFrom: '', dateTo: '' }
  const [draft, setDraft] = useState(() => ({ ...emptyFilters, entityAffected: new URLSearchParams(window.location.search).get('entity') || '' }))
  const [filters, setFilters] = useState(draft)
  const [page, setPage] = useState(1)
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [selectedLog, setSelectedLog] = useState(null)

  useEffect(() => {
    let active = true
    requestAuditLogs(session.accessToken, {
      page,
      pageSize: 15,
      action: filters.action,
      entityAffected: filters.entityAffected,
      dateFrom: filters.dateFrom ? `${filters.dateFrom}T00:00:00+08:00` : '',
      dateTo: filters.dateTo ? `${filters.dateTo}T23:59:59.999+08:00` : '',
    })
      .then((result) => { if (active) { setData(result); setError('') } })
      .catch((requestError) => {
        if (!active) return
        if (isSessionExpiredError(requestError)) return onSessionExpired()
        setError(getAuthErrorMessage(requestError))
      })
      .finally(() => { if (active) setIsLoading(false) })
    return () => { active = false }
  }, [filters, onSessionExpired, page, session.accessToken])

  function applyFilters(event) {
    event.preventDefault()
    if (draft.dateFrom && draft.dateTo && draft.dateFrom > draft.dateTo) {
      setError('Date to must be the same as or later than Date from.')
      return
    }
    setError('')
    setIsLoading(true)
    setPage(1)
    setFilters({ ...draft })
  }

  function clearFilters() {
    setDraft(emptyFilters)
    setError('')
    setIsLoading(true)
    setPage(1)
    setFilters(emptyFilters)
  }

  const logs = data?.auditLogs ?? []
  const pageSystemActions = logs.filter((log) => log.actorType === 'SYSTEM').length
  const pageReportActions = logs.filter((log) => log.entityAffected === 'REPORT').length

  return (
    <DashboardShell breadcrumbs={['Operations', 'Oversight', 'Audit logs']} currentPath="/audit-logs" onLogout={onLogout} onNavigate={onNavigate} pageTitle="Audit logs" user={session.user}>
      <header className="ga-page-header border-b border-line pb-6"><p className="ga-eyebrow">Read-only oversight</p><h1 className="ga-page-title mt-2">Audit logs</h1><p className="ga-page-copy">Find who changed a record, what changed, and when. Use the filters to narrow the log.</p></header>
      <OversightNavigation onNavigate={onNavigate} role={session.user.role} />

      <form onSubmit={applyFilters} className="ga-card mt-6 p-5 sm:p-6" aria-label="Audit log filters">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5"><div><label htmlFor="audit-action" className="ga-label">Action</label><input id="audit-action" value={draft.action} onChange={(event) => setDraft((current) => ({ ...current, action: event.target.value }))} placeholder="e.g. STAFF_LOGIN" className="ga-input mt-2 uppercase placeholder:normal-case" /></div><div><label htmlFor="audit-entity" className="ga-label">Entity</label><input id="audit-entity" value={draft.entityAffected} onChange={(event) => setDraft((current) => ({ ...current, entityAffected: event.target.value }))} placeholder="e.g. REPORT" className="ga-input mt-2 uppercase placeholder:normal-case" /></div><div><label htmlFor="audit-date-from" className="ga-label">Date from</label><input id="audit-date-from" type="date" value={draft.dateFrom} onChange={(event) => setDraft((current) => ({ ...current, dateFrom: event.target.value }))} className="ga-input mt-2" /></div><div><label htmlFor="audit-date-to" className="ga-label">Date to</label><input id="audit-date-to" type="date" value={draft.dateTo} onChange={(event) => setDraft((current) => ({ ...current, dateTo: event.target.value }))} className="ga-input mt-2" /></div><div className="flex gap-2 self-end"><button type="submit" className="ga-btn-primary flex-1">Apply</button><button type="button" onClick={clearFilters} className="ga-btn-secondary flex-1">Reset</button></div></div>
      </form>

      {isLoading ? <ReportSkeleton /> : error ? <section className="mt-6 rounded-xl border border-amber-200 bg-white p-5" role="alert"><h2 className="font-extrabold text-ink">Audit logs could not be loaded</h2><p className="mt-2 text-sm leading-6 text-muted-copy">{error}</p><button type="button" onClick={() => { setIsLoading(true); setFilters({ ...filters }) }} className="ga-btn-primary mt-4">Try again</button></section> : <>
        <section className="mt-6 grid gap-4 sm:grid-cols-3" aria-label="Audit log summary"><article className="ga-card p-5"><p className="text-xs font-bold uppercase tracking-[0.08em] text-muted-copy">Matching records</p><p className="mt-3 text-3xl font-black text-ink">{numberFormatter.format(data.pagination.total)}</p></article><article className="ga-card p-5"><p className="text-xs font-bold uppercase tracking-[0.08em] text-muted-copy">System actions on page</p><p className="mt-3 text-3xl font-black text-brand-blue">{pageSystemActions}</p></article><article className="ga-card p-5"><p className="text-xs font-bold uppercase tracking-[0.08em] text-muted-copy">Report actions on page</p><p className="mt-3 text-3xl font-black text-brand-green">{pageReportActions}</p></article></section>
        <AuditTable logs={logs} onViewDetails={setSelectedLog} />
        <Pagination pagination={data.pagination} onPage={(nextPage) => { setIsLoading(true); setPage(nextPage) }} />
      </>}
      {selectedLog && <AuditDetailDialog log={selectedLog} onClose={() => setSelectedLog(null)} />}
    </DashboardShell>
  )
}

function AuditTable({ logs, onViewDetails }) {
  if (logs.length === 0) return <section className="mt-5 rounded-xl border border-dashed border-line bg-white p-8 text-center"><span aria-hidden="true" className="mx-auto grid size-12 place-items-center rounded-full bg-info-soft font-black text-brand-blue">0</span><h2 className="mt-4 text-xl font-extrabold text-ink">No audit records found</h2><p className="mt-2 text-sm text-muted-copy">Adjust the action, entity, or date filters to review another scope.</p></section>
  return (
    <div className="ga-card mt-5 overflow-hidden">
      <ul className="divide-y divide-line md:hidden" aria-label="Sanitized GarantiyAid audit log records">
        {logs.map((log) => <li key={log.auditId} className="p-5"><div className="flex items-start justify-between gap-3"><div><p className="font-bold text-ink">{log.user?.fullName ?? humanize(log.actorType)}</p><p className="mt-1 text-sm text-muted-copy">{formatDate(log.createdAt)}</p></div><StatusBadge value={log.entityAffected} /></div><dl className="mt-4 grid gap-3 border-t border-line pt-4 text-sm"><div><dt className="text-muted-copy">Action</dt><dd className="mt-1 font-semibold text-copy">{humanize(log.action)}</dd></div><div><dt className="text-muted-copy">Record</dt><dd className="mt-1 break-all font-mono text-xs text-copy">{log.recordId ?? 'Not applicable'}</dd></div></dl><AuditDetails log={log} onOpen={onViewDetails} /></li>)}
      </ul>
      <div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[980px] border-collapse text-left text-sm"><caption className="sr-only">Sanitized GarantiyAid audit log records</caption><thead><tr className="border-b border-line bg-slate-50 text-xs uppercase tracking-[0.08em] text-muted-copy"><th scope="col" className="px-5 py-3">Recorded</th><th scope="col" className="px-5 py-3">Actor</th><th scope="col" className="px-5 py-3">Action</th><th scope="col" className="px-5 py-3">Entity</th><th scope="col" className="px-5 py-3">Record</th><th scope="col" className="px-5 py-3">Details</th></tr></thead><tbody className="divide-y divide-line">{logs.map((log) => <tr key={log.auditId} className="hover:bg-slate-50/70"><td className="whitespace-nowrap px-5 py-4 text-xs text-muted-copy">{formatDate(log.createdAt)}</td><td className="px-5 py-4"><p className="font-bold text-ink">{log.user?.fullName ?? humanize(log.actorType)}</p><p className="mt-1 text-xs text-muted-copy">{log.user?.employeeId ?? log.actorType}</p></td><td className="px-5 py-4"><span className="font-semibold text-copy">{humanize(log.action)}</span></td><td className="px-5 py-4"><StatusBadge value={log.entityAffected} /></td><td className="max-w-52 px-5 py-4 font-mono text-xs text-muted-copy"><span className="break-all">{log.recordId ?? 'Not applicable'}</span></td><td className="px-5 py-4"><AuditDetails log={log} onOpen={onViewDetails} /></td></tr>)}</tbody></table></div>
    </div>
  )
}

function AuditDetails({ log, onOpen }) {
  return <button type="button" onClick={() => onOpen(log)} className="inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-xs font-bold text-brand-blue transition-colors hover:bg-info-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue">View details<Icon name="chevronRight" className="size-3.5" strokeWidth={2.2} /></button>
}

function AuditDetailDialog({ log, onClose }) {
  const dialogRef = useRef(null)
  const details = Object.entries(log.details ?? {})
  useEffect(() => { dialogRef.current?.showModal() }, [])

  return (
    <dialog ref={dialogRef} onCancel={onClose} onClose={onClose} aria-labelledby="audit-detail-title" className="m-auto max-h-[calc(100dvh-2rem)] w-[min(42rem,calc(100%-2rem))] overflow-y-auto rounded-2xl border border-line bg-white p-0 text-ink shadow-2xl backdrop:bg-slate-950/60 backdrop:backdrop-blur-[3px]">
      <div className="p-5 sm:p-7">
        <header className="flex items-start justify-between gap-5">
          <div className="min-w-0"><p className="ga-eyebrow">Audit record</p><h2 id="audit-detail-title" className="mt-2 text-2xl font-extrabold text-ink">{humanize(log.action)}</h2><p className="mt-2 text-sm leading-6 text-muted-copy">{log.user?.fullName ?? humanize(log.actorType)} · {formatDate(log.createdAt)}</p></div>
          <button type="button" onClick={() => dialogRef.current?.close()} aria-label="Close audit record" className="grid size-11 shrink-0 place-items-center rounded-lg border border-line text-copy transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-brand-blue"><Icon name="close" /></button>
        </header>

        <dl className="mt-6 grid gap-3 rounded-xl border border-line bg-slate-50 p-4 sm:grid-cols-3">
          <div><dt className="text-xs font-semibold text-muted-copy">Entity</dt><dd className="mt-2"><StatusBadge value={log.entityAffected} /></dd></div>
          <div className="sm:col-span-2"><dt className="text-xs font-semibold text-muted-copy">Record reference</dt><dd className="mt-2 break-all font-mono text-xs font-semibold text-copy">{log.recordId ?? 'Not applicable'}</dd></div>
          <div className="sm:col-span-3"><dt className="text-xs font-semibold text-muted-copy">Source IP</dt><dd className="mt-1 text-sm font-bold text-ink">{log.ipAddress ?? 'Not recorded'}</dd></div>
        </dl>

        <section className="mt-6" aria-labelledby="audit-fields-title">
          <h3 id="audit-fields-title" className="text-sm font-extrabold text-ink">Recorded details</h3>
          {details.length === 0 ? <p className="mt-3 rounded-xl border border-dashed border-line p-5 text-sm text-muted-copy">No additional details were recorded for this action.</p> : <dl className="mt-3 divide-y divide-line rounded-xl border border-line px-4">{details.map(([key, value]) => <AuditDetail key={key} label={humanizeAuditKey(key)} value={value} />)}</dl>}
        </section>

        <footer className="mt-7 flex justify-end border-t border-line pt-5"><button type="button" onClick={() => dialogRef.current?.close()} className="ga-btn-primary">Close</button></footer>
      </div>
    </dialog>
  )
}

function humanizeAuditKey(value) {
  return value.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replaceAll('_', ' ').replace(/^./, (letter) => letter.toUpperCase())
}

function AuditDetail({ label, value }) {
  const displayValue = value == null || value === ''
    ? 'Not recorded'
    : Array.isArray(value)
      ? value.join(', ')
      : typeof value === 'object'
        ? JSON.stringify(value)
        : String(value)
  return <div className="grid gap-1 py-3 sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-4"><dt className="text-xs font-semibold text-muted-copy">{label}</dt><dd className="break-words text-sm font-semibold leading-5 text-copy">{displayValue === '[REDACTED]' ? <span className="inline-flex rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-xs text-muted-copy">Protected</span> : displayValue}</dd></div>
}

function ReportsAuditPage(props) {
  if (!authorizedRoles.has(props.session.user.role)) return <AccessDenied session={props.session} onLogout={props.onLogout} onNavigate={props.onNavigate} />
  return props.view === 'reports' ? <ReportsPage {...props} /> : <AuditLogsPage {...props} />
}

export default ReportsAuditPage
