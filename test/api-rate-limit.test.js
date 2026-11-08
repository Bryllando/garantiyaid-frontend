import assert from 'node:assert/strict'
import test from 'node:test'
import { reissueDistributionQrToken, requestPrograms } from '../src/auth/staffAuth.js'

test('API cooldown respects Retry-After, isolates accounts and never automatically retries a write', async t => {
  let now = 10000, calls = 0
  t.mock.method(Date, 'now', () => now)
  t.mock.method(globalThis, 'fetch', async () => {
    calls++
    return calls === 1
      ? new Response(JSON.stringify({ error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Wait before retrying.', scope: 'garantiyaid-api' } }), { status: 429, headers: { 'Retry-After': '2' } })
      : new Response(JSON.stringify({ data: { programs: [], pagination: {} } }))
  })
  await assert.rejects(reissueDistributionQrToken('cooldown-staff', 'event-1', 'qr-1'), error => error.status === 429 && error.retryAfterSeconds === 2)
  await assert.rejects(requestPrograms('cooldown-staff'), error => error.retryAfterSeconds === 2)
  assert.equal(calls, 1, 'Polling and repeated actions do not hit the API during its cooldown')
  await requestPrograms('different-staff')
  assert.equal(calls, 2, 'A different account retains its own request budget')
  now += 1001
  await assert.rejects(requestPrograms('cooldown-staff'), error => error.retryAfterSeconds === 1)
  now += 1000
  await requestPrograms('cooldown-staff')
  assert.equal(calls, 3)
})

test('a dedicated action limit does not block unrelated API reads', async t => {
  let calls = 0
  t.mock.method(globalThis, 'fetch', async () => ++calls === 1
    ? new Response(JSON.stringify({ error: { code: 'RATE_LIMIT_EXCEEDED', scope: 'garantiyaid-notifications', retryAfterSeconds: 30 } }), { status: 429 })
    : new Response(JSON.stringify({ data: { programs: [], pagination: {} } })))
  await assert.rejects(requestPrograms('scoped-limit-staff'), error => error.retryAfterSeconds === 30)
  await requestPrograms('scoped-limit-staff')
  assert.equal(calls, 2)
})

test('replacement uses the protected POST endpoint and requires the one-time raw credential', async t => {
  let malformed = false
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.ok(url.endsWith('/distributions/event-1/qr-tokens/qr-1/reissue'))
    assert.equal(options.method, 'POST')
    assert.equal(options.headers.Authorization, 'Bearer replacement-staff')
    return new Response(JSON.stringify({ data: { qrToken: { qrTokenId: 'qr-1', ...(malformed ? {} : { token: 'synthetic-only' }) }, rawTokenReturnedOnce: true } }))
  })
  assert.equal((await reissueDistributionQrToken('replacement-staff', 'event-1', 'qr-1')).token, 'synthetic-only')
  malformed = true
  await assert.rejects(reissueDistributionQrToken('replacement-staff', 'event-1', 'qr-1'), /unexpected replacement QR/)
})
