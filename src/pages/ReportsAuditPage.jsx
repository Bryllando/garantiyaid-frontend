import { useEffect, useRef, useState } from 'react'
import DashboardShell from '../components/layout/DashboardShell.jsx'
import ReportEventPicker from '../components/dswd/ReportEventPicker.jsx'
import DistributionStatusReport from '../components/dswd/DistributionStatusReport.jsx'
import { readReportScope, reportDateHelp, reportLocation, reportQuestions, reportStatuses, reportTypes } from '../utils/reportScope.js'
import { Icon } from '../components/ui/icon.jsx'
import { Skeleton, SkeletonRows } from '../components/ui/skeleton.jsx'
import { LoadingLabel } from '../components/ui/spinner.jsx'
import { OverviewEmptyState } from '../components/ui/overview.jsx'
import { auditDocument, reportCoverage, reportDefinition, reportDocument, reportExplanation, reportFinding } from '../utils/reportPresentation.js'
import {
  getAuthErrorMessage,
  isSessionExpiredError,
  requestAuditLogs,
  requestDistribution,
  requestDistributionCsv,
  requestReportSnapshot,
  requestAuditExport,
} from '../auth/staffAuth.js'

const authorizedRoles = new Set(['SYSTEM_ADMIN', 'DSWD_STAFF'])
const numberFormatter = new Intl.NumberFormat('en-PH')
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
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false)
  const [isExplaining, setIsExplaining] = useState(false)
  const [pdfError, setPdfError] = useState('')
  const [aiError, setAiError] = useState('')
  const [resultPage, setResultPage] = useState(1)
  const requestSerial = useRef(0)
  const scopeKey = reportLocation(scope)
  const eventKey = `${scope.distributionId}/${eventRetry}`
  const currentEvent = eventResult?.key === eventKey ? eventResult : null
  const selected = currentEvent?.data
  const busy = isGenerating || isExporting || isDownloadingPdf || isExplaining
  const eventReady = !scope.distributionId || Boolean(selected)
  const current = snapshot?.key === scopeKey ? snapshot : null
  const currentFailure = failure?.key === scopeKey ? failure : null
  const formRef = useRef(null)
  const [filtersOpen, setFiltersOpen] = useState(Boolean(scope.status || scope.dateFrom || scope.dateTo))
  const activeFilters = [scope.status && humanize(scope.status), scope.dateFrom && `From ${scope.dateFrom}`, scope.dateTo && `To ${scope.dateTo}`].filter(Boolean)

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
    setPdfError('')
    setAiError('')
  }

  async function loadReport(page = 1, explain = false) {
    if (busy || !eventReady) return
    if (scope.type !== 'FUNDS' && !scope.distributionId) {
      setFieldError('Select a distribution event before generating this report.')
      formRef.current?.elements.namedItem('report-distribution')?.focus()
      return
    }
    if (scope.dateFrom && scope.dateTo && scope.dateFrom > scope.dateTo) {
      setFieldError('Date to must be the same as or later than Date from.')
      const endDate = formRef.current?.elements.namedItem('report-date-to')
      if (endDate) {
        endDate.closest('details').open = true
        endDate.focus()
      }
      return
    }
    const serial = ++requestSerial.current
    setFieldError('')
    setFailure(null)
    setIsGenerating(true)
    setIsExplaining(explain)
    if (!explain) setAiError('')
    setPdfError('')
    try {
      const generated = await requestReportSnapshot(session.accessToken, scope, { explain })
      if (generated.distributionId && generated.distributionId !== scope.distributionId) throw new Error('The returned report does not match the selected event. Try generating it again.')
      if (serial === requestSerial.current) {
        setSnapshot({ key: scopeKey, scope, event: generated.event ?? selected, report: generated })
        setResultPage(1)
        setAiError('')
      }
    } catch (issue) {
      if (serial !== requestSerial.current) return
      if (isSessionExpiredError(issue)) onSessionExpired()
      else if (explain) setAiError(getAuthErrorMessage(issue))
      else setFailure({ key: scopeKey, page, message: getAuthErrorMessage(issue) })
    } finally { if (serial === requestSerial.current) { setIsGenerating(false); setIsExplaining(false) } }
  }

  async function exportPdf() {
    if (busy || !current) return
    const serial = requestSerial.current
    setIsDownloadingPdf(true)
    setPdfError('')
    try {
      const { createReportPdf, downloadReportPdf } = await import('../utils/reportPdf.js')
      const blob = await createReportPdf(reportDocument(current, session.user))
      if (serial === requestSerial.current) downloadReportPdf(blob, current.scope.type, current.report.generatedAt)
    } catch (issue) {
      if (serial === requestSerial.current) setPdfError(issue.message || 'The PDF could not be prepared. Try again.')
    } finally { if (serial === requestSerial.current) setIsDownloadingPdf(false) }
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
    <DashboardShell breadcrumbs={['Operations', 'Reports & review', 'Reports']} currentPath="/reports" onLogout={onLogout} onNavigate={onNavigate} pageTitle="Reports" user={session.user}>
      <div className="ga-reports-workspace">
      <header className="ga-page-header flex flex-wrap items-start justify-between gap-x-6 gap-y-3 border-b border-line pb-5">
        <div className="min-w-0"><h1 className="ga-page-title"><Icon name="reports" className="size-6" />Operational reports</h1><p className="ga-page-copy">Review distribution status or generate a report for selected records.</p></div>
        <a href="#report-generator-heading" className="ga-btn-primary inline-flex items-center gap-2" onClick={(event) => {
          if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return
          const heading = formRef.current?.querySelector('#report-generator-heading')
          if (!heading) return
          event.preventDefault()
          heading.focus({ preventScroll: true })
          heading.scrollIntoView({ block: 'start', behavior: 'instant' })
        }}>Choose a report<Icon name="arrowRight" className="size-4 rotate-90" /></a>
      </header>
      <OversightNavigation onNavigate={onNavigate} role={session.user.role} />
      <DistributionStatusReport key={session.accessToken} token={session.accessToken} onSessionExpired={onSessionExpired} />
      {selected && <nav aria-label="Selected event review" className="mt-3 flex flex-wrap gap-x-5">{[
        ...(session.user.role === 'SYSTEM_ADMIN' ? [['Return to event review', `/distributions/manage?event=${encodeURIComponent(scope.distributionId)}`]] : []),
        [selected.deliveryMode === 'PHYSICAL_GOODS' ? 'Review physical release records' : 'Review reconciliation', selected.deliveryMode === 'PHYSICAL_GOODS' ? `/claim-accountability?distribution=${encodeURIComponent(scope.distributionId)}` : `/dswd/ledger?distribution=${encodeURIComponent(scope.distributionId)}`],
      ].map(([label, href]) => <a key={href} href={href} onClick={(event) => { event.preventDefault(); onNavigate(href) }} className="ga-admin-link min-h-11">{label}</a>)}</nav>}

      <form ref={formRef} noValidate onSubmit={(event) => { event.preventDefault(); loadReport(1) }} className="ga-card mt-5 p-5 sm:p-6" aria-label="Report generator">
        <h2 id="report-generator-heading" tabIndex={-1} className="ga-section-heading">Choose a report</h2>
        <div className="mt-4 grid items-start gap-5 lg:grid-cols-2">
          <div><label htmlFor="report-type" className="ga-label">Report type</label><select id="report-type" aria-describedby="report-question" value={scope.type} disabled={busy} onChange={(event) => changeScope({ type: event.target.value, status: '', ...(event.target.value === 'SUMMARY' ? { dateFrom: '', dateTo: '' } : {}) })} className="ga-input mt-2 cursor-pointer font-semibold">{reportTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><p id="report-question" className="mt-2 text-sm leading-6 text-copy">{reportQuestions[scope.type]}</p></div>
          <ReportEventPicker token={session.accessToken} value={scope.distributionId} selected={selected} allowAll={scope.type === 'FUNDS'} disabled={busy} onSelect={(distributionId) => changeScope({ distributionId })} onSessionExpired={onSessionExpired} />
        </div>
        {scope.distributionId && !currentEvent && <SkeletonRows label="Checking selected event" className="mt-3 border-y border-line bg-slate-50" rows={1} />}
        {currentEvent?.error && <div role="alert" className="mt-3 border-l-2 border-brand-amber bg-warning-soft p-3 text-sm leading-6"><p className="font-bold">Selected event could not be loaded</p><p>{currentEvent.error}</p><p className="mt-1">Retry or choose another event. Your selected event has not been replaced.</p><button type="button" disabled={busy} onClick={() => setEventRetry((value) => value + 1)} className="ga-admin-link min-h-11">Retry selected event</button></div>}
        {selected && <div className="mt-3 border-y border-line bg-slate-50 px-4 py-3 text-sm leading-6"><p className="break-words font-bold text-ink">{selected.title}</p><p className="break-words text-copy">{selected.program?.programName || 'Program not recorded'} / {selected.barangay?.barangayName || 'Barangay not recorded'} / {selected.distributionDate}</p></div>}
        {scope.type !== 'SUMMARY' && <details className="mt-4 border-t border-line" open={filtersOpen} onToggle={event => setFiltersOpen(event.currentTarget.open)}>
          <summary className="cursor-pointer py-3 text-sm font-semibold text-brand-blue">Report filters <span className="ml-2 font-normal text-copy">{activeFilters.join(' · ') || (reportStatuses[scope.type] ? 'All dates and statuses' : 'All dates')}</span></summary>
          <p id="report-date-help" className="mb-3 text-sm text-copy">{reportDateHelp[scope.type]}</p>
          <div className="grid gap-4 sm:grid-cols-3">
            {reportStatuses[scope.type] && <div><label htmlFor="report-status" className="ga-label">Status</label><select id="report-status" value={scope.status} disabled={busy} onChange={(event) => changeScope({ status: event.target.value })} className="ga-input mt-2"><option value="">All statuses</option>{reportStatuses[scope.type].map((status) => <option key={status} value={status}>{humanize(status)}</option>)}</select></div>}
            <div><label htmlFor="report-date-from" className="ga-label">Date from</label><input id="report-date-from" type="date" value={scope.dateFrom} disabled={busy} onChange={(event) => changeScope({ dateFrom: event.target.value })} aria-describedby="report-date-help" className="ga-input mt-2" /></div>
            <div><label htmlFor="report-date-to" className="ga-label">Date to</label><input id="report-date-to" type="date" value={scope.dateTo} disabled={busy} onChange={(event) => changeScope({ dateTo: event.target.value })} aria-invalid={Boolean(fieldError && scope.dateFrom && scope.dateTo && scope.dateFrom > scope.dateTo)} aria-describedby="report-date-help report-form-error" className="ga-input mt-2" /></div>
          </div>
        </details>}
        {fieldError && <p id="report-form-error" role="alert" className="mt-4 text-sm font-semibold text-brand-red">{fieldError}</p>}
        <div className="mt-5 flex flex-col gap-3 border-t border-line pt-4 sm:flex-row sm:items-center sm:justify-between"><p className="text-sm leading-6 text-muted-copy">{current ? 'Generate again to check for updated records.' : 'Choose the coverage to include.'}</p><button type="submit" disabled={busy || !eventReady} className="ga-btn-primary shrink-0">{isGenerating ? <LoadingLabel>{isExplaining ? 'Preparing AI highlights...' : 'Generating report...'}</LoadingLabel> : <><Icon name="reports" className="size-4" />Generate report</>}</button></div>
      </form>

      {currentFailure && <section role="alert" className="mt-5 border-l-4 border-brand-amber bg-warning-soft p-4 text-sm leading-6"><h2 className="font-bold">{current ? 'Report could not be refreshed' : 'Report could not be generated'}</h2><p>{currentFailure.message}</p>{current && <p className="mt-2">Showing the last successful report below. It may not include the latest changes.</p>}<button type="button" disabled={busy || !eventReady} onClick={() => loadReport(currentFailure.page)} className="ga-btn-secondary mt-3">Retry report</button></section>}
      {isGenerating && (current ? <p role="status" className="mt-5 text-sm"><LoadingLabel>Refreshing report. The previous result remains visible.</LoadingLabel></p> : <ReportSkeleton />)}
      {current ? (
        <ReportResult snapshot={current} page={resultPage} onPage={setResultPage} disabled={busy} aiError={aiError}>
          <div className="ga-report-actions">
            <p>The PDF includes every matching record across all pages of this report.{scope.type === 'SUMMARY' && ' Summary PDFs include claims, schedules, exceptions, and simulated fund utilization.'}</p>
            <div>
              <button type="button" onClick={exportPdf} disabled={busy} className="ga-btn-primary"><Icon name="download" className="size-4" />{isDownloadingPdf ? <LoadingLabel>Preparing PDF...</LoadingLabel> : 'Download report PDF'}</button>
              <button type="button" onClick={() => loadReport(1, true)} disabled={busy} className="ga-btn-secondary"><Icon name="info" className="size-4" />{isExplaining ? <LoadingLabel>Preparing highlights...</LoadingLabel> : 'Explain with AI'}</button>
            </div>
          </div>
          {pdfError && <p role="alert" className="ga-report-feedback">{pdfError}</p>}
        </ReportResult>
      ) : snapshot && !isGenerating && !currentFailure && <section className="ga-card mt-5"><OverviewEmptyState icon="reports" title="Coverage changed"><p>Generate a report for the selected coverage. The previous result is hidden because it uses different filters.</p></OverviewEmptyState></section>}
      <details className="ga-card mt-4 p-4 sm:px-6">
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
      <p className="mt-5 border-t border-line pt-4 text-xs leading-5 text-muted-copy">Capstone prototype. Reports are not COA-certified. Wallet amounts are simulated.</p>
      </div>
    </DashboardShell>
  )
}

