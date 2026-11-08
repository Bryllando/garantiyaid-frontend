import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import ReconciliationPanel from '../components/distributions/ReconciliationPanel.jsx'
import DisputeLedgerContext from '../components/claims/DisputeLedgerContext.jsx'
import DashboardShell from '../components/layout/DashboardShell.jsx'
import IndividualWalletWorkspace from '../components/wallets/IndividualWalletWorkspace.jsx'
import { ConfirmationDialog } from '../components/ui/confirmation-dialog.jsx'
import { Icon } from '../components/ui/icon.jsx'
import { Skeleton } from '../components/ui/skeleton.jsx'
import { LoadingLabel, Spinner } from '../components/ui/spinner.jsx'
import {
  creditVerifiedClaim,
  getAuthErrorMessage,
  isSessionExpiredError,
  requestDashboardOverview,
  requestCreditableClaims,
  requestDistributionDashboard,
  requestDistribution,
  requestDistributionClaim,
  requestDistributionList,
  requestDistributionReconciliation,
  requestDistributionTransactions,
  requestTransactionReceipt,
  reverseBenefitCredit,
} from '../auth/staffAuth.js'
import { connectStaffRealtime } from '../realtime/staffRealtime.js'
import { claimChecks } from '../utils/claimWorkflow.js'
import { creditReviewBlockers, readCreditQueueLocation } from '../utils/ledgerReview.js'

const moneyFormatter = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' })
const dateFormatter = new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Manila' })
const distributionStatuses = ['', 'DRAFT', 'OPEN', 'CLOSED', 'CANCELLED']
const transactionTypes = ['', 'BENEFIT_CREDIT', 'BENEFIT_REVERSAL', 'SIMULATED_TRANSFER_IN', 'SIMULATED_TRANSFER_OUT']
const transactionStatuses = ['', 'PENDING', 'COMPLETED', 'FAILED', 'REVERSED']

const eventLabels = {
  'distribution.updated': 'Distribution data updated',
  'schedule.updated': 'Schedule updated',
  'schedule.checked_in': 'Queue check-in recorded',
  'qr.scan.recorded': 'QR scan recorded',
  'claim.updated': 'Claim status updated',
  'claim.released': 'Physical assistance released',
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
  return value.toLowerCase().replaceAll('_', ' ').replace(/^./, (letter) => letter.toUpperCase()).replace(/\bqr\b/gi, 'QR')
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
        <h1 className="mt-4 text-2xl font-extrabold text-ink">Authorized operations access required</h1>
        <p className="mt-3 text-sm leading-6 text-muted-copy">Live monitoring and simulated ledger oversight are available to System Administrators and DSWD Staff.</p>
        <button type="button" onClick={() => onNavigate('/dashboard')} className="ga-btn-primary mt-6">Return to dashboard</button>
      </section>
    </DashboardShell>
  )
}

