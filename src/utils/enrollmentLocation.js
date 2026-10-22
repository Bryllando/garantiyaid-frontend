export function readEnrollmentLocation(search = '') {
  const params = new URLSearchParams(search)
  const page = Number(params.get('page'))
  return {
    filters: { search: params.get('search') || '', status: params.get('status') || '', programId: params.get('programId') || '' },
    page: Number.isSafeInteger(page) && page > 0 ? page : 1,
    selectedId: params.get('enrollment') || '',
  }
}

export function enrollmentLocation({ filters, page = 1, selectedId = '' }) {
  const params = new URLSearchParams()
  for (const key of ['search', 'status', 'programId']) if (filters[key]) params.set(key, filters[key])
  if (page > 1) params.set('page', String(page))
  if (selectedId) params.set('enrollment', selectedId)
  return `/enrollments${params.size ? `?${params}` : ''}`
}
