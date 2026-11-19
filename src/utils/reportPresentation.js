import { reportDateHelp, reportStatuses, reportTypes } from './reportScope.js'

const numbers = new Intl.NumberFormat('en-PH')
const money = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' })
const dates = new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Manila' })
export const reportLabel = type => reportTypes.find(([key]) => key === type)?.[1] ?? 'Report'
export const humanizeReportValue = value => value ? String(value).toLowerCase().replaceAll('_', ' ').replace(/^./, character => character.toUpperCase()).replace(/\bQr\b/g, 'QR') : 'Not recorded'
export const formatReportNumber = value => value == null || value === '' || !Number.isFinite(Number(value)) ? 'Unavailable' : numbers.format(value)
export const formatReportMoney = value => value == null || value === '' || !Number.isFinite(Number(value)) ? 'Unavailable' : money.format(value)
export function formatReportDate(value) {
  if (!value) return 'Not recorded'
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? String(value) : `${dates.format(parsed)} PHT`
}
const percent = value => value == null || !Number.isFinite(Number(value)) ? 'Unavailable' : `${formatReportNumber(value)}%`
const text = value => value == null || value === '' ? 'Not recorded' : String(value)
const statusCoverageNotice = 'Status totals cover all statuses within the date range. Matching records below follow your selected status.'
const countStatus = (counts, status) => counts ? (Object.hasOwn(counts, status) ? counts[status] : 0) : undefined

export function reportFinding(scope, data) {
  if (scope.type === 'FUNDS') {
    const remaining = formatReportMoney(data.totals?.remainingAmount)
    return remaining === 'Unavailable' ? 'The remaining simulated allocation is unavailable.' : `${remaining} remains in the simulated allocation.`
  }
  const [count, singular, plural] = {
    SUMMARY: [data.beneficiaries?.claimedCount, 'completed claim', 'completed claims'],
    CLAIMS: [data.summary?.matchingClaimCount, 'matching claim', 'matching claims'],
    SCHEDULES: [data.summary?.matchingScheduleCount, 'matching schedule', 'matching schedules'],
    ANOMALIES: [data.summary?.total, 'recorded exception', 'recorded exceptions'],
  }[scope.type]
  if (formatReportNumber(count) === 'Unavailable') return 'The record count is unavailable.'
  if (scope.type === 'SCHEDULES' && scope.status === 'MISSED') {
    return Number(count) === 1 ? '1 schedule was marked missed.' : `${formatReportNumber(count)} schedules were marked missed.`
  }
  if (scope.type === 'CLAIMS' && scope.status) {
    const status = humanizeReportValue(scope.status).toLowerCase()
    return Number(count) === 1 ? `1 claim is marked ${status}.` : `${formatReportNumber(count)} claims are marked ${status}.`
  }
  const label = Number(count) === 1 ? singular : plural
  const status = scope.status ? ` with status “${humanizeReportValue(scope.status)}”` : ''
  return `${formatReportNumber(count)} ${label}${status}.`
}

function assistanceRecord(row) {
  if (row.deliveryMode !== 'PHYSICAL_GOODS') return row.claimedAt ? `${formatReportDate(row.claimedAt)}\nSimulated wallet credit` : 'Not recorded'
  if (!row.releasedAt) return 'Not recorded'
  return `${formatReportDate(row.releasedAt)}\n${row.releasedBy?.fullName ?? 'Staff not recorded'}\n${row.releaseEvidenceReference ?? 'No evidence reference'}`
}

