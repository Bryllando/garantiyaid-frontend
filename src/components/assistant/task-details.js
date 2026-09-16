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
    field('verificationRequirement', 'Verification', ['Which verification method?', 'Anong verification method?', 'Unsang verification method?'], 'select', ['QR', 'BIOMETRIC', 'QR_AND_BIOMETRIC', 'BIOMETRIC_AND_SIGNATURE']),
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

export const detailCopy = {
  cancelled: ['Pending details cleared. No event or reminder was changed.', 'Na-clear ang mga detalye. Walang event o reminder na binago.', 'Na-clear ang mga detalye. Walay event o reminder nga giusab.'],
  complete: ['Your details are collected. Review the summary below. Nothing has been submitted; these preferences still need an official preview.', 'Kumpleto na ang mga detalye. Suriin ang buod sa ibaba. Wala pang naisumite; kailangan pa ang opisyal na preview.', 'Nakolekta na ang mga detalye. Ribyuha ang summary sa ubos. Wala pay gisumite; kinahanglan pa ang opisyal nga preview.'],
  switch: ['Keep or cancel the current task before starting another one.', 'Tapusin o kanselahin muna ang kasalukuyang gawain.', 'Humanon o kanselahon una ang kasamtangang buluhaton.'],
}
export const translated = (copy, language) => copy[{ en: 0, fil: 1, ceb: 2 }[language] ?? 0]
export const fieldsForTask = (task) => taskFields[task.kind].filter((item) => task.kind !== 'reminder' || task.values.deliveryMode === 'scheduled' || !['date', 'startTime'].includes(item.key))
export const nextTaskField = (task) => fieldsForTask(task).find((item) => !task.values[item.key])
export const isTaskCancellation = (text) => /^(?:(?:please|palihog)\s+)?(?:cancel(?: this| the| my)?(?: pending)?(?: task| draft| request)?|stop|never\s?mind|ayaw na|kanselahin|kanselaha)[.!\s]*$/i.test(text)
  || /^(?:do not|don['’]?t|ayaw|huwag|wag|dili|hindi)\s+(?:create|send|queue|make|himo|buhat|ipadala|gumawa)\b/i.test(text.trim())
export const isTaskQuestion = (text) => !/^(?:change\s+)?(?:venue|program|barangay|title|date|start|end|slots|verification|event|area|message|timing)\s*:/i.test(text.trim())
  && /\?|^(how|what|why|when|where|explain|show|check|unsa|ngano|asa|paano|ano|bakit|ipaliwanag)\b/i.test(text.trim())

export function manilaDate(now = new Date()) {
  return new Date(now.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10)
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
  const definition = taskFields[task.kind].find((item) => item.key === key)
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
    if (key === 'deliveryMode') value = ({ later: 'scheduled', ngayon: 'now', karon: 'now', ulahi: 'scheduled' })[value] || value
    value = definition.options.find((option) => option.toLowerCase() === value) || ''
    if (!value) error = 'Choose one of the listed options.'
  } else if (!value || value.length > (key === 'messageTemplate' ? 320 : 200) || /<\/?[a-z][^>]*>/i.test(value)) {
    error = `Enter plain text, up to ${key === 'messageTemplate' ? 320 : 200} characters.`
  } else if (key === 'messageTemplate' && value.length < 10) error = 'Use at least 10 characters for the reminder.'
  if (error) return { task, error }
  const values = { ...task.values, [key]: value }
  if (['program', 'barangay', 'distribution'].includes(key)) delete values[`${key}Id`]
  if (key === 'deliveryMode' && value === 'now') { delete values.date; delete values.startTime }
  return { task: { ...task, values }, error: '' }
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
export function collectTaskDetails(task, text, { key, initial = false, now = new Date() } = {}) {
  let result = { task, error: '' }
  let extracted = false
  const assign = (fieldKey, value) => {
    const next = setTaskValue(result.task, fieldKey, value, now)
    result = { task: next.task, error: result.error || next.error }
    extracted = true
  }
  const aliases = { venue: 'location', program: 'program', barangay: 'barangay', title: 'title', date: 'date', start: 'startTime', end: 'endTime', slots: 'slotDurationMinutes', verification: 'verificationRequirement', event: 'distribution', area: 'serviceArea', message: 'messageTemplate', timing: 'deliveryMode' }
  const labelled = [...text.matchAll(/(?:^|[;\n])\s*(?:change\s+)?(venue|program|barangay|title|date|start|end|slots|verification|event|area|message|timing)\s*:\s*([^;\n]+)/gi)]
  for (const match of labelled) assign(aliases[match[1].toLowerCase()], match[2])
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

export function taskReply(task, language) {
  const next = nextTaskField(task)
  return next ? translated(next.question, language) : taskTimingIssue(task) || translated(detailCopy.complete, language)
}
