import test from 'node:test'
import assert from 'node:assert/strict'
import { readReportScope, reportLocation } from '../src/utils/reportScope.js'

test('report coverage round-trips through refresh and retains the monitoring return destination', () => {
  const scope = { type: 'CLAIMS', distributionId: 'event-105', status: 'CLAIMED', dateFrom: '2026-10-01', dateTo: '2026-10-28' }
  const url = new URL(reportLocation(scope, '?monitorFrom=%2Fdswd%2Flive-dashboard%3Fdistribution%3Devent-105'), 'https://local.test')
  assert.deepEqual(readReportScope(url.search), scope)
  assert.equal(url.searchParams.get('monitorFrom'), '/dswd/live-dashboard?distribution=event-105')
})

test('report controls accept only supported statuses and actual calendar dates', () => {
  assert.deepEqual(readReportScope('?report=SUMMARY&status=CLAIMED&dateFrom=2026-10-01'), { type: 'SUMMARY', distributionId: '', status: '', dateFrom: '', dateTo: '' })
  const scope = readReportScope('?report=SCHEDULES&status=CLAIMED&dateFrom=2026-02-30&dateTo=2024-02-29')
  assert.equal(scope.status, '')
  assert.equal(scope.dateFrom, '')
  assert.equal(scope.dateTo, '2024-02-29')
  assert.equal(readReportScope('?report=UNSUPPORTED').type, 'SUMMARY')
  assert.equal(reportLocation(readReportScope('?report=SUMMARY'), '?status=OPEN&dateTo=2026-01-01'), '/reports')
})
