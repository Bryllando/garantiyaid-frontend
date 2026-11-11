import { useEffect, useRef, useState } from 'react'
import { Icon } from '../ui/icon.jsx'
import { fieldsForTask, nextTaskField, reminderContextFields, taskTimingIssue, translated } from './task-details.js'

function FieldEditor({ definition, value, onSave, error, language, chatOpen, onChatToggle }) {
  const [input, setInput] = useState(value || '')
  const inputRef = useRef(null)
  useEffect(() => {
    if (document.activeElement?.id !== 'garantiyaid-ai-message') inputRef.current?.focus({ preventScroll: true })
  }, [])
  const props = {
    id: 'ai-task-detail', ref: inputRef, value: input, required: true,
    onChange: (event) => setInput(event.target.value),
    'aria-describedby': `ai-task-detail-help${error ? ' ai-task-detail-error' : ''}`, 'aria-invalid': Boolean(error),
    className: 'ga-input mt-2 min-h-11 w-full min-w-0',
  }
  const placeholder = { program: 'e.g. Community Cash Assistance', barangay: 'e.g. San Nicolas', distribution: 'Enter the existing event title', serviceArea: 'e.g. Purok 2, or all scheduled service areas', location: 'e.g. Barangay Hall', title: 'Enter a short event title', messageTemplate: 'Write the reminder beneficiaries will receive' }[definition.key]
  return <form onSubmit={(event) => { event.preventDefault(); onSave(definition.key, input) }} className="border-t border-line p-5 sm:p-6">
    <label htmlFor="ai-task-detail" className="ga-label">{definition.label}</label>
    <p id="ai-task-detail-help" className="mt-1 text-sm leading-6 text-muted-copy">{translated(definition.question, language)}</p>
    {definition.options ? <select {...props}><option value="">Choose an option</option>{definition.options.map((option) => <option key={option} value={option}>{option.replaceAll('_', ' ').toLowerCase().replace(/^qr/, 'QR')}</option>)}</select>
      : definition.type === 'textarea' ? <textarea {...props} placeholder={placeholder} rows={3} maxLength={320} />
        : <input {...props} placeholder={placeholder} type={definition.type} maxLength={200} min={definition.type === 'number' ? 5 : undefined} max={definition.type === 'number' ? 720 : undefined} step={definition.type === 'number' ? 1 : undefined} />}
    {error && <p id="ai-task-detail-error" role="alert" className="mt-2 text-sm font-semibold text-brand-red">{error}</p>}
    <div className="mt-4 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">{onChatToggle ? <button type="button" onClick={onChatToggle} aria-expanded={chatOpen} className="inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm font-semibold text-brand-blue hover:bg-info-soft focus-visible:outline-2 focus-visible:outline-brand-blue"><Icon name={chatOpen ? 'enrollments' : 'helpCases'} className="size-4" />{chatOpen ? 'Use guided fields' : 'Use chat instead'}</button> : <p className="text-xs leading-5 text-muted-copy">You can also answer or ask for help in chat.</p>}<button type="submit" className="ga-btn-primary shrink-0">Keep this detail <Icon name="arrowRight" className="size-4" /></button></div>
  </form>
}

