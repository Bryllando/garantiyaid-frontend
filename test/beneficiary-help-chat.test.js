import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('../src/components/assistant/BeneficiaryHelpChat.jsx', import.meta.url), 'utf8')
const homeSource = readFileSync(new URL('../src/pages/HomePage.jsx', import.meta.url), 'utf8')
const authSource = readFileSync(new URL('../src/auth/staffAuth.js', import.meta.url), 'utf8')

test('public beneficiary help is multilingual, accessible, and embedded on the home page', () => {
  assert.match(homeSource, /<BeneficiaryHelpChat \/>/)
  assert.match(source, /en:[\s\S]*fil:[\s\S]*ceb:/)
  assert.match(source, /role="dialog" aria-modal="false"/)
  assert.match(source, /prefers-reduced-motion: reduce/)
  assert.match(source, /aria-expanded=\{open\}/)
  assert.match(source, /aria-controls="beneficiary-help-panel"/)
})

test('public help uses a session credential and clearly blocks personal-record use', () => {
  assert.match(source, /createPublicChatbotSession/)
  assert.match(source, /submitPublicChatbotMessage/)
  assert.match(authSource, /X-Chatbot-Session-Token/)
  assert.match(source, /General guidance only/)
  assert.match(source, /cannot check personal applications, schedules, claims, or eligibility/)
  assert.match(source, /Sensitive-looking information was removed/)
  assert.match(source, /AI-assisted wording · No personal records shared/)
})