function ReportResult({ snapshot, page, onPage, disabled, aiError, children }) {
  const { report, scope, event } = snapshot
  const definition = reportDefinition(scope.type, report.data, report)
  const rows = definition.rows?.slice((page - 1) * 20, page * 20)
  const showExplanation = Boolean(report.aiExplanation || aiError)
  const resultRef = useRef(null)
  const explanationRef = useRef(null)
  useEffect(() => {
    const heading = explanationRef.current ?? resultRef.current
    heading?.focus({ preventScroll: true })
    heading?.closest('section')?.scrollIntoView({ block: 'start' })
  }, [snapshot, aiError])
  return (
    <section className="ga-generated-report mt-6 min-w-0" aria-labelledby="report-result-heading" aria-busy={disabled}>
      <header className="ga-card border-t-4 border-t-brand-blue p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold text-muted-copy">Generated report</p><h2 ref={resultRef} tabIndex={-1} id="report-result-heading" className="mt-1 text-xl font-bold text-ink">{reportLabel(scope.type)}</h2></div><p className="text-xs leading-5 text-muted-copy">Generated {formatDate(report.generatedAt)} PHT</p></div>
        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm lg:grid-cols-4">{reportCoverage(scope, event).map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-muted-copy">{label}</dt><dd className="mt-1 break-words font-semibold leading-6 text-ink">{value}</dd></div>)}</dl>
        {reportDateHelp[scope.type] && <p className="mt-3 text-xs leading-5 text-muted-copy">{reportDateHelp[scope.type]}</p>}
        {!showExplanation && <p className="mt-4 border-t border-line pt-3 text-lg font-semibold text-brand-navy" role="status">{reportFinding(scope, report.data)}</p>}
        {children}
      </header>
      {showExplanation && <ReportExplanation snapshot={snapshot} headingRef={explanationRef} aiError={aiError} />}
      <details key={snapshot.key} className="ga-report-reading mt-4 border-y border-line">
        <summary className="cursor-pointer py-3 text-sm font-semibold text-brand-blue">How to read this report</summary>
        {definition.notice && <p className="mt-4 border-l-2 border-line pl-4 text-sm leading-6 text-copy">{definition.notice}</p>}
        <dl className={`ga-admin-summary mt-4 grid lg:grid-cols-4 ${scope.type === 'FUNDS' ? 'grid-cols-1 min-[400px]:grid-cols-2 max-[399px]:[&>div]:border-l-0 max-[399px]:[&>div+div]:border-t max-[399px]:[&>div+div]:border-line' : 'grid-cols-2'}`}>{definition.metrics.map(([label, value]) => <div key={label}><dt>{label}</dt><dd className="text-2xl font-semibold tabular-nums text-ink">{value}</dd></div>)}</dl>
        {scope.type === 'SUMMARY' && <section className="ga-card ga-report-explanations" aria-labelledby="supporting-sections-heading"><header><h3 id="supporting-sections-heading"><Icon name="audit" />Included in the summary PDF</h3></header><dl>{Object.entries(report.supportingReports ?? {}).map(([type, supporting]) => <div key={type}><dt>{reportLabel(type)}</dt><dd>{numberFormatter.format(supporting.data.pagination.total)} records from the same event snapshot.</dd></div>)}</dl></section>}
      </details>
      {rows && <DataTable caption={`${reportLabel(scope.type)} results`} columns={definition.columns} rows={rows} empty="No records matched the selected report filters." />}
      {definition.rows && <Pagination pagination={{ page, total: definition.rows.length, totalPages: Math.ceil(definition.rows.length / 20) }} onPage={onPage} disabled={disabled} />}
    </section>
  )
}

