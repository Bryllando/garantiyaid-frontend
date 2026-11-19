export default function DistributionLiveStatus({ connection }) {
  const connected = connection === 'connected'
  const connecting = connection === 'connecting'
  return <span role="status" className={`inline-flex w-fit items-center gap-2 rounded-full border px-3 py-1 text-sm font-bold ${connected ? 'ga-status-success' : connecting ? 'border-line bg-slate-50 text-copy' : 'ga-status-warning'}`}>
    <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-current" />
    {connected ? 'Live' : connecting ? 'Connecting…' : 'Live updates paused'}
  </span>
}
