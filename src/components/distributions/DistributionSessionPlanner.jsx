import { useEffect, useMemo, useRef, useState } from 'react'
import { getAuthErrorMessage } from '../../auth/staffAuth.js'
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

function plannedSlots(session, slotDurationMinutes) {
  const duration = minutes(session.endTime) - minutes(session.startTime)
  return duration > 0 && duration % slotDurationMinutes === 0 ? duration / slotDurationMinutes : 0
}

function newSession(distribution, index, date = distribution.distributionDate, clientId = crypto.randomUUID()) {
  return { clientId, label: index === 0 ? 'Main service session' : `Service session ${index + 1}`,
    date, startTime: distribution.startTime, endTime: distribution.endTime, location: distribution.location, capacity: '10', serviceAreas: [] }
}

function validatePlan(distribution, sessions, mode, serviceAreas, unspecifiedCount) {
  if (sessions.some((session) => !session.label.trim() || !session.location.trim())) return 'Complete every session label and venue.'
  const invalidTime = sessions.findIndex(session => minutes(session.endTime) <= minutes(session.startTime))
  if (invalidTime >= 0) return `Session ${invalidTime + 1}: end time must be later than start time.`
  const unevenTime = sessions.findIndex(session => (minutes(session.endTime) - minutes(session.startTime)) % distribution.slotDurationMinutes !== 0)
  if (unevenTime >= 0) return `Session ${unevenTime + 1}: the time window must divide evenly into ${distribution.slotDurationMinutes}-minute slots.`
  if (sessions.some((session) => Number(session.capacity) < 1 || Number(session.capacity) > 1000)) return 'Beneficiaries per slot must be between 1 and 1,000.'
  if ([...sessions].sort((left, right) => left.date.localeCompare(right.date))[0].date !== distribution.distributionDate) return 'The first service session must use the event date.'
  const ranges = sessions.map(session => ({ start: `${session.date}T${session.startTime}`, end: `${session.date}T${session.endTime}` })).sort((left, right) => left.start.localeCompare(right.start))
  if (ranges.some((range, index) => index > 0 && range.start < ranges[index - 1].end)) return 'Service sessions cannot overlap.'
  if (mode === 'BY_AREA') {
    if (unspecifiedCount > 0) return `Update the Sitio/Purok of ${unspecifiedCount} eligible ${unspecifiedCount === 1 ? 'beneficiary' : 'beneficiaries'} before using area-based scheduling. You can use Whole barangay without this field.`
    if (sessions.some(session => session.serviceAreas.length === 0)) return 'Choose at least one Sitio or Purok for every session.'
    const covered = new Set(sessions.flatMap(session => session.serviceAreas))
    const missing = serviceAreas.filter(area => !covered.has(area.name))
    if (missing.length > 0) return `Assign every eligible service area. Still missing: ${missing.map(area => area.name).join(', ')}.`
  }
  return ''
}

