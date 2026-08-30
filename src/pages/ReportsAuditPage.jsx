import { useEffect, useState } from 'react'
import DashboardShell from '../components/layout/DashboardShell.jsx'
import { Skeleton } from '../components/ui/skeleton.jsx'
import { LoadingLabel } from '../components/ui/spinner.jsx'
import {
  getAuthErrorMessage,
  isSessionExpiredError,
  requestAuditLogs,
  requestDistributionCsv,
  requestDistributionList,
  requestDistributionReport,
  requestFundUtilizationReport,
} from '../auth/staffAuth.js'

const authorizedRoles = new Set(['SYSTEM_ADMIN', 'DSWD_STAFF'])
const reportTypes = [
  ['SUMMARY', 'Distribution summary'],
  ['CLAIMS', 'Claim status'],
  ['SCHEDULES', 'Queue schedules'],
  ['ANOMALIES', 'Anomaly review'],
  ['FUNDS', 'Simulated fund utilization'],
]
const reportStatuses = {
  CLAIMS: ['PENDING', 'VERIFIED', 'CLAIMED', 'REJECTED', 'VOIDED'],
  SCHEDULES: ['SCHEDULED', 'CHECKED_IN', 'MISSED', 'CANCELLED'],
  FUNDS: ['DRAFT', 'OPEN', 'CLOSED', 'CANCELLED'],
}
const numberFormatter = new Intl.NumberFormat('en-PH')
const moneyFormatter = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' })
const dateFormatter = new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Manila' })

