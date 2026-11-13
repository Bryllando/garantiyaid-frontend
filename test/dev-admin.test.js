import test from 'node:test'
import assert from 'node:assert/strict'
import { getLoginOutcome, requestStaffLogin } from '../src/auth/staffAuth.js'

test('Developer Admin uses the same username/password API and receives a backend-authenticated session', async t => {
  const requests = []
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    requests.push({ url, options })
    return { ok: true, json: async () => ({ data: { accessToken: 'fixture-only', user: { employeeId: 'DEV-ADMIN', role: 'SYSTEM_ADMIN' } } }) }
  })
  const credentials = { identifier: 'DEV-ADMIN', password: 'fixture-only-password' }
  const data = await requestStaffLogin(credentials)
  assert.equal(getLoginOutcome(data), 'authenticated')
  assert.equal(data.user.role, 'SYSTEM_ADMIN')
  assert.equal(requests.length, 1)
  assert.match(requests[0].url, /auth\/login$/)
  assert.deepEqual(JSON.parse(requests[0].options.body), credentials)
})

test('the common login path respects TOTP outcomes returned by the backend', async t => {
  for (const [data, expected] of [[{ requiresTotp: true }, 'totp'], [{ requiresTotpEnrollment: true, totpSetupToken: 'fixture' }, 'totp-enrollment']]) {
    const mock = t.mock.method(globalThis, 'fetch', async () => ({ ok: true, json: async () => ({ data }) }))
    assert.equal(getLoginOutcome(await requestStaffLogin({ identifier: 'ordinary.admin', password: 'fixture-only-password' })), expected)
    mock.mock.restore()
  }
})

test('invalid developer credentials preserve the backend error without retrying or bypassing login', async t => {
  let calls = 0
  t.mock.method(globalThis, 'fetch', async () => {
    calls++
    return { ok: false, status: 401, json: async () => ({ error: { code: 'INVALID_CREDENTIALS', message: 'Invalid credentials.' } }) }
  })
  await assert.rejects(requestStaffLogin({ identifier: 'DEV-ADMIN', password: 'wrong-password' }), { code: 'INVALID_CREDENTIALS', status: 401 })
  assert.equal(calls, 1)
})
