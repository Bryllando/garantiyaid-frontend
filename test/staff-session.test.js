import test from 'node:test'
import assert from 'node:assert/strict'
import { setImmediate as flush } from 'node:timers/promises'
import { clearLoginToken, currentStaffToken, storeLoginToken, watchStaffSession } from '../src/auth/staff-session.js'
import { isSessionExpiredError } from '../src/auth/staffAuth.js'

test('working staff renew without remounting their workspace, an unattended session warns and expires', async t => {
  const epoch = 2000000000
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: epoch * 1000 })
  const listeners = new Map()
  const values = new Map()
  const environment = {
    sessionStorage: { getItem: k => values.get(k) ?? null, setItem: (k,v) => values.set(k,v), removeItem: k => values.delete(k) },
    window: { addEventListener: (k,v) => listeners.set(k,v), removeEventListener: k => listeners.delete(k) },
    document: { visibilityState: 'visible', addEventListener() {}, removeEventListener() {} },
  }
  for (const [k,v] of Object.entries(environment)) {
    const old = Object.getOwnPropertyDescriptor(globalThis, k)
    Object.defineProperty(globalThis, k, { configurable: true, value: v })
    t.after(() => { if (old) Object.defineProperty(globalThis, k, old); else delete globalThis[k] })
  }
  const token = time => 'header.' + Buffer.from(JSON.stringify({ iat: time, exp: time + 900, session_end: epoch + 28800 })).toString('base64url') + '.test'
  const initial = token(epoch)
  storeLoginToken({ accessToken: initial, continuationToken: 'test-proof' })
  let calls = 0, warnings = 0, expirations = 0
  const stop = watchStaffSession(initial, {
    renew: async (current, proof) => { assert.equal(proof, 'test-proof'); assert.equal(current, initial); calls++; return token(Date.now() / 1000) },
    warn: () => { warnings++ }, expire: () => { expirations++ }, dismiss() {},
  })
  t.mock.timers.tick(13 * 60000)
  assert.equal(warnings, 1)
  assert.equal(calls, 0)
  listeners.get('keydown')({ isTrusted: false })
  environment.document.visibilityState = 'hidden'
  listeners.get('keydown')({ isTrusted: true })
  assert.equal(calls, 0)
  environment.document.visibilityState = 'visible'
  listeners.get('keydown')({ isTrusted: true })
  await flush()
  assert.equal(calls, 1)
  assert.notEqual(currentStaffToken(initial), initial)
  t.mock.timers.tick(15 * 60000)
  assert.equal(expirations, 1)
  assert.equal(calls, 1)
  stop()
  clearLoginToken()
  assert.equal(values.size, 0)
  assert.equal(isSessionExpiredError({ status: 401, code: 'ACCOUNT_REAUTHENTICATION_FAILED' }), false)
  assert.equal(isSessionExpiredError({ status: 401, code: 'INVALID_SESSION' }), true)
})
