import { reportDateHelp, reportTypes } from './reportScope.js'

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
    metrics: [['Matching claims', formatReportNumber(data.summary.matchingClaimCount)], ['Claimed', formatReportNumber(data.summary.statusCounts.CLAIMED ?? 0)], ['Verified', formatReportNumber(data.summary.statusCounts.VERIFIED ?? 0)], ['Rejected or voided', formatReportNumber((data.summary.statusCounts.REJECTED ?? 0) + (data.summary.statusCounts.VOIDED ?? 0))]],
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
    metrics: [['Matching schedules', formatReportNumber(data.summary.matchingScheduleCount)], ['Scheduled', formatReportNumber(data.summary.statusCounts.SCHEDULED ?? 0)], ['Checked in', formatReportNumber(data.summary.statusCounts.CHECKED_IN ?? 0)], ['Missed', formatReportNumber(data.summary.statusCounts.MISSED ?? 0)]],
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

export function reportDocument(snapshot, user) {
  const { report, scope } = snapshot
  const event = report.event ?? snapshot.event
  const definition = reportDefinition(scope.type, report.data, report)
  const sections = [{ title: 'Executive summary', metrics: definition.metrics, description: definition.notice }]
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
