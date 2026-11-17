import { useEffect, useRef, useState } from 'react'
import { Icon } from '../ui/icon.jsx'
import { LoadingLabel } from '../ui/spinner.jsx'
import { fieldsForTask, nextTaskField, reminderContextFields, taskTimingIssue, translated } from './task-details.js'
import { formatReminderEvent, resolveServiceArea, UNRESOLVED_AREA } from './task-preview.js'

const dateFormatter = new Intl.DateTimeFormat('en-PH', { dateStyle: 'full', timeZone: 'Asia/Manila' })

function FieldEditor({ definition, value, onSave, error, language, chatOpen, onChatToggle, distributions, matchingEvents, eventId, eventLoading, eventLookupError, onRefreshEvents, onSelectEvent, serviceAreas, areaLoading, areaLookupError, onRefreshAreas }) {
  const isEvent = definition.key === 'distribution'
  const isArea = definition.key === 'serviceArea'
  const [input, setInput] = useState(isEvent ? eventId || '' : value || '')
  const inputRef = useRef(null)
  const selectedEvent = distributions.find(row => row.distributionId === input)
  const matchingIds = new Set(matchingEvents.map(row => row.distributionId))
  const matches = distributions.filter(row => matchingIds.has(row.distributionId))
  const others = distributions.filter(row => !matchingIds.has(row.distributionId))
  const areaValue = isArea && input ? resolveServiceArea(input, serviceAreas) : UNRESOLVED_AREA
  const selectedArea = areaValue === UNRESOLVED_AREA ? '' : areaValue || 'All scheduled service areas'
  const areaUnavailable = !eventId || areaLoading || Boolean(areaLookupError)
  useEffect(() => {
    if (!eventLoading && !areaLoading && document.activeElement?.id !== 'garantiyaid-ai-message') inputRef.current?.focus({ preventScroll: !isArea })
  }, [eventLoading, areaLoading])
  const props = {
    id: 'ai-task-detail', ref: inputRef, value: input, required: true,
    onChange: (event) => setInput(event.target.value),
    'aria-describedby': `ai-task-detail-help${error ? ' ai-task-detail-error' : ''}${isArea && areaLookupError ? ' ai-task-area-error' : ''}`, 'aria-invalid': Boolean(error || isArea && areaLookupError),
    className: 'ga-input mt-2 min-h-11 w-full min-w-0',
  }
  const placeholder = { program: 'e.g. Community Cash Assistance', barangay: 'e.g. San Nicolas', serviceArea: 'e.g. Purok 2, or all scheduled service areas', location: 'e.g. Barangay Hall', title: 'Enter a short event title', messageTemplate: 'Write the reminder beneficiaries will receive' }[definition.key]
  return <form onSubmit={(event) => { event.preventDefault(); if (isEvent) { if (selectedEvent && !eventLoading && !eventLookupError) onSelectEvent(selectedEvent) } else if (!isArea || !areaUnavailable && selectedArea) onSave(definition.key, isArea ? selectedArea : input) }} className="border-t border-line p-5 sm:p-6">
    <label htmlFor="ai-task-detail" className="ga-label">{definition.label}</label>
    <p id="ai-task-detail-help" className="mt-1 text-sm leading-6 text-muted-copy">{translated(definition.question, language)}</p>
    {isEvent ? <>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        {eventLoading ? <p role="status" className="text-xs text-muted-copy"><LoadingLabel>Loading saved events...</LoadingLabel></p> : <p className="text-xs text-muted-copy">{eventLookupError ? 'Events could not be loaded' : `${distributions.length} ${distributions.length === 1 ? 'event' : 'events'} available`}</p>}
        {onRefreshEvents && <button type="button" onClick={onRefreshEvents} disabled={eventLoading} className="inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-semibold text-brand-blue hover:bg-info-soft focus-visible:outline-2 focus-visible:outline-brand-blue disabled:cursor-wait disabled:opacity-50"><Icon name="reset" className="size-4" />Refresh events</button>}
      </div>
      <select {...props} disabled={eventLoading || Boolean(eventLookupError) || !distributions.length}>
        <option value="">{eventLoading ? 'Loading events...' : distributions.length ? 'Choose a distribution event' : 'No events available'}</option>
        {matches.length > 0 ? <>
          <optgroup label="Matching your request">{matches.map(row => <option key={row.distributionId} value={row.distributionId}>{matchingEvents.findIndex(match => match.distributionId === row.distributionId) + 1}. {formatReminderEvent(row)}</option>)}</optgroup>
          {others.length > 0 && <optgroup label="Other available events">{others.map(row => <option key={row.distributionId} value={row.distributionId}>{formatReminderEvent(row)}</option>)}</optgroup>}
        </> : distributions.map(row => <option key={row.distributionId} value={row.distributionId}>{formatReminderEvent(row)}</option>)}
      </select>
      {!eventLoading && !eventLookupError && distributions.length === 0 && <div role="status" className="mt-3 rounded-lg border border-line bg-slate-50 p-4 text-sm leading-6 text-copy"><p className="font-semibold text-ink">No saved events available</p><p className="mt-1">An event is a distribution saved by the System Administrator with a program, barangay and schedule. Ask the administrator to prepare one in Distribution events, then choose Refresh events here. Only draft or open events within your authorized access appear.</p></div>}
      {!eventLoading && eventId && !distributions.some(row => row.distributionId === eventId) && <p role="status" className="mt-3 text-sm leading-6 text-brand-amber">The previous event is no longer available. Choose another saved event before continuing.</p>}
      {selectedEvent && !eventLookupError && <section aria-label="Selected event details" className="mt-3 rounded-lg border border-line bg-slate-50 p-4">
        <div className="flex items-start gap-3"><Icon name="calendar" className="mt-0.5 size-5 shrink-0 text-brand-blue" /><p className="min-w-0 flex-1 text-sm font-semibold text-ink [overflow-wrap:anywhere]">{selectedEvent.title}</p><span className="shrink-0 rounded border border-line bg-white px-2 py-1 text-xs font-semibold text-copy">{selectedEvent.status === 'OPEN' ? 'Open' : 'Draft'}</span></div>
        <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
          <div><dt className="text-xs text-muted-copy">Program</dt><dd className="mt-1 font-semibold text-ink [overflow-wrap:anywhere]">{selectedEvent.program?.programName || selectedEvent.program?.programCode || 'Not recorded'}</dd></div>
          <div><dt className="text-xs text-muted-copy">Barangay / city</dt><dd className="mt-1 font-semibold text-ink [overflow-wrap:anywhere]">{[selectedEvent.barangay?.barangayName, selectedEvent.barangay?.city].filter(Boolean).join(', ') || 'Not recorded'}</dd></div>
          <div><dt className="text-xs text-muted-copy">Distribution schedule (PHT)</dt><dd className="mt-1 font-semibold text-ink">{dateFormatter.format(new Date(`${selectedEvent.distributionDate}T00:00:00+08:00`))}{selectedEvent.startTime && selectedEvent.endTime && <span className="mt-1 block font-normal">{selectedEvent.startTime}–{selectedEvent.endTime}</span>}</dd></div>
          <div><dt className="text-xs text-muted-copy">Venue</dt><dd className="mt-1 font-semibold text-ink [overflow-wrap:anywhere]">{selectedEvent.location || 'Not recorded'}</dd></div>
        </dl>
        <p className="mt-3 border-t border-line pt-3 text-xs leading-5 text-muted-copy">{selectedEvent.status === 'DRAFT' ? 'Draft event: only beneficiaries with assigned schedules can appear in the recipient preview.' : 'Only eligible scheduled beneficiaries can receive a reminder. You will review the recipients before confirming.'}</p>
      </section>}
    </> : isArea ? <>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <p role="status" className="text-xs text-muted-copy">{areaLoading ? <LoadingLabel>Loading recipient areas...</LoadingLabel> : `${serviceAreas.length} named ${serviceAreas.length === 1 ? 'area' : 'areas'} in this event`}</p>
        {onRefreshAreas && <button type="button" onClick={onRefreshAreas} disabled={!eventId || areaLoading} className="inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-semibold text-brand-blue hover:bg-info-soft focus-visible:outline-2 focus-visible:outline-brand-blue disabled:cursor-wait disabled:opacity-50"><Icon name="reset" className="size-4" />Refresh areas</button>}
      </div>
      <select {...props} value={selectedArea} disabled={areaUnavailable} aria-busy={areaLoading}>
        <option value="">{areaLoading ? 'Loading areas...' : 'Choose the recipient area'}</option>
        <option value="All scheduled service areas">All scheduled service areas</option>
        {serviceAreas.map(area => <option key={area} value={area}>{area}</option>)}
      </select>
      {areaLookupError && <p id="ai-task-area-error" role="alert" className="mt-2 text-sm font-semibold text-brand-red">{areaLookupError} Use Refresh areas to try again.</p>}
      {!areaLoading && !areaLookupError && serviceAreas.length === 0 && <p className="mt-2 text-sm leading-6 text-muted-copy">No named Sitio/Purok found for this event. Choose All scheduled service areas to review its scheduled beneficiaries.</p>}
      {!areaUnavailable && input && !selectedArea && <p role="status" className="mt-2 text-sm leading-6 text-brand-amber">The previous area is unavailable for this event. Choose an area from the list.</p>}
    </> : definition.options ? <select {...props}><option value="">Choose an option</option>{definition.options.map((option) => <option key={option} value={option}>{option.replaceAll('_', ' ').toLowerCase().replace(/^qr/, 'QR')}</option>)}</select>
      : definition.type === 'textarea' ? <textarea {...props} placeholder={placeholder} rows={3} maxLength={320} />
        : <input {...props} placeholder={placeholder} type={definition.type} maxLength={200} min={definition.type === 'number' ? 5 : undefined} max={definition.type === 'number' ? 720 : undefined} step={definition.type === 'number' ? 1 : undefined} />}
    {error && <p id="ai-task-detail-error" role="alert" className="mt-2 text-sm font-semibold text-brand-red">{error}</p>}
    <div className="mt-4 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">{onChatToggle ? <button type="button" onClick={onChatToggle} aria-expanded={chatOpen} className="inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm font-semibold text-brand-blue hover:bg-info-soft focus-visible:outline-2 focus-visible:outline-brand-blue"><Icon name={chatOpen ? 'enrollments' : 'helpCases'} className="size-4" />{chatOpen ? 'Use guided fields' : 'Use chat instead'}</button> : <p className="text-xs leading-5 text-muted-copy">You can also answer or ask for help in chat.</p>}<button type="submit" disabled={isEvent && (!selectedEvent || eventLoading || Boolean(eventLookupError)) || isArea && (areaUnavailable || !selectedArea)} className="ga-btn-primary shrink-0">{isEvent ? 'Use selected event' : 'Keep this detail'} <Icon name="arrowRight" className="size-4" /></button></div>
  </form>
}

