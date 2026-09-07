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
  'Staff & barangays': 'Manage staff access, roles, barangays, and service assignments.',
  'Authenticator recovery': 'Help a verified staff member restore authenticator access.',
  'Distribution setup': 'Prepare allocation schedules and controlled distribution events.',
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
  'Claim settlement': 'Credit verified claims and reconcile the simulated aid ledger.',
  'Claim accountability': 'Issue claim receipts, file disputes, and record independent review decisions.',
}

const roleContent = {
  SYSTEM_ADMIN: {
    eyebrow: 'System administration',
    heading: 'Protect access and oversee aid operations.',
    description: 'Review distribution activity, staff controls, recorded anomalies, and oversight paths from one accountable workspace.',
    primary: { label: 'Manage staff and barangays', href: '/admin/administration', icon: 'administration' },
  },
  DSWD_STAFF: {
    eyebrow: 'DSWD operations',
    heading: 'Move verified assistance from review to delivery.',
    description: 'Monitor active operations, resolve enrollment work, and keep simulated fund and claim records ready for oversight.',
    primary: { label: 'Open live monitoring', href: '/dswd/live-dashboard', icon: 'monitoring' },
  },
  BARANGAY_FACILITATOR: {
    eyebrow: 'Barangay operations',
    heading: 'Keep today\'s beneficiary service moving.',
    description: 'Follow assigned schedules, verify beneficiaries, and complete distribution-site work within your barangay scope.',
    primary: { label: 'View beneficiary queue', href: '/facilitator/queue', icon: 'queue' },
  },
}

const featuredModuleHrefs = {
  SYSTEM_ADMIN: ['/admin/administration', '/distributions/manage', '/reports', '/audit-logs'],
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
      { label: 'Scheduled queue', value: formatCount(overview.queue.scheduledCount), detail: 'Assigned beneficiaries', tone: 'blue', icon: 'queue' },
      { label: 'Checked in', value: formatCount(overview.queue.checkedInCount), detail: 'Currently in progress', tone: 'success', icon: 'check' },
      { label: 'Unclaimed', value: formatCount(overview.beneficiaries.unclaimedAllocationCount), detail: 'Needs follow-through', tone: 'warning', icon: 'receipt' },
      { label: 'Claim completion', value: `${overview.beneficiaries.claimCompletionPercentage}%`, detail: 'Verified assistance claims', tone: 'success', icon: 'enrollments' },
    ]
  }

  if (role === 'SYSTEM_ADMIN') {
    return [
      { label: 'Open distributions', value: formatCount(overview.distributions.openDistributionCount), detail: 'Active operations', tone: 'blue', icon: 'distributions' },
      { label: 'Approved beneficiaries', value: formatCount(overview.beneficiaries.approvedBeneficiaryCount), detail: 'Current data scope', tone: 'blue', icon: 'beneficiaries' },
      { label: 'Duplicate attempts', value: formatCount(overview.anomalies.duplicateAttemptCount), detail: 'Recorded for oversight', tone: overview.anomalies.duplicateAttemptCount ? 'danger' : 'neutral', icon: 'audit' },
      { label: 'Claim completion', value: `${overview.beneficiaries.claimCompletionPercentage}%`, detail: 'Verified assistance claims', tone: 'success', icon: 'enrollments' },
    ]
  }

  return [
    { label: 'Active programs', value: formatCount(overview.programs.activeProgramCount), detail: 'Available assistance', tone: 'blue', icon: 'programs' },
    { label: 'Approved beneficiaries', value: formatCount(overview.beneficiaries.approvedBeneficiaryCount), detail: 'Current data scope', tone: 'blue', icon: 'beneficiaries' },
    { label: 'Upcoming distributions', value: formatCount(overview.distributions.upcomingDistributionCount), detail: 'Draft or open events', tone: 'warning', icon: 'calendar' },
    { label: 'Claim completion', value: `${overview.beneficiaries.claimCompletionPercentage}%`, detail: 'Verified assistance claims', tone: 'success', icon: 'enrollments' },
  ]
}

