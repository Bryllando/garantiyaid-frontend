const field = (key, label, question, type = 'text', options) => ({ key, label, question, type, options })
const date = field('date', 'Date (PHT)', ['Which date? Use YYYY-MM-DD, today, or tomorrow.', 'Anong petsa? Gamitin ang YYYY-MM-DD, ngayon, o bukas.', 'Unsang petsa? Gamita ang YYYY-MM-DD, karon, o ugma.'], 'date')
const start = field('startTime', 'Start time (PHT)', ['What time should it start? Include AM or PM.', 'Anong oras magsisimula? Isama ang AM o PM.', 'Unsang orasa magsugod? Iapil ang AM o PM.'], 'time')
export const taskFields = {
  distributionDraft: [
    field('program', 'Program', ['Which assistance program?', 'Anong assistance program?', 'Unsang assistance program?']),
    field('barangay', 'Barangay', ['Which barangay?', 'Anong barangay?', 'Unsang barangay?']),
    date, start,
    field('endTime', 'End time (PHT)', ['What time should it end? Include AM or PM.', 'Anong oras matatapos? Isama ang AM o PM.', 'Unsang orasa mahuman? Iapil ang AM o PM.'], 'time'),
    field('location', 'Venue', ['Where will it take place?', 'Saan ito gaganapin?', 'Asa kini ipahigayon?']),
    field('slotDurationMinutes', 'Slot duration', ['How many minutes per slot? For example, 30 minutes.', 'Ilang minuto bawat slot? Halimbawa, 30 minutes.', 'Pila ka minuto matag slot? Pananglitan, 30 minutes.'], 'number'),
    field('deliveryMode', 'Assistance delivery', ['Will this release physical goods or use the simulated wallet?', 'Pisikal na ayuda ba ito o simulated wallet?', 'Pisikal nga ayuda ba kini o simulated wallet?'], 'select', ['PHYSICAL_GOODS', 'SIMULATED_WALLET']),
    field('verificationRequirement', 'Verification', ['Which verification method?', 'Anong verification method?', 'Unsang verification method?'], 'select', ['QR', 'BIOMETRIC', 'QR_OR_BIOMETRIC', 'QR_AND_BIOMETRIC', 'BIOMETRIC_AND_SIGNATURE']),
    field('title', 'Event title', ['What title should the event use?', 'Ano ang pamagat ng event?', 'Unsa ang titulo sa event?']),
  ],
  reminder: [
    field('distribution', 'Distribution event', ['Which existing distribution event?', 'Anong kasalukuyang distribution event?', 'Unsang kasamtangang distribution event?']),
    field('serviceArea', 'Recipient area', ['Which Sitio/Purok, or all scheduled service areas?', 'Anong Sitio/Purok, o lahat ng scheduled service areas?', 'Unsang Sitio/Purok, o tanang scheduled service areas?']),
    field('messageTemplate', 'Reminder message', ['What should the reminder say? Do not include personal records.', 'Ano ang mensahe? Huwag isama ang personal records.', 'Unsa ang mensahe? Ayaw iapil ang personal records.'], 'textarea'),
    field('deliveryMode', 'Queue timing', ['Queue now or schedule for later?', 'I-queue ngayon o sa ibang oras?', 'I-queue karon o sa ulahi?'], 'select', ['now', 'scheduled']),
    date,
    { ...start, label: 'Queue time (PHT)', question: ['What time should it be queued? Include AM or PM.', 'Anong oras ito i-queue? Isama ang AM o PM.', 'Unsang orasa kini i-queue? Iapil ang AM o PM.'] },
  ],
}

export const reminderContextFields = [field('program', 'Event program', ['Which program?', 'Anong programa?', 'Unsang programa?']), field('barangay', 'Event barangay', ['Which barangay?', 'Anong barangay?', 'Unsang barangay?']), { ...date, key: 'eventDate', label: 'Event date (PHT)' }, { ...start, key: 'eventTime', label: 'Event start time (PHT)' }]

