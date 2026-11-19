export const reportTypes = [
  ['SUMMARY', 'Distribution summary'],
  ['CLAIMS', 'Claim status'],
  ['SCHEDULES', 'Queue schedules'],
  ['ANOMALIES', 'Anomaly review'],
  ['FUNDS', 'Simulated fund utilization'],
]
export const reportQuestions = {
  SUMMARY: 'What happened at this distribution event?',
  CLAIMS: 'Which claims have a recorded completion?',
  SCHEDULES: 'Who was scheduled, checked in, or marked missed?',
  ANOMALIES: 'Which recorded exceptions need a closer look?',
  FUNDS: 'How much of the simulated allocation remains?',
}
export const reportStatuses = {
  CLAIMS: ['PENDING', 'VERIFIED', 'CLAIMED', 'REJECTED', 'VOIDED'],
  SCHEDULES: ['SCHEDULED', 'CHECKED_IN', 'MISSED', 'CANCELLED'],
  FUNDS: ['DRAFT', 'OPEN', 'CLOSED', 'CANCELLED'],
}
export const reportDateHelp = {
  CLAIMS: 'Dates refer to claim record creation, in Philippine time.',
  SCHEDULES: 'Dates refer to schedule record creation, in Philippine time.',
  ANOMALIES: 'Dates refer to when exceptions were recorded, in Philippine time.',
  FUNDS: 'Dates refer to distribution event dates.',
}
const validDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value || '') && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().startsWith(value)

export function readReportScope(search) {
  const params = new URLSearchParams(search)
  const type = reportTypes.some(([value]) => value === params.get('report')) ? params.get('report') : 'SUMMARY'
  return {
    type,
    distributionId: (params.get('distribution') || '').slice(0, 100),
    status: reportStatuses[type]?.includes(params.get('status')) ? params.get('status') : '',
    dateFrom: type !== 'SUMMARY' && validDate(params.get('dateFrom')) ? params.get('dateFrom') : '',
    dateTo: type !== 'SUMMARY' && validDate(params.get('dateTo')) ? params.get('dateTo') : '',
  }
}

export function reportLocation(scope, search = '') {
  const params = new URLSearchParams(search)
  for (const [key, value] of Object.entries({ report: scope.type === 'SUMMARY' ? '' : scope.type, distribution: scope.distributionId, status: scope.status, dateFrom: scope.dateFrom, dateTo: scope.dateTo })) {
    if (value) params.set(key, value)
    else params.delete(key)
  }
  return `/reports${params.size ? `?${params}` : ''}`
}
