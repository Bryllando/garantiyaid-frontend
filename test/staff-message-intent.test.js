import assert from 'node:assert/strict'
import test from 'node:test'
import { messageIntent, routingReplies } from '../src/components/assistant/staff-message-intent.js'

const examples = {
  distributionDraft: [
    'Create a schedule tomorrow at 9 AM',
    'Hello, create a schedule tomorrow at 9 AM',
    'HI! Please create a distribution event.',
    'Can you draft a distribution?',
    'I want to plan an event',
    'Maayong buntag, palihog himoa ang distribution ugma',
    'Kumusta, paki gumawa ng schedule bukas',
  ],
  reminder: [
    'Send an SMS reminder', 'Hello, please prepare an area reminder',
    'Schedule a reminder for tomorrow', 'Create a reminder for the distribution',
    'Notify beneficiaries', 'Remind the scheduled beneficiaries',
    'Palihog ipadala ang pahibalo', 'Textan ang beneficiaries',
    'Create a reminder for the distribution at noon',
  ],
  delivery: [
    'Show failed SMS delivery', 'Hello, what is the SMS delivery status?',
    'Why did the distribution reminder fail? Check its status',
    'Do not send SMS; show failed delivery records', 'Check queued reminders',
    'SMS not sent', 'The reminder was not delivered',
  ],
  schedule: [
    'Do not create a schedule, explain the steps first',
    'How can I create a distribution?', 'Show my schedule',
    'Can you explain how to plan an event?', 'Unsaon pag create sa schedule?',
    'Paano gumawa ng schedule?', 'Ayaw paghimo og event; ipasabot ang steps',
  ],
  cancel: [
    'Cancel', 'Never mind', 'Wait, do not send reminders',
    'Don’t create a schedule', "Don't send an SMS", 'Do not create an event',
    'Stop', 'Huwag gumawa ng schedule', 'Ayaw ipadala ang mensahe',
    'Create a schedule but do not send it',
  ],
  clarify: [
    'SMS', 'reminder', 'Schedule tomorrow', 'Please create something',
    'Create a distribution and send reminders',
    'Send reminders and create a distribution',
  ],
  greeting: ['Hello!', 'good morning', 'Maayong buntag', 'Kumusta?', 'testing'],
  beneficiary: ['Show beneficiary contacts', 'Hi, check the beneficiaries in this sitio'],
  help: ['How do I send a reminder?', 'Explain SMS reminders', 'Yes', 'Approve', 'Help me', ''],
}

for (const [expected, messages] of Object.entries(examples)) {
  test(`staff request routing: ${expected}`, () => {
    for (const message of messages) assert.equal(messageIntent(message, 'SYSTEM_ADMIN'), expected, message)
  })
}

test('distribution creation routing preserves the administrator role restriction', () => {
  for (const role of ['DSWD_STAFF', 'BARANGAY_FACILITATOR', undefined]) {
    for (const message of examples.distributionDraft) assert.equal(messageIntent(message, role), 'schedule', `${role}: ${message}`)
  }
})

test('local routing responses cover all supported languages and are not API intents', () => {
  for (const intent of ['clarify', 'cancel']) {
    for (const language of ['en', 'fil', 'ceb']) assert.ok(routingReplies[intent][language].length > 0)
  }
  assert.match(routingReplies.cancel.en, /does not cancel an existing event/)
})
