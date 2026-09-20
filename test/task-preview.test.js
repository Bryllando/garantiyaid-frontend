import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { allPages, distributionFormFromTask, formatPreviewTime, reminderFormFromTask, reminderRequest, resolveServiceArea, uniqueMatch, UNRESOLVED_AREA } from '../src/components/assistant/task-preview.js'
import { setTaskValue } from '../src/components/assistant/task-details.js'

test('lookup resolves only one exact authorized record, never a partial or duplicate name', () => {
  const rows = [{ programId: 'one', programName: 'Example Program', programCode: 'EX1' }, { programId: 'two', programName: 'Example Program', programCode: 'EX2' }]
  assert.equal(uniqueMatch(rows, 'Example', ['programName']), undefined)
  assert.equal(uniqueMatch(rows, 'Example Program', ['programName']), undefined)
  assert.equal(uniqueMatch(rows, ' ex2 ', ['programCode']).programId, 'two')
  assert.equal(uniqueMatch(rows, '', ['programCode']), undefined)
  const mapped = distributionFormFromTask({ program: 'EX2', barangay: 'Unavailable', date: '2026-10-09', slotDurationMinutes: '45', startTime: '09:00', endTime: '12:00' }, rows, [])
  assert.equal(mapped.programId, 'two')
  assert.equal(mapped.barangayId, '')
  assert.equal(mapped.distributionDate, '2026-10-09')
  assert.equal(mapped.slotDurationMinutes, '45')
  assert.equal(mapped.startTime, '09:00')
  assert.equal(mapped.deliveryMode, 'PHYSICAL_GOODS')
})

test('lookup includes later pages and fails on incomplete or failed responses', async () => {
  const requested = []
  const rows = await allPages(async ({ page, pageSize }) => {
    requested.push(page)
    assert.equal(pageSize, 100)
    return { programs: [{ programId: `${page}` }], pagination: { totalPages: 3 } }
  }, 'programs')
  assert.deepEqual(requested, [1, 2, 3])
  assert.equal(rows.length, 3)
  await assert.rejects(allPages(async () => ({ programs: [] }), 'programs'), /incomplete/)
  await assert.rejects(allPages(async () => ({ programs: [], pagination: { totalPages: 2 } }), 'programs'), /changed/)
  await assert.rejects(allPages(async () => { throw new Error('Session expired') }, 'programs'), /Session expired/)
})

test('reminder mapping preserves text/timing and cannot broaden an unmatched area', () => {
  const values = { distribution: 'Example event', serviceArea: 'Purok 3', messageTemplate: 'Bring your QR credential.', deliveryMode: 'scheduled', date: '2026-10-09', startTime: '09:00' }
  const form = reminderFormFromTask(values, [{ distributionId: 'event-1', title: 'Example event' }])
  assert.equal(form.distributionId, 'event-1')
  assert.equal(form.messageTemplate, values.messageTemplate)
  assert.equal(form.sendAt, '2026-10-09T09:00')
  assert.equal(form.serviceArea, UNRESOLVED_AREA)
  assert.equal(resolveServiceArea('Purok 3', ['Purok 2']), UNRESOLVED_AREA)
  assert.equal(resolveServiceArea(' purok 2 ', ['Purok 2']), 'Purok 2')
  assert.equal(resolveServiceArea('All scheduled service areas', []), '')
  assert.throws(() => reminderRequest(form), /Choose the intended/)
  assert.equal(reminderRequest({ ...form, serviceArea: 'Purok 3' }).serviceArea, 'Purok 3')
})

test('queue timestamps explicitly use PHT and queue-now delegates to the server clock', () => {
  const form = { messageTemplate: 'Example message', serviceArea: '', deliveryMode: 'scheduled', sendAt: '2026-10-09T09:00' }
  assert.equal(reminderRequest(form).sendAt, '2026-10-09T01:00:00.000Z')
  assert.match(formatPreviewTime('2026-10-09T01:00:00Z'), /Friday, October 9, 2026.*9:00 AM PHT/)
  assert.equal(reminderRequest({ ...form, deliveryMode: 'now' }).sendAt, undefined)
  for (const sendAt of ['', '2026-02-30T09:00', '2026-10-09T25:00']) assert.throws(() => reminderRequest({ ...form, sendAt }), /valid date and time/)
})

test('explicit record choices survive returning to chat but are cleared when names change', () => {
  const task = { kind: 'distributionDraft', values: { barangay: 'Same name', barangayId: 'chosen' } }
  const rows = [{ barangayId: 'chosen', barangayName: 'Same name' }, { barangayId: 'other', barangayName: 'Same name' }]
  assert.equal(distributionFormFromTask(task.values, [], rows).barangayId, 'chosen')
  const changed = setTaskValue(task, 'barangay', 'New name').task
  assert.equal(changed.values.barangayId, undefined)
  assert.equal(distributionFormFromTask(changed.values, [], rows).barangayId, '')
})

test('chat confirmation requires a reviewed server snapshot and prevents repeat clicks', () => {
  const scheduler = readFileSync(new URL('../src/components/assistant/AssistantDistributionScheduler.jsx', import.meta.url), 'utf8')
  const assistant = readFileSync(new URL('../src/components/assistant/StaffAiAssistant.jsx', import.meta.url), 'utf8')
  for (const source of [scheduler, assistant]) {
    assert.match(source, /if \(!preview \|\| !reviewed \|\| busy \|\| submittingRef.current\) return/)
    assert.match(source, /confirmationSnapshot/)
    assert.match(source, /preview.approvalId/)
    assert.match(source, /uncertainConfirmation\(requestError\)/)
    assert.match(source, /disabled=\{Boolean\(busy\) \|\| uncertain\}/)
  }
  assert.match(assistant, /setPreview\(null\); setReviewed\(false\)/)
  assert.match(assistant, /new Date\(data.checkedAt\)/)
})
