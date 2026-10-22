import AdminOverview from '../components/admin/AdminOverview.jsx'
import { useEffect, useState } from 'react'
import DashboardShell from '../components/layout/DashboardShell.jsx'
import { Icon } from '../components/ui/icon.jsx'
import { Skeleton } from '../components/ui/skeleton.jsx'
import {
  getAuthErrorMessage,
  getDashboardNavigation,
  isSessionExpiredError,
  requestDashboardOverview,
  requestDistributionList,
  STAFF_ROLE_LABELS,
} from '../auth/staffAuth.js'
import { connectOverviewRealtime } from '../realtime/staffRealtime.js'

const moduleDescriptions = {
  'Assistance programs': 'Maintain assistance programs and their eligibility rules.',
  'Enrollment review': 'Review beneficiary submissions and supporting documents.',
  Beneficiaries: 'Open beneficiary records available within your authorized scope.',
  Reports: 'Generate distribution, claim, schedule, and fund summaries.',
  'Audit logs': 'Review recorded staff and system actions.',
  'Live monitoring': 'Watch active distributions, queues, claims, and exceptions.',
  Ledger: 'Review simulated fund utilization and transaction records.',
  'Queue & schedules': 'Manage today\'s assigned beneficiary queue and time slots.',
  'QR verification': 'Validate single-use claim references at distribution sites.',
  Notifications: 'Monitor simulated SMS delivery and follow up on failed reminders.',
  'Biometric identity': 'Record consent, enroll a face profile, and verify claims.',
  'Claim accountability': 'Issue claim receipts, file disputes, and record independent review decisions.',
}

const roleContent = {
  DSWD_STAFF: {
    heading: 'DSWD overview',
    description: 'Enrollment reviews, distributions, and simulated aid records across authorized barangays.',
    primary: { label: 'Open live monitoring', href: '/dswd/live-dashboard' },
  },
  BARANGAY_FACILITATOR: {
    heading: 'Barangay overview',
    description: 'Beneficiary records, schedules, and claim verification for your assigned barangay.',
    primary: { label: 'View beneficiary queue', href: '/facilitator/queue' },
  },
}

const featuredModuleHrefs = {
  DSWD_STAFF: ['/dswd/live-dashboard', '/enrollments', '/programs', '/dswd/ledger'],
  BARANGAY_FACILITATOR: ['/facilitator/queue', '/facilitator/qr-verification', '/beneficiaries', '/biometrics'],
}

const numberFormatter = new Intl.NumberFormat('en-PH')

function formatCount(value) {
  return numberFormatter.format(Number(value ?? 0))
}

function clampPercentage(value) {
  return Math.min(100, Math.max(0, Number(value) || 0))
}

function dashboardMetrics(overview, role) {
  if (role === 'BARANGAY_FACILITATOR') {
    return [
      { label: 'Scheduled queue', value: formatCount(overview.queue.scheduledCount), detail: 'Assigned beneficiaries' },
      { label: 'Checked in', value: formatCount(overview.queue.checkedInCount), detail: 'Currently in progress' },
      { label: 'Unclaimed', value: formatCount(overview.beneficiaries.unclaimedAllocationCount), detail: 'Allocations awaiting a claim' },
      { label: 'Claim completion', value: `${overview.beneficiaries.claimCompletionPercentage}%`, detail: 'Verified assistance claims' },
    ]
  }

  return [
    { label: 'Active programs', value: formatCount(overview.programs.activeProgramCount), detail: 'Available assistance' },
    { label: 'Approved beneficiaries', value: formatCount(overview.beneficiaries.approvedBeneficiaryCount), detail: 'Current data scope' },
    { label: 'Upcoming distributions', value: formatCount(overview.distributions.upcomingDistributionCount), detail: 'Draft or open events' },
    { label: 'Claim completion', value: `${overview.beneficiaries.claimCompletionPercentage}%`, detail: 'Verified assistance claims' },
  ]
}

