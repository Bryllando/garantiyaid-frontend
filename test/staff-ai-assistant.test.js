import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('../src/components/assistant/StaffAiAssistant.jsx', import.meta.url), 'utf8')
const shellSource = readFileSync(new URL('../src/components/layout/DashboardShell.jsx', import.meta.url), 'utf8')
const authSource = readFileSync(new URL('../src/auth/staffAuth.js', import.meta.url), 'utf8')
const schedulerSource = readFileSync(new URL('../src/components/assistant/AssistantDistributionScheduler.jsx', import.meta.url), 'utf8')

test('staff AI assistant is shared, role-aware, animated, responsive, and accessible', () => {
  assert.match(shellSource, /<StaffAiAssistant/)
  assert.match(source, /src="\/GarantiyAid-AI-logo\.svg"/)
  assert.match(source, /SYSTEM_ADMIN:[\s\S]*DSWD_STAFF:[\s\S]*BARANGAY_FACILITATOR:/)
  assert.match(source, /prefers-reduced-motion: reduce/)
  assert.match(source, /animate\(launcherRef\.current/)
  assert.match(source, /role="dialog" aria-modal="false"/)
  assert.match(source, /aria-expanded=\{open\}/)
  assert.match(source, /aria-controls="garantiyaid-ai-panel"/)
  assert.match(source, /tabIndex=\{open \? -1 : 0\}/)
  assert.match(source, /sm:w-\[min\(29rem,calc\(100vw-3rem\)\)\]/)
  assert.match(source, /English[\s\S]*Filipino[\s\S]*Cebuano/)
})

test('staff guidance uses authenticated OpenRouter AI with bounded conversation context', () => {
  assert.match(authSource, /\/chatbot\/staff-assistant\/messages/)
  assert.match(source, /requestStaffAssistantMessage\(accessToken, \{[\s\S]*messageText: content,[\s\S]*messages\.slice\(-6\)/)
  assert.match(source, /OpenRouter AI · Sensitive patterns redacted/)
  assert.match(source, /GarantiyAid AI is thinking/)
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
  assert.match(schedulerSource, /createDistribution/)
  assert.match(schedulerSource, /This creates a draft only/)
  assert.match(schedulerSource, /type="checkbox" checked=\{reviewed\}/)
})

test('staff assistant feedback is metadata-only and does not submit conversation text', () => {
  assert.match(authSource, /\/chatbot\/staff-feedback/)
  assert.match(source, /rating,[\s\S]*context:[\s\S]*intent: lastIntent/)
  assert.doesNotMatch(source, /recordStaffAssistantFeedback\([\s\S]{0,200}messageText/)
})