export default function AssistantTaskDetails({ task, editing, onEdit, onSave, onCancel, onPreview, language, error, busy, chatOpen, onChatToggle, distributions = [], matchingEvents = [], eventLoading = false, eventLookupError, onRefreshEvents, onSelectEvent, serviceAreas = [], areaLoading = false, areaLookupError, onRefreshAreas }) {
  const fields = fieldsForTask(task)
  const contextFields = task.kind === 'reminder' ? reminderContextFields.filter(item => task.values[item.key]) : []
  const active = [...fields, ...contextFields].find((item) => item.key === editing) || nextTaskField(task)
  const count = fields.filter((item) => task.values[item.key]).length
  const timingIssue = taskTimingIssue(task)
  const distribution = task.kind === 'distributionDraft'
  const stages = distribution ? ['Details', 'Review', 'Save draft'] : ['Details', 'Recipients', 'Queue SMS']
  return <section aria-labelledby="ai-task-title" className="overflow-hidden rounded-xl border border-line bg-white">
    <div className="p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-xs font-semibold text-brand-blue"><Icon name={distribution ? 'calendar' : 'smsDelivery'} className="size-4" />{distribution ? 'Distribution planning' : 'SMS reminder'}</span>
        <span className="rounded-full border border-line bg-page px-2.5 py-1 text-xs font-semibold text-muted-copy">Not submitted</span>
      </div>
      <h3 id="ai-task-title" className="mt-3 text-xl font-semibold text-ink sm:text-2xl">{distribution ? 'Prepare a distribution draft' : 'Prepare a reminder'}</h3>
      <p className="mt-2 text-sm leading-6 text-muted-copy">{distribution ? 'Collect the program, service area and schedule for your draft.' : 'Select a saved distribution, then choose recipients and review your SMS.'}</p>
      <ol aria-label="Task stages" className="mt-5 hidden grid-cols-3 gap-2 border-y border-line py-3 sm:grid">{stages.map((stage, index) => <li key={stage} aria-current={index === 0 ? 'step' : undefined} className={`flex items-center gap-2 text-xs leading-5 ${index === 0 ? 'font-semibold text-brand-blue' : 'text-muted-copy'}`}><span aria-hidden="true" className={`grid size-6 shrink-0 place-items-center rounded-full ${index === 0 ? 'bg-brand-blue text-white' : 'border border-line'}`}>{index + 1}</span>{stage}</li>)}</ol>
      <div className="mt-4 flex items-center justify-between gap-3 text-xs text-muted-copy"><span>{active ? 'Collecting details' : 'Ready for review'}</span><span className="tabular-nums">{count} of {fields.length} details</span></div>
      <progress aria-label="Task details collected" max={fields.length} value={count} className="ga-assistant-task-progress mt-2 block h-1.5 w-full" />
    </div>
    <fieldset disabled={busy && !eventLoading && !areaLoading} className="min-w-0 border-0 p-0 disabled:opacity-60">
      <legend className="sr-only">Collected task details</legend>
      {count > 0 && <dl className="divide-y divide-line border-t border-line bg-slate-50/60">
        {[...fields, ...contextFields].filter((item) => task.values[item.key]).map((item) => <div key={item.key} className="flex items-start gap-2 px-4 py-2">
          <div className="min-w-0 flex-1"><dt className="text-xs font-semibold text-muted-copy">{item.label}</dt><dd className="mt-1 whitespace-pre-wrap text-sm font-semibold text-ink [overflow-wrap:anywhere]">{item.type === 'date' ? new Intl.DateTimeFormat('en-PH', { dateStyle: 'full', timeZone: 'Asia/Manila' }).format(new Date(`${task.values[item.key]}T00:00:00+08:00`)) : item.options ? task.values[item.key].replaceAll('_', ' ') : task.values[item.key]}</dd></div>
          <button type="button" onClick={() => onEdit(item.key)} aria-label={`Edit ${item.label}`} className="min-h-11 shrink-0 rounded-lg px-3 text-sm font-bold text-brand-blue hover:bg-info-soft focus-visible:outline-2 focus-visible:outline-brand-blue">Edit</button>
        </div>)}
      </dl>}
      {timingIssue && <p role="status" className="border-t border-line bg-warning-soft px-4 py-3 text-sm text-brand-amber">{timingIssue}</p>}
      {active ? <FieldEditor key={`${active.key}:${task.values[active.key] || ''}:${task.values.distributionId || ''}`} definition={active} value={task.values[active.key]} onSave={onSave} error={error} language={language} chatOpen={chatOpen} onChatToggle={onChatToggle} distributions={distributions} matchingEvents={matchingEvents} eventId={task.values.distributionId} eventLoading={eventLoading} eventLookupError={eventLookupError} onRefreshEvents={onRefreshEvents} onSelectEvent={onSelectEvent} serviceAreas={serviceAreas} areaLoading={areaLoading} areaLookupError={areaLookupError} onRefreshAreas={onRefreshAreas} />
        : <div role="status" className="border-t border-line bg-info-soft p-4 text-sm leading-6 text-copy"><p className="font-bold text-ink">{timingIssue ? 'Check your time choices' : 'Details collected'}</p><p className="mt-1">These preferences still need an official preview. Nothing has been created or queued.</p>{error && <p className="mt-2 font-semibold text-brand-red">{error}</p>}</div>}
      <div className="border-t border-line px-5 py-4 sm:px-6">
        {onPreview && !active && !timingIssue && <button type="button" onClick={onPreview} disabled={busy} className="ga-btn-primary mb-3 w-full">Match records and preview</button>}
        <p className="flex items-start gap-2 text-xs leading-5 text-muted-copy"><Icon name="security" className="mt-0.5 size-4 shrink-0" /><span>{distribution ? 'You’ll review and confirm before a draft is saved.' : 'You’ll review recipients and confirm before any SMS is queued.'}</span></p>
        <details className="mt-2 text-xs leading-5 text-muted-copy"><summary className="min-h-6 cursor-pointer rounded-sm focus-visible:outline-2 focus-visible:outline-brand-blue">About these details</summary><p className="mt-1">{distribution ? 'Names and recipient scope are not yet verified.' : 'Event choices come from records you can access. Recipient scope and sending time will be checked at preview.'} Dates use Philippine time. Details stay in this open session and clear on refresh or sign-out.</p></details>
        {!active && onChatToggle && <button type="button" onClick={onChatToggle} aria-expanded={chatOpen} className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm font-semibold text-brand-blue hover:bg-info-soft focus-visible:outline-2 focus-visible:outline-brand-blue"><Icon name="helpCases" className="size-4" />{chatOpen ? 'Use guided fields' : 'Use chat instead'}</button>}
        <button type="button" onClick={onCancel} className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm font-semibold text-copy hover:bg-page focus-visible:outline-2 focus-visible:outline-brand-blue"><Icon name="arrowLeft" className="size-4" />Cancel pending task</button>
      </div>
    </fieldset>
  </section>
}