function attentionFor(overview, role) {
  if (role === 'DSWD_STAFF' && overview.distributions.upcomingDistributionCount > 0) {
    return { title: `Upcoming distributions: ${formatCount(overview.distributions.upcomingDistributionCount)}`, description: 'Review scheduled events, queues, and claims in live monitoring.', action: ['View distributions', '/dswd/live-dashboard'] }
  }
  if (role === 'BARANGAY_FACILITATOR' && overview.queue.scheduledCount > 0) {
    return { title: `Scheduled beneficiaries: ${formatCount(overview.queue.scheduledCount)}`, description: 'Check assigned time slots before starting claim verification.', action: ['Review queue', '/facilitator/queue'] }
  }
  return role === 'BARANGAY_FACILITATOR'
    ? { title: 'No beneficiaries currently scheduled', description: 'Assigned schedules will appear in your barangay queue.', action: ['View queue', '/facilitator/queue'] }
    : { title: 'No upcoming distributions', description: 'Open live monitoring to review current distribution records.', action: ['View distributions', '/dswd/live-dashboard'] }
}

function DashboardSkeleton() {
  return (
    <div className="mx-auto w-full max-w-7xl" role="status" aria-label="Loading operations dashboard" aria-busy="true">
      <span className="sr-only">Loading operations dashboard...</span>
      <Skeleton className="h-20 rounded" />
      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-24 rounded" />)}
      </div>
      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <Skeleton className="h-80 rounded" />
        <Skeleton className="h-80 rounded" />
      </div>
    </div>
  )
}

