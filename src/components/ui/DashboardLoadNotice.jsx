import { Icon } from './icon.jsx'

export default function DashboardLoadNotice({ error, rateLimited, retrySeconds, onRetry, busy, compact = false, assignmentRequired = false, staffId }) {
  const countdown = `${Math.floor(retrySeconds / 60)}:${String(retrySeconds % 60).padStart(2, '0')}`
  const Heading = compact ? 'h2' : 'h1'
  return <section role={rateLimited ? 'status' : 'alert'} aria-labelledby="dashboard-error-title" className={compact
    ? 'mb-5 flex flex-wrap items-start gap-4 rounded-lg border border-amber-200 bg-warning-soft p-4'
    : 'ga-card w-full max-w-2xl border-line p-6 sm:p-8'}>
    <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-lg bg-warning-soft text-brand-amber"><Icon name="info" className="size-5" /></span>
    <div className="min-w-0 flex-1">
      <Heading id="dashboard-error-title" className={compact ? 'text-base font-semibold text-ink' : 'mt-4 text-xl font-semibold leading-7 text-ink sm:text-2xl'}>{assignmentRequired ? 'Barangay assignment needed' : rateLimited ? 'Dashboard updates paused' : compact ? 'Showing the previous update' : 'Dashboard could not be loaded'}</Heading>
      <p className="mt-2 text-sm leading-6 text-copy">{assignmentRequired
        ? 'Your staff account has no assigned barangay. A System Administrator must set your assignment before you can view beneficiary and distribution records.'
        : rateLimited
        ? `${compact ? 'Your last successful figures are still shown. ' : ''}The request limit was reached. We’ll check again when the wait ends.`
        : compact ? 'Latest figures could not be loaded. Showing the last available update.' : 'Check your connection and that the GarantiyAid server is running, then try again.'}</p>
      {assignmentRequired && <div className="mt-4 rounded-lg border border-line bg-slate-50 p-4 text-sm leading-6 text-copy">
        {staffId && <p className="font-semibold text-ink">Staff ID: {staffId}</p>}
        <p className={staffId ? 'mt-2' : ''}>Ask your System Administrator to edit your staff account, choose an active barangay under <strong>Assigned barangay</strong>, and save.</p>
        <p className="mt-2">After your administrator saves the assignment, return here and select Check assignment again.</p>
      </div>}
      {!assignmentRequired && !rateLimited && error && <p className="mt-2 text-sm leading-6 text-muted-copy">{error}</p>}
      {rateLimited && retrySeconds > 0 && <p role="timer" aria-live="off" className="mt-3 text-sm font-semibold tabular-nums text-ink">Next check in {countdown}</p>}
      <button type="button" onClick={onRetry} disabled={busy || retrySeconds > 0} className={`${compact ? 'ga-btn-secondary' : 'ga-btn-primary'} mt-4`}><Icon name="reset" className="size-4" /><span aria-live="off">{busy ? assignmentRequired ? 'Checking assignment…' : 'Checking dashboard…' : retrySeconds > 0 ? `Retry in ${countdown}` : assignmentRequired ? 'Check assignment again' : 'Try again'}</span></button>
    </div>
  </section>
}
