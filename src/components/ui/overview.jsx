import { Icon } from './icon.jsx'

const dateTime = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Manila' })

export function OverviewUpdate({ generatedAt, liveStatus, children }) {
  const parsed = generatedAt ? new Date(generatedAt) : null
  const updatedAt = parsed && !Number.isNaN(parsed.getTime()) ? dateTime.format(parsed) : null
  return <div className="ga-overview-update" role="status">
    <span><Icon name="clock" className="size-3.5 shrink-0" />{updatedAt ? <span>Last updated <time dateTime={generatedAt}>{updatedAt} PHT</time></span> : <span>Last update time unavailable.</span>}{children}</span>
    <span className="ga-overview-connection" data-connected={liveStatus === 'connected'}>{liveStatus === 'connected' ? 'Automatic updates connected.' : liveStatus === 'connecting' ? 'Connecting to automatic updates…' : 'Automatic updates are unavailable. Refresh to get the latest records.'}</span>
  </div>
}

export function OverviewEmptyState({ icon, title, children }) {
  return <div className="ga-overview-empty">
    <div className="ga-overview-empty-art" aria-hidden="true">
      <svg width="80" height="64" viewBox="0 0 80 64" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
        <path d="M10 43 18 29h44l8 14v14H10Z" fill="var(--color-info-soft)" />
        <path d="M10 43h19l4 6h14l4-6h19" />
        <path d="M23 37V7h34v30" fill="var(--color-surface)" />
      </svg>
      <Icon name={icon} className="size-6" />
    </div>
    <div><h3 className="ga-overview-record-name">{title}</h3>{children}</div>
  </div>
}
