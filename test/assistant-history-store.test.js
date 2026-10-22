import test from 'node:test'
import assert from 'node:assert/strict'
import { createHistoryStore } from '../src/components/assistant/history-store.js'
import { historyApiFixture } from '../scripts/fixtures/assistant-history.js'
import { newConversation, saveConversations } from '../src/components/assistant/conversation-history.js'

function setup(fixture = historyApiFixture(), storage = null) {
  const items = new Map()
  storage ??= { getItem: key => items.get(key), setItem: (key, value) => items.set(key, value), removeItem: key => items.delete(key) }
  const store = createHistoryStore({ owner: 'staff', api: fixture.api, storage })
  const current = () => store.getSnapshot().conversations.find(row => row.id === store.getSnapshot().activeId)
  return { store, current, fixture, storage }
}

test('account history survives a fresh tab/session, restores draft, and exceeds old 20-chat/100-message caps', async () => {
  const { store, fixture, current } = setup()
  for (let i = 0; i < 125; i++) await fixture.seed(`Older chat ${i}`)
  await store.load()
  store.change({ messages: Array.from({ length: 125 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: `Message ${i}` })), input: 'Keep my draft', language: 'en' })
  assert.equal(await store.flush(), true)
  const id = current().id
  assert.equal(fixture.rows.get(id).messages.length, 125)
  const fresh = setup(fixture)
  await fresh.store.load()
  assert.equal(fresh.store.getSnapshot().conversations.filter(row => row.saved).length, 126)
  await fresh.store.select(id)
  assert.equal(fresh.current().messages.length, 125)
  assert.equal(fresh.current().input, 'Keep my draft')
  const writes = fixture.writes
  await fresh.store.load(); await fresh.store.flush()
  assert.equal(fixture.writes, writes, 'Passive loading does not refresh the inactivity timer')
})

test('legacy session chats migrate without losing any saved conversation', async () => {
  const data = setup(), a = { ...newConversation(), messages: [{ role: 'user', content: 'Legacy question' }] }
  delete a.lastUsedAt; delete a.expiresAt
  saveConversations('staff', a.id, [a], data.storage)
  const migrated = setup(data.fixture, data.storage)
  await migrated.store.load()
  assert.equal(data.fixture.rows.get(a.id).messages[0].content, 'Legacy question')
  assert.ok(Number.isFinite(Date.parse(migrated.current().lastUsedAt)))
})

test('changing language in an empty chat does not create clutter or leave a saving indicator', async () => {
  const data = setup(); await data.store.load()
  data.store.change({ language: 'en' }); await data.store.flush()
  assert.equal(data.store.getSnapshot().status, 'saved')
  assert.equal(data.fixture.rows.size, 0)
})

test('offline and interrupted saves retain drafts; retry never duplicates messages, even after reload', async () => {
  const data = setup(); await data.store.load()
  data.fixture.failWrites = true
  data.store.change({ messages: [{ role: 'user', content: 'Keep this question' }], input: 'Still typing' })
  assert.equal(await data.store.flush(), false)
  assert.equal(data.current().messages.length, 1)
  data.fixture.failWrites = false; data.fixture.loseResponse = true
  assert.equal(await data.store.retry(), false)
  assert.equal(data.fixture.rows.get(data.current().id).messages.length, 1)
  const reloaded = setup(data.fixture, data.storage)
  await reloaded.store.load()
  assert.equal(reloaded.store.getSnapshot().status, 'saved')
  assert.equal(data.fixture.rows.get(reloaded.current().id).messages.length, 1)
  assert.equal(reloaded.current().input, 'Still typing')
})

test('archive/restore/delete affect only the chosen chat and never recreate deleted chats', async () => {
  const data = setup(); await data.store.load()
  data.store.change({ messages: [{ role: 'user', content: 'Archive me' }] }); await data.store.flush()
  const id = data.current().id, expiry = data.fixture.rows.get(id).expiresAt
  await data.store.act(id, 'archive')
  assert.notEqual(data.current().id, id)
  assert.equal(data.fixture.rows.get(id).expiresAt, expiry)
  await data.store.act(id, 'restore'); await data.store.select(id)
  assert.equal(data.current().messages[0].content, 'Archive me')
  await data.store.act(id, 'delete'); await data.store.flush()
  assert.equal(data.fixture.rows.has(id), false)
  assert.equal(data.store.getSnapshot().conversations.some(row => row.id === id), false)
})

test('two tabs cannot silently overwrite; a separate copy preserves unsaved work', async () => {
  const first = setup(); const id = await first.fixture.seed('Shared chat')
  const second = setup(first.fixture)
  await first.store.load(); await second.store.load(); await first.store.select(id); await second.store.select(id)
  first.store.change({ input: 'First window draft' }); await first.store.flush()
  second.store.change({ input: 'Second window draft' })
  assert.equal(await second.store.flush(), false)
  assert.equal(second.store.getSnapshot().conflictId, id)
  assert.equal(first.fixture.rows.get(id).input, 'First window draft')
  assert.equal(await second.store.saveCopy(), true)
  assert.notEqual(second.current().id, id)
  assert.equal(first.fixture.rows.get(second.current().id).input, 'Second window draft')
})

test('changes made during a slow save are queued, and double selection cannot race', async () => {
  const data = setup(); await data.store.load()
  let release
  const original = data.fixture.api.save
  data.fixture.api.save = async (...args) => { await new Promise(resolve => { release = resolve }); return original(...args) }
  data.store.change({ input: 'Before request' })
  const flush = data.store.flush()
  data.store.change({ input: 'Typed while saving' })
  data.fixture.api.save = original; release(); await flush
  assert.equal(data.fixture.rows.get(data.current().id).input, 'Typed while saving')
  assert.equal(data.store.hasUnsaved(), false)
})
