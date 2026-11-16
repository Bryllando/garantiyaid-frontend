import { Icon } from './icon.jsx'

export default function DashboardLoadNotice({ error, rateLimited, retrySeconds, onRetry, busy, compact = false }) {
  const countdown = `${Math.floor(retrySeconds / 60)}:${String(retrySeconds % 60).padStart(2, '0')}`
  const Heading = compact ? 'h2' : 'h1'
  return <section role={rateLimited ? 'status' : 'alert'} aria-labelledby="dashboard-error-title" className={compact
    ? 'mb-5 flex flex-wrap items-start gap-4 rounded-lg border border-amber-200 bg-warning-soft p-4'
    : 'ga-card mx-auto max-w-2xl border-line p-6 sm:p-8'}>
    <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-lg bg-warning-soft text-brand-amber"><Icon name="info" className="size-5" /></span>
    <div className="min-w-0 flex-1">
      <Heading id="dashboard-error-title" className={compact ? 'text-base font-semibold text-ink' : 'mt-4 text-xl font-semibold leading-7 text-ink sm:text-2xl'}>{rateLimited ? 'Dashboard updates paused' : compact ? 'Showing the previous update' : 'Dashboard could not be loaded'}</Heading>
      <p className="mt-2 text-sm leading-6 text-copy">{rateLimited
        ? `${compact ? 'Your last successful figures are still shown. ' : ''}The request limit was reached. We’ll check again when the wait ends.`
        : compact ? 'Latest figures could not be loaded. Showing the last available update.' : 'Check your connection and that the GarantiyAid server is running, then try again.'}</p>
      {!rateLimited && error && <p className="mt-2 text-sm leading-6 text-muted-copy">{error}</p>}
      {rateLimited && retrySeconds > 0 && <p role="timer" aria-live="off" className="mt-3 text-sm font-semibold tabular-nums text-ink">Next check in {countdown}</p>}
      <button type="button" onClick={onRetry} disabled={busy || retrySeconds > 0} className={`${compact ? 'ga-btn-secondary' : 'ga-btn-primary'} mt-4`}><Icon name="reset" className="size-4" /><span aria-live="off">{busy ? 'Checking dashboard…' : retrySeconds > 0 ? `Retry in ${countdown}` : 'Try again'}</span></button>
    </div>
  </section>
}