function DashboardPage({ session, onLogout, onNavigate, onSessionExpired }) {
  const [overview, setOverview] = useState(null)
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [reloadCount, setReloadCount] = useState(0)
  const [liveStatus, setLiveStatus] = useState('connecting')
  const [draftEvents, setDraftEvents] = useState([])
  const [draftError, setDraftError] = useState('')
  const [draftLoading, setDraftLoading] = useState(() => session.user.role === 'SYSTEM_ADMIN')
  const role = session.user.role
  const content = roleContent[role] ?? roleContent.DSWD_STAFF
  const modules = getDashboardNavigation(role).flatMap((item) => item.children ?? [item]).filter((item) => item.href && item.href !== '/dashboard')
  const moduleByHref = new Map(modules.map((item) => [item.href, item]))
  const featuredModules = (featuredModuleHrefs[role] ?? []).map((href) => moduleByHref.get(href)).filter(Boolean)

  useEffect(() => {
    let active = true
    let connectedOnce = false
    let refreshTimer
    const refresh = () => {
      if (!active) return
      clearTimeout(refreshTimer)
      refreshTimer = setTimeout(() => setReloadCount((count) => count + 1), 250)
    }
    const disconnect = connectOverviewRealtime(session.accessToken, {
      onReady: () => {
        if (!active) return
        setLiveStatus('connected')
        if (connectedOnce) refresh()
        connectedOnce = true
      },
      onUpdate: refresh,
      onError: (socketError) => {
        if (!active) return
        if (['AUTHENTICATION_REQUIRED', 'INVALID_TOKEN', 'INVALID_SESSION'].includes(socketError?.data?.code)) return onSessionExpired()
        setLiveStatus('reconnecting')
      },
      onDisconnect: () => { if (active) setLiveStatus('reconnecting') },
    })
    return () => { active = false; clearTimeout(refreshTimer); disconnect() }
  }, [onSessionExpired, session.accessToken])

  useEffect(() => {
    let active = true
    requestDashboardOverview(session.accessToken)
      .then((data) => { if (active) { setOverview(data); setError('') } })
      .catch((requestError) => {
        if (!active) return
        if (isSessionExpiredError(requestError)) return onSessionExpired()
        setError(getAuthErrorMessage(requestError))
      })
      .finally(() => { if (active) setIsLoading(false) })
    return () => { active = false }
  }, [onSessionExpired, reloadCount, session.accessToken])

  useEffect(() => {
    if (role !== 'SYSTEM_ADMIN') return undefined
    let active = true
    requestDistributionList(session.accessToken, { page: 1, pageSize: 5, status: 'DRAFT' })
      .then((data) => { if (active) { setDraftEvents(data.distributions); setDraftError('') } })
      .catch((requestError) => {
        if (!active) return
        if (isSessionExpiredError(requestError)) return onSessionExpired()
        setDraftError(getAuthErrorMessage(requestError))
      })
      .finally(() => { if (active) setDraftLoading(false) })
    return () => { active = false }
  }, [onSessionExpired, reloadCount, role, session.accessToken])

  const isEmpty = overview
    && overview.programs.activeProgramCount === 0
    && overview.distributions.totalMatchingDistributionCount === 0
    && overview.beneficiaries.approvedBeneficiaryCount === 0
  const attention = overview ? attentionFor(overview, role) : null
  const scopeLabel = overview?.scope.global
    ? 'All authorized barangays'
    : session.user.barangay?.barangayName ?? 'Assigned barangay scope'

  return (
    <DashboardShell breadcrumbs={['Operations', 'Overview']} currentPath="/dashboard" onLogout={onLogout} onNavigate={onNavigate} pageTitle="Overview" user={session.user}>
      {isLoading ? <DashboardSkeleton /> : error && !overview ? (
        <section className="ga-card mx-auto max-w-2xl border-amber-200 p-6 sm:p-8" role="alert" aria-labelledby="dashboard-error-title">
          <span aria-hidden="true" className="grid size-12 place-items-center rounded-xl bg-warning-soft text-brand-amber"><Icon name="info" className="size-6" /></span>
          <p className="ga-eyebrow mt-5 text-brand-amber">Dashboard unavailable</p>
          <h1 id="dashboard-error-title" className="mt-2 text-2xl font-bold text-ink">We could not load operations data</h1>
          <p className="mt-3 max-w-2xl text-base leading-7 text-muted-copy">{error}</p>
          <button type="button" onClick={() => { setError(''); setIsLoading(true); setReloadCount((count) => count + 1) }} className="ga-btn-primary mt-5"><Icon name="reset" />Try again</button>
        </section>
      ) : role === 'SYSTEM_ADMIN' ? <>
        {error && <p role="status" className="mb-4 border-l-4 border-brand-amber bg-warning-soft p-3 text-sm">Latest figures could not be loaded. Showing the last available update.</p>}
        <AdminOverview session={session} overview={overview} draftEvents={draftEvents} draftError={draftError} draftLoading={draftLoading} liveStatus={liveStatus} reloadCount={reloadCount} onRefresh={() => setReloadCount((count) => count + 1)} onNavigate={onNavigate} onSessionExpired={onSessionExpired} />
      </> : (
        <div className="ga-dashboard-ready">
          {error && <p role="status" className="mb-4 border-l-4 border-brand-amber bg-warning-soft p-3 text-sm">Latest figures could not be loaded. Showing the last available update.</p>}
          <header className="ga-page-header flex flex-wrap items-start justify-between gap-4 border-b border-line pb-4">
            <div><h1 id="overview-title" className="ga-page-title">{content.heading}</h1><p className="ga-page-copy">{content.description}</p></div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setReloadCount((count) => count + 1)} className="ga-btn-secondary">Refresh records</button>
              <a href={content.primary.href} onClick={(event) => navigateLink(event, content.primary.href, onNavigate)} className="ga-btn-primary">{content.primary.label}</a>
            </div>
          </header>
          <div className="my-3 flex flex-wrap justify-between gap-2 text-xs text-muted-copy" role="status">
            <span>{scopeLabel} · Updated {overview.generatedAt}</span>
            <span>{liveStatus === 'connected' ? 'Live updates connected' : liveStatus === 'connecting' ? 'Connecting to live updates' : 'Live updates unavailable. Use Refresh records.'}</span>
          </div>
          <dl className="ga-admin-summary grid grid-cols-2 lg:grid-cols-4" aria-label="Operations summary">
            {dashboardMetrics(overview, role).map((metric) => <div key={metric.label}>
              <dt>{metric.label}</dt>
              <dd><span className="block text-[1.75rem] font-semibold tabular-nums leading-relaxed text-ink">{metric.value}</span><span className="text-xs text-muted-copy">{metric.detail}</span></dd>
            </div>)}
          </dl>

          <div className="mt-5 grid items-start gap-5 xl:grid-cols-2">
            <section className="ga-admin-register" aria-labelledby="tools-heading">
              <header><h2 id="tools-heading">{role === 'DSWD_STAFF' ? 'DSWD tasks' : 'Barangay tasks'}</h2></header>
              <ul className="divide-y divide-line">
                {featuredModules.map((item) => <li key={item.href}>
                  <a href={item.href} onClick={(event) => navigateLink(event, item.href, onNavigate)} className="flex min-h-14 items-center justify-between gap-4 p-4 hover:bg-slate-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-blue">
                    <span className="min-w-0"><span className="block text-sm font-semibold text-brand-blue">{item.label}</span><span className="mt-1 block text-sm leading-6 text-copy">{moduleDescriptions[item.label] ?? 'View records and available actions.'}</span></span>
                    <Icon name="chevronRight" className="size-4 shrink-0 text-muted-copy" />
                  </a>
                </li>)}
              </ul>
              {isEmpty && <p className="border-t border-line p-4 text-sm leading-6 text-copy"><strong className="font-semibold text-ink">No operational records yet.</strong> Figures will appear as programs and distributions are added.</p>}
            </section>

            <section className="ga-admin-register" aria-labelledby="progress-heading">
              <header><h2 id="progress-heading">Distribution status</h2></header>
              <div className="border-b border-line px-4 py-3">
                <p className="text-sm font-semibold text-ink">{attention.title}</p>
                <p className="mt-1 text-sm leading-6 text-copy">{attention.description}</p>
                <a href={attention.action[1]} onClick={(event) => navigateLink(event, attention.action[1], onNavigate)} className="ga-admin-link">{attention.action[0]}</a>
              </div>
              <div className="space-y-5 p-4">
                <ProgressRow label="Claim completion" value={overview.beneficiaries.claimCompletionPercentage} />
                <ProgressRow label="Queue capacity used" value={overview.queue.capacityUtilizationPercentage} />
                <ProgressRow label="Beneficiaries checked in" value={overview.queue.checkInPercentage} />
              </div>
            </section>
          </div>

          <details className="ga-admin-guide mt-5">
            <summary className="cursor-pointer">Account and data scope</summary>
            <div className="p-4">
              <dl className="max-w-2xl divide-y divide-line text-sm">
                <DataRow label="Staff ID" value={session.user.employeeId} />
                <DataRow label="Role" value={STAFF_ROLE_LABELS[role]} />
                <DataRow label="Authenticator" value={session.user.totpEnabled ? 'Verified' : 'Setup required'} success={session.user.totpEnabled} />
                <DataRow label="Data scope" value={scopeLabel} />
                <DataRow label="Financial records" value={overview.financialVisibility ? 'Authorized' : 'Restricted by role'} />
              </dl>
              <a href="/account" onClick={(event) => navigateLink(event, '/account', onNavigate)} className="ga-admin-link mt-2">Review account security</a>
            </div>
          </details>
        </div>
      )}
    </DashboardShell>
  )
}

function navigateLink(event, href, onNavigate) {
  if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return
  event.preventDefault()
  onNavigate(href)
}

function ProgressRow({ label, value }) {
  const percentage = clampPercentage(value)
  return (
    <div>
      <div className="flex items-center justify-between gap-4 text-sm">
        <span className="font-semibold text-copy">{label}</span>
        <span className="font-extrabold tabular-nums text-ink">{percentage}%</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
        <div role="progressbar" aria-label={label} aria-valuemin="0" aria-valuemax="100" aria-valuenow={percentage} className="h-full rounded-full bg-brand-blue" style={{ width: `${percentage}%` }} />
      </div>
    </div>
  )
}

function DataRow({ label, value, success = false }) {
  return <div className="grid grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] gap-3 py-2.5 first:pt-0 last:pb-0"><dt className="text-muted-copy">{label}</dt><dd className={`min-w-0 break-words text-right font-bold ${success ? 'text-brand-green' : 'text-ink'}`}>{value}</dd></div>
}

export default DashboardPage
