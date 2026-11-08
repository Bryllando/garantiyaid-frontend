import test from 'node:test'
import assert from 'node:assert/strict'
import { eventWorkRows } from '../src/utils/eventOperations.js'
import { monitoringActionHref, monitoringLocation, monitoringReturnPath, readMonitoringLocation } from '../src/utils/monitoringLocation.js'

test('monitoring preserves event, search, filters and server page through a return link', () => {
  const query = readMonitoringLocation('?status=ALL&distribution=event-105&search=Rain%20aid&page=14&dateFrom=2026-10-01&dateTo=2026-10-31')
  const href = monitoringActionHref('/reports?distribution=event-105&report=SCHEDULES&status=MISSED', query)
  assert.equal(monitoringReturnPath(href.split('?')[1]), monitoringLocation(query))
  assert.equal(query.page, 14)
  assert.equal(query.status, 'ALL')
  assert.equal(new URL(href, 'https://test.invalid').searchParams.get('status'), 'MISSED')
})

test('monitoring rejects external return destinations and invalid filters', () => {
  for (const value of ['https://evil.invalid', '//evil.invalid', '/dswd/live-dashboard/other', '/admin/administration', 'javascript:alert(1)']) assert.equal(monitoringReturnPath(`monitorFrom=${encodeURIComponent(value)}`), '')
  const query = readMonitoringLocation('?page=-1&status=INVALID&dateFrom=2026-02-30&search=' + 'x'.repeat(200))
  assert.equal(query.page, 1)
  assert.equal(query.status, 'OPEN')
  assert.equal(query.dateFrom, '')
  assert.equal(query.search.length, 100)
})

test('DSWD actions use permitted attendance, claim and ledger destinations', () => {
  const event = { distributionId: 'event-1', deliveryMode: 'SIMULATED_WALLET', status: 'OPEN', verificationRequirement: 'QR' }
  const work = eventWorkRows(event, { SCHEDULED: 5, MISSED: 1 }, { PENDING: 2, VERIFIED: 3 }, { OPEN: 1 }, 'DSWD_STAFF')
  assert.equal(work.find((row) => row.key === 'arrival').href, '/reports?distribution=event-1&report=SCHEDULES&status=SCHEDULED')
  assert.equal(work.find((row) => row.key === 'release').href, '/dswd/ledger?distribution=event-1')
  assert.ok(work.every((row) => !row.href.startsWith('/admin/')))
  assert.equal(work.find((row) => row.key === 'OPEN').count, 1)
  const physical = eventWorkRows({ ...event, deliveryMode: 'PHYSICAL_GOODS' }, {}, { VERIFIED: 2 }, {}, 'DSWD_STAFF')
  assert.equal(physical[2].owner, 'Barangay staff')
  assert.match(physical[2].href, /^\/claim-accountability/)
  const closed = eventWorkRows({ ...event, status: 'CLOSED' }, {}, { VERIFIED: 1 }, {}, 'DSWD_STAFF')
  assert.match(closed[2].href, /^\/claim-accountability/)
  const admin = eventWorkRows(event, {}, {}, {}, 'SYSTEM_ADMIN')
  assert.match(admin[0].href, /^\/admin\/schedules/)
})