export const detailCopy = {
  cancelled: ['Pending details cleared. No event or reminder was changed.', 'Na-clear ang mga detalye. Walang event o reminder na binago.', 'Na-clear ang mga detalye. Walay event o reminder nga giusab.'],
  complete: ['Your details are collected. Review the summary below. Nothing has been submitted; these preferences still need an official preview.', 'Kumpleto na ang mga detalye. Suriin ang buod sa ibaba. Wala pang naisumite; kailangan pa ang opisyal na preview.', 'Nakolekta na ang mga detalye. Ribyuha ang summary sa ubos. Wala pay gisumite; kinahanglan pa ang opisyal nga preview.'],
  switch: ['Keep or cancel the current task before starting another one.', 'Tapusin o kanselahin muna ang kasalukuyang gawain.', 'Humanon o kanselahon una ang kasamtangang buluhaton.'],
}
export const translated = (copy, language) => copy[{ en: 0, fil: 1, ceb: 2 }[language] ?? 0]
export const fieldsForTask = (task) => taskFields[task.kind].filter((item) => task.kind !== 'reminder' || task.values.deliveryMode === 'scheduled' || !['date', 'startTime'].includes(item.key))
export const nextTaskField = (task) => fieldsForTask(task).find((item) => !task.values[item.key] || item.key === 'distribution' && task.kind === 'reminder' && task.eventUnresolved)
export const isTaskCancellation = (text) => /^(?:(?:please|palihog)\s+)?(?:cancel(?: this| the| my)?(?: pending)?(?: task| draft| request)?|stop|never\s?mind|ayaw na|kanselahin|kanselaha)[.!\s]*$/i.test(text)
  || /^(?:do not|don['’]?t|ayaw|huwag|wag|dili|hindi)\s+(?:sa\s+|muna\s+)?(?:create|send|queue|make|himo|buhat|ipadala|gumawa)\b/i.test(text.trim())
export const isTaskQuestion = (text) => !/^(?:change\s+)?(?:venue|program|barangay|title|date|start|end|slots|delivery|verification|event|area|message|timing)\s*:/i.test(text.trim())
  && /\?|^(how|what|why|when|where|explain|show|check|unsa|unsaon|ngano|nganong|asa|paano|ano|bakit|ipaliwanag)\b/i.test(text.trim())

export function manilaDate(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now).map(part => [part.type, part.value]))
  return `${parts.year}-${parts.month}-${parts.day}`
}

function parseTime(value) {
  const text = value.trim().toLowerCase()
  if (text === 'noon') return '12:00'
  if (text === 'midnight') return '00:00'
  const match = text.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/)
  if (!match) return ''
  let hour = Number(match[1])
  const minute = Number(match[2] || 0)
  if (minute > 59 || (match[3] ? hour < 1 || hour > 12 : hour > 23 || !match[2])) return ''
  if (match[3]) hour = hour % 12 + (match[3] === 'pm' ? 12 : 0)
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

