import { useEffect, useState } from 'react'
import DashboardShell from '../components/layout/DashboardShell.jsx'
import { Skeleton } from '../components/ui/skeleton.jsx'
import {
  getAuthErrorMessage,
  isSessionExpiredError,
  requestDashboardOverview,
  requestDistributionDashboard,
  requestDistributionList,
  requestDistributionTransactions,
} from '../auth/staffAuth.js'
import { connectStaffRealtime } from '../realtime/staffRealtime.js'

const moneyFormatter = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' })
const dateFormatter = new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Manila' })
const distributionStatuses = ['', 'DRAFT', 'OPEN', 'CLOSED', 'CANCELLED']
const transactionTypes = ['', 'BENEFIT_CREDIT', 'BENEFIT_REVERSAL', 'SIMULATED_TRANSFER_IN', 'SIMULATED_TRANSFER_OUT']
const transactionStatuses = ['', 'PENDING', 'COMPLETED', 'FAILED', 'REVERSED']

const eventLabels = {
  'distribution.updated': 'Distribution data updated',
  'schedule.checked_in': 'Queue check-in recorded',
  'qr.scan.recorded': 'QR scan recorded',
  'claim.updated': 'Claim status updated',
  'biometric.attempt.recorded': 'Biometric verification recorded',
  'wallet.transaction.completed': 'Simulated ledger transaction completed',
  'wallet.transaction.reversed': 'Simulated ledger transaction reversed',
  'dashboard.metrics.updated': 'Dashboard metrics updated',
  'anomaly.detected': 'Operational anomaly detected',
}

function formatMoney(value) {
  return moneyFormatter.format(Number(value ?? 0))
}

function humanize(value) {
  return value.toLowerCase().replaceAll('_', ' ').replace(/^./, (letter) => letter.toUpperCase())
}

function beneficiaryName(beneficiary) {
  return [beneficiary?.firstName, beneficiary?.middleName, beneficiary?.lastName].filter(Boolean).join(' ')
}

function LoadingDashboard({ ledger = false }) {
  return (
    <div className="mt-7" role="status" aria-label={`Loading DSWD ${ledger ? 'ledger' : 'dashboard'}`} aria-busy="true">
      <span className="sr-only">Loading DSWD {ledger ? 'ledger' : 'dashboard'}…</span>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => <div key={index} className="rounded-xl border border-line bg-white p-5"><Skeleton className="h-4 w-32" /><Skeleton className="mt-4 h-9 w-28" /><Skeleton className="mt-3 h-3 w-40" /></div>)}
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-2"><Skeleton className="h-72 rounded-xl" /><Skeleton className="h-72 rounded-xl" /></div>
    </div>
  )
}

function AccessDenied({ session, onLogout, onNavigate }) {
  return (
    <DashboardShell breadcrumbs={['Operations', 'DSWD access']} currentPath={window.location.pathname} onLogout={onLogout} onNavigate={onNavigate} pageTitle="DSWD operations" user={session.user}>
      <section className="ga-card mx-auto max-w-lg p-7 text-center">
        <span aria-hidden="true" className="mx-auto grid size-12 place-items-center rounded-full bg-warning-soft font-black text-brand-amber">!</span>
        <h1 className="mt-4 text-2xl font-extrabold text-ink">DSWD Staff access required</h1>
        <p className="mt-3 text-sm leading-6 text-muted-copy">Global live monitoring and the simulated ledger are restricted to authorized DSWD Staff.</p>
        <button type="button" onClick={() => onNavigate('/dashboard')} className="ga-btn-primary mt-6">Return to dashboard</button>
      </section>
    </DashboardShell>
  )
}