export function reportDefinition(type, data, report = {}) {
  if (type === 'SUMMARY') return {
    metrics: [
      ['Allocated beneficiaries', formatReportNumber(data.beneficiaries.allocatedCount)],
      ['Completed claims', formatReportNumber(data.beneficiaries.claimedCount)],
      ['Claim completion', percent(data.beneficiaries.claimCompletionPercentage)],
      ['Queue utilization', percent(data.slots.capacityUtilizationPercentage)],
      ['Exceptions for review', formatReportNumber(report.supportingReports?.ANOMALIES?.data.summary.total)],
      ...(data.physicalPackage ? [
        ['Recorded handovers', formatReportNumber(data.physicalPackage.handoverCount)],
        ['Recorded package units', `${formatReportNumber(data.physicalPackage.recordedQuantity)} ${data.physicalPackage.unit ?? 'known units'}`],
        ['Units on voided claims', formatReportNumber(data.physicalPackage.voidedClaimQuantity)],
        ['Handovers without quantity', formatReportNumber(data.physicalPackage.quantityNotRecordedCount)],
      ] : []),
    ],
    notice: data.distribution.deliveryMode === 'PHYSICAL_GOODS'
      ? 'Physical assistance release; wallet credits are not required. Recorded handovers and quantities include voided claims. Voiding does not record returned goods.'
      : `Simulated net credited is ${formatReportMoney(data.fundUtilization?.netCreditedAmount)}. No real funds are transferred.`,
  }
  if (type === 'CLAIMS') return {
    metrics: [['Matching claims', formatReportNumber(data.summary?.matchingClaimCount)], ['Claimed', formatReportNumber(countStatus(data.summary?.statusCounts, 'CLAIMED'))], ['Verified', formatReportNumber(countStatus(data.summary?.statusCounts, 'VERIFIED'))], ['Rejected or voided', formatReportNumber(data.summary?.statusCounts ? (data.summary.statusCounts.REJECTED ?? 0) + (data.summary.statusCounts.VOIDED ?? 0) : undefined)]],
    notice: report.coverage?.status ? statusCoverageNotice : undefined,
    rows: data.claims,
    columns: [
      ['Recorded', row => formatReportDate(row.recordedAt)],
      ['Beneficiary / queue', row => `${text(row.beneficiaryName)}\nQueue ${text(row.queueNumber)}`],
      ['Verification', row => humanizeReportValue(row.verificationMethod)],
      ['Delivery', row => humanizeReportValue(row.deliveryMode)],
      ['Assistance recorded / staff', assistanceRecord],
      ['Package handed over', row => row.releasedQuantity != null ? `${text(row.releasedPackageName)}: ${row.releasedQuantity} ${text(row.releasedPackageUnit)}` : row.deliveryMode === 'PHYSICAL_GOODS' ? 'Quantity not recorded' : 'Not applicable'],
      ['Allocation (PHP)', row => formatReportMoney(row.allocatedAmount)],
      ['Status', row => humanizeReportValue(row.claimStatus)],
    ],
    widths: [28, 43, 27, 30, 43, 43, 28, 27],
  }
  if (type === 'SCHEDULES') return {
    metrics: [['Matching schedules', formatReportNumber(data.summary?.matchingScheduleCount)], ['Scheduled', formatReportNumber(countStatus(data.summary?.statusCounts, 'SCHEDULED'))], ['Checked in', formatReportNumber(countStatus(data.summary?.statusCounts, 'CHECKED_IN'))], ['Missed', formatReportNumber(countStatus(data.summary?.statusCounts, 'MISSED'))]],
    notice: report.coverage?.status ? statusCoverageNotice : undefined,
    rows: data.schedules,
    columns: [['Slot / session', row => `${formatReportDate(row.slotStart)}\n${text(row.sessionLabel)}`], ['Beneficiary / queue', row => `${text(row.beneficiaryName)}\nQueue ${text(row.queueNumber)}`], ['Assignment', row => row.assignedByAi ? 'Automated rules' : 'Staff assigned'], ['Schedule', row => humanizeReportValue(row.scheduleStatus)], ['Claim', row => row.claimStatus ? humanizeReportValue(row.claimStatus) : 'No claim']],
  }
  if (type === 'ANOMALIES') return {
    metrics: [['Total anomalies', formatReportNumber(data.summary.total)], ['QR anomalies', formatReportNumber(data.summary.qrAnomalyCount)], ['Biometric anomalies', formatReportNumber(data.summary.biometricAnomalyCount)], ['Duplicate claim flags', formatReportNumber(data.summary.duplicateClaimFlagCount)], ['Transaction anomalies', formatReportNumber(data.summary.transactionAnomalyCount)]],
    rows: data.anomalies,
    columns: [['Occurred', row => formatReportDate(row.occurredAt)], ['Category', row => humanizeReportValue(row.category)], ['Result', row => humanizeReportValue(row.result)], ['Severity', row => humanizeReportValue(row.severity)], ['Reference', row => text(row.anomalyId)]],
    notice: 'Counts describe exception records. Retries, duplicate flags, and completed reversals may appear. Review each record and its outcome.',
  }
  return {
    metrics: [['Allocated', formatReportMoney(data.totals.allocatedAmount)], ['Net simulated credit', formatReportMoney(data.totals.netCreditedAmount)], ['Remaining', formatReportMoney(data.totals.remainingAmount)], ['Real funds moved', 'No']],
    rows: data.distributions,
    columns: [['Distribution', row => text(row.distribution.title)], ['Event date', row => text(row.distribution.distributionDate)], ['Program / barangay', row => `${row.distribution.program?.programCode ?? 'Not recorded'}\n${row.distribution.barangay?.barangayName ?? 'Not recorded'}`], ['Allocated', row => formatReportMoney(row.utilization.allocatedAmount)], ['Net credited', row => formatReportMoney(row.utilization.netCreditedAmount)], ['Remaining', row => formatReportMoney(row.utilization.remainingAmount)]],
    notice: 'Amounts describe the closed-loop prototype ledger. No real funds are transferred. Totals include all matching events.',
  }
}

