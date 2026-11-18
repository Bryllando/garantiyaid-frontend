import assert from 'node:assert/strict'
import test from 'node:test'
import { reportFixture, reportEvent, auditFixtures } from '../scripts/fixtures/report-snapshots.js'
import { auditDocument, formatReportMoney, formatReportNumber, orderedReportFacts, reportDefinition, reportDocument } from '../src/utils/reportPresentation.js'

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
    const scope = { type, distributionId: reportEvent.distributionId, status: type === 'CLAIMS' ? 'REJECTED' : 'MISSED' }
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
