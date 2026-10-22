import assert from 'node:assert/strict'
import { setImmediate } from 'node:timers/promises'
import test from 'node:test'
import { checkSignInReadiness } from '../src/auth/signInReadiness.js'

const readyResponse = () => ({ ok: true, json: async () => ({ data: { timestamp: new Date().toISOString() } }) })

test('startup recovers automatically using only health requests and stops checking once connected', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const requests = []
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    requests.push({ url, options })
    if (requests.length === 1) throw new TypeError('Failed to fetch')
    if (requests.length === 2) return { ok: false, status: 503, json: async () => ({ error: { code: 'API_UNAVAILABLE' } }) }
    return readyResponse()
  })
  const statuses = []
  const stop = checkSignInReadiness((status) => statuses.push(status))
  t.after(stop)
  await setImmediate()
  assert.deepEqual(statuses, ['checking', 'unavailable'])
  t.mock.timers.tick(3000)
  await setImmediate()
  assert.equal(statuses.at(-1), 'unavailable')
  t.mock.timers.tick(3000)
  await setImmediate()
  assert.equal(statuses.at(-1), 'ready')
  t.mock.timers.tick(30000)
  await setImmediate()
  assert.equal(requests.length, 3)
  for (const { url, options } of requests) {
    assert.match(url, /\/api\/v1\/health$/)
    assert.equal(options.method, 'GET')
    assert.equal(options.body, undefined)
    assert.equal(options.headers.Authorization, undefined)
  }
})

test('a hanging startup check times out and a later check can recover', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  let calls = 0
  let firstSignal
  t.mock.method(globalThis, 'fetch', async (_url, { signal }) => {
    calls += 1
    if (calls > 1) return readyResponse()
    firstSignal = signal
    return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true }))
  })
  const statuses = []
  const stop = checkSignInReadiness((status) => statuses.push(status))
  t.after(stop)
  t.mock.timers.tick(5000)
  await setImmediate()
  assert.equal(firstSignal.aborted, true)
  assert.equal(statuses.at(-1), 'unavailable')
  t.mock.timers.tick(3000)
  await setImmediate()
  assert.equal(statuses.at(-1), 'ready')
})

test('leaving the login page cancels the check without retrying or updating the page', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  let signal
  let calls = 0
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    calls += 1
    signal = options.signal
    return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true }))
  })
  const statuses = []
  const stop = checkSignInReadiness((status) => statuses.push(status))
  stop()
  await setImmediate()
  t.mock.timers.tick(30000)
  await setImmediate()
  assert.equal(signal.aborted, true)
  assert.equal(calls, 1)
  assert.deepEqual(statuses, ['checking'])
})
