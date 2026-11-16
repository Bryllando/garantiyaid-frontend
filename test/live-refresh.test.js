import assert from 'node:assert/strict'
import test from 'node:test'
import { createLiveRefresh } from '../src/utils/liveRefresh.js'
import { getApiRetryAfterSeconds, requestPrograms, subscribeApiCooldown } from '../src/auth/staffAuth.js'

test('continuous live events remain bounded over a full 15-minute request window and stop on cleanup', t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'] })
  let calls = 0
  const refresh = createLiveRefresh('bounded-events', () => calls++)
  for (let second = 0; second < 900; second++) { refresh(); t.mock.timers.tick(1000) }
  assert.equal(calls, 45, 'A continuous stream must not create a request per event')
  refresh.cancel()
  refresh(); t.mock.timers.tick(60_000)
  assert.equal(calls, 45, 'Unmounted views must not refresh')
})

test('a scheduled live refresh honors the complete server cooldown and informs only its account', async t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'] })
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ error: { code: 'RATE_LIMIT_EXCEEDED', scope: 'garantiyaid-api', retryAfterSeconds: 60 } }), { status: 429 }))
  let calls = 0, ownSignals = 0, otherSignals = 0
  const unsubscribe = subscribeApiCooldown('paused-events', () => ownSignals++)
  const unsubscribeOther = subscribeApiCooldown('other-events', () => otherSignals++)
  t.after(unsubscribe); t.after(unsubscribeOther)
  const refresh = createLiveRefresh('paused-events', () => calls++)
  refresh()
  await assert.rejects(requestPrograms('paused-events'), error => error.retryAfterSeconds === 60 && error.retryAt === Date.now() + 60_000)
  assert.equal(ownSignals, 1); assert.equal(otherSignals, 0)
  t.mock.timers.tick(20_000)
  assert.equal(calls, 0)
  t.mock.timers.tick(39_000)
  assert.equal(getApiRetryAfterSeconds('paused-events'), 1)
  assert.equal(calls, 0)
  t.mock.timers.tick(1000)
  assert.equal(calls, 1)
  assert.equal(getApiRetryAfterSeconds('paused-events'), 0)
  refresh.cancel()
})

test('hidden workspaces make no automatic reads and resume after they become visible', t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'] })
  const previous = globalThis.document
  globalThis.document = { visibilityState: 'hidden' }
  t.after(() => { if (previous === undefined) delete globalThis.document; else globalThis.document = previous })
  let calls = 0
  const refresh = createLiveRefresh('hidden-events', () => calls++)
  refresh(); t.mock.timers.tick(120_000)
  assert.equal(calls, 0)
  document.visibilityState = 'visible'
  t.mock.timers.tick(20_000)
  assert.equal(calls, 1)
  refresh.cancel()
})