export function reportCoverage(scope, event) {
  return [
    ['Event', event?.title || 'All authorized distributions'],
    ['Program / barangay', event ? `${event.program?.programName ?? 'Not recorded'} / ${event.barangay?.barangayName ?? 'Not recorded'}` : 'All authorized programs and barangays'],
    ['Date coverage', scope.type === 'SUMMARY' || (!scope.dateFrom && !scope.dateTo) ? 'All dates' : `${scope.dateFrom || 'Start of records'} to ${scope.dateTo || 'Latest records'}`],
    ['Status coverage', scope.status ? humanizeReportValue(scope.status) : 'All statuses'],
  ]
}

export function orderedReportFacts(report) {
  const highlights = report.aiExplanation?.highlights ?? []
  const selected = new Set(highlights.map(fact => fact.id))
  return [...highlights, ...(report.facts ?? []).filter(fact => !selected.has(fact.id))]
}

const calendarDate = new Intl.DateTimeFormat('en-GB', { dateStyle: 'long', timeZone: 'UTC' })
const simulationNote = 'All amounts come from the prototype’s simulated ledger.'

function explanationDates({ dateFrom, dateTo }) {
  const start = dateFrom && new Date(dateFrom)
  const end = dateTo && new Date(dateTo)
  if (start && end) return calendarDate.formatRange(start, end).replace(/\s*–\s*/g, '–')
  if (start) return `From ${calendarDate.format(start)}`
  if (end) return `Through ${calendarDate.format(end)}`
  return 'All dates'
}

