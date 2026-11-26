import AdminOverview from '../components/admin/AdminOverview.jsx'
import DswdWorkOverview from '../components/dswd/DswdWorkOverview.jsx'
import { useCallback, useEffect, useRef, useState } from 'react'
import DashboardShell from '../components/layout/DashboardShell.jsx'
import DashboardLoadNotice from '../components/ui/DashboardLoadNotice.jsx'
import { useApiCooldown } from '../hooks/useApiCooldown.js'
import { createLiveRefresh } from '../utils/liveRefresh.js'
import { Icon } from '../components/ui/icon.jsx'
import { Skeleton } from '../components/ui/skeleton.jsx'
import { OverviewEmptyState, OverviewUpdate } from '../components/ui/overview.jsx'
import {
  getAuthErrorMessage,
  getApiRetryAfterSeconds,
  getDashboardNavigation,
  isSessionExpiredError,
  requestDashboardOverview,
  requestDistributionList,
  requestOwnAccount,
  updateStoredStaffUser,
  STAFF_ROLE_LABELS,
} from '../auth/staffAuth.js'
import { connectOverviewRealtime } from '../realtime/staffRealtime.js'

const moduleDescriptions = {
  'Assistance programs': 'Maintain assistance programs and their eligibility rules.',
  'Enrollment review': 'Review beneficiary submissions and supporting documents.',
  Beneficiaries: 'Register residents, update verified details, and submit supporting documents.',
  Reports: 'Generate distribution, claim, schedule, and fund summaries.',
  'Audit logs': 'Review recorded staff and system actions.',
  'Live monitoring': 'Watch active distributions, queues, claims, and exceptions.',
  Ledger: 'Review simulated fund utilization and transaction records.',
  'Queue & schedules': 'Find a scheduled beneficiary and continue their required claim checks.',
  'QR verification': 'Validate single-use claim references at distribution sites.',
  Notifications: 'Monitor SMS processing and follow up on failed reminders.',
  'Biometric identity': 'Record consent, enroll a face profile, and verify claims.',
  'Claim accountability': 'Issue claim receipts, file disputes, and record independent review decisions.',
  'Releases & receipts': 'Record a verified physical handover, issue a receipt, or refer a concern.',
}

const roleContent = {
  DSWD_STAFF: {
    heading: 'DSWD overview',
    description: 'Enrollment reviews, distributions, and simulated aid records across authorized barangays.',
    primary: { label: 'Open live monitoring', href: '/dswd/live-dashboard' },
  },
  BARANGAY_FACILITATOR: {
    heading: 'Barangay overview',
    description: 'Register beneficiaries, prepare their records, and record assistance handovers in your barangay.',
    primary: { label: 'View beneficiary queue', href: '/facilitator/queue' },
  },
}

const featuredModuleHrefs = {
  DSWD_STAFF: ['/dswd/live-dashboard', '/enrollments', '/programs', '/dswd/ledger'],
  BARANGAY_FACILITATOR: ['/beneficiaries', '/biometrics', '/facilitator/queue', '/claim-accountability'],
}