function humanize(value = '') {
  return value.toLowerCase().replaceAll('_', ' ').replace(/^./, (letter) => letter.toUpperCase())
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
  const [distributions, setDistributions] = useState([])
  const [reportType, setReportType] = useState('SUMMARY')
  const [distributionId, setDistributionId] = useState('')
  const [status, setStatus] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [report, setReport] = useState(null)
  const [error, setError] = useState('')
  const [isLoadingDistributions, setIsLoadingDistributions] = useState(true)
  const [isGenerating, setIsGenerating] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [exportMessage, setExportMessage] = useState('')

  useEffect(() => {
    let active = true
    // ponytail: the latest 100 events fit the current capstone dataset; add server search when this ceiling is reached.
    requestDistributionList(session.accessToken, { page: 1, pageSize: 100 })
      .then((data) => {
        if (!active) return
        setDistributions(data.distributions)
        setDistributionId(data.distributions[0]?.distributionId ?? '')
        setError('')
      })
      .catch((requestError) => {
        if (!active) return
        if (isSessionExpiredError(requestError)) return onSessionExpired()
        setError(getAuthErrorMessage(requestError))
      })
      .finally(() => { if (active) setIsLoadingDistributions(false) })
    return () => { active = false }
  }, [onSessionExpired, session.accessToken])

  async function loadReport(page = 1) {
    if (reportType !== 'FUNDS' && !distributionId) {
      setError('Select a distribution event before generating this report.')
      return
    }
    if (dateFrom && dateTo && dateFrom > dateTo) {
      setError('Date to must be the same as or later than Date from.')
      return
    }

    setError('')
    setExportMessage('')
    setIsGenerating(true)
    try {
      const filters = { page, pageSize: 20, status, dateFrom, dateTo }
      const generated = reportType === 'FUNDS'
        ? await requestFundUtilizationReport(session.accessToken, { ...filters, distributionId })
        : await requestDistributionReport(session.accessToken, distributionId, reportType, reportType === 'SUMMARY' ? {} : filters)
      setReport(generated)
    } catch (requestError) {
      if (isSessionExpiredError(requestError)) return onSessionExpired()
      setError(getAuthErrorMessage(requestError))
    } finally {
      setIsGenerating(false)
    }
  }

  async function exportCsv() {
    if (!distributionId) return
    setIsExporting(true)
    setExportMessage('')
    try {
      const exported = await requestDistributionCsv(session.accessToken, distributionId)
      const url = URL.createObjectURL(new Blob([exported.csv], { type: 'text/csv;charset=utf-8' }))
      const link = document.createElement('a')
      link.href = url
      link.download = exported.filename
      link.click()
      URL.revokeObjectURL(url)
      setExportMessage(`${exported.filename} downloaded. The export action was recorded in the audit log.`)
    } catch (requestError) {
      if (isSessionExpiredError(requestError)) return onSessionExpired()
      setError(getAuthErrorMessage(requestError))
    } finally {
      setIsExporting(false)
    }
  }

  const statusOptions = reportStatuses[reportType] ?? []
  const filtersSupported = reportType !== 'SUMMARY'

  return (
    <DashboardShell breadcrumbs={['Operations', 'Oversight', 'Reports']} currentPath="/reports" onLogout={onLogout} onNavigate={onNavigate} pageTitle="Reports" user={session.user}>
      <header className="flex flex-col gap-5 border-b border-line pb-6 xl:flex-row xl:items-end xl:justify-between">
        <div><p className="ga-eyebrow">Authorized reporting</p><h1 className="ga-page-title mt-2">Operational reports</h1><p className="ga-page-copy">Generate privacy-conscious operational reports from current GarantiyAid records. Every generated report and export is audited.</p></div>
        <button type="button" onClick={exportCsv} disabled={!distributionId || isExporting} className="ga-btn-secondary">{isExporting ? <LoadingLabel>Preparing CSV...</LoadingLabel> : 'Export compliance CSV'}</button>
      </header>

      <section className="mt-6 rounded-xl border border-blue-200 bg-info-soft p-4 text-sm leading-6 text-copy" aria-label="Report limitation"><strong className="text-ink">Prototype compliance review:</strong> Reports are not COA-certified. Simulated fund reports do not represent actual government disbursements.</section>

      <form onSubmit={(event) => { event.preventDefault(); loadReport(1) }} className="ga-card mt-6 p-5 sm:p-6" aria-label="Report generator">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div><label htmlFor="report-type" className="ga-label">Report type</label><select id="report-type" value={reportType} onChange={(event) => { setReportType(event.target.value); setStatus(''); setReport(null) }} className="ga-input mt-2 cursor-pointer font-semibold">{reportTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
          <div><label htmlFor="report-distribution" className="ga-label">Distribution event</label><select id="report-distribution" value={distributionId} required={reportType !== 'FUNDS'} onChange={(event) => { setDistributionId(event.target.value); setReport(null) }} disabled={isLoadingDistributions} className="ga-input mt-2 cursor-pointer font-semibold">{reportType === 'FUNDS' && <option value="">All distributions</option>}{distributions.map((distribution) => <option key={distribution.distributionId} value={distribution.distributionId}>{distribution.title} · {distribution.distributionDate}</option>)}</select></div>
          {filtersSupported && <><div><label htmlFor="report-status" className="ga-label">Status</label><select id="report-status" value={status} onChange={(event) => setStatus(event.target.value)} disabled={statusOptions.length === 0} className="ga-input mt-2 cursor-pointer font-semibold"><option value="">All statuses</option>{statusOptions.map((value) => <option key={value} value={value}>{humanize(value)}</option>)}</select></div><div className="grid grid-cols-2 gap-3"><div><label htmlFor="report-date-from" className="ga-label">Date from</label><input id="report-date-from" type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} className="ga-input mt-2 px-2" /></div><div><label htmlFor="report-date-to" className="ga-label">Date to</label><input id="report-date-to" type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} className="ga-input mt-2 px-2" /></div></div></>}
        </div>
        <div className="mt-5 flex flex-col gap-3 border-t border-line pt-5 sm:flex-row sm:items-center sm:justify-between"><p className="text-sm leading-5 text-muted-copy">Only authorized operational fields are returned; government IDs, contact details, tokens, and biometric templates are excluded.</p><button type="submit" disabled={isGenerating || isLoadingDistributions || (reportType !== 'FUNDS' && !distributionId)} className="ga-btn-primary shrink-0">{isGenerating ? <LoadingLabel>Generating report...</LoadingLabel> : 'Generate report'}</button></div>
      </form>

      <div aria-live="polite" aria-atomic="true">{exportMessage && <p className="mt-4 rounded-lg border border-emerald-200 bg-success-soft px-4 py-3 text-sm font-semibold text-brand-green">{exportMessage}</p>}</div>
      {error && <section className="mt-5 rounded-xl border border-amber-200 bg-white p-5" role="alert"><h2 className="font-extrabold text-ink">Report request could not be completed</h2><p className="mt-2 text-sm leading-6 text-muted-copy">{error}</p></section>}
      {isGenerating ? <ReportSkeleton /> : report ? <ReportResult report={report} type={reportType} onPage={loadReport} /> : !error && <section className="mt-6 rounded-xl border border-dashed border-line bg-white p-8 text-center"><span aria-hidden="true" className="mx-auto grid size-12 place-items-center rounded-full bg-info-soft font-black text-brand-blue">RP</span><h2 className="mt-4 text-xl font-extrabold text-ink">Choose a report to begin</h2><p className="mt-2 text-sm leading-6 text-muted-copy">Select the report scope, then generate a current read-only snapshot.</p></section>}
    </DashboardShell>
  )
}