function Filters({ draft, setDraft, error, onApply }) {
  return (
    <form onSubmit={onApply} className="ga-card mt-6 p-4 sm:p-5" aria-label="Dashboard filters">
      <div className="grid gap-4 md:grid-cols-4">
        <div><label htmlFor="dswd-status" className="ga-label">Distribution status</label><select id="dswd-status" value={draft.status} onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value }))} className="ga-input mt-2 cursor-pointer font-semibold">{distributionStatuses.map((status) => <option key={status || 'ALL'} value={status}>{status ? humanize(status) : 'All statuses'}</option>)}</select></div>
        <div><label htmlFor="dswd-date-from" className="ga-label">Date from</label><input id="dswd-date-from" type="date" value={draft.dateFrom} onChange={(event) => setDraft((current) => ({ ...current, dateFrom: event.target.value }))} className="ga-input mt-2" /></div>
        <div><label htmlFor="dswd-date-to" className="ga-label">Date to</label><input id="dswd-date-to" type="date" value={draft.dateTo} onChange={(event) => setDraft((current) => ({ ...current, dateTo: event.target.value }))} className="ga-input mt-2" /></div>
        <button type="submit" className="ga-btn-primary self-end">Apply filters</button>
      </div>
      {error && <p role="alert" className="mt-3 text-sm font-semibold text-brand-amber">{error}</p>}
    </form>
  )
}