export default function AssistantTaskDetails({ task, editing, onEdit, onSave, onCancel, onPreview, language, error, busy, chatOpen, onChatToggle }) {
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
      <p className="mt-2 text-sm leading-6 text-muted-copy">{distribution ? 'Collect the program, service area and schedule for your draft.' : 'Choose an existing event, recipient area and SMS message.'}</p>
      <ol aria-label="Task stages" className="mt-5 hidden grid-cols-3 gap-2 border-y border-line py-3 sm:grid">{stages.map((stage, index) => <li key={stage} aria-current={index === 0 ? 'step' : undefined} className={`flex items-center gap-2 text-xs leading-5 ${index === 0 ? 'font-semibold text-brand-blue' : 'text-muted-copy'}`}><span aria-hidden="true" className={`grid size-6 shrink-0 place-items-center rounded-full ${index === 0 ? 'bg-brand-blue text-white' : 'border border-line'}`}>{index + 1}</span>{stage}</li>)}</ol>
      <div className="mt-4 flex items-center justify-between gap-3 text-xs text-muted-copy"><span>{active ? 'Collecting details' : 'Ready for review'}</span><span className="tabular-nums">{count} of {fields.length} details</span></div>
      <progress aria-label="Task details collected" max={fields.length} value={count} className="ga-assistant-task-progress mt-2 block h-1.5 w-full" />
    </div>
    <fieldset disabled={busy} className="min-w-0 border-0 p-0 disabled:opacity-60">
      <legend className="sr-only">Collected task details</legend>
      {count > 0 && <dl className="divide-y divide-line border-t border-line bg-slate-50/60">
        {[...fields, ...contextFields].filter((item) => task.values[item.key]).map((item) => <div key={item.key} className="flex items-start gap-2 px-4 py-2">
          <div className="min-w-0 flex-1"><dt className="text-xs font-semibold text-muted-copy">{item.label}</dt><dd className="mt-1 whitespace-pre-wrap text-sm font-semibold text-ink [overflow-wrap:anywhere]">{item.type === 'date' ? new Intl.DateTimeFormat('en-PH', { dateStyle: 'full', timeZone: 'Asia/Manila' }).format(new Date(`${task.values[item.key]}T00:00:00+08:00`)) : item.options ? task.values[item.key].replaceAll('_', ' ') : task.values[item.key]}</dd></div>
          <button type="button" onClick={() => onEdit(item.key)} aria-label={`Edit ${item.label}`} className="min-h-11 shrink-0 rounded-lg px-3 text-sm font-bold text-brand-blue hover:bg-info-soft focus-visible:outline-2 focus-visible:outline-brand-blue">Edit</button>
        </div>)}
      </dl>}
      {timingIssue && <p role="status" className="border-t border-line bg-warning-soft px-4 py-3 text-sm text-brand-amber">{timingIssue}</p>}
      {active ? <FieldEditor key={`${active.key}:${task.values[active.key] || ''}`} definition={active} value={task.values[active.key]} onSave={onSave} error={error} language={language} chatOpen={chatOpen} onChatToggle={onChatToggle} />
        : <div role="status" className="border-t border-line bg-info-soft p-4 text-sm leading-6 text-copy"><p className="font-bold text-ink">{timingIssue ? 'Check your time choices' : 'Details collected'}</p><p className="mt-1">These preferences still need an official preview. Nothing has been created or queued.</p>{error && <p className="mt-2 font-semibold text-brand-red">{error}</p>}</div>}
      <div className="border-t border-line px-5 py-4 sm:px-6">
        {onPreview && !active && !timingIssue && <button type="button" onClick={onPreview} disabled={busy} className="ga-btn-primary mb-3 w-full">Match records and preview</button>}
        <p className="flex items-start gap-2 text-xs leading-5 text-muted-copy"><Icon name="security" className="mt-0.5 size-4 shrink-0" /><span>{distribution ? 'You’ll review and confirm before a draft is saved.' : 'You’ll review recipients and confirm before any SMS is queued.'}</span></p>
        <details className="mt-2 text-xs leading-5 text-muted-copy"><summary className="min-h-6 cursor-pointer rounded-sm focus-visible:outline-2 focus-visible:outline-brand-blue">About these details</summary><p className="mt-1">Names and recipient scope are not yet verified. Dates use Philippine time. Details stay in this open session and clear on refresh or sign-out.</p></details>
        {!active && onChatToggle && <button type="button" onClick={onChatToggle} aria-expanded={chatOpen} className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm font-semibold text-brand-blue hover:bg-info-soft focus-visible:outline-2 focus-visible:outline-brand-blue"><Icon name="helpCases" className="size-4" />{chatOpen ? 'Use guided fields' : 'Use chat instead'}</button>}
        <button type="button" onClick={onCancel} className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm font-semibold text-copy hover:bg-page focus-visible:outline-2 focus-visible:outline-brand-blue"><Icon name="arrowLeft" className="size-4" />Cancel pending task</button>
      </div>
    </fieldset>
  </section>
}
