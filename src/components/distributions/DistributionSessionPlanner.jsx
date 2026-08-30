import { useMemo, useState } from 'react'
import { Icon } from '../ui/icon.jsx'
import { LoadingLabel } from '../ui/spinner.jsx'

const dateFormatter = new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeZone: 'Asia/Manila' })
const timeFormatter = new Intl.DateTimeFormat('en-PH', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Manila' })

function addDays(date, days) {
  const value = new Date(`${date}T00:00:00.000Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

function minutes(value) {
  const [hours, minute] = value.split(':').map(Number)
  return hours * 60 + minute
}

function plannedCapacity(session, slotDurationMinutes) {
  const duration = minutes(session.endTime) - minutes(session.startTime)
  return duration > 0 && duration % slotDurationMinutes === 0
    ? duration / slotDurationMinutes * Number(session.capacity || 0)
    : 0
}

function newSession(distribution, index, date = distribution.distributionDate) {
  return {
    label: index === 0 ? 'Main service session' : `Service session ${index + 1}`,
    date,
    startTime: distribution.startTime,
    endTime: distribution.endTime,
    location: distribution.location,
    capacity: '10',
    serviceAreas: [],
  }
}

function validatePlan(distribution, sessions, mode, serviceAreas, unspecifiedCount) {
  if (sessions.some((session) => !session.label.trim() || !session.location.trim())) return 'Complete every session label and venue.'
  if (sessions.some((session) => minutes(session.endTime) <= minutes(session.startTime))) return 'Every service session must end after it starts.'
  if (sessions.some((session) => (minutes(session.endTime) - minutes(session.startTime)) % distribution.slotDurationMinutes !== 0)) return `Every session must divide evenly into ${distribution.slotDurationMinutes}-minute slots.`
  if (sessions.some((session) => Number(session.capacity) < 1 || Number(session.capacity) > 1000)) return 'Beneficiaries per slot must be between 1 and 1,000.'
  if ([...sessions].sort((left, right) => left.date.localeCompare(right.date))[0].date !== distribution.distributionDate) return 'The first service session must use the event date.'

  const ranges = sessions.map((session) => ({
    start: `${session.date}T${session.startTime}`,
    end: `${session.date}T${session.endTime}`,
  })).sort((left, right) => left.start.localeCompare(right.start))
  if (ranges.some((range, index) => index > 0 && range.start < ranges[index - 1].end)) return 'Service sessions cannot overlap.'

  if (mode === 'BY_AREA') {
    if (unspecifiedCount > 0) return `Update the Sitio/Purok of ${unspecifiedCount} eligible ${unspecifiedCount === 1 ? 'beneficiary' : 'beneficiaries'} before using area-based scheduling.`
    if (sessions.some((session) => session.serviceAreas.length === 0)) return 'Choose at least one Sitio or Purok for every session.'
    const covered = new Set(sessions.flatMap((session) => session.serviceAreas))
    const missing = serviceAreas.filter((area) => !covered.has(area.name))
    if (missing.length > 0) return `Assign every eligible service area. Still missing: ${missing.map((area) => area.name).join(', ')}.`
  }
  return ''
}

export function DistributionSessionPlanner({ busy, distribution, onGenerate, serviceAreaSummary }) {
  const serviceAreas = serviceAreaSummary?.serviceAreas ?? []
  const unspecifiedCount = serviceAreaSummary?.unspecifiedServiceAreaCount ?? 0
  const eligibleCount = serviceAreas.reduce((total, area) => total + area.count, 0) + unspecifiedCount
  const [mode, setMode] = useState('WHOLE')
  const [sessions, setSessions] = useState(() => [newSession(distribution, 0)])
  const [error, setError] = useState('')
  const totalCapacity = useMemo(() => sessions.reduce(
    (total, session) => total + plannedCapacity(session, distribution.slotDurationMinutes),
    0,
  ), [distribution.slotDurationMinutes, sessions])

  function updateSession(index, field, value) {
    setSessions((current) => current.map((session, sessionIndex) => (
      sessionIndex === index ? { ...session, [field]: value } : session
    )))
    setError('')
  }

  function changeMode(nextMode) {
    setMode(nextMode)
    setSessions((current) => current.map((session) => ({ ...session, serviceAreas: [] })))
    setError('')
  }

  function toggleArea(sessionIndex, area) {
    setSessions((current) => current.map((session, index) => index === sessionIndex ? {
      ...session,
      serviceAreas: session.serviceAreas.includes(area)
        ? session.serviceAreas.filter((value) => value !== area)
        : [...session.serviceAreas, area],
    } : session))
    setError('')
  }

  function addSession() {
    setSessions((current) => {
      const lastDate = current.at(-1)?.date ?? distribution.distributionDate
      return [...current, newSession(distribution, current.length, addDays(lastDate, 1))]
    })
  }

  async function submit(event) {
    event.preventDefault()
    const validationError = validatePlan(distribution, sessions, mode, serviceAreas, unspecifiedCount)
    if (validationError) return setError(validationError)
    setError('')
    await onGenerate(sessions.map((session) => ({
      ...session,
      capacity: Number(session.capacity),
      serviceAreas: mode === 'BY_AREA' ? session.serviceAreas : [],
    })))
  }

  return (
    <form onSubmit={submit} className="mt-5 space-y-5">
      <div className="grid gap-3 sm:grid-cols-3" aria-label="Session plan summary">
        {[
          ['Eligible pool', eligibleCount, 'people'],
          ['Planned capacity', totalCapacity, 'people'],
          ['Sessions', sessions.length, 'calendar'],
        ].map(([label, value, icon]) => <div key={label} className="rounded-xl border border-line bg-slate-50 p-4"><div className="flex items-center gap-2 text-muted-copy"><Icon name={icon} /><span className="text-xs font-bold uppercase tracking-[0.08em]">{label}</span></div><p className="mt-2 text-2xl font-black tabular-nums text-ink">{value}</p></div>)}
      </div>

      <fieldset>
        <legend className="ga-label">How should beneficiaries be grouped?</legend>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          {[
            ['WHOLE', 'Whole Barangay', 'Fill the earliest available session by capacity.'],
            ['BY_AREA', 'By Sitio / Purok', 'Match each beneficiary to a covered service area.'],
          ].map(([value, label, description]) => <label key={value} className={`cursor-pointer rounded-xl border p-4 transition-colors ${mode === value ? 'border-brand-blue bg-info-soft ring-2 ring-blue-100' : 'border-line bg-white hover:border-blue-200'}`}><span className="flex items-start gap-3"><input type="radio" name="coverage-mode" value={value} checked={mode === value} onChange={() => changeMode(value)} className="mt-1 size-4 accent-brand-blue" /><span><span className="block font-extrabold text-ink">{label}</span><span className="mt-1 block text-sm leading-5 text-muted-copy">{description}</span></span></span></label>)}
        </div>
      </fieldset>

      {mode === 'BY_AREA' && unspecifiedCount > 0 && <div className="rounded-xl border border-amber-200 bg-warning-soft p-4 text-sm leading-6 text-copy" role="status"><strong className="text-brand-amber">Profile update needed:</strong> {unspecifiedCount} eligible {unspecifiedCount === 1 ? 'beneficiary has' : 'beneficiaries have'} no Sitio/Purok recorded.</div>}

      <div className="space-y-4">
        {sessions.map((session, index) => {
          const capacity = plannedCapacity(session, distribution.slotDurationMinutes)
          const pool = serviceAreas.filter((area) => session.serviceAreas.includes(area.name)).reduce((total, area) => total + area.count, 0)
          return <fieldset key={`${index}-${session.date}`} className="overflow-hidden rounded-2xl border border-line bg-white shadow-sm"><legend className="sr-only">Service session {index + 1}</legend><div className="flex items-center justify-between gap-3 border-b border-line bg-slate-50 px-4 py-3 sm:px-5"><div><p className="text-xs font-bold uppercase tracking-[0.08em] text-brand-blue">Session {index + 1}</p><p className="mt-1 text-sm font-semibold text-copy">Capacity for {capacity} beneficiaries</p></div>{sessions.length > 1 && <button type="button" onClick={() => setSessions((current) => current.filter((_, sessionIndex) => sessionIndex !== index))} aria-label={`Remove service session ${index + 1}`} className="grid size-11 place-items-center rounded-lg border border-line bg-white text-copy transition-colors hover:border-red-200 hover:bg-red-50 hover:text-brand-red focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue"><Icon name="close" /></button>}</div>
            <div className="grid gap-4 p-4 sm:grid-cols-2 sm:p-5">
              <div className="sm:col-span-2"><label htmlFor={`session-label-${index}`} className="ga-label">Session label</label><input id={`session-label-${index}`} required maxLength="120" value={session.label} onChange={(event) => updateSession(index, 'label', event.target.value)} className="ga-input mt-2" /></div>
              <div><label htmlFor={`session-date-${index}`} className="ga-label">Date</label><input id={`session-date-${index}`} type="date" required min={distribution.distributionDate} value={session.date} onChange={(event) => updateSession(index, 'date', event.target.value)} className="ga-input mt-2" /></div>
              <div><label htmlFor={`session-capacity-${index}`} className="ga-label">Beneficiaries per slot</label><input id={`session-capacity-${index}`} type="number" required min="1" max="1000" value={session.capacity} onChange={(event) => updateSession(index, 'capacity', event.target.value)} className="ga-input mt-2 tabular-nums" /></div>
              <div><label htmlFor={`session-start-${index}`} className="ga-label">Start time</label><input id={`session-start-${index}`} type="time" required value={session.startTime} onChange={(event) => updateSession(index, 'startTime', event.target.value)} className="ga-input mt-2" /></div>
              <div><label htmlFor={`session-end-${index}`} className="ga-label">End time</label><input id={`session-end-${index}`} type="time" required value={session.endTime} onChange={(event) => updateSession(index, 'endTime', event.target.value)} className="ga-input mt-2" /></div>
              <div className="sm:col-span-2"><label htmlFor={`session-location-${index}`} className="ga-label">Venue</label><div className="relative mt-2"><span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-copy"><Icon name="location" /></span><input id={`session-location-${index}`} required maxLength="200" value={session.location} onChange={(event) => updateSession(index, 'location', event.target.value)} className="ga-input pl-11" /></div></div>
            </div>
            {mode === 'BY_AREA' && <div className="border-t border-line bg-slate-50/70 p-4 sm:p-5"><div className="flex flex-wrap items-end justify-between gap-2"><div><p className="ga-label">Covered Sitios / Puroks</p><p className="mt-1 text-xs text-muted-copy">A large area may be selected in more than one non-overlapping session.</p></div><span className="text-xs font-bold text-brand-blue">{pool} eligible in selected areas</span></div><div className="mt-3 grid gap-2 sm:grid-cols-2">{serviceAreas.map((area) => <label key={area.name} className="flex min-h-12 cursor-pointer items-center justify-between gap-3 rounded-lg border border-line bg-white px-3 py-2.5 transition-colors hover:border-blue-200"><span className="flex min-w-0 items-center gap-3"><input type="checkbox" checked={session.serviceAreas.includes(area.name)} onChange={() => toggleArea(index, area.name)} className="size-4 shrink-0 accent-brand-blue" /><span className="truncate text-sm font-bold text-ink">{area.name}</span></span><span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold tabular-nums text-copy">{area.count}</span></label>)}</div></div>}
          </fieldset>
        })}
      </div>

      <button type="button" onClick={addSession} className="ga-btn-secondary w-full border-dashed"><Icon name="plus" />Add another service session</button>
      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold leading-6 text-brand-red" role="alert">{error}</div>}
      <div className="flex flex-col gap-3 rounded-xl border border-blue-200 bg-info-soft p-4 sm:flex-row sm:items-center sm:justify-between"><p className="text-sm leading-6 text-copy"><strong className="text-ink">Ready check:</strong> capacity {totalCapacity >= eligibleCount ? 'covers' : 'is below'} the current pool of {eligibleCount} eligible beneficiaries.</p><button type="submit" disabled={busy || totalCapacity < 1} className="ga-btn-primary shrink-0">{busy ? <LoadingLabel>Generating sessions...</LoadingLabel> : `Generate ${sessions.length} ${sessions.length === 1 ? 'session' : 'sessions'}`}</button></div>
    </form>
  )
}

export function DistributionSessionSummary({ slots, summary }) {
  const sessions = [...slots.reduce((groups, slot) => {
    const current = groups.get(slot.sessionId) ?? { ...slot, slots: [], capacity: 0 }
    current.slots.push(slot)
    current.capacity += slot.capacity
    groups.set(slot.sessionId, current)
    return groups
  }, new Map()).values()]

  return <div className="mt-5"><div className="rounded-xl border border-emerald-200 bg-success-soft p-4"><p className="font-bold text-brand-green">{summary.sessionCount} service {summary.sessionCount === 1 ? 'session' : 'sessions'} ready · {summary.matchingSlotCount} time slots · capacity for {summary.matchingCapacity} beneficiaries</p></div><div className="mt-3 grid gap-3 lg:grid-cols-2">{sessions.map((session) => <article key={session.sessionId} className="rounded-xl border border-line bg-white p-4 shadow-sm"><div className="flex items-start justify-between gap-3"><div><p className="font-extrabold text-ink">{session.sessionLabel}</p><p className="mt-1 text-sm font-semibold text-brand-blue">{dateFormatter.format(new Date(session.slotStart))}</p></div><span className="rounded-full bg-info-soft px-2.5 py-1 text-xs font-bold tabular-nums text-brand-blue">{session.capacity} places</span></div><dl className="mt-4 space-y-2 text-sm text-copy"><div className="flex gap-2"><Icon name="calendar" /><div><dt className="sr-only">Time</dt><dd>{timeFormatter.format(new Date(session.slots[0].slotStart))}–{timeFormatter.format(new Date(session.slots.at(-1).slotEnd))}</dd></div></div><div className="flex gap-2"><Icon name="location" /><div><dt className="sr-only">Venue</dt><dd>{session.location}</dd></div></div></dl><div className="mt-4 flex flex-wrap gap-2">{session.serviceAreas.length > 0 ? session.serviceAreas.map((area) => <span key={area} className="rounded-full border border-blue-200 bg-info-soft px-2.5 py-1 text-xs font-bold text-brand-blue">{area}</span>) : <span className="rounded-full border border-line bg-slate-50 px-2.5 py-1 text-xs font-bold text-copy">Whole Barangay</span>}</div></article>)}</div></div>
}