const moduleIcons = {
  '/beneficiaries': 'beneficiaries',
  '/biometrics': 'biometrics',
  '/facilitator/queue': 'queue',
  '/claim-accountability': 'receipt',
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
      { label: 'Scheduled queue', value: formatCount(overview.queue.scheduledCount), detail: 'Assigned beneficiaries', icon: 'queue' },
      { label: 'Verified, awaiting assistance', value: formatCount(overview.beneficiaries.verifiedBeneficiaryCount), detail: 'Release or credit not yet recorded', icon: 'security' },
      { label: 'Completed claims', value: formatCount(overview.beneficiaries.claimedBeneficiaryCount), detail: 'Recorded handover or wallet credit', icon: 'receipt' },
      { label: 'Unclaimed allocations', value: formatCount(overview.beneficiaries.unclaimedAllocationCount), detail: 'Assistance not yet recorded as received', icon: 'clock' },
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
  if (role === 'BARANGAY_FACILITATOR' && overview.beneficiaries.verifiedBeneficiaryCount > 0) {
    return { title: `Verified claims awaiting assistance: ${formatCount(overview.beneficiaries.verifiedBeneficiaryCount)}`, description: 'Record physical handovers after checking the claim. DSWD handles simulated wallet credits.', action: ['Review verified claims', '/claim-accountability?status=VERIFIED'] }
  }
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
  const [requestError, setRequestError] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [reloadCount, setReloadCount] = useState(0)
  const [liveStatus, setLiveStatus] = useState('connecting')
  const [draftEvents, setDraftEvents] = useState([])
  const [draftError, setDraftError] = useState('')
  const [draftLoading, setDraftLoading] = useState(() => session.user.role === 'SYSTEM_ADMIN')
  const fetching = useRef(false)
  const previousCooldown = useRef(0)
  const retrySeconds = useApiCooldown(session.accessToken)
  const error = requestError ? getAuthErrorMessage(requestError) : ''
  const assignmentRequired = requestError?.code === 'BARANGAY_ASSIGNMENT_REQUIRED'
  const rateLimited = requestError?.status === 429 || retrySeconds > 0
  const refreshDashboard = useCallback(() => {
    if (fetching.current || getApiRetryAfterSeconds(session.accessToken)) return
    fetching.current = true
    setIsLoading(true)
    setReloadCount(count => count + 1)
  }, [session.accessToken])
  const role = session.user.role
  const content = roleContent[role] ?? roleContent.DSWD_STAFF
  const modules = getDashboardNavigation(role).flatMap((item) => item.children ?? [item]).filter((item) => item.href && item.href !== '/dashboard')
  const moduleByHref = new Map(modules.map((item) => [item.href, item]))
  const featuredModules = (featuredModuleHrefs[role] ?? []).map((href) => moduleByHref.get(href)).filter(Boolean)

  useEffect(() => {
    const previous = previousCooldown.current
    previousCooldown.current = retrySeconds
    if (previous > 0 && retrySeconds === 0 && document.visibilityState === 'visible') refreshDashboard()
  }, [refreshDashboard, retrySeconds])

  useEffect(() => {
    if (assignmentRequired) return undefined
    let active = true
    let connectedOnce = false
    const refresh = createLiveRefresh(session.accessToken, refreshDashboard)
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
    const safetyRefresh = setInterval(() => { if (document.visibilityState === 'visible') refresh() }, 60_000)
    return () => { active = false; refresh.cancel(); clearInterval(safetyRefresh); disconnect() }
  }, [assignmentRequired, onSessionExpired, refreshDashboard, session.accessToken])

  useEffect(() => {
    let active = true
    fetching.current = true
    requestDashboardOverview(session.accessToken)
      .then(async (data) => {
        if (!active) return
        if (role === 'BARANGAY_FACILITATOR' && data.scope?.barangayId && data.scope.barangayId !== session.user.barangayId) {
          setOverview(null)
          const account = await requestOwnAccount(session.accessToken)
          if (!active) return
          if (account.user.userId !== session.user.userId || account.user.barangayId !== data.scope.barangayId) throw new Error('Account details could not be confirmed. Refresh or sign in again.')
          updateStoredStaffUser(session.accessToken, account.user)
          onNavigate('/dashboard')
          return
        }
        setOverview(data)
        setRequestError(null)
      })
      .catch((requestError) => {
        if (!active) return
        if (isSessionExpiredError(requestError)) return onSessionExpired()
        if (requestError.code === 'BARANGAY_ASSIGNMENT_REQUIRED') setOverview(null)
        setRequestError(requestError)
      })
      .finally(() => { if (active) { fetching.current = false; setIsLoading(false) } })
    return () => { active = false }
  }, [onNavigate, onSessionExpired, reloadCount, role, session.accessToken, session.user.barangayId, session.user.userId])

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
    <DashboardShell breadcrumbs={['Operations', 'Overview']} currentPath="/dashboard" onLogout={onLogout} onNavigate={onNavigate} pageTitle="Overview" showAssistant={role === 'SYSTEM_ADMIN'} user={session.user}>
      {overview && (error || retrySeconds > 0) && <DashboardLoadNotice compact error={error} rateLimited={rateLimited} retrySeconds={retrySeconds} busy={isLoading} onRetry={refreshDashboard} />}
      {assignmentRequired ? (
        <DashboardLoadNotice assignmentRequired staffId={session.user.employeeId} retrySeconds={retrySeconds} busy={isLoading} onRetry={refreshDashboard} />
      ) : isLoading && !overview ? <DashboardSkeleton /> : error && !overview ? (
        <DashboardLoadNotice error={error} rateLimited={rateLimited} retrySeconds={retrySeconds} busy={isLoading} onRetry={refreshDashboard} />
      ) : role === 'SYSTEM_ADMIN' ? <>
        <AdminOverview session={session} overview={overview} draftEvents={draftEvents} draftError={draftError} draftLoading={draftLoading} liveStatus={liveStatus} reloadCount={reloadCount} onRefresh={refreshDashboard} refreshDisabled={isLoading || retrySeconds > 0} onNavigate={onNavigate} onSessionExpired={onSessionExpired} />
      </> : role === 'DSWD_STAFF' ? <DswdWorkOverview session={session} overview={overview} liveStatus={liveStatus} reloadCount={reloadCount} onRefresh={refreshDashboard} refreshDisabled={isLoading || retrySeconds > 0} onNavigate={onNavigate} onSessionExpired={onSessionExpired} /> : (
        <div className="ga-overview ga-barangay-overview ga-dashboard-ready">
          <header className="ga-overview-heading">
            <div><h1 id="overview-title" className="ga-page-title">{content.heading}</h1><p className="ga-page-copy">{content.description}</p></div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={refreshDashboard} disabled={isLoading || retrySeconds > 0} className="ga-btn-secondary"><Icon name="reset" className="size-4" />Refresh records</button>
              <a href={content.primary.href} onClick={(event) => navigateLink(event, content.primary.href, onNavigate)} className="ga-btn-primary">{content.primary.label}<Icon name="arrowRight" className="size-4" /></a>
            </div>
          </header>
          <OverviewUpdate generatedAt={overview.generatedAt} liveStatus={liveStatus}><span className="ga-overview-scope"><Icon name="location" className="size-3.5 shrink-0" />{scopeLabel}</span></OverviewUpdate>
          <dl className="ga-admin-summary grid grid-cols-2 lg:grid-cols-4" aria-label="Operations summary">
            {dashboardMetrics(overview, role).map((metric) => <div key={metric.label}>
              <dt><span className="ga-overview-icon"><Icon name={metric.icon} /></span><span>{metric.label}</span></dt>
              <dd><span className="ga-overview-total">{metric.value}</span><span className="ga-overview-metric-detail">{metric.detail}</span></dd>
            </div>)}
          </dl>

          <div className="ga-overview-work ga-overview-work-equal xl:grid-cols-2">
            <section className="ga-admin-register" aria-labelledby="tools-heading">
              <header><h2 id="tools-heading"><Icon name="office" />{role === 'DSWD_STAFF' ? 'DSWD tasks' : 'Barangay tasks'}</h2></header>
              <ul className="ga-overview-tasks">
                {featuredModules.map((item) => <li key={item.href}>
                  <a href={item.href} onClick={(event) => navigateLink(event, item.href, onNavigate)} className="flex min-h-14 items-center justify-between gap-4 p-4 hover:bg-slate-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-blue">
                    <span className="ga-overview-task-icon"><Icon name={moduleIcons[item.href]} /></span>
                    <span className="min-w-0"><span className="block text-sm font-semibold text-brand-blue">{item.label}</span><span className="mt-1 block text-sm leading-6 text-copy">{moduleDescriptions[item.label] ?? 'View records and available actions.'}</span></span>
                    <Icon name="chevronRight" className="size-4 shrink-0 text-muted-copy" />
                  </a>
                </li>)}
              </ul>
              {isEmpty && <OverviewEmptyState icon="beneficiaries" title="No operational records yet."><p>Figures will appear as programs and distributions are added.</p></OverviewEmptyState>}
            </section>

            <section className="ga-admin-register" aria-labelledby="progress-heading">
              <header><h2 id="progress-heading"><Icon name="monitoring" />Distribution status</h2></header>
              <div className="ga-overview-attention">
                <Icon name="queue" className="size-5 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-ink">{attention.title}</p>
                  <p className="mt-1 text-sm leading-6 text-copy">{attention.description}</p>
                  <a href={attention.action[1]} onClick={(event) => navigateLink(event, attention.action[1], onNavigate)} className="ga-admin-link">{attention.action[0]}</a>
                </div>
              </div>
              <div className="ga-overview-completion">
                <ProgressRow label="Claim completion" value={overview.beneficiaries.claimCompletionPercentage} />
                <p className="text-sm leading-6 text-copy">Completion counts recorded handovers and wallet credits. Check-in and identity verification alone do not mean assistance was received.</p>
              </div>
            </section>
          </div>

          <section className="ga-admin-register ga-overview-handoff" aria-labelledby="handoff-heading">
            <header><h2 id="handoff-heading"><Icon name="people" />Who handles the next step</h2></header>
            <dl className="grid divide-y divide-line text-sm md:grid-cols-3 md:divide-x md:divide-y-0">
              <div className="p-4"><dt className="font-semibold text-ink"><Icon name="office" />Barangay staff</dt><dd className="mt-2 leading-6 text-copy">Register and update residents, submit enrollment documents, record face consent and enrollment, assist claim checks, and record physical release.</dd></div>
              <div className="p-4"><dt className="font-semibold text-ink"><Icon name="enrollments" />DSWD</dt><dd className="mt-2 leading-6 text-copy">Review eligibility and enrollment, verify claims, and record simulated wallet credits. Refer review concerns to DSWD.</dd></div>
              <div className="p-4"><dt className="font-semibold text-ink"><Icon name="distributions" />Admin</dt><dd className="mt-2 leading-6 text-copy">Set up events, allocations and sessions, review claim credentials, and close events. Barangay staff can adjust assigned schedules while an event is still a draft.</dd></div>
            </dl>
          </section>

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