function ReportExplanation({ snapshot, headingRef, aiError }) {
  const { finding, matchLabel, paragraphs, table, details, context, dateMeaning, simulation } = reportExplanation(snapshot)
  return (
    <section className="ga-card ga-generated-report mt-5 border-t-4 border-t-brand-navy p-5 text-sm leading-6 text-copy sm:p-7" aria-labelledby="report-explanation-heading">
      <h3 ref={headingRef} id="report-explanation-heading" tabIndex={-1} className="font-semibold text-brand-navy">Report explanation</h3>
      <div className="mt-3 border-l-4 border-brand-blue bg-info-soft px-4 py-3">
        {matchLabel && <p className="text-sm font-semibold text-brand-blue">{matchLabel}</p>}
        <p className="text-lg font-semibold leading-snug text-brand-navy">{finding}</p>
      </div>
      {paragraphs.length > 0 && <div className="mt-5 space-y-2">
        <h4 className="font-semibold text-ink">What the figures mean</h4>
        {paragraphs.map(paragraph => <p key={paragraph}>{paragraph}</p>)}
      </div>}
      {table && <table className="mt-5 w-full border-collapse text-left">
        <caption className="pb-2 text-left font-semibold text-ink">{table.caption}</caption>
        <thead className="border-y border-line bg-slate-50"><tr>
          <th scope="col" className="px-3 py-2 font-semibold">{table.columns[0]}</th>
          <th scope="col" className="px-3 py-2 text-right font-semibold">{table.columns[1]}</th>
        </tr></thead>
        <tbody className="divide-y divide-line border-b border-line">{table.rows.map(([label, value]) => <tr key={label}>
          <th scope="row" className="break-words px-3 py-2 text-left font-normal">{label}</th>
          <td className="px-3 py-2 text-right font-semibold tabular-nums text-ink">{value}</td>
        </tr>)}</tbody>
      </table>}
      <div className="mt-5">
        <h4 className="font-semibold text-ink">What this covers</h4>
        <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1">
          {details.map(([label, value]) => <div key={label} className="col-span-full grid grid-cols-subgrid gap-x-3">
            <dt className="text-muted-copy">{label}</dt><dd className="break-words font-medium text-ink">{value}</dd>
          </div>)}
        </dl>
        {dateMeaning && <p className="mt-2">{dateMeaning}</p>}
        {context && <p className="mt-1">{context}</p>}
      </div>
      {simulation && <p className="mt-4 border-t border-line pt-3 text-sm text-muted-copy">{simulation}</p>}
      {aiError && <div role="alert" className="ga-report-feedback"><p>{aiError}</p><p>This explanation uses the last generated report.</p></div>}
    </section>
  )
}

