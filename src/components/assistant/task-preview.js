const normalized = (value) => String(value || '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase()

export function uniqueMatch(rows, text, keys) {
  if (!normalized(text)) return undefined
  const matches = rows.filter((row) => keys.some((key) => normalized(row[key]) === normalized(text)))
  return matches.length === 1 ? matches[0] : undefined
}

export async function allPages(request, key) {
  const rows = []
  for (let page = 1; ; page += 1) {
    const result = await request({ page, pageSize: 100 })
    const pages = result.pagination?.totalPages
    if (!Array.isArray(result[key]) || !Number.isInteger(pages) || pages < 0) throw new Error('The server returned an incomplete lookup. Please retry.')
    rows.push(...result[key])
    if (page >= pages) return rows
    if (!result[key].length) throw new Error('The lookup changed while loading. Please retry.')
  }
}

export function distributionFormFromTask(values, programs, barangays) {
  return {
    programId: uniqueMatch(programs, values.programId || values.program, ['programId', 'programName', 'programCode'])?.programId || '',
    barangayId: uniqueMatch(barangays, values.barangayId || values.barangay, ['barangayId', 'barangayName'])?.barangayId || '',
    title: values.title, distributionDate: values.date, startTime: values.startTime,
    endTime: values.endTime, slotDurationMinutes: values.slotDurationMinutes,
    location: values.location, deliveryMode: values.deliveryMode || 'PHYSICAL_GOODS', verificationRequirement: values.verificationRequirement,
  }
}

export const UNRESOLVED_AREA = '__choose_area__'
const phrase = (value) => normalized(value).replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
const mentioned = (text, value) => Boolean(value && ` ${phrase(text)} `.includes(` ${phrase(value)} `))

export function reminderEventMatches(values, distributions, query = '') {
  const rows = distributions.filter(row => ['DRAFT', 'OPEN'].includes(row.status))
  const programMentioned = row => [row.program?.programName, row.program?.programCode].some(value => mentioned(query, value))
  const barangayMentioned = row => mentioned(query, row.barangay?.barangayName)
  const queryProgram = rows.some(programMentioned)
  const queryBarangay = rows.some(barangayMentioned)
  const hasName = values.distributionId || values.distribution || values.program || values.barangay
  return rows.filter(row => {
    const programs = [row.program?.programName, row.program?.programCode]
    const inferredProgram = programs.some(value => mentioned(query, value))
    const inferredBarangay = mentioned(query, row.barangay?.barangayName)
    if (!hasName && !(inferredProgram && inferredBarangay) && !mentioned(query, row.title)) return false
    if (values.distributionId && row.distributionId !== values.distributionId) return false
    if (!values.distributionId && values.distribution && ![row.distributionId, row.title].some(value => normalized(value) === normalized(values.distribution))) return false
    if (values.program && !programs.some(value => normalized(value) === normalized(values.program))) return false
    if (values.barangay && normalized(row.barangay?.barangayName) !== normalized(values.barangay)) return false
    if (!values.distributionId && !values.program && queryProgram && !inferredProgram) return false
    if (!values.distributionId && !values.barangay && queryBarangay && !inferredBarangay) return false
    if (values.eventDate && row.distributionDate !== values.eventDate) return false
    if (values.eventTime && row.startTime !== values.eventTime) return false
    return true
  })
}

export function selectReminderEvent(task, row) {
  return { ...task, eventUnresolved: false, values: { ...task.values, distribution: row.title, distributionId: row.distributionId, program: row.program?.programCode || row.program?.programName || task.values.program, barangay: row.barangay?.barangayName || task.values.barangay, eventDate: row.distributionDate || task.values.eventDate, eventTime: row.startTime || task.values.eventTime } }
}
export function resolveServiceArea(text, areas) {
  if (/^(all|all scheduled service areas|all service areas|lahat|tanan)$/i.test(text.trim())) return ''
  return uniqueMatch(areas.map((area) => ({ area })), text, ['area'])?.area || UNRESOLVED_AREA
}

export function reminderFormFromTask(values, distributions) {
  const candidates = reminderEventMatches(values, distributions)
  return {
    distributionId: candidates.length === 1 ? candidates[0].distributionId : '',
    serviceArea: UNRESOLVED_AREA,
    messageTemplate: values.messageTemplate,
    deliveryMode: values.deliveryMode,
    sendAt: values.deliveryMode === 'scheduled' ? `${values.date}T${values.startTime}` : '',
  }
}

export function reminderRequest(form) {
  if (form.serviceArea === UNRESOLVED_AREA) throw new Error('Choose the intended Sitio/Purok or explicitly select all scheduled service areas.')
  const payload = { messageTemplate: form.messageTemplate.trim(), ...(form.serviceArea ? { serviceArea: form.serviceArea } : {}) }
  if (form.deliveryMode === 'scheduled') {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(form.sendAt)) throw new Error('Choose a valid date and time in Philippine time.')
    const instant = new Date(`${form.sendAt}:00+08:00`)
    if (Number.isNaN(instant.getTime()) || new Date(instant.getTime() + 28800000).toISOString().slice(0, 16) !== form.sendAt) throw new Error('Choose a valid date and time in Philippine time.')
    payload.sendAt = instant.toISOString()
  }
  // Omitting sendAt for "now" uses the backend clock, including during preview.
  return payload
}

export function formatPreviewTime(value) {
  return new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'full', timeStyle: 'short' }).format(new Date(value)) + ' PHT'
}
