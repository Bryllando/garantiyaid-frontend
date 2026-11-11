import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { conversationIntent, guidanceTarget } from '../src/components/assistant/staff-message-intent.js'
import { collectTaskDetails, isTaskCancellation, nextTaskField, setTaskValue } from '../src/components/assistant/task-details.js'
import { reminderEventMatches, selectReminderEvent, reminderFormFromTask } from '../src/components/assistant/task-preview.js'

const { examples, status } = JSON.parse(readFileSync(new URL('../docs/staff-assistant-conversation-examples.json', import.meta.url)))
const now = new Date('2026-11-10T01:00:00Z')
const intentName = intent => ({ reminder: 'PREPARE_AREA_REMINDER', distributionDraft: 'CREATE_DISTRIBUTION_DRAFT' })[intent] || intent.toUpperCase()
const events = [
  { distributionId: 'punta-am', title: 'Punta morning', status: 'OPEN', distributionDate: '2026-11-10', startTime: '10:00', endTime: '12:00', program: { programCode: 'TUPAD', programName: 'TUPAD program' }, barangay: { barangayName: 'Punta' } },
  { distributionId: 'punta-next', title: 'Punta next day', status: 'DRAFT', distributionDate: '2026-11-11', startTime: '10:00', endTime: '12:00', program: { programCode: 'TUPAD', programName: 'TUPAD program' }, barangay: { barangayName: 'Punta' } },
]

test('staff example corpus remains reviewable draft material with all requested fields', () => {
  assert.equal(status, 'DRAFT_FOR_STAFF_REVIEW')
  assert.ok(examples.length >= 72)
  assert.equal(new Set(examples.map(row => row.id)).size, examples.length)
  for (const row of examples) {
    for (const key of ['audience', 'role', 'language', 'message', 'previousConversation', 'expectedIntent', 'extractedDetails', 'missingOrAmbiguous', 'expectedBehavior', 'visualizationUseful', 'visualizationTemplate', 'confirmationRequired']) assert.ok(Object.hasOwn(row, key), `${row.id}: ${key}`)
    assert.equal(typeof row.confirmationRequired, 'boolean')
    assert.equal(row.visualizationUseful, Boolean(row.visualizationTemplate))
  }
  const cases = examples.map(row => JSON.stringify([row.audience, row.message.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim(), row.context ?? row.history ?? row.previousConversation]))
  assert.equal(new Set(cases).size, cases.length, 'Questions with the same audience and context must be unique')
})

for (const row of examples.filter(row => row.audience === 'STAFF')) test(`conversation ${row.id} (${row.language}, ${row.role}): ${row.message}`, () => {
  const intent = conversationIntent(row.message, row.role, row.context)
  assert.equal(intentName(intent), row.expectedIntent)
  if (intent === 'cancel') { assert.equal(isTaskCancellation(row.message), true); return }
  if (!['reminder', 'distributionDraft'].includes(intent)) return
  const task = row.context || { kind: intent, values: {} }
  const result = collectTaskDetails(task, row.message, { now, key: row.context ? nextTaskField(task)?.key : undefined, initial: !row.context || /^(?:i-notify|send|notify)/i.test(row.message) })
  for (const [key, value] of Object.entries(row.extractedDetails)) assert.equal(result.task.values[key], value, key)
  if (row.id === 48) { assert.match(result.error, /already set/); assert.deepEqual(result.task, task) }
})

test('English, Cebuano and Filipino reminder paraphrases resolve the same authorized event', () => {
  for (const id of [27, 28, 29]) {
    const row = examples.find(row => row.id === id)
    const { task, error } = collectTaskDetails({ kind: 'reminder', values: {} }, row.message, { initial: true, now })
    assert.equal(error, '')
    assert.deepEqual(reminderEventMatches(task.values, events.slice(0, 1), task.eventQuery).map(row => row.distributionId), ['punta-am'])
    assert.equal(reminderEventMatches(task.values, events, task.eventQuery).length, 2, 'Duplicate program/area requires choosing an actual event')
  }
})