function DataTable({ caption, columns, rows, empty }) {
  const rowKey = (row, index) => row.auditId ?? row.claimId ?? row.scheduleId ?? row.anomalyId ?? row.distribution?.distributionId ?? index
  return (
    <div className="ga-card mt-5 overflow-hidden">
      {rows.length === 0 ? <div className="p-8 text-center"><h3 className="font-extrabold text-ink">No records found</h3><p className="mt-2 text-sm text-muted-copy">{empty}</p></div> : <>
        <ul className="divide-y divide-line md:hidden" aria-label={caption}>
          {rows.map((row, rowIndex) => <li key={rowKey(row, rowIndex)} className="space-y-3 p-5">{columns.map(([label, render]) => <dl key={label} className="grid grid-cols-[7rem_minmax(0,1fr)] gap-3 text-sm"><dt className="text-muted-copy">{label}</dt><dd className="min-w-0 whitespace-pre-line break-words text-copy">{reportCell(label, render(row))}</dd></dl>)}</li>)}
        </ul>
        <div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[820px] border-collapse text-left text-sm"><caption className="sr-only">{caption}</caption><thead><tr className="border-b border-line bg-slate-50 text-xs uppercase tracking-[0.08em] text-muted-copy">{columns.map(([label]) => <th key={label} scope="col" className="px-5 py-3 font-bold">{label}</th>)}</tr></thead><tbody className="divide-y divide-line">{rows.map((row, rowIndex) => <tr key={rowKey(row, rowIndex)} className="align-top hover:bg-slate-50/70">{columns.map(([label, render]) => <td key={label} className="whitespace-pre-line px-5 py-4 text-copy">{reportCell(label, render(row))}</td>)}</tr>)}</tbody></table></div>
      </>}
    </div>
  )
}