function Filters({ draft, setDraft, error, onApply, onClear, hasFilters, compact = false }) {
  return (
    <form onSubmit={onApply} className="ga-card mt-6 p-4 sm:p-5" aria-label="Dashboard filters">
      {compact && <div className="mb-4"><h2 className="flex items-center gap-2 font-bold text-ink"><Icon name="search" className="size-5 text-brand-blue" />Filter distribution events</h2><p className="mt-1 text-sm text-muted-copy">Choose a status or date range, then apply your filters.</p></div>}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
        <div><label htmlFor="dswd-status" className="ga-label">Distribution status</label><select id="dswd-status" value={draft.status} onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value }))} className="ga-input mt-2 cursor-pointer font-semibold">{distributionStatuses.map((status) => <option key={status || 'ALL'} value={status}>{status ? humanize(status) : 'All statuses'}</option>)}</select></div>
        <div><label htmlFor="dswd-date-from" className="ga-label">Date from</label><input id="dswd-date-from" type="date" value={draft.dateFrom} onChange={(event) => setDraft((current) => ({ ...current, dateFrom: event.target.value }))} className="ga-input mt-2" /></div>
        <div><label htmlFor="dswd-date-to" className="ga-label">Date to</label><input id="dswd-date-to" type="date" value={draft.dateTo} onChange={(event) => setDraft((current) => ({ ...current, dateTo: event.target.value }))} className="ga-input mt-2" /></div>
        <div className="flex flex-wrap items-end gap-2"><button type="submit" className="ga-btn-primary"><Icon name="search" className="size-4" />Apply filters</button>{onClear && hasFilters && <button type="button" onClick={onClear} className="ga-btn-secondary"><Icon name="close" className="size-4" />Clear filters</button>}</div>
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
  const [selectedId, setSelectedId] = useState(() => new URLSearchParams(window.location.search).get('distribution') || '')
  const linkedDistributionRef = useRef({ id: new URLSearchParams(window.location.search).get('distribution') || '', record: null })
  const [mainError, setMainError] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const [connection, setConnection] = useState('connecting')
  const [liveMessage, setLiveMessage] = useState('Connecting to secure live updates')

  const [distributionSummary, setDistributionSummary] = useState(null)
  const [transactions, setTransactions] = useState(null)
  const [creditableClaims, setCreditableClaims] = useState(null)
  const [creditQuery, setCreditQuery] = useState(() => readCreditQueueLocation(window.location.search))
  const [creditQueueError, setCreditQueueError] = useState('')
  const [creditQueueLoading, setCreditQueueLoading] = useState(true)
  const [ledgerActionError, setLedgerActionError] = useState('')
  const [creditResult, setCreditResult] = useState(null)
  const creditResultRef = useRef(null)
  const [reconciliation, setReconciliation] = useState(null)
  const [receipt, setReceipt] = useState(null)
  const [ledgerAction, setLedgerAction] = useState(null)
  const [isMutating, setIsMutating] = useState(false)
  const [loadingReceiptId, setLoadingReceiptId] = useState('')
  const [ledgerError, setLedgerError] = useState('')
  const [isLoadingLedger, setIsLoadingLedger] = useState(view === 'ledger')
  const [transactionType, setTransactionType] = useState('')
  const [transactionStatus, setTransactionStatus] = useState('')
  const [transactionPage, setTransactionPage] = useState(1)
  const [ledgerMode, setLedgerMode] = useState(() => new URLSearchParams(window.location.search).get('workspace') === 'wallets' ? 'wallets' : 'events')
  const isDswd = session.user.role === 'DSWD_STAFF'
  const isAdmin = session.user.role === 'SYSTEM_ADMIN'
  const canAccess = isDswd || isAdmin
  const currentPath = view === 'live' ? '/dswd/live-dashboard' : '/dswd/ledger'
  const pageTitle = view === 'live' ? 'Live operations dashboard' : isAdmin ? 'Transactions & wallets' : 'Simulated aid ledger'
  const selectedDistribution = distributions.find((item) => item.distributionId === selectedId)

  useEffect(() => {
    if (view !== 'ledger') return
    const url = new URL(window.location.href)
    if (selectedId) url.searchParams.set('distribution', selectedId)
    else url.searchParams.delete('distribution')
    if (ledgerMode === 'wallets') url.searchParams.set('workspace', 'wallets')
    else { url.searchParams.delete('workspace'); url.searchParams.delete('beneficiary') }
    if (creditQuery.search) url.searchParams.set('creditSearch', creditQuery.search)
    else url.searchParams.delete('creditSearch')
    if (creditQuery.page > 1) url.searchParams.set('creditPage', String(creditQuery.page))
    else url.searchParams.delete('creditPage')
    window.history.replaceState(window.history.state, '', url)
  }, [creditQuery, ledgerMode, selectedId, view])

  useEffect(() => {
    if (!canAccess) return undefined
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
  }, [canAccess, onSessionExpired, session.accessToken])

  useEffect(() => {
    if (!canAccess) return undefined
    let active = true
    const scope = { ...filters }
    const requests = [requestDashboardOverview(session.accessToken, scope)]
    if (view === 'ledger') requests.push(requestDistributionList(session.accessToken, { page: 1, pageSize: 100, ...scope }))

    Promise.all(requests)
      .then(async ([nextOverview, distributionData]) => {
        let available = distributionData?.distributions ?? []
        const linked = linkedDistributionRef.current
        if (distributionData && linked.id && !available.some((item) => item.distributionId === linked.id)) {
          try {
            linked.record ??= await requestDistribution(session.accessToken, linked.id)
            available = [linked.record, ...available]
          } catch (error) { if (isSessionExpiredError(error)) throw error; throw new Error('The linked distribution is unavailable in this ledger. Return to the original record or try again.') }
        }
        if (!active) return
        setMainError('')
        setOverview(nextOverview)
        if (distributionData) {
          setDistributions(available)
          setSelectedId((current) => available.some((item) => item.distributionId === current) ? current : available[0]?.distributionId ?? '')
          if (available.length === 0) setIsLoadingLedger(false)
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
  }, [canAccess, filters, onSessionExpired, refreshKey, session.accessToken, view])

  useEffect(() => {
    if (!canAccess || view !== 'ledger' || !selectedId) return undefined
    let active = true
    Promise.all([
      requestDistributionDashboard(session.accessToken, selectedId),
      requestDistributionTransactions(session.accessToken, selectedId, { page: transactionPage, pageSize: 20, type: transactionType, status: transactionStatus }),
      requestDistributionReconciliation(session.accessToken, selectedId),
    ])
      .then(([summary, transactionData, reconciliationData]) => {
        if (!active) return
        setLedgerError('')
        setDistributionSummary(summary)
        setTransactions(transactionData)
        setReconciliation(reconciliationData.reconciliation)
      })
      .catch((error) => {
        if (!active) return
        if (isSessionExpiredError(error)) return onSessionExpired()
        setLedgerError(getAuthErrorMessage(error))
      })
      .finally(() => { if (active) setIsLoadingLedger(false) })
    return () => { active = false }
  }, [canAccess, onSessionExpired, refreshKey, selectedDistribution?.deliveryMode, selectedDistribution?.status, selectedId, session.accessToken, transactionPage, transactionStatus, transactionType, view])

  useEffect(() => {
    if (!canAccess || view !== 'ledger' || ledgerMode !== 'events' || !selectedId || !selectedDistribution?.status) return undefined
    let active = true
    const request = selectedDistribution?.status === 'OPEN' && selectedDistribution?.deliveryMode === 'SIMULATED_WALLET'
      ? requestCreditableClaims(session.accessToken, selectedId, { ...creditQuery, pageSize: 10 })
      : Promise.resolve({ claims: [], summary: { creditableClaimCount: 0 }, pagination: { page: 1, total: 0, totalPages: 0 } })
    request.then((data) => {
      if (!active) return
      const lastPage = Math.max(1, data.pagination.totalPages)
      if (creditQuery.page > lastPage) { setCreditQueueLoading(true); setCreditQuery((current) => ({ ...current, page: lastPage })); return }
      setCreditableClaims(data)
      setCreditQueueError('')
      setCreditQueueLoading(false)
    }).catch((error) => {
      if (!active) return
      if (isSessionExpiredError(error)) return onSessionExpired()
      setCreditQueueError(getAuthErrorMessage(error))
      setCreditQueueLoading(false)
    })
    return () => { active = false }
  }, [canAccess, creditQuery, ledgerMode, onSessionExpired, refreshKey, selectedDistribution?.deliveryMode, selectedDistribution?.status, selectedId, session.accessToken, view])

  useEffect(() => {
    if (creditResult) creditResultRef.current?.focus()
  }, [creditResult])

  function applyFilters(event, nextFilters = draftFilters) {
    event?.preventDefault()
    if (nextFilters.dateFrom && nextFilters.dateTo && nextFilters.dateFrom > nextFilters.dateTo) {
      setFilterError('Date to must be the same as or later than Date from.')
      return
    }
    setFilterError('')
    setCreditQuery({ search: '', page: 1 })
    setCreditQueueLoading(true)
    setCreditResult(null)
    setMainError('')
    setLedgerError('')
    setIsRefreshing(Boolean(overview))
    setIsLoading(!overview)
    setIsLoadingLedger(view === 'ledger')
    setTransactionPage(1)
    setFilters({ ...nextFilters })
    setRefreshKey((value) => value + 1)
  }

  function clearFilters() {
    const empty = { status: '', dateFrom: '', dateTo: '' }
    setDraftFilters(empty)
    applyFilters(null, empty)
    document.getElementById('dswd-status')?.focus()
  }

  function refresh() {
    setCreditQueueLoading(true)
    setMainError('')
    setLedgerError('')
    setIsRefreshing(Boolean(overview))
    setIsLoading(!overview)
    setIsLoadingLedger(view === 'ledger')
    setRefreshKey((value) => value + 1)
  }

  function selectDistribution(distributionId) {
    setCreditQuery({ search: '', page: 1 })
    setCreditQueueError('')
    setCreditQueueLoading(true)
    setCreditResult(null)
    setLedgerAction(null)
    setSelectedId(distributionId)
    setDistributionSummary(null)
    setTransactions(null)
    setCreditableClaims(null)
    setReconciliation(null)
    setLedgerError('')
    setTransactionPage(1)
    setIsLoadingLedger(true)
  }

  async function loadCreditReview(action) {
    setLedgerActionError('')
    setLedgerAction({ ...action, loading: true, loadError: '' })
    try {
      const claim = await requestDistributionClaim(session.accessToken, action.distribution.distributionId, action.claim.claimId)
      if (claim.distributionId !== action.distribution.distributionId) throw new Error('This claim could not be confirmed in the selected distribution. Reload the ledger before continuing.')
      setLedgerAction((current) => current?.idempotencyKey === action.idempotencyKey ? { ...current, claim, distribution: { ...action.distribution, ...claim.distribution }, loading: false } : current)
    } catch (error) {
      if (isSessionExpiredError(error)) return onSessionExpired()
      setLedgerAction((current) => current?.idempotencyKey === action.idempotencyKey ? { ...current, loading: false, loadError: getAuthErrorMessage(error) } : current)
    }
  }

  function reviewCredit(claim) {
    loadCreditReview({ type: 'credit', claim, distribution: selectedDistribution, idempotencyKey: crypto.randomUUID() })
  }

  async function confirmLedgerAction(reason) {
    const action = ledgerAction
    if (!action) return
    if (action.type === 'credit' && (action.loading || action.loadError || creditReviewBlockers(action.claim, action.distribution, session.user.role).length)) throw new Error('Review the claim requirements before crediting.')
    setIsMutating(true)
    setLedgerActionError('')
    try {
      if (action.type === 'credit') {
        const result = await creditVerifiedClaim(session.accessToken, action.distribution.distributionId, action.claim.claimId, '', action.idempotencyKey)
        setCreditResult({ ...result, claim: action.claim, distribution: action.distribution })
        toast.success('Verified claim credited to the simulated ledger.', { description: `${result.transaction.referenceNo} · ${formatMoney(result.transaction.amount)}` })
      } else {
        const result = await reverseBenefitCredit(session.accessToken, action.transaction.walletId, action.transaction.transactionId, reason)
        toast.success('Simulated benefit credit reversed.', { description: `${result.reversalTransaction.referenceNo} · Claim status: Voided` })
      }
      setLedgerAction(null)
      setCreditQueueLoading(true)
      setIsLoadingLedger(true)
      setRefreshKey((value) => value + 1)
    } catch (error) {
      if (isSessionExpiredError(error)) return onSessionExpired()
      setLedgerActionError(getAuthErrorMessage(error))
      if (error.status === 409 && action.type === 'credit') {
        await loadCreditReview(action)
        setLedgerActionError(getAuthErrorMessage(error))
        setRefreshKey((value) => value + 1)
      }
      throw error
    } finally {
      setIsMutating(false)
    }
  }

  async function openReceipt(transaction) {
    setLoadingReceiptId(transaction.transactionId)
    try {
      setReceipt(await requestTransactionReceipt(session.accessToken, transaction.walletId, transaction.transactionId))
    } catch (error) {
      if (isSessionExpiredError(error)) return onSessionExpired()
      toast.error(getAuthErrorMessage(error))
    } finally {
      setLoadingReceiptId('')
    }
  }

  if (!canAccess) return <AccessDenied session={session} onLogout={onLogout} onNavigate={onNavigate} />

  const connectionStyles = connection === 'connected' ? 'bg-success-soft text-brand-green' : connection === 'connecting' ? 'bg-warning-soft text-brand-amber' : 'bg-slate-100 text-copy'
  const creditBlockers = ledgerAction?.type === 'credit' ? creditReviewBlockers(ledgerAction.claim, ledgerAction.distribution, session.user.role) : []
  const creditResultPanel = (creditResult && ledgerMode === 'events' && creditResult.distribution.distributionId === selectedId && <section ref={creditResultRef} tabIndex={-1} aria-labelledby="credit-result-heading" className="mt-6 border-l-4 border-brand-green bg-success-soft p-5 focus:outline-2 focus:outline-brand-green">
        <h2 id="credit-result-heading" className="font-bold text-ink">Simulated credit recorded</h2>
        <p className="mt-2 text-sm leading-6 text-copy">{beneficiaryName(creditResult.claim.beneficiary)} · {formatMoney(creditResult.transaction.amount)} · {creditResult.distribution.title}</p>
        <p className="mt-1 break-words text-sm text-copy">Reference: {creditResult.transaction.referenceNo}</p>
        <div className="mt-3 flex flex-wrap gap-3"><button type="button" onClick={() => openReceipt({ ...creditResult.transaction, walletId: creditResult.transaction.walletId || creditResult.wallet.walletId })} disabled={Boolean(loadingReceiptId)} className="ga-btn-secondary">View transaction receipt</button><a href={`/claim-accountability?distribution=${encodeURIComponent(selectedId)}&claim=${encodeURIComponent(creditResult.claim.claimId)}`} onClick={(event) => { event.preventDefault(); onNavigate(event.currentTarget.getAttribute('href')) }} className="ga-btn-secondary">Open claim record</a><button type="button" onClick={() => { setCreditResult(null); document.getElementById('credit-queue-heading')?.focus() }} className="ga-btn-secondary">Continue with next beneficiary</button></div>
      </section>)

  return (
    <DashboardShell breadcrumbs={['Operations', isAdmin ? 'Oversight' : 'DSWD Staff', pageTitle]} currentPath={currentPath} onLogout={onLogout} onNavigate={onNavigate} pageTitle={pageTitle} showAssistant={view !== 'ledger'} user={session.user}>
      <header className="ga-page-header flex flex-col gap-5 border-b border-line pb-6 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="ga-eyebrow">{isAdmin ? 'Administrator operations oversight' : 'DSWD authorized workspace'}</p>
            {view === 'live' && <span role="status" aria-atomic="true" className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${connectionStyles}`}>{connection === 'connecting' && <Spinner aria-hidden="true" className="size-3" />}{connection === 'connected' ? 'Live connected' : connection === 'connecting' ? 'Connecting' : 'Live disconnected'}</span>}
          </div>
          <h1 className="ga-page-title mt-2">{pageTitle}</h1>
          <p className="ga-page-copy">{view === 'live' ? 'Monitor distributions, queues, claims, verification activity, and operational anomalies as updates occur.' : ledgerMode === 'wallets' ? isAdmin ? 'Review a beneficiary wallet, create an empty wallet when needed, and inspect its history.' : 'Review a beneficiary wallet and record an authorized internal simulated transfer.' : 'Select a distribution to review fund use, reconciliation, and traceable transaction records.'}</p>
          {view === 'live' && <p className="mt-2 text-xs font-semibold text-muted-copy" aria-live="polite" aria-atomic="true">{liveMessage}</p>}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          {view === 'live' && <button type="button" onClick={refresh} disabled={isRefreshing} className="ga-btn-secondary">{isRefreshing ? <LoadingLabel>Refreshing...</LoadingLabel> : 'Refresh data'}</button>}
          {view === 'live' && <button type="button" onClick={() => onNavigate('/dswd/ledger')} className="ga-btn-primary">Open transactions</button>}
        </div>
      </header>

      {view === 'ledger' && <DisputeLedgerContext session={session} distributionId={selectedId} onNavigate={onNavigate} onSessionExpired={onSessionExpired} />}

      {view === 'ledger' && <><div role="group" aria-label="Simulated ledger workspace" className="mt-6 inline-flex w-full rounded-xl border border-line bg-white p-1 shadow-sm sm:w-auto"><button type="button" aria-pressed={ledgerMode === 'events'} onClick={() => setLedgerMode('events')} className={`flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg px-3 text-sm font-bold sm:flex-none sm:px-5 ${ledgerMode === 'events' ? 'bg-brand-navy text-white' : 'text-copy hover:bg-slate-50'}`}><Icon name="ledger" className="hidden size-4 shrink-0 sm:block" />{isAdmin ? 'Distribution ledger' : 'Distribution settlement'}</button><button type="button" aria-pressed={ledgerMode === 'wallets'} onClick={() => setLedgerMode('wallets')} className={`flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg px-3 text-sm font-bold sm:flex-none sm:px-5 ${ledgerMode === 'wallets' ? 'bg-brand-navy text-white' : 'text-copy hover:bg-slate-50'}`}><Icon name="profile" className="hidden size-4 shrink-0 sm:block" />Individual wallets</button></div><div className="mt-4 flex items-start gap-3 rounded-xl border border-blue-200 bg-info-soft px-4 py-3 text-sm leading-6 text-copy"><Icon name="info" className="mt-0.5 size-5 shrink-0 text-brand-blue" /><p><strong className="text-ink">Simulation only.</strong> These balances and transactions demonstrate system controls; no real funds are stored or moved.</p></div></>}

      {view === 'live' && <Filters draft={draftFilters} setDraft={setDraftFilters} error={filterError} onApply={applyFilters} />}
      {view === 'ledger' && ledgerMode === 'events' && <Filters compact draft={draftFilters} setDraft={setDraftFilters} error={filterError} onApply={applyFilters} onClear={clearFilters} hasFilters={Object.values(filters).some(Boolean) || Object.values(draftFilters).some(Boolean)} />}

      {view === 'ledger' && ledgerMode === 'wallets' ? (
        <IndividualWalletWorkspace session={session} loadingReceiptId={loadingReceiptId} onNavigate={onNavigate} onReceipt={openReceipt} onSessionExpired={onSessionExpired} />
      ) : isLoading ? <LoadingDashboard ledger={view === 'ledger'} /> : mainError ? (
        <section className="mt-7 rounded-xl border border-amber-200 bg-white p-6" role="alert"><h2 className="text-xl font-extrabold text-ink">Unable to load operations data</h2><p className="mt-2 text-sm leading-6 text-muted-copy">{mainError}</p><button type="button" onClick={refresh} className="ga-btn-primary mt-4">Try again</button></section>
      ) : view === 'live' ? (
        <LiveDashboard overview={overview} />
      ) : (
        <LedgerDashboard
          token={session.accessToken}
          onSessionExpired={onSessionExpired}
          overview={overview}
          distributions={distributions}
          selectedId={selectedId}
          selectedDistribution={selectedDistribution}
          selectDistribution={selectDistribution}
          isAdmin={isAdmin}
          filtered={Object.values(filters).some(Boolean)}
          onClearFilters={clearFilters}
          onNavigate={onNavigate}
          summary={distributionSummary}
          transactions={transactions}
          result={creditResultPanel}
          creditQueue={<CreditQueue data={creditableClaims} query={creditQuery} onQuery={(query) => { setCreditQueueLoading(true); setCreditQuery(query) }} loading={creditQueueLoading} error={creditQueueError} retry={() => { setCreditQueueLoading(true); setRefreshKey((value) => value + 1) }} deliveryMode={selectedDistribution?.deliveryMode} distributionStatus={selectedDistribution?.status} disabled={isMutating} onCredit={isDswd ? reviewCredit : undefined} onNavigate={onNavigate} distributionId={selectedId} />}
          reconciliation={reconciliation}
          error={ledgerError}
          isLoading={isLoadingLedger}
          isMutating={isMutating}
          retry={refresh}
          onReceipt={openReceipt}
          onReverse={isDswd ? (transaction) => { setLedgerActionError(''); setLedgerAction({ type: 'reverse', transaction }) } : undefined}
          loadingReceiptId={loadingReceiptId}
          transactionType={transactionType}
          setTransactionType={(value) => { setTransactionType(value); setTransactionPage(1); setIsLoadingLedger(true) }}
          transactionStatus={transactionStatus}
          setTransactionStatus={(value) => { setTransactionStatus(value); setTransactionPage(1); setIsLoadingLedger(true) }}
          transactionPage={transactionPage}
          setTransactionPage={(value) => { setTransactionPage(value); setIsLoadingLedger(true) }}
        />
      )}



      <ConfirmationDialog
        open={Boolean(ledgerAction)}
        destructive={ledgerAction?.type === 'reverse'}
        actionLabel={ledgerAction?.type === 'reverse' ? 'Reverse simulated credit' : 'Credit verified claim'}
        title={ledgerAction?.type === 'reverse' ? 'Reverse this benefit credit?' : 'Credit this verified claim?'}
        error={ledgerActionError}
        confirmDisabled={ledgerAction?.type === 'credit' && (Boolean(ledgerAction.loading || ledgerAction.loadError) || creditBlockers.length > 0)}
        description={ledgerAction?.type === 'reverse'
          ? `This will create a compensating ledger entry, mark the original transaction as Reversed, and void the linked claim. Amount: ${formatMoney(ledgerAction?.transaction?.amount)}.`
          : 'Confirm the beneficiary and event below. This records a simulated wallet credit; no real funds move.'}
        reasonLabel={ledgerAction?.type === 'reverse' ? 'Reason for reversal' : undefined}
        reasonMaxLength={255}
        onCancel={() => setLedgerAction(null)}
        onConfirm={confirmLedgerAction}
      >
        {ledgerAction?.type === 'credit' && <>
          <dl className="mt-5 space-y-3 border-y border-line py-4 text-sm"><ReceiptField label="Beneficiary" value={beneficiaryName(ledgerAction.claim.beneficiary)} /><ReceiptField label="Distribution event" value={ledgerAction.distribution.title} /><ReceiptField label="Program" value={ledgerAction.distribution.program?.programName} /><ReceiptField label="Allocated amount" value={formatMoney(ledgerAction.claim.allocation?.amount)} /><ReceiptField label="Queue number" value={ledgerAction.claim.schedule?.queueNumber ?? 'Not recorded'} /></dl>
          {ledgerAction.loading ? <p role="status" className="mt-4 text-sm"><LoadingLabel>Checking the latest claim...</LoadingLabel></p> : ledgerAction.loadError ? <div role="alert" className="mt-4 text-sm text-brand-red"><p>{ledgerAction.loadError}</p><button type="button" onClick={() => loadCreditReview(ledgerAction)} className="ga-btn-secondary mt-3">Retry claim check</button></div> : <>
            <h3 className="mt-4 text-sm font-bold">Verification</h3><ul className="mt-2 space-y-2 text-sm text-copy">{claimChecks(ledgerAction.claim, ledgerAction.distribution).filter((check) => check.required).map((check) => <li key={check.key}>{check.label}: <strong>{check.status}</strong></li>)}</ul>
            {creditBlockers.length > 0 ? <div className="mt-4 border-l-2 border-amber-300 pl-3 text-sm leading-6"><p className="font-bold">Credit unavailable</p><ul className="mt-1 list-disc pl-4">{creditBlockers.map((blocker) => <li key={blocker}>{blocker}</li>)}</ul></div> : <p className="mt-4 text-sm leading-6 text-copy">The claim is verified and the beneficiary is checked in. Confirming updates the claim and wallet together.</p>}
            <a href={`/claim-accountability?distribution=${encodeURIComponent(ledgerAction.distribution.distributionId)}&claim=${encodeURIComponent(ledgerAction.claim.claimId)}`} onClick={(event) => { event.preventDefault(); if (!isMutating) onNavigate(event.currentTarget.getAttribute('href')) }} aria-disabled={isMutating} className="mt-2 inline-flex min-h-11 items-center text-sm font-bold text-brand-blue underline underline-offset-4">Review claim and disputes</a>
          </>}
        </>}
      </ConfirmationDialog>
      {receipt && <ReceiptDialog receipt={receipt} onClose={() => setReceipt(null)} />}
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
      <div className="flex items-center justify-between gap-4"><div><p className="ga-eyebrow">Operational status</p><h2 className="mt-1 text-xl font-extrabold text-ink">Activity across authorized barangays</h2></div><p className="hidden text-xs font-semibold text-muted-copy sm:block">Updated {overview.generatedAt}</p></div>
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

function LedgerDashboard({ token, onSessionExpired, distributions, selectedId, selectedDistribution, selectDistribution, isAdmin, filtered, onClearFilters, onNavigate, summary, transactions, creditQueue, result, reconciliation, error, isLoading, isMutating, retry, onReceipt, onReverse, loadingReceiptId, transactionType, setTransactionType, transactionStatus, setTransactionStatus, transactionPage, setTransactionPage }) {
  if (distributions.length === 0) return <section className="ga-card mt-6 flex items-start gap-4 p-5 sm:p-6" aria-labelledby="empty-ledger-heading"><span className="grid size-11 shrink-0 place-items-center rounded-lg bg-info-soft text-brand-blue"><Icon name={filtered ? 'search' : 'ledger'} /></span><div className="min-w-0"><h2 id="empty-ledger-heading" className="text-xl font-extrabold text-ink">{filtered ? 'No distributions match your filters' : 'No distributions in this scope'}</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-copy">{filtered ? 'Try a different status or date range, or clear the filters to see all available events.' : isAdmin ? 'Distribution events appear here once they are created. Open distribution events to review the setup or create an event.' : 'No distribution events are available in your authorized area. Ask your system administrator to confirm the event and your assigned scope.'}</p>{filtered ? <button type="button" onClick={onClearFilters} className="ga-btn-secondary mt-4"><Icon name="close" className="size-4" />Show all distributions</button> : isAdmin ? <a href="/distributions/manage" onClick={(event) => { event.preventDefault(); onNavigate('/distributions/manage') }} className="ga-btn-primary mt-4"><Icon name="calendar" className="size-4" />View distribution events</a> : <button type="button" onClick={retry} className="ga-btn-secondary mt-4"><Icon name="reset" className="size-4" />Refresh ledger</button>}</div></section>
  return (
    <div className="mt-7">
      <section className="ga-card p-5 sm:p-6" aria-label="Selected distribution context">
        <div className="flex flex-wrap items-end gap-3"><div className="min-w-0 flex-1 basis-full sm:basis-0"><label htmlFor="ledger-distribution" className="ga-label">Distribution event</label><div className="relative mt-2"><Icon name="calendar" className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted-copy" /><select id="ledger-distribution" value={selectedId} disabled={isMutating} onChange={(event) => selectDistribution(event.target.value)} className="ga-input cursor-pointer pl-11 font-semibold">{distributions.map((distribution) => <option key={distribution.distributionId} value={distribution.distributionId}>{distribution.title} - {distribution.distributionDate}</option>)}</select></div></div><button type="button" onClick={retry} disabled={isLoading || isMutating} className="ga-btn-secondary"><Icon name="reset" className="size-4" />Refresh ledger</button></div>
        <h2 className="mt-3 break-words text-sm font-bold leading-6 text-ink sm:hidden">{selectedDistribution?.title}</h2>
        <dl className="mt-4 grid grid-cols-2 gap-4 border-t border-line pt-4 text-sm lg:grid-cols-4"><ReceiptField label="Program" value={selectedDistribution?.program?.programName || selectedDistribution?.program?.programCode} /><ReceiptField label="Barangay" value={selectedDistribution?.barangay?.barangayName} /><ReceiptField label="Event status" value={selectedDistribution?.status ? humanize(selectedDistribution.status) : 'Not confirmed'} /><ReceiptField label="Delivery" value={selectedDistribution?.deliveryMode ? humanize(selectedDistribution.deliveryMode) : 'Not confirmed'} /></dl>
        <nav aria-label="Event ledger sections" className="mt-3 flex flex-wrap gap-x-5 gap-y-1 border-t border-line pt-2 text-sm font-semibold text-brand-blue">{[['credit-queue-heading', 'Awaiting credit'], ['transactions-heading', 'Transactions'], ['event-reconciliation', 'Reconciliation']].map(([id, label]) => <a key={id} href={`#${id}`} className="inline-flex min-h-11 items-center underline underline-offset-4">{label}</a>)}{isAdmin && <><a href={`/distributions/manage?event=${encodeURIComponent(selectedId)}`} onClick={(event) => { event.preventDefault(); onNavigate(event.currentTarget.getAttribute('href')) }} className="inline-flex min-h-11 items-center underline underline-offset-4">View event setup</a><a href={`/reports?distribution=${encodeURIComponent(selectedId)}`} onClick={(event) => { event.preventDefault(); onNavigate(event.currentTarget.getAttribute('href')) }} className="inline-flex min-h-11 items-center underline underline-offset-4">Event report</a></>}</nav>
      </section>
      {result}

      {isLoading ? <LoadingDashboard ledger /> : error ? <section className="mt-6 rounded-xl border border-amber-200 bg-white p-6" role="alert"><h2 className="font-extrabold text-ink">Unable to load the selected ledger</h2><p className="mt-2 text-sm text-muted-copy">{error}</p><button type="button" onClick={retry} className="ga-btn-primary mt-4">Try again</button></section> : (
        <>
          <details open={isAdmin} className="group ga-card mt-5 px-5 py-2"><summary className="flex min-h-11 cursor-pointer items-center justify-between gap-3 text-sm font-bold text-ink"><h2 id="ledger-summary-heading">Event fund utilization</h2><Icon name="chevronDown" className="size-4 transition-transform group-open:rotate-180 motion-reduce:transition-none" /></summary><dl className="mt-3 grid grid-cols-2 gap-x-5 gap-y-3 sm:grid-cols-3 xl:grid-cols-5">{[['Allocated', summary.fundUtilization.allocatedAmount], ['Net credited', summary.fundUtilization.netCreditedAmount], ['Remaining', summary.fundUtilization.remainingAmount], ['Reversed', summary.fundUtilization.reversedAmount], ['Failed', summary.fundUtilization.failedAmount]].map(([label, amount]) => <div key={label}><dt className="text-xs text-muted-copy">{label}</dt><dd className="mt-1 font-bold tabular-nums text-ink">{formatMoney(amount)}</dd></div>)}</dl></details>

          <div className="mt-6 grid items-start gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(22rem,0.75fr)]">
            {creditQueue}
            <ReconciliationPanel key={selectedId} reconciliation={reconciliation} distributionId={selectedId} token={token} onSessionExpired={onSessionExpired} onNavigate={onNavigate} />
          </div>

          <section className="ga-card mt-6 overflow-hidden" aria-labelledby="transactions-heading"><div className="border-b border-line p-5 sm:p-6"><div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"><div><p className="ga-eyebrow">Traceable records</p><h2 id="transactions-heading" tabIndex={-1} className="scroll-mt-40 mt-1 text-xl font-extrabold text-ink">Transactions</h2><p className="mt-1 text-sm text-muted-copy">{transactions.pagination.total} matching {transactions.pagination.total === 1 ? 'entry' : 'entries'} for this event</p></div><div className="grid gap-3 sm:grid-cols-2"><div><label htmlFor="transaction-type" className="ga-label">Type</label><select id="transaction-type" value={transactionType} onChange={(event) => setTransactionType(event.target.value)} className="ga-input mt-2 cursor-pointer font-semibold">{transactionTypes.map((value) => <option key={value || 'ALL'} value={value}>{value ? humanize(value) : 'All transaction types'}</option>)}</select></div><div><label htmlFor="transaction-status" className="ga-label">Status</label><select id="transaction-status" value={transactionStatus} onChange={(event) => setTransactionStatus(event.target.value)} className="ga-input mt-2 cursor-pointer font-semibold">{transactionStatuses.map((value) => <option key={value || 'ALL'} value={value}>{value ? humanize(value) : 'All statuses'}</option>)}</select></div></div></div></div>
            {transactions.transactions.length === 0 ? <div className="p-8 text-center"><p className="font-extrabold text-ink">No transactions found</p><p className="mt-2 text-sm text-muted-copy">No simulated ledger entries match the selected event and filters.</p></div> : <TransactionTable transactions={transactions.transactions} disabled={isMutating} loadingReceiptId={loadingReceiptId} onReceipt={onReceipt} onReverse={onReverse} />}
            {transactions.transactions.length > 0 && <div className="flex items-center justify-between border-t border-line px-5 py-4"><p className="text-xs font-semibold text-muted-copy">Page {transactions.pagination.page} of {Math.max(transactions.pagination.totalPages, 1)}</p><div className="flex gap-2"><button type="button" disabled={transactionPage <= 1} onClick={() => setTransactionPage(transactionPage - 1)} className="min-h-11 cursor-pointer rounded-lg border border-line px-4 text-sm font-bold text-copy disabled:cursor-not-allowed disabled:opacity-50">Previous</button><button type="button" disabled={transactionPage >= transactions.pagination.totalPages} onClick={() => setTransactionPage(transactionPage + 1)} className="min-h-11 cursor-pointer rounded-lg border border-line px-4 text-sm font-bold text-copy disabled:cursor-not-allowed disabled:opacity-50">Next</button></div></div>}
          </section>
        </>
      )}
    </div>
  )
}

function CreditQueue({ data, query, onQuery, loading, error, retry, deliveryMode, distributionStatus, disabled, onCredit, onNavigate, distributionId }) {
  const claims = data?.claims ?? []
  const total = data?.pagination.total ?? 0
  const pages = Math.max(1, data?.pagination.totalPages ?? 1)
  const available = deliveryMode === 'SIMULATED_WALLET' && distributionStatus === 'OPEN'
  return <section className="ga-card min-w-0 overflow-hidden" aria-labelledby="credit-queue-heading">
    <header className="border-b border-line p-5"><h2 id="credit-queue-heading" tabIndex={-1} className="scroll-mt-40 text-xl font-bold text-ink">Ready for simulated credit</h2><p className="mt-2 text-sm leading-6 text-muted-copy">Review a beneficiary's verified claim before recording the credit.</p></header>
    {!available ? <div className="p-5 text-sm leading-6 text-copy"><h3 className="font-bold text-ink">{deliveryMode === 'PHYSICAL_GOODS' ? 'Physical release workflow' : 'Crediting unavailable'}</h3><p className="mt-2">{deliveryMode === 'PHYSICAL_GOODS' ? 'Barangay staff record the physical handover. These claims do not enter the simulated wallet queue.' : 'Verified claims can only be credited while the distribution event is open.'}</p></div> : <>
      <form aria-label="Search credit queue" onSubmit={(event) => { event.preventDefault(); onQuery({ search: new FormData(event.currentTarget).get('search').trim(), page: 1 }) }} className="border-b border-line p-5"><label htmlFor="credit-search" className="ga-label">Find beneficiary</label><div className="mt-2 flex flex-wrap gap-2"><div className="relative min-w-0 flex-1 basis-48"><Icon name="search" className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted-copy" /><input key={query.search} id="credit-search" name="search" type="search" autoComplete="off" maxLength={100} defaultValue={query.search} placeholder="Name or claim ID" className="ga-input pl-11" /></div><button type="submit" disabled={loading || disabled} className="ga-btn-primary"><Icon name="search" className="size-4" />Search</button>{query.search && <button type="button" onClick={() => { onQuery({ search: '', page: 1 }); requestAnimationFrame(() => document.getElementById('credit-search')?.focus()) }} disabled={loading || disabled} className="ga-btn-secondary"><Icon name="close" className="size-4" />Clear search</button>}</div><p className="mt-2 text-xs leading-5 text-muted-copy">Search all matching claims in this event.</p></form>
      {loading ? <p role="status" className="p-5 text-sm"><LoadingLabel>Loading claims...</LoadingLabel></p> : error ? <div role="alert" className="p-5 text-sm leading-6"><p className="font-bold">Credit queue could not be loaded</p><p className="mt-1 text-copy">{error}</p><button type="button" onClick={retry} className="ga-btn-secondary mt-3">Retry credit queue</button></div> : <>
        <p className="border-b border-line px-5 py-3 text-sm text-muted-copy" role="status">{total} {query.search ? 'matching' : 'awaiting credit'} / {total ? `${(query.page - 1) * 10 + 1}-${(query.page - 1) * 10 + claims.length} shown` : '0 shown'}</p>
        {claims.length === 0 ? <div className="p-5"><h3 className="font-bold text-ink">{query.search ? 'No matching beneficiaries' : 'No claims awaiting credit'}</h3><p className="mt-2 text-sm leading-6 text-muted-copy">{query.search ? 'Try another name or clear the search.' : 'Only verified claims without an existing credit or active dispute appear here.'}</p><a href={`/claim-accountability?distribution=${encodeURIComponent(distributionId)}`} onClick={(event) => { event.preventDefault(); onNavigate(event.currentTarget.getAttribute('href')) }} className="ga-admin-link mt-2">Review claims and receipts</a></div> : <ul className="divide-y divide-line">{claims.map((claim) => <li key={claim.claimId} className="px-5 py-4"><div className="flex flex-wrap items-center justify-between gap-3"><div className="min-w-0 flex-1 basis-40"><p className="break-words font-bold text-ink">{beneficiaryName(claim.beneficiary)}</p><p className="mt-1 text-xs leading-5 text-muted-copy">Queue {claim.schedule?.queueNumber ?? 'Not recorded'} / {claim.verificationMethod ? humanize(claim.verificationMethod) : 'Review verification'}</p><p className="mt-1 font-bold tabular-nums text-ink">{formatMoney(claim.allocation?.amount)}</p></div>{onCredit ? <button type="button" onClick={() => onCredit(claim)} disabled={disabled} className="ga-btn-secondary min-h-11">Review and credit</button> : <p className="text-xs text-muted-copy">Awaiting DSWD settlement</p>}</div></li>)}</ul>}
        <nav aria-label="Credit queue pages" className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-4"><p className="text-xs font-semibold text-muted-copy">Page {query.page} of {pages}</p><div className="flex gap-2"><button type="button" aria-label="Previous claims" disabled={disabled || query.page <= 1} onClick={() => { onQuery({ ...query, page: query.page - 1 }); document.getElementById('credit-queue-heading')?.focus() }} className="ga-btn-secondary min-h-11 px-3 text-sm">Previous</button><button type="button" aria-label="Next claims" disabled={disabled || query.page >= pages} onClick={() => { onQuery({ ...query, page: query.page + 1 }); document.getElementById('credit-queue-heading')?.focus() }} className="ga-btn-secondary min-h-11 px-3 text-sm">Next</button></div></nav>
      </>}
    </>}
  </section>
}

function TransactionTable({ transactions, disabled, loadingReceiptId, onReceipt, onReverse }) {
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
            <div className="mt-4 flex flex-col gap-2 sm:flex-row"><button type="button" onClick={() => onReceipt(transaction)} disabled={disabled || loadingReceiptId === transaction.transactionId} className="ga-btn-secondary min-h-11 flex-1 px-4 text-sm">{loadingReceiptId === transaction.transactionId ? <LoadingLabel>Loading receipt...</LoadingLabel> : 'View receipt'}</button>{onReverse && transaction.transactionType === 'BENEFIT_CREDIT' && transaction.status === 'COMPLETED' && !transaction.reversal && <button type="button" onClick={() => onReverse(transaction)} disabled={disabled} className="ga-btn-secondary min-h-11 flex-1 border-red-200 px-4 text-sm text-brand-red hover:bg-danger-soft">Reverse credit</button>}</div>
          </li>
        ))}
      </ul>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[900px] border-collapse text-left text-sm">
          <caption className="sr-only">Simulated aid ledger transactions</caption>
          <thead><tr className="border-b border-line bg-slate-50 text-xs uppercase tracking-[0.08em] text-muted-copy"><th scope="col" className="px-5 py-3">Recorded</th><th scope="col" className="px-5 py-3">Reference</th><th scope="col" className="px-5 py-3">Beneficiary</th><th scope="col" className="px-5 py-3">Type</th><th scope="col" className="px-5 py-3 text-right">Amount</th><th scope="col" className="px-5 py-3">Status</th><th scope="col" className="px-5 py-3 text-right">Actions</th></tr></thead>
          <tbody className="divide-y divide-line">{transactions.map((transaction) => <tr key={transaction.transactionId} className="hover:bg-slate-50"><td className="whitespace-nowrap px-5 py-4 text-xs text-muted-copy">{dateFormatter.format(new Date(transaction.createdAt))}</td><td className="max-w-48 truncate px-5 py-4 font-mono text-xs font-bold text-ink" title={transaction.referenceNo}>{transaction.referenceNo}</td><td className="px-5 py-4"><p className="font-bold text-ink">{beneficiaryName(transaction.beneficiary)}</p><p className="mt-1 text-xs text-muted-copy">{transaction.beneficiary?.barangay?.barangayName}</p></td><td className="px-5 py-4 text-xs font-semibold text-copy">{humanize(transaction.transactionType)}</td><td className="whitespace-nowrap px-5 py-4 text-right">{amount(transaction)}</td><td className="px-5 py-4"><TransactionStatus status={transaction.status} /></td><td className="px-5 py-4"><div className="flex justify-end gap-2"><button type="button" onClick={() => onReceipt(transaction)} disabled={disabled || loadingReceiptId === transaction.transactionId} className="min-h-10 cursor-pointer rounded-lg border border-line bg-white px-3 text-xs font-bold text-brand-blue hover:border-brand-blue hover:bg-info-soft disabled:cursor-not-allowed disabled:opacity-50">{loadingReceiptId === transaction.transactionId ? <LoadingLabel>Loading...</LoadingLabel> : 'Receipt'}</button>{onReverse && transaction.transactionType === 'BENEFIT_CREDIT' && transaction.status === 'COMPLETED' && !transaction.reversal && <button type="button" onClick={() => onReverse(transaction)} disabled={disabled} className="min-h-10 cursor-pointer rounded-lg border border-red-200 bg-white px-3 text-xs font-bold text-brand-red hover:bg-danger-soft disabled:cursor-not-allowed disabled:opacity-50">Reverse</button>}</div></td></tr>)}</tbody>
        </table>
      </div>
    </>
  )
}

