import { useEffect, useState } from 'react'
import DashboardShell from '../components/layout/DashboardShell.jsx'
import { Icon } from '../components/ui/icon.jsx'
import { Skeleton } from '../components/ui/skeleton.jsx'
import {
  getAuthErrorMessage,
  getDashboardNavigation,
  isSessionExpiredError,
  requestDashboardOverview,
  STAFF_ROLE_LABELS,
} from '../auth/staffAuth.js'

const moduleDescriptions = {
  'Staff & barangays': 'Create staff accounts, barangays, roles, and assignments.',
  'Authenticator recovery': 'Help a verified staff member restore authenticator access.',
  Reports: 'Generate distribution, claim, schedule, and fund summaries.',
  'Audit logs': 'Review recorded staff and system actions.',
  'Live monitoring': 'Watch active distributions, queues, claims, and exceptions.',
  Ledger: 'Review simulated fund utilization and transaction records.',
  'Queue & schedules': 'Manage today’s assigned beneficiary queue and time slots.',
  'QR verification': 'Validate single-use claim references at distribution sites.',
  Notifications: 'Monitor simulated SMS delivery and follow up on failed reminders.',
  'Biometric identity': 'Record consent, enroll a face profile, and verify claims.',
  'Claim settlement': 'Credit verified claims and reconcile the simulated aid ledger.',
  'Claim accountability': 'Issue claim receipts, file disputes, and record independent review decisions.',
}

const roleContent = {
  SYSTEM_ADMIN: {
    eyebrow: 'System administration',
    heading: 'Set up staff access and service areas.',
    description: 'Create barangays, assign staff, and resolve account-security concerns.',
    primary: ['Manage staff and barangays', '/admin/administration'],
  },
  DSWD_STAFF: {
    eyebrow: 'DSWD operations',
    heading: 'Monitor distributions and settle verified claims.',
    description: 'Review active operations, verification outcomes, fund records, and reports.',
    primary: ['Open live monitoring', '/dswd/live-dashboard'],
  },
  BARANGAY_FACILITATOR: {
    eyebrow: 'Barangay operations',
    heading: 'Run today’s beneficiary queue.',
    description: 'Check schedules, verify beneficiaries, and complete assigned distribution-site work.',
    primary: ['View beneficiary queue', '/facilitator/queue'],
  },
}

const numberFormatter = new Intl.NumberFormat('en-PH')

function formatCount(value) {
  return numberFormatter.format(Number(value ?? 0))
}

function dashboardMetrics(overview, role) {
  if (role === 'BARANGAY_FACILITATOR') {
    return [
      ['Scheduled queue', formatCount(overview.queue.scheduledCount), 'Assigned beneficiaries', 'blue'],
      ['Checked in', formatCount(overview.queue.checkedInCount), 'Currently in progress', 'success'],
      ['Unclaimed', formatCount(overview.beneficiaries.unclaimedAllocationCount), 'Needs follow-through', 'warning'],
      ['Claim completion', `${overview.beneficiaries.claimCompletionPercentage}%`, 'Verified claims', 'success'],
    ]
  }

  if (role === 'SYSTEM_ADMIN') {
    return [
      ['Open distributions', formatCount(overview.distributions.openDistributionCount), 'Active operations', 'blue'],
      ['Approved beneficiaries', formatCount(overview.beneficiaries.approvedBeneficiaryCount), 'Current data scope', 'blue'],
      ['Duplicate attempts', formatCount(overview.anomalies.duplicateAttemptCount), 'Requires oversight', overview.anomalies.duplicateAttemptCount ? 'danger' : 'neutral'],
      ['Claim completion', `${overview.beneficiaries.claimCompletionPercentage}%`, 'Verified claims', 'success'],
    ]
  }

  return [
    ['Active programs', formatCount(overview.programs.activeProgramCount), 'Available assistance', 'blue'],
    ['Approved beneficiaries', formatCount(overview.beneficiaries.approvedBeneficiaryCount), 'Current data scope', 'blue'],
    ['Upcoming distributions', formatCount(overview.distributions.upcomingDistributionCount), 'Draft or open events', 'warning'],
    ['Claim completion', `${overview.beneficiaries.claimCompletionPercentage}%`, 'Verified claims', 'success'],
  ]
}

const metricStyles = {
  blue: 'border-l-brand-blue text-brand-blue',
  success: 'border-l-brand-green text-brand-green',
  warning: 'border-l-brand-amber text-brand-amber',
  danger: 'border-l-brand-red text-brand-red',
  neutral: 'border-l-slate-400 text-ink',
}

