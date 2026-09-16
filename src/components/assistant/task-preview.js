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
    location: values.location, verificationRequirement: values.verificationRequirement,
  }
}

export const UNRESOLVED_AREA = '__choose_area__'
export function resolveServiceArea(text, areas) {
  if (/^(all|all scheduled service areas|all service areas|lahat|tanan)$/i.test(text.trim())) return ''
  return uniqueMatch(areas.map((area) => ({ area })), text, ['area'])?.area || UNRESOLVED_AREA
}

export function reminderFormFromTask(values, distributions) {
  return {
    distributionId: uniqueMatch(distributions, values.distributionId || values.distribution, ['distributionId', 'title'])?.distributionId || '',
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
