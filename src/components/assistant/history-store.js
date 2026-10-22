import { newConversation, readConversations, saveConversations } from './conversation-history.js'

const checkpoint = row => ({ revision: row.revision, messageCount: row.messageCount, input: row.input, language: row.language, unfinished: row.unfinished })
export const conversationDirty = row => Boolean(row.pending || (row.messages && !row.archivedAt && (row.saved
  ? row.messages.length > row.saved.messageCount || row.input !== row.saved.input || row.language !== row.saved.language || row.unfinished !== row.saved.unfinished
  : row.messages.length || row.input.trim())))

// One writer per tab. Send only new messages, so long histories are never truncated.
export function createHistoryStore({ owner, api, storage, onUnauthorized = () => {} }) {
  const cached = readConversations(owner, storage)
  const initial = cached?.conversations.find(row => row.id === cached.activeId) ?? newConversation()
  let state = { conversations: cached?.conversations ?? [initial], activeId: initial.id, ready: false, working: false, status: 'loading', error: '', conflictId: null, cacheFailed: false }
  const listeners = new Set()
  let loading, saving, timer, cacheEnabled = true
  const current = () => state.conversations.find(row => row.id === state.activeId)
  function publish(patch = {}) {
    state = { ...state, ...patch }
    if (cacheEnabled) state.cacheFailed = !saveConversations(owner, state.activeId, state.conversations, storage)
    listeners.forEach(listener => listener())
  }
  function replace(id, update) { publish({ conversations: state.conversations.map(row => row.id === id ? update(row) : row) }) }
  function fail(error, id) {
    if (error.status === 401 && cacheEnabled) onUnauthorized()
    publish({ status: 'error', error: error.message || 'Chat history could not be saved. Please try again.', conflictId: [404, 409].includes(error.status) ? id : null })
    return false
  }
  async function hydrate(row) {
    let offset = 0, messages = [], revision, metadata
    do {
      const data = await api.get(row.id, offset)
      if (revision !== undefined && data.conversation.revision !== revision) throw new Error('This chat changed while loading. Please open it again.')
      metadata = data.conversation; revision = metadata.revision
      messages.push(...data.messages); offset = data.nextOffset
    } while (offset !== null)
    return { ...metadata, messages, saved: checkpoint(metadata) }
  }
  async function load() {
    if (loading) return loading
    loading = (async () => {
      publish({ status: 'loading', error: '', working: true })
      try {
        let offset = 0, rows = []
        do {
          const data = await api.list(offset)
          rows.push(...data.conversations.map(row => ({ ...row, saved: checkpoint(row) })))
          offset = data.nextOffset
        } while (offset !== null)
        const local = state.conversations.filter(row => conversationDirty(row) || row.id === state.activeId && !row.saved)
        rows = [...local, ...rows.filter(row => !local.some(item => item.id === row.id))]
        let selected = rows.find(row => row.id === state.activeId && !row.archivedAt)
        if (!selected) { selected = newConversation(); rows.unshift(selected) }
        if (!selected.messages) {
          selected = await hydrate(selected)
          rows = rows.map(row => row.id === selected.id ? selected : row)
        }
        publish({ conversations: rows, activeId: selected.id, ready: true, status: 'saved', conflictId: null })
        await flush()
        return true
      } catch (error) { return fail(error, state.activeId) }
      finally { loading = null; publish({ working: false }) }
    })()
    return loading
  }
  function change(fields) {
    const row = current(), values = typeof fields === 'function' ? fields(row) : fields
    if (!row || Object.entries(values).every(([key, value]) => row[key] === value)) return
    replace(row.id, item => ({ ...item, ...values, lastUsedAt: new Date().toISOString() }))
    clearTimeout(timer)
    if (state.ready && state.status !== 'error') {
      const dirty = state.conversations.some(conversationDirty)
      publish({ status: dirty ? 'saving' : 'saved' })
      if (dirty) timer = setTimeout(() => void flush(), 350)
    }
  }
  async function flush() {
    clearTimeout(timer)
    if (saving) return saving
    if (!state.ready || state.conflictId) return false
    if (!state.conversations.some(conversationDirty)) return true
    saving = (async () => {
      let target
      try {
        while ((target = state.conversations.find(conversationDirty))) {
          publish({ status: 'saving', error: '' })
          const request = target.pending ?? {
            create: !target.saved,
            body: { revision: target.saved?.revision ?? 0, mutationId: globalThis.crypto.randomUUID(),
              messages: target.messages.slice(target.saved?.messageCount ?? 0, (target.saved?.messageCount ?? 0) + 20).map(({ role, content, local }) => ({ role, content, local: Boolean(local) })),
              input: target.input, language: target.language, unfinished: Boolean(target.unfinished),
            },
          }
          replace(target.id, row => ({ ...row, pending: request }))
          const { conversation } = await api.save(target.id, request.body, request.create)
          replace(target.id, row => ({ ...row, title: conversation.title, lastUsedAt: conversation.lastUsedAt, expiresAt: conversation.expiresAt, saved: checkpoint(conversation), pending: null }))
        }
        publish({ status: 'saved', error: '', conflictId: null })
        return true
      } catch (error) { return fail(error, target?.id) }
      finally { saving = null }
    })()
    return saving
  }
  async function select(id) {
    if (state.working || !state.ready) return null
    publish({ working: true })
    try {
      if (!await flush()) return null
      const row = state.conversations.find(item => item.id === id)
      if (!row) return null
      let selected = row.saved ? await hydrate(row) : row
      if (selected.archivedAt) throw new Error('Restore this archived chat before continuing it.')
      if (selected.saved) {
        const { conversation } = await api.action(id, 'touch', selected.saved.revision)
        selected = { ...selected, lastUsedAt: conversation.lastUsedAt, expiresAt: conversation.expiresAt }
      }
      publish({ activeId: id, conversations: state.conversations.map(item => item.id === id ? selected : item), error: '' })
      return selected
    } catch (error) { fail(error, id); return null }
    finally { publish({ working: false }) }
  }
  async function touchActive() {
    const row = current()
    if (!row.saved || !state.ready || !await flush()) return
    try {
      const { conversation } = await api.action(row.id, 'touch', row.saved.revision)
      replace(row.id, item => ({ ...item, lastUsedAt: conversation.lastUsedAt, expiresAt: conversation.expiresAt }))
    } catch (error) { fail(error, row.id) }
  }
  async function start() {
    if (state.working || !state.ready) return null
    publish({ working: true })
    try {
      if (!await flush()) return null
      if (!current().messages.length && !current().input.trim()) return current()
      const row = { ...newConversation(), language: current().language }
      publish({ activeId: row.id, conversations: [row, ...state.conversations] })
      return row
    } finally { publish({ working: false }) }
  }
  async function act(id, action) {
    if (state.working) return false
    publish({ working: true })
    try {
      if (!await flush()) return false
      const row = state.conversations.find(item => item.id === id)
      if (!row) return false
      const result = row.saved ? await api.action(id, action, row.saved.revision) : { conversation: null }
      let rows = action === 'delete' ? state.conversations.filter(item => item.id !== id)
        : state.conversations.map(item => item.id === id ? { ...item, ...result.conversation, saved: checkpoint(result.conversation) } : item)
      let activeId = state.activeId
      if (activeId === id && action !== 'restore') {
        const blank = { ...newConversation(), language: row.language }; rows = [blank, ...rows]; activeId = blank.id
      }
      publish({ conversations: rows, activeId, error: '', status: 'saved' })
      return true
    } catch (error) { return fail(error, id) }
    finally { publish({ working: false }) }
  }
  async function saveCopy() {
    const row = state.conversations.find(item => item.id === state.conflictId)
    if (!row?.messages) return false
    const copy = { ...newConversation(), messages: row.messages, input: row.input, language: row.language, unfinished: row.unfinished }
    publish({ conversations: [copy, ...state.conversations.filter(item => item.id !== row.id)], activeId: copy.id, conflictId: null, error: '', status: 'saving' })
    return flush()
  }
  return {
    subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener) }, getSnapshot: () => state,
    load, change, flush, select, start, act, saveCopy, touchActive,
    retry: () => state.ready ? flush() : load(),
    hasUnsaved: () => state.conversations.some(conversationDirty),
    connect: () => { cacheEnabled = true; return () => { cacheEnabled = false; clearTimeout(timer); void flush() } },
  }
}