export function DistributionSessionPlanner({ busy, distribution, onGenerate, serviceAreaSummary }) {
  const serviceAreas = serviceAreaSummary?.serviceAreas ?? []
  const unspecifiedCount = serviceAreaSummary?.unspecifiedServiceAreaCount ?? 0
  const eligibleCount = serviceAreas.reduce((total, area) => total + area.count, 0) + unspecifiedCount
  const barangay = distribution.barangay?.barangayName || 'the selected barangay'
  const [mode, setMode] = useState('WHOLE')
  const [sessions, setSessions] = useState(() => [newSession(distribution, 0)])
  const [error, setError] = useState('')
  const errorRef = useRef(null)
  const newSessionRef = useRef(null)
  const savingRef = useRef(false)
  useEffect(() => { if (error) errorRef.current?.focus() }, [error])
  useEffect(() => {
    if (!newSessionRef.current) return
    document.getElementById(`session-label-${newSessionRef.current}`)?.focus()
    newSessionRef.current = null
  }, [sessions])
  const totalCapacity = useMemo(() => sessions.reduce((total, session) => total + plannedSlots(session, distribution.slotDurationMinutes) * Number(session.capacity || 0), 0), [distribution.slotDurationMinutes, sessions])
  const totalSlots = sessions.reduce((total, session) => total + plannedSlots(session, distribution.slotDurationMinutes), 0)
  const coveredAreas = new Set(sessions.flatMap(session => session.serviceAreas))
  const missingAreas = serviceAreas.filter(area => !coveredAreas.has(area.name))

  function updateSession(index, field, value) {
    setSessions(current => current.map((session, sessionIndex) => sessionIndex === index ? { ...session, [field]: value } : session))
    setError('')
  }
  function changeMode(nextMode) { setMode(nextMode); setError('') }
  function toggleArea(sessionIndex, area) {
    setSessions(current => current.map((session, index) => index === sessionIndex ? { ...session, serviceAreas: session.serviceAreas.includes(area) ? session.serviceAreas.filter(value => value !== area) : [...session.serviceAreas, area] } : session))
    setError('')
  }
  function addSession() {
    const clientId = crypto.randomUUID()
    newSessionRef.current = clientId
    setSessions(current => [...current, newSession(distribution, current.length, addDays(current.at(-1)?.date || distribution.distributionDate, 1), clientId)])
    setError('')
  }
  function removeSession(index) {
    newSessionRef.current = (sessions[index + 1] || sessions[index - 1]).clientId
    setSessions(current => current.filter((_, sessionIndex) => sessionIndex !== index))
    setError('')
  }
  async function submit(event) {
    event.preventDefault()
    if (busy || savingRef.current) return
    const validationError = validatePlan(distribution, sessions, mode, serviceAreas, unspecifiedCount)
    if (validationError) { setError(validationError); errorRef.current?.focus(); return }
    setError('')
    savingRef.current = true
    try {
      await onGenerate(sessions.map(session => ({ label: session.label.trim(), date: session.date, startTime: session.startTime, endTime: session.endTime,
        location: session.location.trim(), capacity: Number(session.capacity), serviceAreas: mode === 'BY_AREA' ? session.serviceAreas : [] })))
    } catch (requestError) { setError(getAuthErrorMessage(requestError)) }
    finally { savingRef.current = false }
  }

  return <form onSubmit={submit} aria-label="Service session plan" aria-busy={busy} className="scroll-mt-36">
    <fieldset disabled={busy} className="min-w-0 space-y-6">
      <div>
        <dl aria-label="Session plan summary" className="grid grid-cols-3 gap-3 border-b border-line pb-4 sm:gap-5">
          {[['Eligible now', eligibleCount, 'people'], ['Planned places', totalCapacity, 'queue'], ['Sessions', sessions.length, 'calendar']].map(([label, value, icon]) => <div key={label} className="min-w-0"><dt className="flex items-start gap-2 text-xs font-semibold leading-5 text-muted-copy"><Icon name={icon} className="mt-0.5 hidden size-4 shrink-0 sm:block" />{label}</dt><dd className="mt-2 text-2xl font-bold tabular-nums text-ink">{value}</dd></div>)}
        </dl>
        <p className="mt-3 text-xs leading-5 text-muted-copy">Eligible now means approved beneficiaries in {barangay} who are not yet allocated to this event. Planned places are the maximum your sessions can accommodate.</p>
      </div>

      <fieldset className="min-w-0" aria-describedby="session-grouping-help">
        <legend className="text-sm font-semibold text-ink">How should beneficiaries be scheduled?</legend>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {[
            ['WHOLE', 'Whole barangay', 'Shared queue', 'Any Sitio/Purok can use the earliest session with space.', 'office'],
            ['BY_AREA', 'By Sitio / Purok', 'Area-specific sessions', 'Match each person to a session covering their recorded area.', 'location'],
          ].map(([value, label, hint, description, icon]) => <label key={value} className={`flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-colors focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-brand-blue ${mode === value ? 'border-brand-blue bg-info-soft' : 'border-line hover:border-blue-200'}`}>
            <input type="radio" name="coverage-mode" value={value} checked={mode === value} aria-labelledby={`coverage-${value}-label`} aria-describedby={`coverage-${value}-help`} onChange={() => changeMode(value)} className="mt-1 size-4 shrink-0 accent-brand-blue" />
            <span className="min-w-0"><span id={`coverage-${value}-label`} className="flex items-center gap-2 text-sm font-semibold text-ink"><Icon name={icon} className="size-4 shrink-0 text-brand-blue" />{label}</span><span id={`coverage-${value}-help`} className="mt-2 block text-xs leading-5 text-copy"><span className="font-semibold">{hint}.</span> {description}</span></span>
          </label>)}
        </div>
        <p id="session-grouping-help" className="mt-3 border-l-2 border-line pl-3 text-sm leading-6 text-copy">{mode === 'WHOLE' ? 'Example: beneficiaries from Purok 1 and Purok 2 share the same sessions. This does not automatically include every resident; only allocated beneficiaries are scheduled.' : 'Example: Purok 1 uses a morning session and Purok 2 uses an afternoon session. Each beneficiary’s saved Sitio/Purok must match a covered area.'}</p>
      </fieldset>

      {mode === 'BY_AREA' && unspecifiedCount > 0 && <div className="flex items-start gap-3 border-l-2 border-brand-amber bg-warning-soft p-4 text-sm leading-6 text-copy" role="status"><Icon name="info" className="mt-1 size-4 shrink-0 text-brand-amber" /><p><strong className="text-ink">{unspecifiedCount} eligible {unspecifiedCount === 1 ? 'beneficiary needs' : 'beneficiaries need'} a Sitio/Purok.</strong> Update their address before creating area-specific sessions, or use Whole barangay.</p></div>}

      <div className="space-y-5">
        {sessions.map((session, index) => {
          const slotCount = plannedSlots(session, distribution.slotDurationMinutes)
          const capacity = slotCount * Number(session.capacity || 0)
          const pool = serviceAreas.filter(area => session.serviceAreas.includes(area.name)).reduce((total, area) => total + area.count, 0)
          return <fieldset key={session.clientId} className="min-w-0 scroll-mt-36 rounded-lg border border-line" aria-labelledby={`session-heading-${session.clientId}`}>
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-t-lg border-b border-line bg-slate-50 px-4 py-3 sm:px-5"><div><h4 id={`session-heading-${session.clientId}`} className="flex items-center gap-2 text-sm font-semibold text-ink"><Icon name="calendar" className="size-4 text-brand-blue" />Service session {index + 1}</h4><p className="mt-1 text-xs text-muted-copy">{mode === 'WHOLE' ? 'Shared queue · any Sitio/Purok' : 'Only the areas selected below'}</p></div>{sessions.length > 1 && <button type="button" onClick={() => removeSession(index)} aria-label={`Remove service session ${index + 1}`} className="ga-btn-secondary min-h-11 gap-2 px-3 text-sm hover:text-brand-red"><Icon name="trash" className="size-4" />Remove</button>}</div>
            <div className="grid min-w-0 gap-4 p-4 sm:grid-cols-2 sm:p-5">
              <div className="min-w-0"><label htmlFor={`session-label-${session.clientId}`} className="ga-label" data-required="true">Session label</label><div className="relative mt-2"><Icon name="pen" className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-copy" /><input id={`session-label-${session.clientId}`} required maxLength="120" placeholder="e.g. Morning session" value={session.label} onChange={event => updateSession(index, 'label', event.target.value)} className="ga-input pl-10" /></div></div>
              <div className="min-w-0"><label htmlFor={`session-location-${index}`} className="ga-label" data-required="true">Venue</label><div className="relative mt-2"><Icon name="location" className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-copy" /><input id={`session-location-${index}`} required maxLength="200" placeholder="e.g. Barangay hall" value={session.location} onChange={event => updateSession(index, 'location', event.target.value)} className="ga-input pl-10" /></div></div>
              <div className="min-w-0"><label htmlFor={`session-date-${index}`} className="ga-label">Date</label><input id={`session-date-${index}`} type="date" required min={distribution.distributionDate} value={session.date} onChange={event => updateSession(index, 'date', event.target.value)} className="ga-input mt-2 min-w-0" /></div>
              <div className="min-w-0"><label htmlFor={`session-capacity-${index}`} className="ga-label" data-required="true">Beneficiaries per slot</label><div className="relative mt-2"><Icon name="people" className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-copy" /><input id={`session-capacity-${index}`} type="number" required min="1" max="1000" step="1" value={session.capacity} aria-describedby={`session-capacity-help-${index}`} onChange={event => updateSession(index, 'capacity', event.target.value)} className="ga-input pl-10 tabular-nums" /></div><p id={`session-capacity-help-${index}`} className="mt-2 text-xs leading-5 text-muted-copy">Maximum people in each {distribution.slotDurationMinutes}-minute time slot.</p></div>
              <div className="min-w-0"><label htmlFor={`session-start-${index}`} className="ga-label">Start time</label><input id={`session-start-${index}`} type="time" required value={session.startTime} onChange={event => updateSession(index, 'startTime', event.target.value)} className="ga-input mt-2" /></div>
              <div className="min-w-0"><label htmlFor={`session-end-${index}`} className="ga-label">End time</label><input id={`session-end-${index}`} type="time" required value={session.endTime} onChange={event => updateSession(index, 'endTime', event.target.value)} className="ga-input mt-2" /></div>
              <p className="text-xs text-muted-copy sm:col-span-2">All dates and times use Philippine Standard Time (PHT).</p>
            </div>
            <div aria-live="polite" className="flex items-start gap-2 border-t border-line px-4 py-3 text-sm leading-6 sm:px-5"><Icon name="clock" className="mt-1 size-4 shrink-0 text-brand-blue" /><p>{slotCount && Number(session.capacity) > 0 ? <><strong className="font-semibold text-ink">{slotCount} time {slotCount === 1 ? 'slot' : 'slots'} × {session.capacity} {Number(session.capacity) === 1 ? 'person' : 'people'} = {capacity} {capacity === 1 ? 'place' : 'places'}</strong><span className="block text-xs text-muted-copy">Each slot lasts {distribution.slotDurationMinutes} minutes. These are available places, not assigned beneficiaries.</span></> : 'Set valid service times and capacity to calculate places.'}</p></div>
            {mode === 'BY_AREA' && <div className="border-t border-line p-4 sm:p-5"><div className="flex flex-wrap items-start justify-between gap-2"><div><h5 className="text-sm font-semibold text-ink">Covered Sitios / Puroks</h5><p className="mt-1 text-xs leading-5 text-muted-copy">Choose from eligible beneficiary records. An area can use more than one session.</p></div><p className="text-xs font-semibold text-copy">{pool} eligible in selected areas</p></div>
              {serviceAreas.length === 0 ? <p className="mt-3 rounded-md bg-slate-50 p-3 text-sm leading-6 text-copy">No Sitio/Purok is recorded in the current eligible list. Update the beneficiary addresses or use Whole barangay.</p> : <div className="mt-3 grid gap-2 sm:grid-cols-2">{serviceAreas.map((area, areaIndex) => <label key={area.name} className={`flex min-h-12 cursor-pointer items-start justify-between gap-3 rounded-md border px-3 py-3 focus-within:outline-2 focus-within:outline-brand-blue ${session.serviceAreas.includes(area.name) ? 'border-brand-blue bg-info-soft' : 'border-line'}`}><span className="flex min-w-0 items-start gap-3"><input type="checkbox" checked={session.serviceAreas.includes(area.name)} aria-labelledby={`session-area-${session.clientId}-${areaIndex}`} onChange={() => toggleArea(index, area.name)} className="mt-0.5 size-4 shrink-0 accent-brand-blue" /><span id={`session-area-${session.clientId}-${areaIndex}`} className="break-words text-sm font-medium text-ink">{area.name}</span></span><span className="shrink-0 text-xs tabular-nums text-copy">{area.count} eligible</span></label>)}</div>}
            </div>}
          </fieldset>
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2"><button type="button" onClick={addSession} disabled={sessions.length >= 30} className="ga-btn-secondary gap-2"><Icon name="plus" className="size-4" />Add another service session</button><p className="text-xs text-muted-copy">{sessions.length} of 30 sessions · New sessions start on the next day.</p></div>
      {error && <div ref={errorRef} tabIndex={-1} className="scroll-mt-36 border-l-2 border-brand-red bg-danger-soft p-4 text-sm font-semibold leading-6 text-brand-red" role="alert">{error}</div>}
      <div className="flex flex-col gap-4 border-t border-line pt-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm leading-6 text-copy"><p className="font-semibold text-ink">{totalCapacity} {totalCapacity === 1 ? 'place' : 'places'} across {totalSlots} time {totalSlots === 1 ? 'slot' : 'slots'}</p><p className="mt-1 text-xs leading-5">Create time slots now; allocate beneficiaries and assign their queue next. Dates, times and area coverage are fixed after generation.</p>{totalCapacity < eligibleCount && <p className="mt-2 text-xs font-semibold text-brand-amber">The current eligible list has {eligibleCount} people. Increase capacity if you plan to include everyone.</p>}{mode === 'BY_AREA' && <p className="mt-2 text-xs font-semibold text-copy">{unspecifiedCount > 0 ? `${unspecifiedCount} eligible profiles still need a Sitio/Purok.` : missingAreas.length ? `${missingAreas.length} eligible ${missingAreas.length === 1 ? 'area still needs' : 'areas still need'} a session.` : serviceAreas.length ? `${serviceAreas.length} eligible ${serviceAreas.length === 1 ? 'area' : 'areas'} covered.` : 'No area records available. Use Whole barangay or update beneficiary addresses.'}</p>}</div>
        <button type="submit" disabled={busy} className="ga-btn-primary shrink-0">{busy ? <LoadingLabel>Generating sessions...</LoadingLabel> : <><Icon name="calendar" className="size-4" />Generate {sessions.length} {sessions.length === 1 ? 'session' : 'sessions'}</>}</button>
      </div>
    </fieldset>
  </form>
}

export function DistributionSessionSummary({ slots, summary, onEditCapacity }) {
  const sessions = [...slots.reduce((groups, slot) => {
    const current = groups.get(slot.sessionId) ?? { ...slot, slots: [], capacity: 0 }
    current.slots.push(slot)
    current.capacity += slot.capacity
    groups.set(slot.sessionId, current)
    return groups
  }, new Map()).values()]

  return <div className="mt-5">
    <p className="border-b border-line pb-4 text-sm font-semibold text-copy">{summary.sessionCount} service {summary.sessionCount === 1 ? 'session' : 'sessions'} · {summary.matchingSlotCount} time slots · {summary.matchingCapacity} places</p>
    <div className="divide-y divide-line">{sessions.map((session) => <article key={session.sessionId} className="py-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h4 className="font-bold text-ink">{session.sessionLabel}</h4><p className="mt-1 text-sm text-copy">{dateFormatter.format(new Date(session.slotStart))} · {session.location}</p></div>
        <span className="text-sm font-semibold tabular-nums text-ink">{session.capacity} places</span>
      </div>
      <p className="mt-2 flex items-start gap-2 text-sm text-muted-copy"><Icon name={session.serviceAreas.length ? 'location' : 'office'} className="size-4 shrink-0" />{session.serviceAreas.length ? `Sitio / Purok: ${session.serviceAreas.join(', ')}` : 'Whole barangay · shared queue for any Sitio/Purok'}</p>
      <details className="mt-3 rounded-lg border border-line">
        <summary className="min-h-11 cursor-pointer px-4 py-3 text-sm font-semibold text-brand-blue">{onEditCapacity ? 'View time slots and edit capacity' : 'View time slots'}</summary>
        <ul className="divide-y divide-line border-t border-line">{session.slots.map((slot) => <li key={slot.slotId} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div><p className="text-sm font-semibold text-ink">{timeFormatter.format(new Date(slot.slotStart))}–{timeFormatter.format(new Date(slot.slotEnd))}</p><p className="mt-1 text-xs text-muted-copy">{slot.capacity} places · {slot.slotStatus === 'FULL' ? 'Full' : slot.slotStatus === 'CLOSED' ? 'Closed' : 'Available'}</p></div>
          {onEditCapacity && <button type="button" onClick={() => onEditCapacity(slot)} className="ga-btn-secondary min-h-11 px-3 text-sm" aria-label={`Edit capacity for ${session.sessionLabel} at ${timeFormatter.format(new Date(slot.slotStart))}`}>Edit capacity</button>}
        </li>)}</ul>
      </details>
    </article>)}</div>
  </div>
}
