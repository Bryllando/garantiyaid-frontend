import assert from 'node:assert/strict'
import test from 'node:test'
import { reportFixture, reportEvent, auditFixtures } from '../scripts/fixtures/report-snapshots.js'
import { auditDocument, formatReportMoney, formatReportNumber, orderedReportFacts, reportFinding, reportDefinition, reportDocument, reportExplanation } from '../src/utils/reportPresentation.js'

test('report documents preserve complete records, exact coverage, supporting sections and unavailable figures', () => {
  const scope = { type: 'SUMMARY', distributionId: reportEvent.distributionId }
  const report = reportFixture(scope)
  const document = reportDocument({ scope, report, event: reportEvent }, { fullName: 'QA Staff', employeeId: 'QA-1' })
  assert.equal(document.sections.find(section => section.title === 'Claim status').rows.length, 43)
  assert.equal(document.sections.find(section => section.title === 'Queue schedules').rows.length, 50)
  assert.equal(document.sections.find(section => section.title === 'Anomaly review').rows.length, 4)
  assert.equal(document.sections.find(section => section.title === 'Executive summary').metrics.find(([label]) => label === 'Exceptions for review')[1], '4')
  assert.equal(formatReportMoney(null), 'Unavailable')
  assert.equal(formatReportNumber(undefined), 'Unavailable')
  assert.equal(formatReportMoney('0.00'), '₱0.00')
  assert.equal(formatReportMoney('6514.00'), '₱6,514.00')
})

test('claims distinguish physical handover evidence from completed simulated credit', () => {
  const wallet = reportFixture({ type: 'CLAIMS', distributionId: reportEvent.distributionId })
  const walletDefinition = reportDefinition('CLAIMS', wallet.data)
  const recorded = walletDefinition.columns.find(([label]) => label === 'Assistance recorded / staff')[1]
  assert.match(recorded(wallet.data.claims[0]), /Simulated wallet credit/)
  assert.equal(recorded(wallet.data.claims.at(-1)), 'Not recorded')
  const physical = reportFixture({ type: 'CLAIMS', distributionId: `${reportEvent.distributionId.slice(0, -1)}2` })
  assert.match(recorded(physical.data.claims[0]), /QA Facilitator.*\nRELEASE-LOG-1/)
})

test('filtered claim and schedule PDFs explain why status totals differ from matching records', () => {
  for (const type of ['CLAIMS', 'SCHEDULES']) {
    const scope = { type, distributionId: reportEvent.distributionId, status: type === 'CLAIMS' ? 'REJECTED' : 'CANCELLED' }
    const report = reportFixture(scope)
    const document = reportDocument({ scope, report }, { fullName: 'QA Staff' })
    const summary = document.sections[0]
    assert.equal(summary.metrics[0][1], '0')
    assert.match(summary.description, /Status totals cover all statuses within the date range/)
    assert.match(summary.description, /records below follow your selected status/)
    assert.equal(document.sections.at(-1).rows.length, 0)
  }
})

test('AI priorities preserve each authored explanation once and audit exports retain all matching rows', () => {
  const report = reportFixture({ type: 'CLAIMS', distributionId: reportEvent.distributionId })
  report.aiExplanation = { highlights: [report.facts[2]] }
  assert.deepEqual(orderedReportFacts(report).map(fact => fact.id), ['simulation', 'coverage', 'assistance'])
  const audit = auditDocument({ generatedAt: report.generatedAt, auditLogs: auditFixtures, total: 27 }, { action: 'REPORT_SNAPSHOT_GENERATED', dateFrom: '2026-11-01' }, { fullName: 'QA' })
  assert.equal(audit.sections[1].rows.length, 27)
  assert.match(audit.sections[1].columns.at(-1)[1](auditFixtures.at(-1)), /AUDIT-DETAIL-END/)
  assert.equal(audit.metadata.find(([key]) => key === 'Action')[1], 'REPORT_SNAPSHOT_GENERATED')
})