function ReceiptDialog({ receipt, onClose }) {
  const dialogRef = useRef(null)
  const transaction = receipt.transaction

  useEffect(() => {
    dialogRef.current?.showModal()
  }, [])

  return (
    <dialog ref={dialogRef} onCancel={onClose} onClose={onClose} className="m-auto max-h-[calc(100dvh-2rem)] w-[min(42rem,calc(100%-2rem))] overflow-y-auto rounded-2xl border border-line bg-white p-0 text-ink shadow-lg backdrop:bg-slate-950/55">
      <article>
        <header className="flex items-start justify-between gap-5 border-b border-line bg-brand-navy p-5 text-white sm:p-7"><div><p className="text-xs font-bold uppercase tracking-[0.14em] text-blue-200">{receipt.receiptVersion}</p><h2 className="mt-2 text-2xl font-extrabold">Simulated transaction receipt</h2><p className="mt-2 text-sm text-slate-300">Issued {dateFormatter.format(new Date(receipt.issuedAt))}</p></div><button type="button" onClick={() => dialogRef.current?.close()} aria-label="Close transaction receipt" className="grid size-11 shrink-0 place-items-center rounded-lg border border-white/20 text-xl text-white hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-white">×</button></header>
        <div className="p-5 sm:p-7">
          <div className="flex flex-col gap-4 border-b border-line pb-6 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-sm font-semibold text-muted-copy">Reference number</p><p className="mt-1 [overflow-wrap:anywhere] font-mono text-sm font-extrabold text-ink">{transaction.referenceNo}</p></div><div className="sm:text-right"><p className="text-sm font-semibold text-muted-copy">Amount</p><p className="mt-1 text-3xl font-black tabular-nums text-brand-green">{formatMoney(transaction.amount)}</p></div></div>
          <dl className="mt-6 grid gap-x-8 gap-y-5 text-sm sm:grid-cols-2"><ReceiptField label="Beneficiary" value={beneficiaryName(transaction.beneficiary)} /><ReceiptField label="Barangay" value={transaction.beneficiary?.barangay?.barangayName} /><ReceiptField label="Program" value={transaction.distribution?.program?.programName} /><ReceiptField label="Distribution" value={transaction.distribution?.title} /><ReceiptField label="Transaction type" value={humanize(transaction.transactionType)} /><ReceiptField label="Status" value={humanize(transaction.status)} /><ReceiptField label="Balance before" value={formatMoney(transaction.balanceBefore)} /><ReceiptField label="Balance after" value={formatMoney(transaction.balanceAfter)} /><ReceiptField label="Processed by" value={transaction.initiatedBy?.fullName} /><ReceiptField label="Recorded" value={dateFormatter.format(new Date(transaction.createdAt))} /></dl>
          {transaction.description && <div className="mt-6 rounded-lg border border-line bg-slate-50 p-4"><p className="text-xs font-bold uppercase tracking-[0.08em] text-muted-copy">Ledger description</p><p className="mt-2 text-sm leading-6 text-copy">{transaction.description}</p></div>}
          <p className="mt-6 rounded-lg border border-blue-200 bg-info-soft p-4 text-sm leading-6 text-copy"><strong className="text-ink">Simulation disclosure:</strong> {receipt.simulation.message}</p>
          <button type="button" onClick={() => dialogRef.current?.close()} className="ga-btn-primary mt-6 w-full">Close receipt</button>
        </div>
      </article>
    </dialog>
  )
}

function ReceiptField({ label, value }) {
  return <div><dt className="text-xs font-bold uppercase tracking-[0.08em] text-muted-copy">{label}</dt><dd className="mt-1 break-words font-bold text-ink">{value || 'Not recorded'}</dd></div>
}

function TransactionStatus({ status }) {
  const style = status === 'COMPLETED' ? 'border-emerald-200 bg-success-soft text-brand-green' : status === 'PENDING' ? 'border-amber-200 bg-warning-soft text-brand-amber' : 'border-line bg-slate-100 text-copy'
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${style}`}>{humanize(status)}</span>
}

export default DswdOperationsPage
