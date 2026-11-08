const statuses = ['OPEN', 'DRAFT', 'CLOSED', 'CANCELLED', 'ALL']
const validDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value || '') && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().startsWith(value)

export function readMonitoringLocation(search) {
  const params = new URLSearchParams(search)
  const page = Number(params.get('page'))
  return {
    search: (params.get('search') || '').trim().slice(0, 100),
    status: statuses.includes(params.get('status')) ? params.get('status') : 'OPEN',
    dateFrom: validDate(params.get('dateFrom')) ? params.get('dateFrom') : '',
    dateTo: validDate(params.get('dateTo')) ? params.get('dateTo') : '',
    page: Number.isSafeInteger(page) && page > 0 ? page : 1,
    distribution: (params.get('distribution') || '').slice(0, 100),
  }
}

export function monitoringLocation(query) {
  const params = new URLSearchParams()
  for (const key of ['status', 'search', 'dateFrom', 'dateTo', 'distribution']) if (query[key]) params.set(key, query[key])
  if (query.page > 1) params.set('page', String(query.page))
  return `/dswd/live-dashboard${params.size ? `?${params}` : ''}`
}

export function monitoringReturnPath(search) {
  const value = new URLSearchParams(search).get('monitorFrom') || ''
  if (value !== '/dswd/live-dashboard' && !value.startsWith('/dswd/live-dashboard?')) return ''
  return monitoringLocation(readMonitoringLocation(value.split('?')[1] || ''))
}

export function monitoringActionHref(href, query) {
  return `${href}${href.includes('?') ? '&' : '?'}monitorFrom=${encodeURIComponent(monitoringLocation(query))}`
}