function attentionFor(overview, role) {
  if (role === 'SYSTEM_ADMIN' && overview.anomalies.duplicateAttemptCount > 0) {
    return { tone: 'danger', label: 'Needs review', title: `${formatCount(overview.anomalies.duplicateAttemptCount)} duplicate claim attempt(s)`, description: 'Open reports or audit logs to review the recorded activity.', action: ['Review reports', '/reports'] }
  }
  if (role === 'DSWD_STAFF' && overview.distributions.upcomingDistributionCount > 0) {
    return { tone: 'warning', label: 'Upcoming work', title: `${formatCount(overview.distributions.upcomingDistributionCount)} distribution event(s) ahead`, description: 'Open live monitoring to review the current operational picture.', action: ['Open live monitoring', '/dswd/live-dashboard'] }
  }
  if (role === 'BARANGAY_FACILITATOR' && overview.queue.scheduledCount > 0) {
    return { tone: 'blue', label: 'Current queue', title: `${formatCount(overview.queue.scheduledCount)} beneficiary schedule(s)`, description: 'Review time slots before beginning QR claim verification.', action: ['Review queue', '/facilitator/queue'] }
  }
  return { tone: 'success', label: 'Current status', title: 'No urgent action detected', description: 'Continue with the tools assigned to your role.', action: null }
}

function DashboardSkeleton() {
  return (
    <div role="status" aria-label="Loading operations dashboard" aria-busy="true">
      <span className="sr-only">Loading operations dashboard…</span>
      <div className="space-y-3 border-b border-line pb-7"><Skeleton className="h-4 w-40" /><Skeleton className="h-10 w-[min(34rem,85vw)]" /><Skeleton className="h-5 w-[min(42rem,90vw)]" /></div>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-36 rounded-xl" />)}
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-[1.45fr_0.85fr]"><Skeleton className="h-80 rounded-xl" /><Skeleton className="h-80 rounded-xl" /></div>
    </div>
  )
}

