import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('../src/components/assistant/StaffAiAssistant.jsx', import.meta.url), 'utf8')
const shellSource = readFileSync(new URL('../src/components/layout/DashboardShell.jsx', import.meta.url), 'utf8')
const authSource = readFileSync(new URL('../src/auth/staffAuth.js', import.meta.url), 'utf8')
const schedulerSource = readFileSync(new URL('../src/components/assistant/AssistantDistributionScheduler.jsx', import.meta.url), 'utf8')

test('staff AI assistant has a shared role-aware page and collapsible history', () => {
  assert.match(shellSource, /<StaffAiAssistant/)
  assert.match(source, /src="\/GarantiyAid-AI-logo\.svg"/)
  assert.match(source, /SYSTEM_ADMIN:[\s\S]*DSWD_STAFF:[\s\S]*BARANGAY_FACILITATOR:/)
  assert.match(source, /hidden=\{!active\}/)
  assert.match(source, /aria-expanded=\{historyOpen\}/)
  assert.match(source, /aria-controls="staff-assistant-history"/)
  assert.match(shellSource, /<StaffNotificationCenter[\s\S]*<StaffAiAssistant/)
  assert.match(shellSource, /aria-label="Open assistant conversation"/)
  assert.match(source, /ga-assistant-workspace/)
  assert.match(source, /English[\s\S]*Filipino[\s\S]*Cebuano/)
})

test('staff guidance uses authenticated OpenRouter AI with bounded conversation context', () => {
  assert.match(authSource, /\/chatbot\/staff-assistant\/messages/)
  assert.match(source, /requestStaffAssistantMessage\(accessToken, \{[\s\S]*messageText: content,[\s\S]*messages\.filter\(\(message\) => !message\.local\)\.slice\(-6\)/)
  assert.match(source, /Review AI guidance/)
  assert.match(source, /Preparing your answer/)
})

test('assistant reminder requires a server preview and explicit confirmation', () => {
  assert.match(authSource, /\/notifications\/assistant-preview/)
  assert.match(authSource, /\/notifications\/assistant-enqueue/)
  assert.match(source, /previewAssistantDistributionReminder/)
  assert.match(source, /expectedRecipientCount: preview\.recipientCount/)
  assert.match(source, /expectedPreviewHash: preview\.previewHash/)
  assert.match(source, /type="checkbox" checked=\{reviewed\}/)
  assert.match(source, /SMS is a notice, not claim authorization/)
  assert.match(source, /Current environment: simulated SMS only/)
})

test('Admin AI scheduler creates only a reviewed distribution draft', () => {
  assert.match(source, /user\?\.role === 'SYSTEM_ADMIN'/)
  assert.match(source, /<AssistantDistributionScheduler/)
  assert.match(authSource, /\/distributions\/assistant-preview/)
  assert.match(schedulerSource, /previewAssistantDistribution/)
  assert.match(schedulerSource, /confirmAssistantDistribution/)
  assert.match(schedulerSource, /This creates a draft only/)
  assert.match(schedulerSource, /type="checkbox" checked=\{reviewed\}/)
})

test('staff assistant feedback is metadata-only and does not submit conversation text', () => {
  assert.match(authSource, /\/chatbot\/staff-feedback/)
  assert.match(source, /rating,[\s\S]*context:[\s\S]*intent: lastIntent/)
  assert.doesNotMatch(source, /recordStaffAssistantFeedback\([\s\S]{0,200}messageText/)
})
