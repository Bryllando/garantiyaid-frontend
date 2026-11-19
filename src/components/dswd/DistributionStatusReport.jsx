import { useEffect, useState } from 'react'
import { getAuthErrorMessage, isSessionExpiredError, requestDashboardOverview } from '../../auth/staffAuth.js'
import { formatReportDate, formatReportNumber } from '../../utils/reportPresentation.js'
import { SkeletonRows } from '../ui/skeleton.jsx'

const eventStatuses = [
  ['DRAFT', 'Draft', 'bg-brand-amber'],
  ['OPEN', 'Open', 'bg-brand-blue'],
  ['CLOSED', 'Closed', 'bg-brand-green'],
  ['CANCELLED', 'Cancelled', 'bg-slate-500'],
]

export default function DistributionStatusReport({ token, onSessionExpired }) {
  const [result, setResult] = useState(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let active = true
    requestDashboardOverview(token).then(({ distributions, generatedAt }) => {
      if (!active) return
      if (!Number.isInteger(distributions?.totalMatchingDistributionCount) || !distributions.statusCounts) {
        throw new Error('Event totals are unavailable.')
      }
      setResult({ total: distributions.totalMatchingDistributionCount, counts: distributions.statusCounts, generatedAt })
    }).catch(error => {
      if (!active) return
      if (isSessionExpiredError(error)) onSessionExpired()
      else setResult({ error: getAuthErrorMessage(error) })
    })
    return () => { active = false }
  }, [token, attempt, onSessionExpired])

  return (
    <section aria-labelledby="distribution-status-title" className="ga-card mt-5 grid overflow-hidden md:grid-cols-[minmax(17rem,1fr)_minmax(0,1.8fr)]">
      <header className="flex flex-col items-start bg-brand-navy p-5 text-white sm:p-6">
        <h2 id="distribution-status-title" className="text-xl font-semibold">Distribution status report</h2>
        <p className="mt-1 text-sm text-blue-100">All authorized events · All dates</p>
        {result?.counts && <>
          <p className="my-4 flex flex-wrap items-baseline gap-2">
            <strong className="text-4xl font-semibold tabular-nums">{formatReportNumber(result.total)}</strong>{' '}
            <span className="text-sm">{result.total === 1 ? 'distribution event' : 'distribution events'}</span>
          </p>
          {result.generatedAt && <p className="mt-auto text-xs text-blue-100">As of <time dateTime={result.generatedAt}>{formatReportDate(result.generatedAt)}</time></p>}
        </>}
      </header>
      <div className="min-w-0 bg-white p-5 sm:p-6">
        {!result ? <SkeletonRows label="Loading event totals" rows={2} />
          : result.error ? <div role="alert" className="text-sm">
            <p className="font-semibold text-ink">Distribution status could not be loaded</p>
            <p className="mt-1 text-copy">{result.error}</p>
            <button type="button" className="ga-btn-secondary mt-3" onClick={() => { setResult(null); setAttempt(value => value + 1) }}>Retry event totals</button>
          </div>
          : result.total === 0 ? <p className="text-sm text-copy">No distribution events have been recorded in your authorized scope.</p>
          : <>
            <h3 className="font-semibold text-brand-navy">Events by current status</h3>
            <dl className="mt-3 grid grid-cols-[5rem_minmax(0,1fr)_auto] gap-x-3 gap-y-2 text-sm">
              {eventStatuses.map(([status, label, color]) => {
                const count = result.counts[status] ?? 0
                return <div key={status} className="col-span-full grid grid-cols-subgrid items-center">
                  <dt className="text-copy">{label}</dt>
                  <dd className="col-span-2 grid grid-cols-subgrid items-center">
                    <span aria-hidden="true" className="h-2 overflow-hidden rounded-sm bg-slate-100"><span className={`block h-full ${color}`} style={{ width: `${100 * count / result.total}%` }} /></span>
                    <span className="text-right font-semibold tabular-nums text-ink">{formatReportNumber(count)}</span>
                  </dd>
                </div>
              })}
            </dl>
          </>}
      </div>
    </section>
  )
}
