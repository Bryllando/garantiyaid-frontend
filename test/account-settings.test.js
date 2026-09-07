import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('../src/pages/AccountSettingsPage.jsx', import.meta.url), 'utf8')

test('account settings progressively discloses URL-addressable focused panels', () => {
  assert.match(source, /new URLSearchParams\(window\.location\.search\)/)
  assert.match(source, /window\.history\.pushState/)
  assert.match(source, /aria-current=\{selected \? 'page'/)

  for (const section of ['profile', 'password', 'authenticator', 'recovery', 'sessions']) {
    assert.match(source, new RegExp(`displayedSection === '${section}'`))
    assert.match(source, new RegExp(`id="account-${section}-panel"`))
  }
})

test('authenticator replacement keeps the existing secure flow understandable', () => {
  assert.match(source, /existing QR code cannot be displayed again/)
  assert.match(source, /current authenticator remains active until the new phone produces a valid code/)
  assert.match(source, /Set up on a new phone/)
  assert.match(source, /startOwnTotpReplacement/)
  assert.match(source, /confirmOwnTotpReplacement/)
})

test('account navigation keeps responsive and keyboard-accessible states', () => {
  assert.match(source, /lg:grid-cols-\[19rem_minmax\(0,1fr\)\]/)
  assert.match(source, /min-h-14 w-full/)
  assert.match(source, /focus-visible:outline-brand-blue/)
  assert.match(source, /tabIndex=\{-1\}/)
  assert.match(source, /lg:hidden/)
})