function DashboardPage({ session, onLogout, onNavigate, onSessionExpired }) {
  const [overview, setOverview] = useState(null)
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [reloadCount, setReloadCount] = useState(0)
  const role = session.user.role
  const content = roleContent[role] ?? roleContent.DSWD_STAFF
  const modules = getDashboardNavigation(role).filter((item) => item.href !== '/dashboard')

  useEffect(() => {
    let active = true
    requestDashboardOverview(session.accessToken)
      .then((data) => { if (active) setOverview(data) })
      .catch((requestError) => {
        if (!active) return
        if (isSessionExpiredError(requestError)) return onSessionExpired()
        setError(getAuthErrorMessage(requestError))
      })
      .finally(() => { if (active) setIsLoading(false) })
    return () => { active = false }
  }, [onSessionExpired, reloadCount, session.accessToken])

  const isEmpty = overview
    && overview.programs.activeProgramCount === 0
    && overview.distributions.totalMatchingDistributionCount === 0
    && overview.beneficiaries.approvedBeneficiaryCount === 0
  const attention = overview ? attentionFor(overview, role) : null

  return (
    <DashboardShell breadcrumbs={['Operations', 'Overview']} currentPath="/dashboard" onLogout={onLogout} onNavigate={onNavigate} pageTitle="Overview" user={session.user}>
      {isLoading ? <DashboardSkeleton /> : error ? (
        <section className="ga-card border-amber-200 p-6" role="alert" aria-labelledby="dashboard-error-title">
          <p className="ga-eyebrow text-brand-amber">Dashboard unavailable</p>
          <h1 id="dashboard-error-title" className="mt-2 text-2xl font-bold text-ink">We could not load operations data</h1>
          <p className="mt-3 max-w-2xl text-base leading-7 text-muted-copy">{error}</p>
          <button type="button" onClick={() => { setError(''); setIsLoading(true); setReloadCount((count) => count + 1) }} className="ga-btn-primary mt-5">Try again</button>
        </section>
      ) : (
        <div className="ga-dashboard-ready">
          <header className="flex flex-col gap-5 border-b border-line pb-7 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="ga-eyebrow">{content.eyebrow}</p>
              <h1 className="ga-page-title max-w-3xl">{content.heading}</h1>
              <p className="ga-page-copy">{content.description}</p>
            </div>
            <a href={content.primary[1]} onClick={(event) => { event.preventDefault(); onNavigate(content.primary[1]) }} className="ga-btn-primary shrink-0">{content.primary[0]}</a>
          </header>

          {attention && <div className="mt-6"><AttentionCard attention={attention} onNavigate={onNavigate} /></div>}

          <section className="mt-6" aria-labelledby="status-heading">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="ga-eyebrow">At a glance</p>
                <h2 id="status-heading" className="mt-1 text-xl font-bold text-ink">Current operations</h2>
              </div>
              <p className="text-sm text-muted-copy">Updated {overview.generatedAt}</p>
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {dashboardMetrics(overview, role).map(([label, value, detail, tone]) => (
                <article key={label} className={`ga-card ga-metric-card border-l-4 p-5 ${metricStyles[tone]}`}>
                  <p className="text-sm font-semibold text-muted-copy">{label}</p>
                  <p className="mt-3 text-3xl font-bold tracking-tight tabular-nums text-ink">{value}</p>
                  <p className="mt-2 text-sm text-muted-copy">{detail}</p>
                </article>
              ))}
            </div>
          </section>

          <div className="mt-6 grid gap-6 xl:grid-cols-[1.45fr_0.85fr]">
            <section className="ga-card p-5 sm:p-6" aria-labelledby="tools-heading">
              <p className="ga-eyebrow">Your workspace</p>
              <h2 id="tools-heading" className="mt-1 text-xl font-bold text-ink">Continue your work</h2>
              <p className="mt-2 text-base leading-7 text-muted-copy">These are the working modules available for your signed-in role.</p>
              <div className="mt-5 divide-y divide-line border-y border-line">
                {modules.map((item) => (
                  <a key={item.href} href={item.href} onClick={(event) => { event.preventDefault(); onNavigate(item.href) }} className="group -mx-3 flex min-h-24 items-center justify-between gap-5 rounded-lg px-3 py-4 transition-colors hover:bg-info-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue">
                    <span className="min-w-0">
                      <span className="block font-bold text-ink group-hover:text-brand-blue">{item.label}</span>
                      <span className="mt-1 block text-sm leading-6 text-muted-copy">{moduleDescriptions[item.label]}</span>
                    </span>
                    <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-full bg-info-soft text-brand-blue transition-[background-color,color] duration-200 group-hover:bg-brand-blue group-hover:text-white"><Icon name="arrowRight" className="size-4" strokeWidth={2.2} /></span>
                  </a>
                ))}
              </div>
              {isEmpty && <p className="mt-5 rounded-lg border border-dashed border-line bg-slate-50 p-4 text-sm leading-6 text-muted-copy">No operational records are available yet. This overview will populate after authorized program and distribution records are created.</p>}
            </section>

            <div className="space-y-6">
              <section className="ga-card p-5" aria-labelledby="scope-heading">
                <h2 id="scope-heading" className="text-lg font-bold text-ink">Access and data scope</h2>
                <dl className="mt-4 divide-y divide-line text-sm">
                  <DataRow label="Staff ID" value={session.user.employeeId} />
                  <DataRow label="Role" value={STAFF_ROLE_LABELS[role]} />
                  <DataRow label="Authenticator" value={session.user.totpEnabled ? 'Verified' : 'Setup required'} success={session.user.totpEnabled} />
                  <DataRow label="Data scope" value={overview.scope.global ? 'Authorized global view' : session.user.barangay?.barangayName ?? 'Assigned barangay'} />
                </dl>
              </section>
            </div>
          </div>
        </div>
      )}
    </DashboardShell>
  )
}

function AttentionCard({ attention, onNavigate }) {
  const styles = attention.tone === 'danger' ? 'border-red-200 bg-danger-soft' : attention.tone === 'warning' ? 'border-amber-200 bg-warning-soft' : attention.tone === 'success' ? 'border-emerald-200 bg-success-soft' : 'border-blue-200 bg-info-soft'
  const labelColor = attention.tone === 'danger' ? 'text-brand-red' : attention.tone === 'warning' ? 'text-brand-amber' : attention.tone === 'success' ? 'text-brand-green' : 'text-brand-blue'
  return (
    <section className={`rounded-xl border p-5 ${styles}`} aria-labelledby="attention-heading">
      <p className={`text-xs font-bold uppercase tracking-[0.12em] ${labelColor}`}>{attention.label}</p>
      <h2 id="attention-heading" className="mt-2 text-lg font-bold text-ink">{attention.title}</h2>
      <p className="mt-2 text-sm leading-6 text-copy">{attention.description}</p>
      {attention.action && <a href={attention.action[1]} onClick={(event) => { event.preventDefault(); onNavigate(attention.action[1]) }} className="mt-4 inline-flex min-h-11 items-center gap-2 font-bold text-brand-blue hover:text-brand-blue-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue">{attention.action[0]} <Icon name="arrowRight" className="size-4" strokeWidth={2.2} /></a>}
    </section>
  )
}

function DataRow({ label, value, success = false }) {
  return <div className="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0"><dt className="text-muted-copy">{label}</dt><dd className={`max-w-52 text-right font-bold ${success ? 'text-brand-green' : 'text-ink'}`}>{value}</dd></div>
}

export default DashboardPage