function reportCell(label, value) {
  return ['Status', 'Schedule', 'Severity'].includes(label) ? <StatusBadge value={String(value).toUpperCase().replaceAll(' ', '_')} /> : value
}

function auditFilters(filters) {
  return { ...filters, dateFrom: filters.dateFrom ? `${filters.dateFrom}T00:00:00+08:00` : '', dateTo: filters.dateTo ? `${filters.dateTo}T23:59:59.999+08:00` : '' }
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
  const [filterError, setFilterError] = useState('')
  const [pdfError, setPdfError] = useState('')
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false)
  const exportSerial = useRef(0)

  useEffect(() => () => { exportSerial.current++ }, [])

  useEffect(() => {
    let active = true
    requestAuditLogs(session.accessToken, { ...auditFilters(filters), page, pageSize: 15 })
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
    if (isDownloadingPdf) return
    if (draft.dateFrom && draft.dateTo && draft.dateFrom > draft.dateTo) {
      setFilterError('Date to must be the same as or later than Date from.')
      return
    }
    setFilterError('')
    setPdfError('')
    setError('')
    setIsLoading(true)
    setPage(1)
    setFilters({ ...draft })
  }

  function clearFilters() {
    if (isDownloadingPdf) return
    setDraft(emptyFilters)
    setError('')
    setIsLoading(true)
    setPage(1)
    setFilters(emptyFilters)
    setFilterError('')
    setPdfError('')
  }

  async function exportPdf() {
    if (isDownloadingPdf || isLoading || error || !data) return
    const serial = ++exportSerial.current
    setIsDownloadingPdf(true)
    setPdfError('')
    try {
      const exported = await requestAuditExport(session.accessToken, auditFilters(filters))
      const { createReportPdf, downloadReportPdf } = await import('../utils/reportPdf.js')
      const blob = await createReportPdf(auditDocument(exported, filters, session.user))
      if (serial === exportSerial.current) downloadReportPdf(blob, 'AUDIT', exported.generatedAt)
    } catch (issue) {
      if (serial !== exportSerial.current) return
      if (isSessionExpiredError(issue)) onSessionExpired()
      else setPdfError(getAuthErrorMessage(issue))
    } finally { if (serial === exportSerial.current) setIsDownloadingPdf(false) }
  }

  const logs = data?.auditLogs ?? []
  const pageSystemActions = logs.filter((log) => log.actorType === 'SYSTEM').length
  const pageReportActions = logs.filter((log) => log.entityAffected === 'REPORT').length

  return (
    <DashboardShell breadcrumbs={['Operations', 'Oversight', 'Audit logs']} currentPath="/audit-logs" onLogout={onLogout} onNavigate={onNavigate} pageTitle="Audit logs" user={session.user}>
      <div className="ga-reports-workspace">
      <header className="ga-page-header flex flex-wrap items-start justify-between gap-4 border-b border-line pb-6"><div><h1 className="ga-page-title"><Icon name="audit" className="size-6" />Audit logs</h1><p className="ga-page-copy">Review staff and system actions, inspect recorded details, and export the applied coverage.</p></div><button type="button" onClick={exportPdf} disabled={isLoading || isDownloadingPdf || Boolean(error) || !data} className="ga-btn-primary"><Icon name="download" className="size-4" />{isDownloadingPdf ? <LoadingLabel>Preparing PDF...</LoadingLabel> : 'Download PDF'}</button></header>
      <OversightNavigation onNavigate={onNavigate} role={session.user.role} />

      <form onSubmit={applyFilters} className="ga-card mt-6 p-5 sm:p-6" aria-label="Audit log filters">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5"><div><label htmlFor="audit-action" className="ga-label">Action</label><input id="audit-action" value={draft.action} onChange={(event) => setDraft((current) => ({ ...current, action: event.target.value }))} placeholder="e.g. STAFF_LOGIN" className="ga-input mt-2 uppercase placeholder:normal-case" /></div><div><label htmlFor="audit-entity" className="ga-label">Entity</label><input id="audit-entity" value={draft.entityAffected} onChange={(event) => setDraft((current) => ({ ...current, entityAffected: event.target.value }))} placeholder="e.g. REPORT" className="ga-input mt-2 uppercase placeholder:normal-case" /></div><div><label htmlFor="audit-date-from" className="ga-label">Date from</label><input id="audit-date-from" type="date" value={draft.dateFrom} onChange={(event) => setDraft((current) => ({ ...current, dateFrom: event.target.value }))} className="ga-input mt-2" /></div><div><label htmlFor="audit-date-to" className="ga-label">Date to</label><input id="audit-date-to" type="date" value={draft.dateTo} onChange={(event) => setDraft((current) => ({ ...current, dateTo: event.target.value }))} className="ga-input mt-2" /></div><div className="flex gap-2 self-end"><button type="submit" className="ga-btn-primary flex-1">Apply</button><button type="button" onClick={clearFilters} className="ga-btn-secondary flex-1">Reset</button></div></div>
        {filterError && <p role="alert" className="mt-3 text-sm text-brand-red">{filterError}</p>}
        <p className="mt-4 border-t border-line pt-3 text-xs leading-5 text-muted-copy">Download PDF includes every record matching the applied filters. Apply draft filter changes before exporting them.</p>
      </form>
      {pdfError && <p role="alert" className="ga-report-feedback">{pdfError}</p>}

      {isLoading ? <ReportSkeleton /> : error ? <section className="mt-6 rounded-xl border border-amber-200 bg-white p-5" role="alert"><h2 className="font-extrabold text-ink">Audit logs could not be loaded</h2><p className="mt-2 text-sm leading-6 text-muted-copy">{error}</p><button type="button" onClick={() => { setIsLoading(true); setFilters({ ...filters }) }} className="ga-btn-primary mt-4">Try again</button></section> : <>
        <section className="mt-6 grid gap-4 sm:grid-cols-3" aria-label="Audit log summary"><article className="ga-card p-5"><p className="text-xs font-bold uppercase tracking-[0.08em] text-muted-copy">Matching records</p><p className="mt-3 text-3xl font-black text-ink">{numberFormatter.format(data.pagination.total)}</p></article><article className="ga-card p-5"><p className="text-xs font-bold uppercase tracking-[0.08em] text-muted-copy">System actions on page</p><p className="mt-3 text-3xl font-black text-brand-blue">{pageSystemActions}</p></article><article className="ga-card p-5"><p className="text-xs font-bold uppercase tracking-[0.08em] text-muted-copy">Report actions on page</p><p className="mt-3 text-3xl font-black text-brand-green">{pageReportActions}</p></article></section>
        <AuditTable logs={logs} onViewDetails={setSelectedLog} />
        <Pagination pagination={data.pagination} disabled={isDownloadingPdf} onPage={(nextPage) => { setIsLoading(true); setPage(nextPage) }} />
      </>}
      {selectedLog && <AuditDetailDialog log={selectedLog} onClose={() => setSelectedLog(null)} />}
      </div>
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
