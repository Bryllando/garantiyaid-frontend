import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { requestAssistantConversations, requestAssistantConversation, saveAssistantConversation, updateAssistantConversation } from '../../auth/staffAuth.js'
import { conversationOwner } from './conversation-history.js'
import { createHistoryStore } from './history-store.js'

export function useAssistantHistory({ user, accessToken, active, onSessionExpired }) {
  const credentials = useRef({ accessToken, onSessionExpired })
  useEffect(() => { credentials.current = { accessToken, onSessionExpired } }, [accessToken, onSessionExpired])
  // These callbacks read credentials only during API requests, never during render.
  // eslint-disable-next-line react/refs
  const [store] = useState(() => createHistoryStore({
    owner: conversationOwner(user),
    onUnauthorized: () => credentials.current.onSessionExpired?.(),
    api: {
      list: offset => requestAssistantConversations(credentials.current.accessToken, offset),
      get: (id, offset) => requestAssistantConversation(credentials.current.accessToken, id, offset),
      save: (id, body, create) => saveAssistantConversation(credentials.current.accessToken, id, body, create),
      action: (id, action, revision) => updateAssistantConversation(credentials.current.accessToken, id, action, revision),
    },
  }))
  const history = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
  useEffect(() => store.connect(), [store])
  useEffect(() => { if (active && !store.getSnapshot().ready) void store.load() }, [active, store])
  useEffect(() => { if (active && history.ready) void store.touchActive() }, [active, history.ready, store])
  useEffect(() => {
    const retry = () => { if (store.getSnapshot().ready) void store.retry() }
    const flush = () => { if (document.visibilityState === 'hidden') void store.flush() }
    const warn = event => { if (store.hasUnsaved()) { event.preventDefault(); event.returnValue = '' } }
    window.addEventListener('online', retry)
    document.addEventListener('visibilitychange', flush)
    window.addEventListener('beforeunload', warn)
    return () => {
      window.removeEventListener('online', retry)
      document.removeEventListener('visibilitychange', flush)
      window.removeEventListener('beforeunload', warn)
    }
  }, [store])
  const setMessages = useCallback(update => store.change(row => ({ messages: typeof update === 'function' ? update(row.messages) : update })), [store])
  const setChatInput = useCallback(input => store.change({ input }), [store])
  const setLanguage = useCallback(language => store.change({ language }), [store])
  return { history, store, conversation: history.conversations.find(row => row.id === history.activeId), setMessages, setChatInput, setLanguage }
}
