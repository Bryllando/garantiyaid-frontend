import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('../src/pages/HomePage.jsx', import.meta.url), 'utf8')

test('public landing page states its service boundary and protected staff path', () => {
  assert.match(source, /Government-service capstone prototype/)
  assert.match(source, /Not an official application, eligibility, or claim-status channel/)
  assert.match(source, /No public application or beneficiary lookup/)
  assert.match(source, /Separation of duties/)
  assert.match(source, /Verification is not a completed release/)
  assert.match(source, /recorded handover and receipt/)
  assert.match(source, /Digital wallet credits are simulated/)
  assert.match(source, /href="\/login"/)
})

test('burial referral information distinguishes preparation from assistance approval', () => {
  assert.match(source, /A referral is not an approval, Guarantee Letter, or payment/)
  assert.match(source, /The receiving office assesses the request and decides the assistance/)
  assert.match(source, /Staff print the reviewed letter for the designated officer to sign/)
  assert.match(source, /Printing does not record issuance/)
  assert.match(source, /Burial referrals are read-only for Admin oversight/)
})