const metricStyles = {
  blue: { icon: 'border-blue-100 bg-info-soft text-brand-blue', value: 'text-brand-blue' },
  success: { icon: 'border-emerald-100 bg-success-soft text-brand-green', value: 'text-brand-green' },
  warning: { icon: 'border-amber-100 bg-warning-soft text-brand-amber', value: 'text-brand-amber' },
  danger: { icon: 'border-red-100 bg-danger-soft text-brand-red', value: 'text-brand-red' },
  neutral: { icon: 'border-slate-200 bg-slate-100 text-copy', value: 'text-ink' },
}

function attentionFor(overview, role) {
  if (role === 'SYSTEM_ADMIN' && overview.anomalies.duplicateAttemptCount > 0) {
    return { tone: 'danger', icon: 'audit', label: 'Needs review', title: `${formatCount(overview.anomalies.duplicateAttemptCount)} duplicate claim attempt(s)`, description: 'Review the recorded activity and confirm whether follow-up is required.', action: ['Review reports', '/reports'] }
  }
  if (role === 'DSWD_STAFF' && overview.distributions.upcomingDistributionCount > 0) {
    return { tone: 'warning', icon: 'calendar', label: 'Upcoming work', title: `${formatCount(overview.distributions.upcomingDistributionCount)} distribution event(s) ahead`, description: 'Review the operational picture before the next distribution activity begins.', action: ['Open live monitoring', '/dswd/live-dashboard'] }
  }
  if (role === 'BARANGAY_FACILITATOR' && overview.queue.scheduledCount > 0) {
    return { tone: 'blue', icon: 'queue', label: 'Current queue', title: `${formatCount(overview.queue.scheduledCount)} beneficiary schedule(s)`, description: 'Review assigned time slots before beginning claim verification.', action: ['Review queue', '/facilitator/queue'] }
  }
  return { tone: 'success', icon: 'check', label: 'Current status', title: 'No immediate issue detected', description: 'Continue with the authorized tools and monitor new operational updates.', action: null }
}