function DswdOperationsPage({ view, session, onLogout, onNavigate, onSessionExpired }) {
  const [draftFilters, setDraftFilters] = useState({ status: '', dateFrom: '', dateTo: '' })
  const [filters, setFilters] = useState(draftFilters)
  const [filterError, setFilterError] = useState('')
  const [overview, setOverview] = useState(null)
  const [distributions, setDistributions] = useState([])
  const [selectedId, setSelectedId] = useState('')
  const [mainError, setMainError] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const [connection, setConnection] = useState('connecting')
  const [liveMessage, setLiveMessage] = useState('Connecting to secure live updates')

  const [distributionSummary, setDistributionSummary] = useState(null)
  const [transactions, setTransactions] = useState(null)
  const [ledgerError, setLedgerError] = useState('')
  const [isLoadingLedger, setIsLoadingLedger] = useState(view === 'ledger')
  const [transactionType, setTransactionType] = useState('')
  const [transactionStatus, setTransactionStatus] = useState('')
  const [transactionPage, setTransactionPage] = useState(1)
  const isDswd = session.user.role === 'DSWD_STAFF'
  const currentPath = view === 'live' ? '/dswd/live-dashboard' : '/dswd/ledger'
  const pageTitle = view === 'live' ? 'Live operations dashboard' : 'Simulated aid ledger'
  const selectedDistribution = distributions.find((item) => item.distributionId === selectedId)

  useEffect(() => {
    if (!isDswd) return undefined
    let active = true
    let refreshTimer
    const disconnect = connectStaffRealtime(session.accessToken, {
      onReady: () => {
        if (!active) return
        setConnection('connected')
        setLiveMessage('Secure live updates connected')
      },
      onUpdate: (eventName) => {
        if (!active) return
        setLiveMessage(eventLabels[eventName] ?? 'Operations data updated')
        clearTimeout(refreshTimer)
        refreshTimer = setTimeout(() => {
          setIsRefreshing(true)
          setRefreshKey((value) => value + 1)
        }, 400)
      },
      onError: (error) => {
        if (!active) return
        if (['AUTHENTICATION_REQUIRED', 'INVALID_TOKEN', 'INVALID_SESSION'].includes(error?.data?.code)) return onSessionExpired()
        setConnection('disconnected')
        setLiveMessage('Live connection unavailable; safety refresh remains active')
      },
      onDisconnect: () => {
        if (!active) return
        setConnection('disconnected')
        setLiveMessage('Live connection interrupted; safety refresh remains active')
      },
    })
    const safetyRefresh = setInterval(() => {
      if (document.visibilityState === 'visible') setRefreshKey((value) => value + 1)
    }, 60_000)
    return () => {
      active = false
      clearTimeout(refreshTimer)
      clearInterval(safetyRefresh)
      disconnect()
    }
  }, [isDswd, onSessionExpired, session.accessToken])

  useEffect(() => {
    if (!isDswd) return undefined
    let active = true
    const scope = { ...filters }
    const requests = [requestDashboardOverview(session.accessToken, scope)]
    if (view === 'ledger') requests.push(requestDistributionList(session.accessToken, { page: 1, pageSize: 100, ...scope }))

    Promise.all(requests)
      .then(([nextOverview, distributionData]) => {
        if (!active) return
        setMainError('')
        setOverview(nextOverview)
        if (distributionData) {
          setDistributions(distributionData.distributions)
          setSelectedId((current) => distributionData.distributions.some((item) => item.distributionId === current) ? current : distributionData.distributions[0]?.distributionId ?? '')
          if (distributionData.distributions.length === 0) setIsLoadingLedger(false)
        }
      })
      .catch((error) => {
        if (!active) return
        if (isSessionExpiredError(error)) return onSessionExpired()
        setMainError(getAuthErrorMessage(error))
      })
      .finally(() => {
        if (!active) return
        setIsLoading(false)
        setIsRefreshing(false)
      })
    return () => { active = false }
  }, [filters, isDswd, onSessionExpired, refreshKey, session.accessToken, view])

  useEffect(() => {
    if (!isDswd || view !== 'ledger' || !selectedId) return undefined
    let active = true
    Promise.all([
      requestDistributionDashboard(session.accessToken, selectedId),
      requestDistributionTransactions(session.accessToken, selectedId, { page: transactionPage, pageSize: 20, type: transactionType, status: transactionStatus }),
    ])
      .then(([summary, transactionData]) => {
        if (!active) return
        setLedgerError('')
        setDistributionSummary(summary)
        setTransactions(transactionData)
      })
      .catch((error) => {
        if (!active) return
        if (isSessionExpiredError(error)) return onSessionExpired()
        setLedgerError(getAuthErrorMessage(error))
      })
      .finally(() => { if (active) setIsLoadingLedger(false) })
    return () => { active = false }
  }, [isDswd, onSessionExpired, refreshKey, selectedId, session.accessToken, transactionPage, transactionStatus, transactionType, view])

  function applyFilters(event) {
    event.preventDefault()
    if (draftFilters.dateFrom && draftFilters.dateTo && draftFilters.dateFrom > draftFilters.dateTo) {
      setFilterError('Date to must be the same as or later than Date from.')
      return
    }
    setFilterError('')
    setMainError('')
    setLedgerError('')
    setIsRefreshing(Boolean(overview))
    setIsLoading(!overview)
    setIsLoadingLedger(view === 'ledger')
    setTransactionPage(1)
    setFilters({ ...draftFilters })
    setRefreshKey((value) => value + 1)
  }

  function refresh() {
    setMainError('')
    setLedgerError('')
    setIsRefreshing(Boolean(overview))
    setIsLoading(!overview)
    setIsLoadingLedger(view === 'ledger')
    setRefreshKey((value) => value + 1)
  }

  function selectDistribution(distributionId) {
    setSelectedId(distributionId)
    setDistributionSummary(null)
    setTransactions(null)
    setLedgerError('')
    setTransactionPage(1)
    setIsLoadingLedger(true)
  }

  if (!isDswd) return <AccessDenied session={session} onLogout={onLogout} onNavigate={onNavigate} />

  const connectionStyles = connection === 'connected' ? 'bg-success-soft text-brand-green' : connection === 'connecting' ? 'bg-warning-soft text-brand-amber' : 'bg-slate-100 text-copy'

  return (
    <DashboardShell breadcrumbs={['Operations', 'DSWD Staff', pageTitle]} currentPath={currentPath} onLogout={onLogout} onNavigate={onNavigate} pageTitle={pageTitle} user={session.user}>
      <header className="flex flex-col gap-5 border-b border-line pb-6 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="ga-eyebrow">DSWD authorized workspace</p>
            <span role="status" aria-atomic="true" className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${connectionStyles}`}>{connection === 'connected' ? 'Live connected' : connection === 'connecting' ? 'Connecting' : 'Live disconnected'}</span>
          </div>
          <h1 className="ga-page-title mt-2">{pageTitle}</h1>
          <p className="ga-page-copy">{view === 'live' ? 'Monitor distributions, queues, claims, verification activity, and operational anomalies as updates occur.' : 'Review simulated fund utilization and trace transaction entries by distribution event.'}</p>
          <p className="mt-2 text-xs font-semibold text-muted-copy" aria-live="polite" aria-atomic="true">{liveMessage}</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <button type="button" onClick={refresh} disabled={isRefreshing} className="ga-btn-secondary">{isRefreshing ? 'Refreshing…' : 'Refresh data'}</button>
          <button type="button" onClick={() => onNavigate(view === 'live' ? '/dswd/ledger' : '/dswd/live-dashboard')} className="ga-btn-primary">{view === 'live' ? 'Open simulated ledger' : 'Open live dashboard'}</button>
        </div>
      </header>

      <Filters draft={draftFilters} setDraft={setDraftFilters} error={filterError} onApply={applyFilters} />

      {isLoading ? <LoadingDashboard ledger={view === 'ledger'} /> : mainError ? (
        <section className="mt-7 rounded-xl border border-amber-200 bg-white p-6" role="alert"><h2 className="text-xl font-extrabold text-ink">Unable to load DSWD operations data</h2><p className="mt-2 text-sm leading-6 text-muted-copy">{mainError}</p><button type="button" onClick={refresh} className="ga-btn-primary mt-4">Try again</button></section>
      ) : view === 'live' ? (
        <LiveDashboard overview={overview} />
      ) : (
        <LedgerDashboard
          overview={overview}
          distributions={distributions}
          selectedId={selectedId}
          selectedDistribution={selectedDistribution}
          selectDistribution={selectDistribution}
          summary={distributionSummary}
          transactions={transactions}
          error={ledgerError}
          isLoading={isLoadingLedger}
          retry={refresh}
          transactionType={transactionType}
          setTransactionType={(value) => { setTransactionType(value); setTransactionPage(1); setIsLoadingLedger(true) }}
          transactionStatus={transactionStatus}
          setTransactionStatus={(value) => { setTransactionStatus(value); setTransactionPage(1); setIsLoadingLedger(true) }}
          transactionPage={transactionPage}
          setTransactionPage={(value) => { setTransactionPage(value); setIsLoadingLedger(true) }}
        />
      )}
    </DashboardShell>
  )
}

function LiveDashboard({ overview }) {
  const metrics = [
    ['Open distributions', overview.distributions.openDistributionCount, 'Currently active events', 'text-brand-blue'],
    ['Upcoming distributions', overview.distributions.upcomingDistributionCount, 'Draft or open schedules', 'text-brand-amber'],
    ['Approved beneficiaries', overview.beneficiaries.approvedBeneficiaryCount, 'Within the current filters', 'text-brand-blue'],
    ['Claim completion', `${overview.beneficiaries.claimCompletionPercentage}%`, 'Completed assistance claims', 'text-brand-green'],
  ]
  return (
    <div className="mt-7">
      <div className="flex items-center justify-between gap-4"><div><p className="ga-eyebrow">Operational status</p><h2 className="mt-1 text-xl font-extrabold text-ink">National assistance activity</h2></div><p className="hidden text-xs font-semibold text-muted-copy sm:block">Updated {overview.generatedAt}</p></div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{metrics.map(([label, value, detail, color]) => <article key={label} className="ga-card p-5"><p className="text-xs font-bold uppercase tracking-[0.08em] text-muted-copy">{label}</p><p className={`mt-3 text-3xl font-black tracking-tight ${color}`}>{value}</p><p className="mt-2 text-sm leading-5 text-muted-copy">{detail}</p></article>)}</div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <section className="ga-card p-5" aria-labelledby="queue-monitoring-heading"><p className="ga-eyebrow">Queue monitoring</p><h2 id="queue-monitoring-heading" className="mt-1 text-lg font-extrabold text-ink">Distribution queues</h2><dl className="mt-5 space-y-4 text-sm"><DataRow label="Scheduled" value={overview.queue.scheduledCount} tone="pending" /><DataRow label="Checked in" value={overview.queue.checkedInCount} tone="success" /><DataRow label="Missed" value={overview.queue.missedCount} /><DataRow label="Capacity utilization" value={`${overview.queue.capacityUtilizationPercentage}%`} /></dl></section>
        <section className="rounded-xl border border-red-200 bg-white p-5 shadow-sm" aria-labelledby="anomalies-heading"><p className="text-xs font-bold uppercase tracking-[0.12em] text-brand-red">Fraud and anomaly watch</p><h2 id="anomalies-heading" className="mt-1 text-lg font-extrabold text-ink">Verification exceptions</h2><dl className="mt-5 space-y-4 text-sm"><DataRow label="Duplicate attempts" value={overview.anomalies.duplicateAttemptCount} tone="danger" /><DataRow label="Invalid QR attempts" value={overview.anomalies.invalidQrAttemptCount} tone="danger" /><DataRow label="Biometric no-match" value={overview.anomalies.biometricNoMatchCount} /><DataRow label="Liveness failures" value={overview.anomalies.livenessFailureCount} /></dl></section>
        <section className="ga-card p-5" aria-labelledby="funds-heading"><p className="ga-eyebrow text-brand-green">Simulated utilization</p><h2 id="funds-heading" className="mt-1 text-lg font-extrabold text-ink">Aid ledger summary</h2><dl className="mt-5 space-y-4 text-sm"><DataRow label="Allocated" value={formatMoney(overview.fundUtilization?.allocatedAmount)} /><DataRow label="Net credited" value={formatMoney(overview.fundUtilization?.netCreditedAmount)} tone="success" /><DataRow label="Remaining" value={formatMoney(overview.fundUtilization?.remainingAmount)} tone="pending" /><DataRow label="Real funds moved" value="No" /></dl><p className="mt-4 border-t border-line pt-4 text-sm leading-5 text-muted-copy">Prototype ledger simulation only; no bank or government payment rail is connected.</p></section>
      </div>
    </div>
  )
}

function DataRow({ label, value, tone }) {
  const color = tone === 'success' ? 'text-brand-green' : tone === 'pending' ? 'text-brand-amber' : tone === 'danger' ? 'text-brand-red' : 'text-ink'
  return <div className="flex items-center justify-between gap-4 border-b border-line pb-3 last:border-0 last:pb-0"><dt className="text-muted-copy">{label}</dt><dd className={`font-extrabold ${color}`}>{value}</dd></div>
}

function LedgerDashboard({ overview, distributions, selectedId, selectedDistribution, selectDistribution, summary, transactions, error, isLoading, retry, transactionType, setTransactionType, transactionStatus, setTransactionStatus, transactionPage, setTransactionPage }) {
  if (distributions.length === 0) return <section className="mt-7 rounded-xl border border-dashed border-line bg-white p-8 text-center"><span aria-hidden="true" className="mx-auto grid size-12 place-items-center rounded-full bg-info-soft font-black text-brand-blue">0</span><h2 className="mt-4 text-xl font-extrabold text-ink">No distributions in this scope</h2><p className="mt-2 text-sm text-muted-copy">Adjust the status or date filters to review another period.</p></section>
  return (
    <div className="mt-7">
      <section className="rounded-xl border border-blue-200 bg-brand-navy p-5 text-white shadow-sm sm:p-6"><div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.14em] text-blue-200">Simulation disclosure</p><h2 className="mt-2 text-xl font-extrabold">Accountable prototype ledger</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">These balances and transactions demonstrate system controls only. No real funds are stored, transferred, or released.</p></div><p className="rounded-full bg-white/10 px-3 py-2 text-xs font-bold text-emerald-300">Real funds moved: No</p></div></section>

      <section className="ga-card mt-6 grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.65fr)] lg:items-end sm:p-6"><div><label htmlFor="ledger-distribution" className="ga-label">Distribution event</label><select id="ledger-distribution" value={selectedId} onChange={(event) => selectDistribution(event.target.value)} className="ga-input mt-2 cursor-pointer font-semibold">{distributions.map((distribution) => <option key={distribution.distributionId} value={distribution.distributionId}>{distribution.title} · {distribution.distributionDate}</option>)}</select></div><dl className="grid grid-cols-2 gap-3 rounded-lg bg-slate-50 p-4 text-sm"><div><dt className="text-xs text-muted-copy">Program</dt><dd className="mt-1 font-bold text-ink">{selectedDistribution?.program.programCode}</dd></div><div><dt className="text-xs text-muted-copy">Barangay</dt><dd className="mt-1 font-bold text-ink">{selectedDistribution?.barangay.barangayName}</dd></div></dl></section>

      {isLoading ? <LoadingDashboard ledger /> : error ? <section className="mt-6 rounded-xl border border-amber-200 bg-white p-6" role="alert"><h2 className="font-extrabold text-ink">Unable to load the selected ledger</h2><p className="mt-2 text-sm text-muted-copy">{error}</p><button type="button" onClick={retry} className="ga-btn-primary mt-4">Try again</button></section> : (
        <>
          <section className="mt-6" aria-labelledby="ledger-summary-heading"><div className="flex items-end justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.12em] text-brand-green">Selected event</p><h2 id="ledger-summary-heading" className="mt-1 text-xl font-extrabold text-ink">Fund utilization</h2></div><p className="hidden text-xs text-muted-copy sm:block">Global net credited: {formatMoney(overview.fundUtilization?.netCreditedAmount)}</p></div><div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-5"><MoneyCard label="Allocated" value={summary.fundUtilization.allocatedAmount} /><MoneyCard label="Net credited" value={summary.fundUtilization.netCreditedAmount} tone="success" /><MoneyCard label="Remaining" value={summary.fundUtilization.remainingAmount} tone="pending" /><MoneyCard label="Reversed" value={summary.fundUtilization.reversedAmount} tone="pending" /><MoneyCard label="Failed" value={summary.fundUtilization.failedAmount} /></div></section>

          <section className="ga-card mt-6 overflow-hidden" aria-labelledby="transactions-heading"><div className="border-b border-line p-5 sm:p-6"><div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"><div><p className="ga-eyebrow">Traceable records</p><h2 id="transactions-heading" className="mt-1 text-xl font-extrabold text-ink">Recent transactions</h2></div><div className="grid gap-3 sm:grid-cols-2"><div><label htmlFor="transaction-type" className="sr-only">Transaction type</label><select id="transaction-type" value={transactionType} onChange={(event) => setTransactionType(event.target.value)} className="ga-input cursor-pointer font-semibold">{transactionTypes.map((value) => <option key={value || 'ALL'} value={value}>{value ? humanize(value) : 'All transaction types'}</option>)}</select></div><div><label htmlFor="transaction-status" className="sr-only">Transaction status</label><select id="transaction-status" value={transactionStatus} onChange={(event) => setTransactionStatus(event.target.value)} className="ga-input cursor-pointer font-semibold">{transactionStatuses.map((value) => <option key={value || 'ALL'} value={value}>{value ? humanize(value) : 'All statuses'}</option>)}</select></div></div></div></div>
            {transactions.transactions.length === 0 ? <div className="p-8 text-center"><p className="font-extrabold text-ink">No transactions found</p><p className="mt-2 text-sm text-muted-copy">No simulated ledger entries match the selected event and filters.</p></div> : <TransactionTable transactions={transactions.transactions} />}
            {transactions.transactions.length > 0 && <div className="flex items-center justify-between border-t border-line px-5 py-4"><p className="text-xs font-semibold text-muted-copy">Page {transactions.pagination.page} of {Math.max(transactions.pagination.totalPages, 1)}</p><div className="flex gap-2"><button type="button" disabled={transactionPage <= 1} onClick={() => setTransactionPage(transactionPage - 1)} className="min-h-11 cursor-pointer rounded-lg border border-line px-4 text-sm font-bold text-copy disabled:cursor-not-allowed disabled:opacity-50">Previous</button><button type="button" disabled={transactionPage >= transactions.pagination.totalPages} onClick={() => setTransactionPage(transactionPage + 1)} className="min-h-11 cursor-pointer rounded-lg border border-line px-4 text-sm font-bold text-copy disabled:cursor-not-allowed disabled:opacity-50">Next</button></div></div>}
          </section>
        </>
      )}
    </div>
  )
}

function MoneyCard({ label, value, tone }) {
  const color = tone === 'success' ? 'text-brand-green' : tone === 'pending' ? 'text-brand-amber' : 'text-ink'
  return <article className="ga-card p-4"><p className="text-xs font-bold uppercase tracking-[0.08em] text-muted-copy">{label}</p><p className={`mt-3 text-xl font-black tracking-tight ${color}`}>{formatMoney(value)}</p></article>
}

function TransactionTable({ transactions }) {
  const amount = (transaction) => {
    const reversal = ['BENEFIT_REVERSAL', 'SIMULATED_TRANSFER_OUT'].includes(transaction.transactionType)
    return <span className={`font-extrabold ${reversal ? 'text-brand-amber' : 'text-brand-green'}`}>{reversal ? '−' : '+'}{formatMoney(transaction.amount)}</span>
  }

  return (
    <>
      <ul className="divide-y divide-line md:hidden">
        {transactions.map((transaction) => (
          <li key={transaction.transactionId} className="p-5">
            <div className="flex items-start justify-between gap-3">
              <div><p className="font-bold text-ink">{beneficiaryName(transaction.beneficiary)}</p><p className="mt-1 text-sm text-muted-copy">{humanize(transaction.transactionType)}</p></div>
              <TransactionStatus status={transaction.status} />
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-4 text-sm">
              <div><dt className="text-muted-copy">Amount</dt><dd className="mt-1">{amount(transaction)}</dd></div>
              <div><dt className="text-muted-copy">Recorded</dt><dd className="mt-1 font-semibold text-ink">{dateFormatter.format(new Date(transaction.createdAt))}</dd></div>
              <div className="col-span-2"><dt className="text-muted-copy">Reference</dt><dd className="mt-1 truncate font-mono text-xs font-bold text-ink">{transaction.referenceNo}</dd></div>
            </dl>
          </li>
        ))}
      </ul>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[760px] border-collapse text-left text-sm">
          <caption className="sr-only">Simulated aid ledger transactions</caption>
          <thead><tr className="border-b border-line bg-slate-50 text-xs uppercase tracking-[0.08em] text-muted-copy"><th scope="col" className="px-5 py-3">Recorded</th><th scope="col" className="px-5 py-3">Reference</th><th scope="col" className="px-5 py-3">Beneficiary</th><th scope="col" className="px-5 py-3">Type</th><th scope="col" className="px-5 py-3 text-right">Amount</th><th scope="col" className="px-5 py-3">Status</th></tr></thead>
          <tbody className="divide-y divide-line">{transactions.map((transaction) => <tr key={transaction.transactionId}><td className="whitespace-nowrap px-5 py-4 text-xs text-muted-copy">{dateFormatter.format(new Date(transaction.createdAt))}</td><td className="max-w-48 truncate px-5 py-4 font-mono text-xs font-bold text-ink" title={transaction.referenceNo}>{transaction.referenceNo}</td><td className="px-5 py-4"><p className="font-bold text-ink">{beneficiaryName(transaction.beneficiary)}</p><p className="mt-1 text-xs text-muted-copy">{transaction.beneficiary?.barangay?.barangayName}</p></td><td className="px-5 py-4 text-xs font-semibold text-copy">{humanize(transaction.transactionType)}</td><td className="whitespace-nowrap px-5 py-4 text-right">{amount(transaction)}</td><td className="px-5 py-4"><TransactionStatus status={transaction.status} /></td></tr>)}</tbody>
        </table>
      </div>
    </>
  )
}

function TransactionStatus({ status }) {
  const style = status === 'COMPLETED' ? 'border-emerald-200 bg-success-soft text-brand-green' : status === 'PENDING' ? 'border-amber-200 bg-warning-soft text-brand-amber' : 'border-line bg-slate-100 text-copy'
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${style}`}>{humanize(status)}</span>
}

export default DswdOperationsPage
