import assert from 'node:assert/strict'
import test from 'node:test'
import { collectTaskDetails, fieldsForTask, isTaskCancellation, isTaskQuestion, manilaDate, nextTaskField, setTaskValue, taskReply, taskTimingIssue } from '../src/components/assistant/task-details.js'

const now = new Date('2026-09-08T10:00:00Z')
const empty = (kind = 'distributionDraft') => ({ kind, values: {} })
const set = (task, key, value) => setTaskValue(task, key, value, now)
const collect = (task, text, options = {}) => collectTaskDetails(task, text, { now, ...options })

test('initial scheduling request retains explicit dates and times while asking for the program', () => {
  const { task, error } = collect(empty(), 'Hello, create a distribution tomorrow at 9 AM', { initial: true })
  assert.equal(error, '')
  assert.deepEqual(task.values, { date: '2026-09-09', startTime: '09:00' })
  assert.equal(nextTaskField(task).key, 'program')
  assert.match(taskReply(task, 'en'), /Which assistance program/)
  assert.match(taskReply(task, 'ceb'), /Unsang/)
})

test('successive answers retain prior values, accept labelled corrections, and complete only when all fields exist', () => {
  let task = collect(empty(), 'Create a schedule tomorrow from 9 AM to noon', { initial: true }).task
  for (const [key, value] of [['program', 'Example Program'], ['barangay', 'Example Barangay'], ['location', 'Community Hall'], ['slotDurationMinutes', '30 minutes'], ['verificationRequirement', 'QR'], ['title', 'Community distribution']]) {
    assert.equal(nextTaskField(task).key, key)
    const result = collect(task, value, { key })
    assert.equal(result.error, '', key)
    task = result.task
  }
  assert.equal(nextTaskField(task), undefined)
  assert.equal(taskTimingIssue(task), '')
  assert.match(taskReply(task, 'en'), /Nothing has been submitted/)
  const updated = collect(task, 'change venue: New Hall; start: 10 AM').task
  assert.equal(updated.values.location, 'New Hall')
  assert.equal(updated.values.startTime, '10:00')
  assert.equal(task.values.startTime, '09:00')
  assert.equal(updated.values.program, 'Example Program')
})

test('ambiguous or invalid dates and times do not replace existing details', () => {
  const task = set(empty(), 'startTime', '9 AM').task
  for (const value of ['9', '25:00', '12:80', '13 PM', '0 AM']) {
    const result = set(task, 'startTime', value)
    assert.ok(result.error, value)
    assert.deepEqual(result.task, task)
  }
  for (const value of ['2026-02-30', '2026-09-07', 'next Friday']) assert.ok(set(task, 'date', value).error)
  assert.equal(set(task, 'startTime', '12 AM').task.values.startTime, '00:00')
  assert.equal(set(task, 'startTime', '12 PM').task.values.startTime, '12:00')
  assert.ok(collect(task, '9 AM or 10 AM', { key: 'startTime' }).error)
  assert.deepEqual(collect(task, '9 AM or 10 AM', { key: 'startTime' }).task, task)
})

test('relative dates use Philippine midnight independently of the browser time zone', () => {
  assert.equal(manilaDate(new Date('2026-09-08T15:59:59Z')), '2026-09-08')
  assert.equal(manilaDate(new Date('2026-09-08T16:00:00Z')), '2026-09-09')
  assert.equal(setTaskValue(empty(), 'date', 'ugma', new Date('2026-12-31T16:00:00Z')).task.values.date, '2027-01-02')
})

test('time window and slot validation prevents a misleading complete state', () => {
  assert.match(taskTimingIssue({ kind: 'distributionDraft', values: { startTime: '12:00', endTime: '09:00' } }), /End time/)
  assert.match(taskTimingIssue({ kind: 'distributionDraft', values: { startTime: '09:00', endTime: '10:00', slotDurationMinutes: '45' } }), /divide evenly/)
  assert.ok(set(empty(), 'slotDurationMinutes', '4').error)
  assert.ok(set(empty(), 'slotDurationMinutes', '30.5').error)
  for (const value of ['QR_AND_BIOMETRIC', 'QR and biometric', 'QR + biometric']) assert.equal(set(empty(), 'verificationRequirement', value).task.values.verificationRequirement, 'QR_AND_BIOMETRIC')
})

test('reminders collect scope and message, and only scheduled mode requires date/time', () => {
  let task = collect(empty('reminder'), 'Schedule an SMS tomorrow at 9 AM', { initial: true }).task
  assert.equal(task.values.deliveryMode, 'scheduled')
  assert.equal(task.values.date, '2026-09-09')
  for (const [key, value] of [['distribution', 'Example Event'], ['serviceArea', 'Purok 2'], ['messageTemplate', 'Please bring your QR credential.']]) task = set(task, key, value).task
  assert.equal(nextTaskField(task), undefined)
  task = set(task, 'deliveryMode', 'now').task
  assert.equal(task.values.date, undefined)
  assert.equal(task.values.startTime, undefined)
  assert.equal(fieldsForTask(task).length, 4)
  task = set(task, 'deliveryMode', 'scheduled').task
  assert.equal(nextTaskField(task).key, 'date')
  assert.equal(task.values.serviceArea, 'Purok 2')
  assert.ok(collect(task, '9 AM to noon', { key: 'startTime' }).error)
})

test('questions, approval words, unknown fields and HTML cannot become collected values', () => {
  for (const text of ['Yes', 'Approve', 'Confirm', 'Which program should I use?']) {
    const result = collect(empty(), text, { key: 'program' })
    assert.ok(result.error)
    assert.deepEqual(result.task.values, {})
  }
  assert.ok(set(empty(), 'programId', 'invented-id').error)
  assert.ok(set(empty(), 'program', '<script>alert(1)</script>').error)
  assert.ok(set(empty('reminder'), 'messageTemplate', 'short').error)
  assert.equal(isTaskCancellation('Cancel pending task'), true)
  assert.equal(isTaskCancellation('Do not create the schedule'), true)
  assert.equal(isTaskCancellation('Don’t send a reminder'), true)
  assert.equal(isTaskCancellation('No, use QR'), false)
  assert.equal(isTaskCancellation('Cancel the existing event'), false)
  assert.equal(isTaskQuestion('message: Have you prepared your QR credential?'), false)
  assert.equal(collect(empty('reminder'), 'message: Have you prepared your QR credential?').task.values.messageTemplate, 'Have you prepared your QR credential?')
})
