export const ASSISTANT_HISTORY_KEY = 'garantiyaid.assistantConversations'

export function conversationOwner(user) {
  return user?.userId ? JSON.stringify([user.userId, user.role, user.barangayId ?? null]) : null
}

export function newConversation() {
  const id = globalThis.crypto?.randomUUID?.() ?? `chat-${Date.now()}-${Math.random().toString(36).slice(2)}`
  return { id, messages: [], input: '', language: 'ceb', unfinished: false, lastUsedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 30 * 86400000).toISOString(), archivedAt: null }
}

export function conversationTitle(conversation) {
  return (conversation.messages?.find((message) => message.role === 'user')?.content
    || conversation.title || conversation.messages?.[0]?.content || conversation.input || 'New conversation').replace(/\s+/g, ' ').slice(0, 90)
}

export function readConversations(owner, storage) {
  try {
    storage ??= globalThis.sessionStorage
    const data = JSON.parse(storage?.getItem(ASSISTANT_HISTORY_KEY) || 'null')
    if (!owner || data?.owner !== owner || !Array.isArray(data.conversations)) return null
    const conversations = data.conversations.filter((row) => row && typeof row.id === 'string'
      && typeof row.input === 'string' && ['en', 'fil', 'ceb'].includes(row.language)
      && (!row.expiresAt || Date.parse(row.expiresAt) > Date.now())
      && Array.isArray(row.messages) && row.messages.every((message) => message && ['user', 'assistant'].includes(message.role) && typeof message.content === 'string'))
    return conversations.length ? { activeId: conversations.some(row => row.id === data.activeId) ? data.activeId : conversations[0].id, conversations } : null
  } catch { return null }
}

export function saveConversations(owner, activeId, conversations, storage) {
  if (!owner) return false
  try {
    storage ??= globalThis.sessionStorage
    // Recovery cache only. Account history is authoritative; operational approvals and recipient previews stay out.
    storage.setItem(ASSISTANT_HISTORY_KEY, JSON.stringify({ owner, activeId, conversations: conversations.filter(row => Array.isArray(row.messages)).map((row) => ({
      id: row.id, language: row.language, input: row.input, unfinished: Boolean(row.unfinished),
      title: row.title, lastUsedAt: row.lastUsedAt, expiresAt: row.expiresAt, archivedAt: row.archivedAt,
      saved: row.saved, pending: row.pending,
      messages: row.messages.map(({ role, content, local }) => ({ role, content, local: Boolean(local) })),
    })) }))
    return true
  } catch { return false }
}