test('a filtered report finding uses the matching count, including zero, and identifies missing counts', () => {
  const scope = { type: 'SCHEDULES', status: 'MISSED' }
  const { data } = reportFixture(scope)
  assert.equal(reportFinding(scope, data), '3 schedules were marked missed.')
  assert.equal(reportFinding(scope, { ...data, summary: { matchingScheduleCount: 0 } }), '0 schedules were marked missed.')
  assert.equal(reportFinding(scope, { ...data, summary: {} }), 'The record count is unavailable.')
})

test('the fund explanation formats ledger amounts, distinguishes zero from unavailable, and covers every matching event', () => {
  const scope = { type: 'FUNDS', dateFrom: '2026-11-01', dateTo: '2026-11-17', status: 'CLOSED' }
  const report = reportFixture(scope)
  report.event = null
  report.data.totals = { allocatedAmount: '6514.00', netCreditedAmount: '0.00', remainingAmount: '6514.00' }
  report.data.pagination.total = 10
  const explanation = reportExplanation({ scope, report })
  assert.equal(explanation.finding, '₱6,514.00 remains in the simulated allocation.')
  assert.deepEqual(explanation.table.rows.map(([, value]) => value), ['₱6,514.00', '₱0.00', '₱6,514.00'])
  assert.deepEqual(explanation.details, [['Event', 'All authorized distributions'], ['Date range', '1–17 November 2026'], ['Status filter', 'Closed']])
  assert.match(explanation.context, /all 10 matching distribution events/)
  assert.match(explanation.paragraphs[1], /accounting for any completed reversals/)
  report.data.totals.netCreditedAmount = null
  assert.equal(reportExplanation({ scope, report }).table.rows[1][1], 'Unavailable')
  report.data.pagination.total = 0
  const empty = reportExplanation({ scope, report })
  assert.match(empty.finding, /No distribution events match/)
  assert.equal(empty.table, undefined)
})

test('queue explanations keep the selected status and all-status totals distinct and rank verified topics', () => {
  const scope = { type: 'SCHEDULES', status: 'MISSED', distributionId: reportEvent.distributionId, dateTo: '2026-11-17' }
  const report = reportFixture(scope)
  report.aiExplanation = { highlights: [{ id: 'missed', explanation: 'Unverified text' }] }
  const explanation = reportExplanation({ scope, report })
  assert.equal(explanation.matchLabel, 'Matching missed schedules')
  assert.equal(explanation.finding, '3 schedules were marked missed.')
  assert.equal(explanation.details[1][1], 'Through 17 November 2026')
  assert.equal(explanation.table.caption, 'Schedule status totals for the date range')
  assert.deepEqual(explanation.table.rows, [['Scheduled', '9'], ['Checked in', '38'], ['Missed', '3'], ['Cancelled', '0']])
  assert.match(explanation.paragraphs[0], /need follow-up/)
  assert.match(explanation.paragraphs[1], /38 check-ins/)
  assert.match(explanation.context, /all statuses.*Missed filter/)
  report.data.summary = { matchingScheduleCount: 0 }
  const empty = reportExplanation({ scope, report })
  assert.equal(empty.finding, 'No schedules match the selected filters.')
  assert.ok(empty.table.rows.every(([, value]) => value === 'Unavailable'))
  assert.match(reportExplanation({ scope, report: { ...report, data: { summary: {} } } }).finding, /matching schedules is unavailable/)
})

test('other report explanations use their own findings, with simulation notes when applicable', () => {
  for (const [type, finding, caption] of [
    ['SUMMARY', 'This event has 38 completed claims on record.', 'Assistance figures for this event'],
    ['CLAIMS', 'The report includes 43 claims.', 'Claim status totals for the date range'],
    ['ANOMALIES', 'The selected dates contain 4 exception records.', 'Exception counts by category'],
  ]) {
    const scope = { type, distributionId: reportEvent.distributionId }
    const explanation = reportExplanation({ scope, report: reportFixture(scope) })
    assert.equal(explanation.finding, finding)
    assert.equal(explanation.table.caption, caption)
  }
  const scope = { type: 'SUMMARY', distributionId: 'event-2' }
  const physical = reportExplanation({ scope, report: reportFixture(scope) })
  assert.match(physical.paragraphs[0], /physical handover/)
  assert.equal(physical.simulation, undefined)
})
