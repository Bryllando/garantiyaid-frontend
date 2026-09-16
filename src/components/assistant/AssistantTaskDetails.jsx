import { useEffect, useRef, useState } from 'react'
import { Icon } from '../ui/icon.jsx'
import { fieldsForTask, nextTaskField, taskTimingIssue, translated } from './task-details.js'

function FieldEditor({ definition, value, onSave, error, language }) {
  const [input, setInput] = useState(value || '')
  const inputRef = useRef(null)
  useEffect(() => {
    if (document.activeElement?.id !== 'garantiyaid-ai-message') inputRef.current?.focus({ preventScroll: true })
  }, [])
  const props = {
    id: 'ai-task-detail', ref: inputRef, value: input, required: true,
    onChange: (event) => setInput(event.target.value),
    'aria-describedby': 'ai-task-detail-help', 'aria-invalid': Boolean(error),
    className: 'ga-input mt-2 min-h-11 w-full min-w-0',
  }
  return <form onSubmit={(event) => { event.preventDefault(); onSave(definition.key, input) }} className="border-t border-line bg-info-soft/50 p-4">
    <label htmlFor="ai-task-detail" className="ga-label">{definition.label}</label>
    <p id="ai-task-detail-help" className="mt-1 text-sm leading-6 text-muted-copy">{translated(definition.question, language)} <span className="block text-xs">Reply in chat or use this field.</span></p>
    {definition.options ? <select {...props}><option value="">Choose an option</option>{definition.options.map((option) => <option key={option} value={option}>{option.replaceAll('_', ' ').toLowerCase().replace(/^qr/, 'QR')}</option>)}</select>
      : definition.type === 'textarea' ? <textarea {...props} rows={3} maxLength={320} />
        : <input {...props} type={definition.type} maxLength={200} min={definition.type === 'number' ? 5 : undefined} max={definition.type === 'number' ? 720 : undefined} step={definition.type === 'number' ? 1 : undefined} />}
    {error && <p role="alert" className="mt-2 text-sm font-semibold text-brand-red">{error}</p>}
    <button type="submit" className="ga-btn-primary mt-3 w-full">Keep this detail</button>
  </form>
}

export default function AssistantTaskDetails({ task, editing, onEdit, onSave, onCancel, onPreview, language, error, busy }) {
  const fields = fieldsForTask(task)
  const active = fields.find((item) => item.key === editing) || nextTaskField(task)
  const count = fields.filter((item) => task.values[item.key]).length
  const timingIssue = taskTimingIssue(task)
  return <section aria-labelledby="ai-task-title" className="overflow-hidden rounded-2xl border border-blue-200 bg-white shadow-sm">
    <div className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-bold uppercase tracking-wider text-brand-blue">Your pending task</span>
        <span className="rounded-full border border-line bg-page px-2.5 py-1 text-xs font-semibold text-muted-copy">Not submitted</span>
      </div>
      <h3 id="ai-task-title" className="mt-2 text-lg font-bold text-ink">{task.kind === 'distributionDraft' ? 'Plan a distribution' : 'Prepare a reminder'}</h3>
      <p className="mt-1 text-sm leading-6 text-muted-copy">One detail at a time. Edit any answer below.</p>
      <div className="mt-3 flex items-center gap-3"><progress aria-label="Task details collected" max={fields.length} value={count} className="h-1.5 min-w-0 flex-1 accent-brand-blue" /><span className="text-xs font-semibold tabular-nums text-muted-copy">{count} of {fields.length}</span></div>
    </div>
    <fieldset disabled={busy} className="min-w-0 border-0 p-0 disabled:opacity-60">
      <legend className="sr-only">Collected task details</legend>
      <dl className="divide-y divide-line border-t border-line">
        {fields.filter((item) => task.values[item.key]).map((item) => <div key={item.key} className="flex items-start gap-2 px-4 py-2">
          <div className="min-w-0 flex-1"><dt className="text-xs font-semibold text-muted-copy">{item.label}</dt><dd className="mt-1 whitespace-pre-wrap text-sm font-semibold text-ink [overflow-wrap:anywhere]">{item.type === 'date' ? new Intl.DateTimeFormat('en-PH', { dateStyle: 'full', timeZone: 'Asia/Manila' }).format(new Date(`${task.values[item.key]}T00:00:00+08:00`)) : item.options ? task.values[item.key].replaceAll('_', ' ') : task.values[item.key]}</dd></div>
          <button type="button" onClick={() => onEdit(item.key)} aria-label={`Edit ${item.label}`} className="min-h-11 shrink-0 rounded-lg px-3 text-sm font-bold text-brand-blue hover:bg-info-soft focus-visible:outline-2 focus-visible:outline-brand-blue">Edit</button>
        </div>)}
      </dl>
      {timingIssue && <p role="status" className="border-t border-line bg-warning-soft px-4 py-3 text-sm text-brand-amber">{timingIssue}</p>}
      {active ? <FieldEditor key={`${active.key}:${task.values[active.key] || ''}`} definition={active} value={task.values[active.key]} onSave={onSave} error={error} language={language} />
        : <div role="status" className="border-t border-line bg-info-soft p-4 text-sm leading-6 text-copy"><p className="font-bold text-ink">{timingIssue ? 'Check your time choices' : 'Details collected'}</p><p className="mt-1">These preferences still need an official preview. Nothing has been created or queued.</p>{error && <p className="mt-2 font-semibold text-brand-red">{error}</p>}</div>}
      <div className="border-t border-line p-4">
        {onPreview && !active && !timingIssue && <button type="button" onClick={onPreview} disabled={busy} className="ga-btn-primary mb-3 w-full">Match records and preview</button>}
        <p className="flex items-start gap-2 text-xs leading-5 text-muted-copy"><Icon name="info" className="mt-0.5 size-4 shrink-0" /><span>Names and recipient scope are not yet verified. Dates use Philippine time; check the displayed date. Details stay in this open session and clear on refresh or sign-out.</span></p>
        <button type="button" onClick={onCancel} className="mt-3 min-h-11 w-full rounded-lg border border-line text-sm font-bold text-copy hover:bg-page focus-visible:outline-2 focus-visible:outline-brand-blue">Cancel pending task</button>
      </div>
    </fieldset>
  </section>
}
