import test from 'node:test'
import assert from 'node:assert/strict'
import { ASSISTANT_HISTORY_KEY, conversationOwner, newConversation, readConversations, saveConversations } from '../src/components/assistant/conversation-history.js'
import { clearStaffSession } from '../src/auth/staffAuth.js'

test('conversation history is scoped to the staff identity, role, and barangay and cleared at logout', () => {
  const items = new Map()
  const storage = { getItem: (key) => items.get(key), setItem: (key, value) => items.set(key, value), removeItem: (key) => items.delete(key) }
  const user = { userId: 'staff-one', role: 'BARANGAY_FACILITATOR', barangayId: 'area-one' }
  const owner = conversationOwner(user)
  const conversation = { ...newConversation(), messages: [{ role: 'user', content: 'How do I prepare a reminder?' }], approvalId: 'must-not-persist', recipients: ['must-not-persist'] }
  assert.equal(saveConversations(owner, conversation.id, [conversation], storage), true)
  assert.equal(readConversations(owner, storage).conversations[0].messages[0].content, conversation.messages[0].content)
  for (const changed of [{ userId: 'staff-two' }, { role: 'SYSTEM_ADMIN' }, { barangayId: 'area-two' }]) assert.equal(readConversations(conversationOwner({ ...user, ...changed }), storage), null)
  assert.ok(!storage.getItem(ASSISTANT_HISTORY_KEY).includes('must-not-persist'))
  const original = globalThis.sessionStorage
  globalThis.sessionStorage = storage
  try { clearStaffSession(); assert.equal(readConversations(owner, storage), null) }
  finally { if (original === undefined) delete globalThis.sessionStorage; else globalThis.sessionStorage = original }
})

test('unavailable or invalid history does not prevent the assistant from opening', () => {
  assert.equal(readConversations('owner', { getItem: () => '{invalid' }), null)
  assert.equal(readConversations('owner', { getItem: () => JSON.stringify({ owner: 'owner', activeId: 'a', conversations: [null] }) }), null)
  assert.equal(saveConversations('owner', 'a', [], { setItem: () => { throw new Error('Quota exceeded') } }), false)
})