export function setTaskValue(task, key, input, now = new Date()) {
  const contextField = task.kind === 'reminder' && reminderContextFields.find(item => item.key === key)
  const definition = taskFields[task.kind].find((item) => item.key === key) || contextField
  if (!definition) return { task, error: 'Choose a field from the task summary.' }
  let value = input.trim()
  let error = ''
  if (definition.type === 'time') {
    value = parseTime(value)
    if (!value) error = 'Use an explicit time such as 9 AM, noon, or 14:30.'
  } else if (definition.type === 'date') {
    const relative = value.toLowerCase()
    if (['today', 'ngayon', 'karon', 'tomorrow', 'bukas', 'ugma'].includes(relative)) {
      value = manilaDate(new Date(now.getTime() + (['tomorrow', 'bukas', 'ugma'].includes(relative) ? 86400000 : 0)))
    }
    const parsed = new Date(`${value}T00:00:00Z`)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) error = 'Choose a valid date in YYYY-MM-DD format.'
    else if (value < manilaDate(now)) error = 'Choose today or a future date in Philippine time.'
  } else if (definition.type === 'number') {
    value = value.replace(/\s*(?:minutes?|mins?)$/i, '')
    if (!/^\d+$/.test(value) || Number(value) < 5 || Number(value) > 720) error = 'Use a whole number from 5 to 720 minutes.'
  } else if (definition.options) {
    value = value.toLowerCase().replace(/\s+and\s+|\s*\+\s*/g, '_and_').replace(/\s+/g, '_')
    if (key === 'deliveryMode' && task.kind === 'reminder') value = ({ later: 'scheduled', ngayon: 'now', karon: 'now', ulahi: 'scheduled' })[value] || value
    value = definition.options.find((option) => option.toLowerCase() === value) || ''
    if (!value) error = 'Choose one of the listed options.'
  } else if (!value || value.length > (key === 'messageTemplate' ? 320 : 200) || /<\/?[a-z][^>]*>/i.test(value)) {
    error = `Enter plain text, up to ${key === 'messageTemplate' ? 320 : 200} characters.`
  } else if (key === 'messageTemplate' && value.length < 10) error = 'Use at least 10 characters for the reminder.'
  if (error) return { task, error }
  const values = { ...task.values, [key]: value }
  if (['program', 'barangay', 'distribution'].includes(key)) delete values[`${key}Id`]
  if (task.kind === 'reminder' && ['program', 'barangay', 'eventDate', 'eventTime'].includes(key) && task.values[key] !== value) { delete values.distribution; delete values.distributionId }
  if (task.kind === 'reminder' && key === 'deliveryMode' && value === 'now') { delete values.date; delete values.startTime }
  return { task: { ...task, values, ...(task.kind === 'reminder' && key === 'distribution' ? { eventQuery: '' } : {}) }, error: '' }
}

export function taskTimingIssue(task) {
  const { startTime, endTime, slotDurationMinutes } = task.values
  if (task.kind !== 'distributionDraft' || !startTime || !endTime) return ''
  const minutes = (time) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3))
  const duration = minutes(endTime) - minutes(startTime)
  if (duration <= 0) return 'End time must follow start time on the same day. Edit the times below.'
  if (slotDurationMinutes && duration % Number(slotDurationMinutes) !== 0) return 'The event window must divide evenly into the slot duration. Edit the times or slot duration.'
  return ''
}

// ponytail: accept labelled details and explicit dates/times; do not guess names
// or ambiguous prose. The focused field editor is the fallback, not another model.
export function collectTaskDetails(task, text, { key, initial = false, replace = false, now = new Date() } = {}) {
  if (task.kind === 'reminder') return collectReminderDetails(task, text, { key, initial, replace, now })
  let result = { task, error: '' }
  let extracted = false
  const assign = (fieldKey, value) => {
    const next = setTaskValue(result.task, fieldKey, value, now)
    result = { task: next.task, error: result.error || next.error }
    extracted = true
  }
  const aliases = { venue: 'location', program: 'program', barangay: 'barangay', title: 'title', date: 'date', start: 'startTime', end: 'endTime', slots: 'slotDurationMinutes', delivery: 'deliveryMode', verification: 'verificationRequirement', event: 'distribution', area: 'serviceArea', message: 'messageTemplate', timing: 'deliveryMode' }
  const labelled = [...text.matchAll(/(?:^|[;\n])\s*(?:change\s+)?(venue|program|barangay|title|date|start|end|slots|delivery|verification|event|area|message|timing)\s*:\s*([^;\n]+)/gi)]
  for (const match of labelled) {
    const alias = match[1].toLowerCase()
    if ((alias === 'delivery' && task.kind === 'reminder') || (alias === 'timing' && task.kind !== 'reminder')) continue
    assign(aliases[alias], match[2])
  }
  if (!labelled.length && (initial || !key || ['date', 'startTime', 'endTime'].includes(key))) {
    const dates = text.match(/\b(?:\d{4}-\d{2}-\d{2}|tomorrow|today|ugma|karon|bukas|ngayon)\b/gi) || []
    if (dates.length === 1) assign('date', dates[0])
    const times = text.match(/\b(?:\d{1,2}(?::\d{2})?\s*(?:am|pm)|\d{1,2}:\d{2}|noon|midnight)\b/gi) || []
    const ambiguous = dates.length > 1 || times.length > (task.kind === 'reminder' ? 1 : 2) || /\bor\b/i.test(text)
    if (!ambiguous) times.forEach((time, index) => assign(index === 1 || key === 'endTime' ? 'endTime' : 'startTime', time))
    if (ambiguous) { result = { task, error: 'There is more than one possible schedule. Use the field editor to choose the exact date and times.' }; extracted = true }
    if (!ambiguous && task.kind === 'reminder' && extracted && (dates.length || times.length)) assign('deliveryMode', 'scheduled')
  }
  if (!extracted && !initial && key && !isTaskQuestion(text) && !/^(yes|no|ok|okay|approve|confirm|continue|sige|oo)[.!\s]*$/i.test(text)) assign(key, text)
  if (!extracted && !initial && !result.error) result.error = 'Please answer the current question or use the field editor below. Nothing has been submitted.'
  return result
}

