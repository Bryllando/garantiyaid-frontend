import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('../src/pages/AdminStaffSecurityPage.jsx', import.meta.url), 'utf8')

test('staff authenticator recovery identifies its task and explains unavailable resets', () => {
  assert.match(source, /aria-labelledby="security-title"/)
  assert.match(source, /official identity-verification process/)
  assert.match(source, /supervisorConfirmed/)
  assert.match(source, /sm:grid-cols-\[minmax\(0,1fr\)_13rem\]/)
  assert.match(source, /sm:items-start/)
  assert.match(source, /sm:w-52 sm:justify-self-end/)
  assert.match(source, /aria-describedby=\{!canReset/)
  assert.match(source, /Another System Administrator must reset your authenticator/)
})

test('reset confirmation moves focus into the workflow and restores it on cancel', () => {
  assert.match(source, /resetHeadingRef\.current\?\.focus/)
  assert.match(source, /resetTriggerRef\.current \?\? returnLinkRef\.current/)
  assert.match(source, /ref=\{resetHeadingRef\} tabIndex=\{-1\}/)
})