function ReportResult({ report, type, onPage }) {
  const definition = reportDefinition(type, report.data)
  return (
    <section className="mt-6" aria-labelledby="report-result-heading">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.14em] text-brand-green">Generated report</p><h2 id="report-result-heading" className="mt-1 text-2xl font-extrabold text-ink">{reportLabel(type)}</h2></div><p className="text-xs font-semibold text-muted-copy">Generated {formatDate(report.generatedAt)} · {report.timeZone}</p></div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{definition.metrics.map(([label, value, tone = 'default']) => <article key={label} className="ga-card p-5"><p className="text-xs font-bold uppercase tracking-[0.08em] text-muted-copy">{label}</p><p className={`mt-3 text-2xl font-black tracking-tight ${tone === 'success' ? 'text-brand-green' : tone === 'danger' ? 'text-brand-red' : tone === 'pending' ? 'text-brand-amber' : 'text-ink'}`}>{value}</p></article>)}</div>
      {definition.notice && <p className="mt-4 rounded-lg border border-line bg-slate-50 px-4 py-3 text-xs leading-5 text-muted-copy">{definition.notice}</p>}
      {definition.rows && <DataTable caption={`${reportLabel(type)} results`} columns={definition.columns} rows={definition.rows} empty="No records matched the selected report filters." />}
      {definition.pagination && <Pagination pagination={definition.pagination} onPage={onPage} />}
    </section>
  )
}

