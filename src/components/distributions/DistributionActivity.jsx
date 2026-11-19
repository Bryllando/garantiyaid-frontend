import { useId } from 'react'
import { Icon } from '../ui/icon.jsx'

export default function DistributionActivity({ entries, claimLink }) {
  const heading = useId()
  return <section className="ga-admin-register min-w-0" aria-labelledby={heading}>
    <header><h2 id={heading}><Icon name="clock" />Recent activity</h2><p className="mt-1 text-sm font-normal text-copy">Updates received while this page is open.</p></header>
    {entries.length ? <ol className="divide-y divide-line">
      {entries.map((entry, index) => <li key={entry.id} className={`flex flex-wrap items-center justify-between gap-x-4 px-4 py-3 [overflow-anchor:none] ${index === 0 ? 'bg-info-soft' : ''}`}>
        <div className="min-w-0">
          <p className="font-semibold leading-snug text-ink">{entry.label}</p>
          <p className="mt-1 text-sm tabular-nums text-copy">{entry.reference && `${entry.reference} · `}<time dateTime={new Date(entry.occurredAt).toISOString()}>{entry.clock}</time></p>
        </div>
        {entry.claimId && claimLink(entry.claimId)}
      </li>)}
    </ol> : <p className="px-4 py-3 text-base text-copy">New updates for this event will appear here.</p>}
  </section>
}