test('follow-ups retain the exact event and separate event timing from SMS queue timing', () => {
  let task = selectReminderEvent({ kind: 'reminder', values: { serviceArea: 'Purok 2' } }, events[0])
  for (const text of ['Karon, 10 AM.', 'SMS lang.', 'Kanang event nga atong gihisgutan.', 'I-notify sila about their distribution schedule.']) {
    const result = collectTaskDetails(task, text, { now, key: nextTaskField(task)?.key, initial: text.startsWith('I-notify') })
    assert.equal(result.error, '', text)
    task = result.task
    assert.equal(task.values.distributionId, 'punta-am')
    assert.equal(task.values.serviceArea, 'Purok 2')
    assert.equal(task.values.deliveryMode, undefined)
    assert.equal(task.values.messageTemplate, undefined)
  }
  assert.equal(task.values.eventDate, '2026-11-10')
  assert.equal(task.values.eventTime, '10:00')
  assert.equal(reminderEventMatches(task.values, events).length, 1)
  const body = collectTaskDetails(task, 'Bring your credential tomorrow at 9 AM.', { now, key: 'messageTemplate' })
  assert.equal(body.task.values.messageTemplate, 'Bring your credential tomorrow at 9 AM.')
  assert.equal(body.task.values.eventDate, '2026-11-10')
})

test('dates, ambiguity, explicit changes, and unavailable channels cannot broaden selection', () => {
  const task = selectReminderEvent({ kind: 'reminder', values: { serviceArea: 'Purok 2' } }, events[0])
  assert.equal(reminderEventMatches({ ...task.values, eventDate: '2026-11-11' }, events).length, 0)
  assert.equal(reminderEventMatches({ ...task.values, eventTime: '11:00' }, events).length, 0)
  assert.equal(reminderEventMatches({ distribution: 'Unknown event' }, events).length, 0)
  assert.equal(reminderEventMatches({}, events, 'Send reminders for Unknown TUPAD distribution').length, 0)
  assert.equal(reminderFormFromTask({ program: 'TUPAD', barangay: 'Punta' }, events).distributionId, '')
  const otherProgram = { ...events[0], distributionId: 'other-program', program: { programCode: 'OTHER', programName: 'Other program' } }
  assert.deepEqual(reminderEventMatches({ barangay: 'Punta' }, [...events, otherProgram], 'Send reminders for the Punta TUPAD distribution').map(row => row.distributionId), ['punta-am', 'punta-next'], 'A short area follow-up cannot drop the program from the earlier request')
  assert.match(collectTaskDetails(task, 'Sa another barangay.', { now }).error, /already set/)
  const changed = collectTaskDetails(task, 'change barangay: another barangay', { now }).task
  assert.equal(changed.values.distributionId, undefined)
  assert.equal(changed.values.barangay, 'another barangay')
  assert.equal(setTaskValue(task, 'eventTime', '11 AM', now).task.values.distributionId, undefined)
  assert.match(collectTaskDetails(task, 'mobile push please', { now }).error, /unavailable/)
  assert.deepEqual(collectTaskDetails(task, 'mobile push please', { now }).task, task)
  assert.match(collectTaskDetails({ kind: 'reminder', values: {} }, 'that event', { now }).error, /No event has been confirmed/)
  assert.equal(collectTaskDetails(task, 'sa punta', { now }).error, '')
  assert.equal(collectTaskDetails(task, 'karon', { now, key: 'deliveryMode' }).task.values.deliveryMode, 'now')
  const timed = collectTaskDetails({ kind: 'reminder', values: {} }, 'Send reminders for TUPAD in Punta today at 10 AM', { now, initial: true }).task
  assert.equal(timed.values.barangay, 'Punta')
  assert.equal(timed.values.eventTime, '10:00')
  assert.equal(timed.values.deliveryMode, undefined)
  assert.deepEqual(reminderEventMatches(timed.values, events).map(row => row.distributionId), ['punta-am'])
})

test('guidance targets use verified role-specific screens, never generated URLs', () => {
  assert.equal(guidanceTarget('SCHEDULE', 'BARANGAY_FACILITATOR').path, '/facilitator/queue')
  assert.equal(guidanceTarget('SCHEDULE', 'DSWD_STAFF').path, '/dswd/live-dashboard')
  assert.equal(guidanceTarget('SCHEDULE', 'SYSTEM_ADMIN').path, '/distributions/manage')
  assert.equal(guidanceTarget('SCHEDULE', 'BENEFICIARY'), null)
  assert.equal(guidanceTarget('arbitrary-html', 'SYSTEM_ADMIN'), null)
})
