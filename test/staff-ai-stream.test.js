import assert from 'node:assert/strict'
import test from 'node:test'
import { requestStaffAssistantMessage } from '../src/auth/staffAuth.js'

const answer = { messageText: 'Maayong adlaw — kumusta?', externalAiUsed: true }
const frame = (event) => `data: ${JSON.stringify(event)}\n\n`

test('staff chat renders partial UTF-8 text before completion and handles retry resets', async (t) => {
  let transport
  let sawFirstText
  const firstText = new Promise((resolve) => { sawFirstText = resolve })
  const texts = []
  const statuses = []
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    assert.equal(options.headers.Authorization, 'Bearer test-token')
    assert.equal(options.headers.Accept, 'text/event-stream')
    return new Response(new ReadableStream({ start(controller) { transport = controller } }), {
      headers: { 'Content-Type': 'text/event-stream' },
    })
  })
  const request = requestStaffAssistantMessage('test-token', { messageText: 'Help' }, {
    onText(text) { texts.push(text); sawFirstText() },
    onStatus(status) { statuses.push(status) },
  })
  const encoder = new TextEncoder()
  const partial = encoder.encode(frame({ type: 'text', text: 'Maayong adlaw —' }))
  for (const byte of partial) transport.enqueue(new Uint8Array([byte]))
  await firstText
  assert.deepEqual(texts, ['Maayong adlaw —'])
  transport.enqueue(encoder.encode(': keep-alive\n\n' + frame({ type: 'text', text: '' }) + frame({ type: 'status', status: 'retrying' }) + frame({ type: 'done', data: answer })))
  assert.deepEqual(await request, answer)
  assert.deepEqual(texts, ['Maayong adlaw —', ''])
  assert.deepEqual(statuses, ['retrying'])
})

test('staff chat rejects an incomplete or failed stream and preserves HTTP errors', async (t) => {
  for (const content of [frame({ type: 'text', text: 'Partial' }), frame({ type: 'error' })]) {
    const mock = t.mock.method(globalThis, 'fetch', async () => new Response(content, { headers: { 'Content-Type': 'text/event-stream' } }))
    await assert.rejects(requestStaffAssistantMessage('token', {}), /interrupted/)
    mock.mock.restore()
  }
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ error: { message: 'Session expired' } }), { status: 401 }))
  await assert.rejects(requestStaffAssistantMessage('token', {}), { message: 'Session expired', status: 401 })
})

test('staff chat forwards cancellation and supports a server returning JSON', async (t) => {
  const controller = new AbortController()
  let signal
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    signal = options.signal
    return new Response(JSON.stringify({ data: answer }), { headers: { 'Content-Type': 'application/json' } })
  })
  assert.deepEqual(await requestStaffAssistantMessage('token', {}, { signal: controller.signal }), answer)
  controller.abort()
  assert.equal(signal.aborted, true)
})