export function reportExplanation({ report, scope, event }) {
  const { data } = report
  const eventTitle = report.event?.title ?? event?.title
  const details = [
    ['Event', eventTitle || (scope.distributionId ? 'Selected distribution' : 'All authorized distributions')],
    ['Date range', explanationDates(scope)],
    ['Status filter', scope.status ? humanizeReportValue(scope.status) : 'All statuses'],
  ]
  let finding = reportFinding(scope, data)
  let context
  let topics
  let table
  let simulation
  let matchLabel
  const summary = data.summary ?? {}
  const statusCount = status => formatReportNumber(countStatus(summary.statusCounts, status))

  if (scope.type === 'FUNDS') {
    const allocated = formatReportMoney(data.totals?.allocatedAmount)
    const credited = formatReportMoney(data.totals?.netCreditedAmount)
    const remaining = formatReportMoney(data.totals?.remainingAmount)
    const eventCount = data.pagination?.total
    if (eventCount === 0) finding = 'No distribution events match the selected filters.'
    if (eventCount == null) context = 'The number of matching events is unavailable.'
    else if (eventCount === 1) context = 'The totals cover one matching distribution event.'
    else if (eventCount > 1) context = `The totals cover all ${formatReportNumber(eventCount)} matching distribution events.`
    topics = eventCount === 0 ? [] : [
      ['funds', allocated === 'Unavailable' ? 'The total simulated allocation is unavailable.' : `The total simulated allocation was ${allocated}.`],
      ['funds', credited === 'Unavailable' ? 'Net simulated credits are unavailable.' : `Net simulated credits totaled ${credited}, after accounting for any completed reversals.`],
    ]
    if (eventCount !== 0) table = { caption: 'Simulated ledger totals', columns: ['Key figure', 'Amount'], rows: [['Total simulated allocation', allocated], ['Net simulated credits', credited], ['Remaining simulated allocation', remaining]] }
    simulation = simulationNote
  } else if (scope.type === 'CLAIMS' || scope.type === 'SCHEDULES') {
    const schedules = scope.type === 'SCHEDULES'
    const noun = schedules ? 'schedules' : 'claims'
    const count = schedules ? summary.matchingScheduleCount : summary.matchingClaimCount
    const formattedCount = formatReportNumber(count)
    const status = scope.status && humanizeReportValue(scope.status)
    if (status) matchLabel = `Matching ${status.toLowerCase()} ${noun}`
    if (formattedCount === 'Unavailable') finding = `The number of matching ${noun} is unavailable.`
    else if (Number(count) === 0) finding = `No ${noun} match the selected filters.`
    else if (scope.status !== 'MISSED') {
      const countLabel = Number(count) === 1 ? noun.slice(0, -1) : noun
      const recordLabel = scope.status === 'CLAIMED' ? `completed ${countLabel}` : `${countLabel}${status ? ` marked ${status.toLowerCase()}` : ''}`
      finding = `The report includes ${formattedCount} ${recordLabel}.`
    }
    context = status
      ? `The table covers all statuses within the selected dates. The detailed records follow the ${status} filter.`
      : `The table covers all ${noun} within the selected dates.`
    const checkedIn = statusCount('CHECKED_IN')
    topics = schedules ? [
      ['attendance', checkedIn === 'Unavailable' ? 'The check-in count is unavailable.' : `The status totals show ${checkedIn} check-ins for these dates. A check-in records attendance.`],
      ['missed', 'Review any schedules marked missed to decide which appointments need follow-up.'],
    ] : [
      ['completed', 'A claimed status records a handover or simulated wallet credit, depending on the event’s delivery mode.'],
      ['verified', 'A verified status means the identity check is complete and assistance is still pending.'],
    ]
    table = { caption: schedules ? 'Schedule status totals for the date range' : 'Claim status totals for the date range', columns: [schedules ? 'Schedule status' : 'Claim status', 'Count'], rows: reportStatuses[scope.type].map(value => [humanizeReportValue(value), statusCount(value)]) }
  } else if (scope.type === 'ANOMALIES') {
    const count = formatReportNumber(summary.total)
    if (summary.total === 0) finding = 'No exception records match the selected dates.'
    else if (count !== 'Unavailable') finding = `The selected dates contain ${count} exception ${summary.total === 1 ? 'record' : 'records'}.`
    topics = [['review', 'Exception records can include retries, unsuccessful checks, duplicate flags, and reversals. Review the recorded outcome before deciding what needs follow-up.']]
    if (summary.total !== 0) table = { caption: 'Exception counts by category', columns: ['Category', 'Count'], rows: [
      ['QR checks', formatReportNumber(summary.qrAnomalyCount)], ['Biometric checks', formatReportNumber(summary.biometricAnomalyCount)],
      ['Duplicate claim flags', formatReportNumber(summary.duplicateClaimFlagCount)], ['Transaction exceptions', formatReportNumber(summary.transactionAnomalyCount)],
    ] }
  } else {
    const beneficiaries = data.beneficiaries ?? {}
    const physical = data.distribution?.deliveryMode === 'PHYSICAL_GOODS'
    const completed = formatReportNumber(beneficiaries.claimedCount)
    if (completed !== 'Unavailable') finding = `This event has ${completed} completed ${beneficiaries.claimedCount === 1 ? 'claim' : 'claims'} on record.`
    const pending = formatReportNumber(beneficiaries.verifiedCount)
    topics = [
      ['completion', physical ? 'Completed claims are counted when a physical handover is recorded.' : 'Completed claims are counted when a simulated wallet credit is recorded.'],
      ['awaiting', pending === 'Unavailable' ? 'The count awaiting assistance is unavailable.' : `The records show ${pending} verified claims awaiting assistance.`],
      ['exceptions', 'The exception records in the full report provide the recorded outcome for each item needing review.'],
    ]
    table = { caption: 'Assistance figures for this event', columns: ['Key figure', 'Count'], rows: [
      ['Allocated beneficiaries', formatReportNumber(beneficiaries.allocatedCount)], ['Completed claims', formatReportNumber(beneficiaries.claimedCount)],
      ['Verified and awaiting assistance', pending], ['Checked-in schedules', formatReportNumber(beneficiaries.checkedInCount)],
    ] }
    if (!physical) simulation = simulationNote
  }

  const priorities = new Map((report.aiExplanation?.highlights ?? []).map((fact, index) => [fact.id, index]))
  const paragraphs = topics.sort(([a], [b]) => (priorities.get(a) ?? priorities.size) - (priorities.get(b) ?? priorities.size)).slice(0, 2).map(([, sentence]) => sentence)
  return { finding, matchLabel, paragraphs, table, details, context, dateMeaning: reportDateHelp[scope.type], simulation }
}