function DashboardSkeleton() {
  return (
    <div className="mx-auto w-full max-w-7xl" role="status" aria-label="Loading operations dashboard" aria-busy="true">
      <span className="sr-only">Loading operations dashboard...</span>
      <Skeleton className="h-72 rounded-2xl" />
      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-36 rounded-xl" />)}
      </div>
      <div className="mt-6 grid gap-5 md:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.72fr)]">
        <Skeleton className="h-96 rounded-xl" />
        <Skeleton className="h-96 rounded-xl" />
        <Skeleton className="h-44 rounded-xl md:col-span-2" />
      </div>
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
  const moduleByHref = new Map(modules.map((item) => [item.href, item]))
  const featuredModules = (featuredModuleHrefs[role] ?? []).map((href) => moduleByHref.get(href)).filter(Boolean)

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
  const scopeLabel = overview?.scope.global
    ? 'National and system-wide scope'
    : session.user.barangay?.barangayName ?? 'Assigned barangay scope'

  return (
    <DashboardShell breadcrumbs={['Operations', 'Overview']} currentPath="/dashboard" onLogout={onLogout} onNavigate={onNavigate} pageTitle="Overview" user={session.user}>
      {isLoading ? <DashboardSkeleton /> : error ? (
        <section className="ga-card mx-auto max-w-2xl border-amber-200 p-6 sm:p-8" role="alert" aria-labelledby="dashboard-error-title">
          <span aria-hidden="true" className="grid size-12 place-items-center rounded-xl bg-warning-soft text-brand-amber"><Icon name="info" className="size-6" /></span>
          <p className="ga-eyebrow mt-5 text-brand-amber">Dashboard unavailable</p>
          <h1 id="dashboard-error-title" className="mt-2 text-2xl font-bold text-ink">We could not load operations data</h1>
          <p className="mt-3 max-w-2xl text-base leading-7 text-muted-copy">{error}</p>
          <button type="button" onClick={() => { setError(''); setIsLoading(true); setReloadCount((count) => count + 1) }} className="ga-btn-primary mt-5"><Icon name="reset" />Try again</button>
        </section>
      ) : (
        <div className="ga-dashboard-ready mx-auto w-full max-w-7xl">
          <section className="ga-card overflow-hidden rounded-2xl" aria-labelledby="overview-title">
            <div className="grid xl:grid-cols-[minmax(0,1.55fr)_minmax(19rem,0.7fr)]">
              <div className="relative isolate overflow-hidden bg-brand-navy p-6 text-white sm:p-8">
                <span aria-hidden="true" className="absolute -right-20 -top-28 size-72 rounded-full border border-white/10" />
                <span aria-hidden="true" className="absolute -bottom-32 right-12 size-64 rounded-full bg-brand-blue/25" />
                <div className="relative z-10">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-lg border border-white/10 bg-white/10 text-blue-100"><Icon name={content.primary.icon} className="size-5" /></span>
                      <p className="text-xs font-bold uppercase tracking-[0.14em] text-blue-200">{content.eyebrow}</p>
                    </div>
                    <span className="inline-flex min-h-9 max-w-full items-center gap-2 rounded-full border border-white/15 bg-white/[0.07] px-3 text-xs font-semibold text-blue-100"><Icon name="location" className="size-4 shrink-0" />{scopeLabel}</span>
                  </div>

                  <h1 id="overview-title" className="mt-6 max-w-3xl text-3xl font-extrabold tracking-tight text-white sm:text-[2.25rem] sm:leading-tight">{content.heading}</h1>
                  <p className="mt-3 max-w-3xl text-base leading-7 text-blue-100">{content.description}</p>

                  <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center">
                    <a href={content.primary.href} onClick={(event) => { event.preventDefault(); onNavigate(content.primary.href) }} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-white px-5 text-base font-bold text-brand-navy shadow-sm transition-[background-color,box-shadow] duration-200 hover:bg-blue-50 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
                      {content.primary.label}<Icon name="arrowRight" className="size-4" strokeWidth={2.2} />
                    </a>
                    <p className="flex items-center gap-2 text-xs font-semibold text-blue-200"><Icon name="clock" className="size-4" />Updated {overview.generatedAt}</p>
                  </div>
                </div>
              </div>

              <AttentionCard attention={attention} onNavigate={onNavigate} />
            </div>
          </section>

          <section className="mt-6" aria-labelledby="status-heading">
            <div className="flex flex-wrap items-end justify-between gap-3 px-1">
              <div>
                <p className="ga-eyebrow">Operations summary</p>
                <h2 id="status-heading" className="mt-1 text-2xl font-bold tracking-tight text-ink">What needs your attention</h2>
              </div>
              <p className="max-w-md text-sm leading-6 text-muted-copy">Live totals are limited to your authorized data scope.</p>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {dashboardMetrics(overview, role).map((metric) => <MetricCard key={metric.label} metric={metric} />)}
            </div>
          </section>

          <div className="mt-6 grid gap-5 md:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.72fr)]">
            <section className="ga-card p-5 sm:p-6" aria-labelledby="tools-heading">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex min-w-0 items-start gap-3">
                  <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-lg border border-blue-100 bg-info-soft text-brand-blue"><Icon name="overview" /></span>
                  <div>
                    <p className="ga-eyebrow">Priority workspaces</p>
                    <h2 id="tools-heading" className="mt-1 text-xl font-bold text-ink">Continue your work</h2>
                    <p className="mt-1 text-sm leading-6 text-muted-copy">The tools most relevant to your role and current operations.</p>
                  </div>
                </div>
                <span className="inline-flex min-h-8 items-center rounded-full border border-line bg-slate-50 px-3 text-xs font-bold text-copy">{featuredModules.length} workspaces</span>
              </div>

              <div className="mt-5 grid gap-3 xl:grid-cols-2">
                {featuredModules.map((item) => (
                  <a key={item.href} href={item.href} onClick={(event) => { event.preventDefault(); onNavigate(item.href) }} className="group flex min-h-28 items-start gap-4 rounded-xl border border-line bg-slate-50/70 p-4 transition-[border-color,background-color,box-shadow] duration-200 hover:border-blue-200 hover:bg-info-soft hover:shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue">
                    <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-lg border border-blue-100 bg-white text-brand-blue shadow-sm transition-colors group-hover:bg-brand-blue group-hover:text-white"><Icon name={item.icon} /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-extrabold text-ink transition-colors group-hover:text-brand-blue">{item.label}</span>
                      <span className="mt-1 block text-sm leading-6 text-muted-copy">{moduleDescriptions[item.label] ?? 'Open this authorized workspace.'}</span>
                    </span>
                    <Icon name="arrowRight" className="mt-1 size-4 shrink-0 text-slate-400 transition-colors group-hover:text-brand-blue" strokeWidth={2.2} />
                  </a>
                ))}
              </div>

              {isEmpty && <div className="mt-5 flex items-start gap-3 rounded-xl border border-dashed border-line bg-slate-50 p-4 text-sm leading-6 text-muted-copy"><Icon name="info" className="mt-0.5 size-5 shrink-0 text-brand-blue" /><p><strong className="text-ink">No operational records yet.</strong> This overview will populate after authorized program and distribution records are created.</p></div>}
            </section>

            <aside className="h-full" aria-label="Account status">
              <section className="ga-card h-full overflow-hidden" aria-labelledby="scope-heading">
                <div className="border-b border-line bg-slate-50 px-4 py-3.5">
                  <div className="flex items-start gap-3">
                    <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-lg border border-blue-100 bg-white text-brand-blue shadow-sm"><Icon name="security" className="size-4" /></span>
                    <div>
                      <p className="ga-eyebrow">Authorized access</p>
                      <h2 id="scope-heading" className="mt-1 text-lg font-bold text-ink">Account and data scope</h2>
                    </div>
                  </div>
                </div>
                <div className="p-4">
                  <dl className="divide-y divide-line text-sm">
                    <DataRow label="Staff ID" value={session.user.employeeId} />
                    <DataRow label="Role" value={STAFF_ROLE_LABELS[role]} />
                    <DataRow label="Authenticator" value={session.user.totpEnabled ? 'Verified' : 'Setup required'} success={session.user.totpEnabled} />
                    <DataRow label="Data scope" value={scopeLabel} />
                    <DataRow label="Financial records" value={overview.financialVisibility ? 'Authorized' : 'Restricted by role'} />
                  </dl>
                  <a href="/account" onClick={(event) => { event.preventDefault(); onNavigate('/account') }} className="mt-4 inline-flex min-h-11 w-full items-center justify-between gap-3 rounded-lg border border-line bg-white px-4 text-sm font-bold text-brand-blue transition-colors hover:border-blue-200 hover:bg-info-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue">Review account security<Icon name="arrowRight" className="size-4" /></a>
                </div>
              </section>

            </aside>

            <section className="ga-card p-5 sm:p-6 md:col-span-2" aria-labelledby="progress-heading">
              <div className="flex items-start gap-3">
                <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-lg border border-emerald-100 bg-success-soft text-brand-green"><Icon name="monitoring" /></span>
                <div>
                  <p className="text-sm font-semibold text-brand-green">Service progress</p>
                  <h2 id="progress-heading" className="mt-1 text-lg font-bold text-ink">Operational readiness</h2>
                </div>
              </div>
              <div className="mt-5 space-y-5">
                <ProgressRow label="Claim completion" value={overview.beneficiaries.claimCompletionPercentage} tone="success" />
                <ProgressRow label="Queue capacity used" value={overview.queue.capacityUtilizationPercentage} tone="blue" />
                <ProgressRow label="Beneficiaries checked in" value={overview.queue.checkInPercentage} tone="warning" />
              </div>
            </section>
          </div>
        </div>
      )}
    </DashboardShell>
  )
}

function MetricCard({ metric }) {
  const styles = metricStyles[metric.tone] ?? metricStyles.neutral
  return (
    <article className="ga-metric-card ga-card min-h-36 p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-bold leading-6 text-copy">{metric.label}</p>
        <span aria-hidden="true" className={`grid size-10 shrink-0 place-items-center rounded-lg border ${styles.icon}`}><Icon name={metric.icon} /></span>
      </div>
      <p className={`mt-3 text-3xl font-extrabold tracking-tight tabular-nums ${styles.value}`}>{metric.value}</p>
      <p className="mt-1 text-sm leading-6 text-muted-copy">{metric.detail}</p>
    </article>
  )
}

function AttentionCard({ attention, onNavigate }) {
  const styles = {
    danger: { surface: 'bg-danger-soft', icon: 'border-red-100 text-brand-red', label: 'text-brand-red' },
    warning: { surface: 'bg-warning-soft', icon: 'border-amber-100 text-brand-amber', label: 'text-brand-amber' },
    success: { surface: 'bg-success-soft', icon: 'border-emerald-100 text-brand-green', label: 'text-brand-green' },
    blue: { surface: 'bg-info-soft', icon: 'border-blue-100 text-brand-blue', label: 'text-brand-blue' },
  }[attention.tone]

  return (
    <aside className={`flex h-full min-h-60 flex-col border-t border-line p-6 sm:p-7 xl:border-l xl:border-t-0 ${styles.surface}`} aria-labelledby="attention-heading">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className={`text-xs font-bold uppercase tracking-[0.12em] ${styles.label}`}>{attention.label}</p>
          <h2 id="attention-heading" className="mt-2 text-xl font-extrabold leading-7 text-ink">{attention.title}</h2>
        </div>
        <span aria-hidden="true" className={`grid size-11 shrink-0 place-items-center rounded-xl border bg-white shadow-sm ${styles.icon}`}><Icon name={attention.icon} /></span>
      </div>
      <p className="mt-4 text-sm leading-6 text-copy">{attention.description}</p>
      <div className="mt-auto pt-6">
        {attention.action
          ? <a href={attention.action[1]} onClick={(event) => { event.preventDefault(); onNavigate(attention.action[1]) }} className="inline-flex min-h-11 items-center gap-2 rounded-lg font-bold text-brand-blue hover:text-brand-blue-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue">{attention.action[0]}<Icon name="arrowRight" className="size-4" strokeWidth={2.2} /></a>
          : <p className="inline-flex items-center gap-2 text-sm font-bold text-brand-green"><Icon name="check" className="size-4" />Ready for normal operations</p>}
      </div>
    </aside>
  )
}

function ProgressRow({ label, value, tone }) {
  const percentage = clampPercentage(value)
  const barColor = tone === 'success' ? 'bg-brand-green' : tone === 'warning' ? 'bg-brand-amber' : 'bg-brand-blue'
  return (
    <div>
      <div className="flex items-center justify-between gap-4 text-sm">
        <span className="font-semibold text-copy">{label}</span>
        <span className="font-extrabold tabular-nums text-ink">{percentage}%</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
        <div role="progressbar" aria-label={label} aria-valuemin="0" aria-valuemax="100" aria-valuenow={percentage} className={`h-full rounded-full ${barColor}`} style={{ width: `${percentage}%` }} />
      </div>
    </div>
  )
}

function DataRow({ label, value, success = false }) {
  return <div className="grid grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] gap-3 py-2.5 first:pt-0 last:pb-0"><dt className="text-muted-copy">{label}</dt><dd className={`min-w-0 break-words text-right font-bold ${success ? 'text-brand-green' : 'text-ink'}`}>{value}</dd></div>
}

export default DashboardPage