function collectReminderDetails(task, text, { key, initial, replace, now }) {
  const clean = text.trim().replace(/[.!]+$/, '')
  if (isTaskCancellation(clean)) return { task, error: 'Cancel the pending task before continuing. Nothing has been queued.' }
  if (/\b(push|mobile notification|app notification)\b/i.test(clean)) return { task, error: 'Mobile push delivery is unavailable. No notification was sent. Choose SMS to continue with this reminder.' }
  if (/^(?:kanang event nga atong gihisgutan|that event|the event we discussed|same event|iyon ding event)[.!\s]*$/i.test(text)) return { task, error: task.values.distributionId ? '' : 'Choose one exact existing event first. No event has been confirmed yet.' }
  let result = { task, error: '' }, extracted = false
  const explicitChange = replace || /^(?:change|instead|ilisan|palitan)\b/i.test(clean)
  const assign = (name, value) => {
    const next = setTaskValue(result.task, name, value, now)
    const previous = task.values[name]
    const sameName = previous && ['program', 'barangay', 'distribution', 'serviceArea'].includes(name) && next.task.values[name]?.normalize('NFKC').toLowerCase() === previous.normalize('NFKC').toLowerCase()
    if (sameName) { extracted = true; return }
    if (previous && next.task.values[name] !== previous && !explicitChange) {
      result.error ||= `${name}: already set to ${previous}. Use Edit or "change ${name}: ..." to replace it.`
    } else result = { task: next.task, error: result.error || next.error }
    extracted = true
  }
  const aliases = { program: 'program', barangay: 'barangay', event: 'distribution', area: 'serviceArea', message: 'messageTemplate', timing: 'deliveryMode', date: 'date', start: 'startTime', 'event date': 'eventDate', 'event time': 'eventTime' }
  const labelled = [...clean.matchAll(/(?:^|[;\n])\s*(?:change\s+)?(program|barangay|event date|event time|event|area|message|timing|date|start)\s*:\s*([^;\n]+)/gi)]
  for (const match of labelled) assign(aliases[match[1].toLowerCase()], match[2])
  if (!labelled.length) {
    if (replace && key) return setTaskValue(task, key, clean, now)
    if (key === 'deliveryMode' && /^(?:now|karon|ngayon)$/i.test(clean)) return setTaskValue(task, key, 'now', now)
    if (/^(?:sms(?: only| lang| lamang)?|text only)$/i.test(clean)) { extracted = true; result.task = { ...task, values: { ...task.values, channel: 'SMS' } } }
    // A distribution time is a lookup constraint; only explicit queue/send timing changes delivery time.
    const queueTiming = /^(?:schedule (?:an? )?(?:sms|reminder)|(?:queue|send|ipadala|i-queue).{0,15}(?:sms|reminder).{0,15}(?:at|on|tomorrow|today|ugma|bukas))\b/i.test(clean) || ['date', 'startTime'].includes(key)
    const shortTiming = /^(?:(?:karon|today|ngayon|ugma|tomorrow|bukas|\d{4}-\d{2}-\d{2})[,\s]*(?:(?:at|sa)\s*)?)?(?:\d{1,2}(?::\d{2})?\s*(?:am|pm)|\d{1,2}:\d{2}|noon|midnight)?$/i.test(clean)
    if (key === 'messageTemplate' && !initial && !extracted && !isTaskQuestion(clean) && !/^(?:yes|no|ok|okay|approve|confirm|continue|sige|oo)$/i.test(clean) && !shortTiming && !/^(?:sa|in|barangay)\s+/i.test(clean) && !queueTiming) return setTaskValue(task, key, text.trim(), now)
    const dates = clean.match(/\b(?:\d{4}-\d{2}-\d{2}|tomorrow|today|ugma|karon|bukas|ngayon)\b/gi) || []
    const times = clean.match(/\b(?:\d{1,2}(?::\d{2})?\s*(?:am|pm)|\d{1,2}:\d{2}|noon|midnight)\b/gi) || []
    if (dates.length > 1 || times.length > 1 || /\bor\b/i.test(clean) && (dates.length || times.length)) return { task, error: 'Choose one date and time in Philippine time. Nothing has changed.' }
    if (dates.length) assign(queueTiming ? 'date' : 'eventDate', dates[0])
    if (times.length) assign(queueTiming ? 'startTime' : 'eventTime', times[0])
    if (queueTiming && (dates.length || times.length)) assign('deliveryMode', 'scheduled')
    else if (/^(now|queue now|ipadala karon|ngayon)$/i.test(clean)) assign('deliveryMode', 'now')
    const request = clean.replace(/^(?:(?:hello|hi|palihog|please|paki)[,\s]+)*/i, '')
    // shortcut: named program/area patterns are conservative; other names use the existing exact field editor.
    const named = request.match(/^(?:pahinumdomi|pahinumdumi|pahibaloa|paalalahanan|abisuhan|send reminders?|remind|notify|i-notify)[\s\S]*?(?:\bsa|\bfor|\bng)\s+(?:the\s+)?(.+?)\s+(?:sa|in|at)\s+(?:barangay\s+)?(.+?)(?:\s+distribution)?$/i)
    if (named) {
      const place = named[2].replace(/\s+(?:(?:today|tomorrow|karon|ugma|ngayon|bukas|\d{4}-\d{2}-\d{2})\b|(?:at\s+)?\d{1,2}(?::\d{2})?\s*(?:am|pm)\b)[\s\S]*$/i, '')
      assign('program', named[1]); assign('barangay', place)
    }
    else if (/^(?:sa|in|barangay)\s+[^;\n]+$/i.test(clean) && !dates.length && !times.length) assign('barangay', clean.replace(/^(?:sa|in|barangay)\s+(?:barangay\s+)?/i, ''))
    if (!extracted && !initial && key && !isTaskQuestion(clean) && !/^(?:yes|no|ok|okay|approve|confirm|continue|sige|oo)[.!\s]*$/i.test(clean)) assign(key, clean)
  }
  if (result.error) return { task, error: result.error }
  if (!extracted && !initial) return { task, error: 'Please answer the current question or use Edit. Nothing has been submitted.' }
  if (initial && clean && !result.task.values.distributionId) result.task = { ...result.task, eventQuery: clean }
  return result
}

export function taskReply(task, language) {
  const next = nextTaskField(task)
  return next ? translated(next.question, language) : taskTimingIssue(task) || translated(detailCopy.complete, language)
}
