import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('../src/pages/HomePage.jsx', import.meta.url), 'utf8')

test('public landing page states its service boundary and protected staff path', () => {
  assert.match(source, /Government-service capstone prototype/)
  assert.match(source, /Not an official application, eligibility, or claim-status channel/)
  assert.match(source, /No public application or beneficiary lookup/)
  assert.match(source, /Separation of duties/)
  assert.match(source, /src="\/LandingPage\.png"/)
  assert.match(source, /width="1586"/)
  assert.match(source, /href="\/login"/)
})