function reportDefinition(type, data) {
  if (type === 'SUMMARY') return {
    metrics: [
      ['Allocated beneficiaries', numberFormatter.format(data.beneficiaries.allocatedCount)],
      ['Claim completion', `${data.beneficiaries.claimCompletionPercentage}%`, 'success'],
      ['Queue utilization', `${data.slots.capacityUtilizationPercentage}%`, 'pending'],
      ['Verification exceptions', numberFormatter.format(data.qrScans.duplicateCount + data.qrScans.invalidCount + data.biometrics.noMatchCount), 'danger'],
    ],
    notice: `${data.distribution.title} · ${data.distribution.program.programName} · ${data.distribution.barangay.barangayName}. Simulated net credited: ${formatMoney(data.fundUtilization.netCreditedAmount)}; real funds moved: No.`,
  }
  if (type === 'CLAIMS') return {
    metrics: [['Matching claims', numberFormatter.format(data.summary.matchingClaimCount)], ['Claimed', numberFormatter.format(data.summary.statusCounts.CLAIMED ?? 0), 'success'], ['Verified', numberFormatter.format(data.summary.statusCounts.VERIFIED ?? 0)], ['Rejected or voided', numberFormatter.format((data.summary.statusCounts.REJECTED ?? 0) + (data.summary.statusCounts.VOIDED ?? 0)), 'danger']],
    rows: data.claims,
    columns: [['Recorded', (row) => formatDate(row.recordedAt)], ['Beneficiary', (row) => row.beneficiaryName], ['Queue', (row) => row.queueNumber], ['Verification', (row) => humanize(row.verificationMethod)], ['Signature', (row) => row.signatureVerified ? 'Secured' : '—'], ['Allocated', (row) => formatMoney(row.allocatedAmount)], ['Status', (row) => <StatusBadge value={row.claimStatus} />]],
    pagination: data.pagination,
  }
  if (type === 'SCHEDULES') return {
    metrics: [['Matching schedules', numberFormatter.format(data.summary.matchingScheduleCount)], ['Scheduled', numberFormatter.format(data.summary.statusCounts.SCHEDULED ?? 0), 'pending'], ['Checked in', numberFormatter.format(data.summary.statusCounts.CHECKED_IN ?? 0), 'success'], ['Missed', numberFormatter.format(data.summary.statusCounts.MISSED ?? 0)]],
    rows: data.schedules,
    columns: [['Slot start', (row) => formatDate(row.slotStart)], ['Beneficiary', (row) => row.beneficiaryName], ['Queue', (row) => row.queueNumber], ['Assignment', (row) => row.assignedByAi ? 'System-assisted' : 'Staff assigned'], ['Schedule', (row) => <StatusBadge value={row.scheduleStatus} />], ['Claim', (row) => row.claimStatus ? humanize(row.claimStatus) : 'No claim']],
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

function Pagination({ pagination, onPage }) {
  const totalPages = Math.max(pagination.totalPages, 1)
  return <div className="mt-4 flex items-center justify-between rounded-xl border border-line bg-white px-5 py-3"><p className="text-xs font-semibold text-muted-copy">Page {pagination.page} of {totalPages} · {numberFormatter.format(pagination.total)} records</p><div className="flex gap-2"><button type="button" disabled={pagination.page <= 1} onClick={() => onPage(pagination.page - 1)} className="min-h-11 cursor-pointer rounded-lg border border-line px-4 text-sm font-bold text-copy disabled:cursor-not-allowed disabled:opacity-50">Previous</button><button type="button" disabled={pagination.page >= totalPages} onClick={() => onPage(pagination.page + 1)} className="min-h-11 cursor-pointer rounded-lg border border-line px-4 text-sm font-bold text-copy disabled:cursor-not-allowed disabled:opacity-50">Next</button></div></div>
}

function AuditLogsPage({ session, onLogout, onNavigate, onSessionExpired }) {
  const emptyFilters = { action: '', entityAffected: '', dateFrom: '', dateTo: '' }
  const [draft, setDraft] = useState(emptyFilters)
  const [filters, setFilters] = useState(emptyFilters)
  const [page, setPage] = useState(1)
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let active = true
    requestAuditLogs(session.accessToken, {
      page,
      pageSize: 25,
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

  const logs = data?.auditLogs ?? []
  const pageSystemActions = logs.filter((log) => log.actorType === 'SYSTEM').length
  const pageReportActions = logs.filter((log) => log.entityAffected === 'REPORT').length

  return (
    <DashboardShell breadcrumbs={['Operations', 'Oversight', 'Audit logs']} currentPath="/audit-logs" onLogout={onLogout} onNavigate={onNavigate} pageTitle="Audit logs" user={session.user}>
      <header className="border-b border-line pb-6"><p className="ga-eyebrow">Read-only oversight</p><h1 className="ga-page-title mt-2">Audit logs</h1><p className="ga-page-copy">Trace sanitized staff and system actions in newest-first order. Audit records cannot be edited or deleted from this workspace.</p></header>

      <form onSubmit={applyFilters} className="ga-card mt-6 p-5 sm:p-6" aria-label="Audit log filters">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5"><div><label htmlFor="audit-action" className="ga-label">Action</label><input id="audit-action" value={draft.action} onChange={(event) => setDraft((current) => ({ ...current, action: event.target.value }))} placeholder="e.g. STAFF_LOGIN" className="ga-input mt-2 uppercase placeholder:normal-case" /></div><div><label htmlFor="audit-entity" className="ga-label">Entity</label><input id="audit-entity" value={draft.entityAffected} onChange={(event) => setDraft((current) => ({ ...current, entityAffected: event.target.value }))} placeholder="e.g. REPORT" className="ga-input mt-2 uppercase placeholder:normal-case" /></div><div><label htmlFor="audit-date-from" className="ga-label">Date from</label><input id="audit-date-from" type="date" value={draft.dateFrom} onChange={(event) => setDraft((current) => ({ ...current, dateFrom: event.target.value }))} className="ga-input mt-2" /></div><div><label htmlFor="audit-date-to" className="ga-label">Date to</label><input id="audit-date-to" type="date" value={draft.dateTo} onChange={(event) => setDraft((current) => ({ ...current, dateTo: event.target.value }))} className="ga-input mt-2" /></div><button type="submit" className="ga-btn-primary self-end">Apply filters</button></div>
      </form>

      {isLoading ? <ReportSkeleton /> : error ? <section className="mt-6 rounded-xl border border-amber-200 bg-white p-5" role="alert"><h2 className="font-extrabold text-ink">Audit logs could not be loaded</h2><p className="mt-2 text-sm leading-6 text-muted-copy">{error}</p><button type="button" onClick={() => { setIsLoading(true); setFilters({ ...filters }) }} className="ga-btn-primary mt-4">Try again</button></section> : <>
        <section className="mt-6 grid gap-4 sm:grid-cols-3" aria-label="Audit log summary"><article className="ga-card p-5"><p className="text-xs font-bold uppercase tracking-[0.08em] text-muted-copy">Matching records</p><p className="mt-3 text-3xl font-black text-ink">{numberFormatter.format(data.pagination.total)}</p></article><article className="ga-card p-5"><p className="text-xs font-bold uppercase tracking-[0.08em] text-muted-copy">System actions on page</p><p className="mt-3 text-3xl font-black text-brand-blue">{pageSystemActions}</p></article><article className="ga-card p-5"><p className="text-xs font-bold uppercase tracking-[0.08em] text-muted-copy">Report actions on page</p><p className="mt-3 text-3xl font-black text-brand-green">{pageReportActions}</p></article></section>
        <AuditTable logs={logs} />
        <Pagination pagination={data.pagination} onPage={(nextPage) => { setIsLoading(true); setPage(nextPage) }} />
      </>}
    </DashboardShell>
  )
}

function AuditTable({ logs }) {
  if (logs.length === 0) return <section className="mt-5 rounded-xl border border-dashed border-line bg-white p-8 text-center"><span aria-hidden="true" className="mx-auto grid size-12 place-items-center rounded-full bg-info-soft font-black text-brand-blue">0</span><h2 className="mt-4 text-xl font-extrabold text-ink">No audit records found</h2><p className="mt-2 text-sm text-muted-copy">Adjust the action, entity, or date filters to review another scope.</p></section>
  return (
    <div className="ga-card mt-5 overflow-hidden">
      <ul className="divide-y divide-line md:hidden" aria-label="Sanitized GarantiyAid audit log records">
        {logs.map((log) => <li key={log.auditId} className="p-5"><div className="flex items-start justify-between gap-3"><div><p className="font-bold text-ink">{log.user?.fullName ?? humanize(log.actorType)}</p><p className="mt-1 text-sm text-muted-copy">{formatDate(log.createdAt)}</p></div><StatusBadge value={log.entityAffected} /></div><dl className="mt-4 grid gap-3 border-t border-line pt-4 text-sm"><div><dt className="text-muted-copy">Action</dt><dd className="mt-1 font-semibold text-copy">{humanize(log.action)}</dd></div><div><dt className="text-muted-copy">Record</dt><dd className="mt-1 break-all font-mono text-xs text-copy">{log.recordId ?? 'Not applicable'}</dd></div></dl><AuditDetails log={log} /></li>)}
      </ul>
      <div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[980px] border-collapse text-left text-sm"><caption className="sr-only">Sanitized GarantiyAid audit log records</caption><thead><tr className="border-b border-line bg-slate-50 text-xs uppercase tracking-[0.08em] text-muted-copy"><th scope="col" className="px-5 py-3">Recorded</th><th scope="col" className="px-5 py-3">Actor</th><th scope="col" className="px-5 py-3">Action</th><th scope="col" className="px-5 py-3">Entity</th><th scope="col" className="px-5 py-3">Record</th><th scope="col" className="px-5 py-3">Details</th></tr></thead><tbody className="divide-y divide-line">{logs.map((log) => <tr key={log.auditId} className="align-top hover:bg-slate-50/70"><td className="whitespace-nowrap px-5 py-4 text-xs text-muted-copy">{formatDate(log.createdAt)}</td><td className="px-5 py-4"><p className="font-bold text-ink">{log.user?.fullName ?? humanize(log.actorType)}</p><p className="mt-1 text-xs text-muted-copy">{log.user?.employeeId ?? log.actorType}</p></td><td className="px-5 py-4"><span className="font-semibold text-copy">{humanize(log.action)}</span></td><td className="px-5 py-4"><StatusBadge value={log.entityAffected} /></td><td className="max-w-52 px-5 py-4 font-mono text-xs text-muted-copy"><span className="break-all">{log.recordId ?? 'Not applicable'}</span></td><td className="px-5 py-4"><AuditDetails log={log} /></td></tr>)}</tbody></table></div>
    </div>
  )
}

function AuditDetails({ log }) {
  return <details className="group mt-3 md:mt-0"><summary className="min-h-11 cursor-pointer list-none rounded-lg border border-line px-3 py-2.5 text-center text-xs font-bold text-brand-blue hover:bg-info-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue">View details</summary><div className="mt-2 w-80 max-w-full rounded-lg bg-brand-navy p-3 text-slate-100"><p className="text-xs font-bold text-blue-200">IP: {log.ipAddress ?? 'Not recorded'}</p><pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words text-xs leading-5">{JSON.stringify(log.details ?? {}, null, 2)}</pre></div></details>
}

function ReportsAuditPage(props) {
  if (!authorizedRoles.has(props.session.user.role)) return <AccessDenied session={props.session} onLogout={props.onLogout} onNavigate={props.onNavigate} />
  return props.view === 'reports' ? <ReportsPage {...props} /> : <AuditLogsPage {...props} />
}

export default ReportsAuditPage