export function reportDocument(snapshot, user) {
  const { report, scope } = snapshot
  const event = report.event ?? snapshot.event
  const definition = reportDefinition(scope.type, report.data, report)
  const sections = [{ title: 'Executive summary', metrics: definition.metrics, description: [reportFinding(scope, report.data), definition.notice].filter(Boolean).join(' ') }]
  sections.push({ title: 'Report explanations', paragraphs: orderedReportFacts(report).map(fact => `${fact.label}. ${fact.explanation}`), description: report.aiExplanation ? 'AI selected the priority of these explanations from the generated report facts.' : reportDateHelp[scope.type] })
  if (definition.rows) sections.push({ title: reportLabel(scope.type), ...definition })
  for (const [type, supporting] of Object.entries(report.supportingReports ?? {})) {
    const content = reportDefinition(type, supporting.data, supporting)
    sections.push({ title: reportLabel(type), description: type === 'FUNDS' ? 'Fund utilization for this event. Amounts are simulated.' : `All event records. ${reportDateHelp[type] ?? ''}`, ...content })
  }
  return { title: reportLabel(scope.type), kind: scope.type, generatedAt: report.generatedAt, metadata: [...reportCoverage(scope, event), ['Prepared by', [user.fullName, user.employeeId].filter(Boolean).join(' / ')], ['Generated', formatReportDate(report.generatedAt)]], sections, disclaimer: 'Capstone prototype. This report is not COA-certified. Wallet amounts are simulated.' }
}

export function auditDocument(exported, filters, user) {
  return {
    title: 'Audit logs', kind: 'AUDIT', generatedAt: exported.generatedAt,
    metadata: [['Action', filters.action || 'All actions'], ['Entity', filters.entityAffected || 'All entities'], ['Date coverage', `${filters.dateFrom || 'Start of records'} to ${filters.dateTo || 'Latest records'}`], ['Prepared by', [user.fullName, user.employeeId].filter(Boolean).join(' / ')], ['Generated', formatReportDate(exported.generatedAt)]],
    sections: [
      { title: 'Executive summary', metrics: [['Matching audit records', formatReportNumber(exported.total)], ['System actions', formatReportNumber(exported.auditLogs.filter(log => log.actorType === 'SYSTEM').length)], ['Report actions', formatReportNumber(exported.auditLogs.filter(log => log.entityAffected === 'REPORT').length)]], description: 'Every record matching the applied filters is included. Detail fields use the server\'s existing privacy masking.' },
      { title: 'Audit records', rows: exported.auditLogs, columns: [['Recorded', row => formatReportDate(row.createdAt)], ['Actor / staff ID', row => `${row.user?.fullName ?? humanizeReportValue(row.actorType)}\n${row.user?.employeeId ?? row.actorType}`], ['Action', row => humanizeReportValue(row.action)], ['Entity', row => text(row.entityAffected)], ['Record', row => text(row.recordId)], ['Recorded details', row => row.details == null ? 'No additional details' : JSON.stringify(row.details, null, 2)]], widths: [29, 38, 43, 24, 40, 95] },
    ],
    disclaimer: 'Capstone prototype. Sanitized staff audit records for authorized review. This report is not COA-certified.',
  }
}
