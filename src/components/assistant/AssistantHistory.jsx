import { useEffect, useRef, useState } from 'react'
import { Icon } from '../ui/icon.jsx'
import { conversationTitle } from './conversation-history.js'

const dateLabel = value => new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric' }).format(new Date(value))

export function HistorySaveStatus({ history, store }) {
  const canCopy = history.conflictId && history.conversations.find(row => row.id === history.conflictId)?.messages
  return <div className="ga-assistant-save-status" data-error={Boolean(history.error)} role="status" aria-live="polite">
    {history.error ? <><span>{history.error} Keep this page open until your changes are saved.</span>
      <button type="button" onClick={() => void (canCopy ? store.saveCopy() : history.conflictId ? store.load() : store.retry())}>{canCopy ? 'Save as new chat' : 'Retry'}</button></>
      : <><Icon name={history.status === 'saved' ? 'check' : 'clock'} className="size-3.5 shrink-0" /><span>{history.status === 'loading' ? 'Loading your saved chats…' : history.status === 'saving' ? 'Saving…' : 'Saved to your account'}</span></>}
    {history.cacheFailed && history.status !== 'saved' && <span>Browser recovery is unavailable. Wait for account saving before leaving.</span>}
  </div>
}

function DeleteChatDialog({ conversation, busy, error, onCancel, onDelete }) {
  const ref = useRef(null)
  useEffect(() => {
    if (conversation && !ref.current.open) ref.current.showModal()
    if (!conversation && ref.current.open) ref.current.close()
  }, [conversation])
  return <dialog ref={ref} aria-labelledby="delete-chat-title" aria-describedby="delete-chat-description" className="ga-assistant-delete-dialog" onKeyDown={event => {
    event.stopPropagation()
    if (event.key !== 'Tab') return
    const buttons = [...ref.current.querySelectorAll('button:not(:disabled)')]
    if (!buttons.length) { event.preventDefault(); return }
    if (event.shiftKey && document.activeElement === buttons[0]) { event.preventDefault(); buttons.at(-1).focus() }
    else if (!event.shiftKey && document.activeElement === buttons.at(-1)) { event.preventDefault(); buttons[0].focus() }
  }} onCancel={event => { event.preventDefault(); if (!busy) onCancel() }}>
    <h2 id="delete-chat-title">Delete this conversation?</h2>
    <p className="ga-assistant-delete-name">{conversation && conversationTitle(conversation)}</p>
    <p id="delete-chat-description">This permanently deletes the messages and draft from your account. You can archive the chat instead to keep it.</p>
    {error && <p role="alert" className="mt-3 text-sm text-brand-red">{error}</p>}
    <div className="ga-assistant-delete-actions"><button autoFocus type="button" className="ga-btn-secondary" disabled={busy} onClick={onCancel}>Cancel</button><button type="button" className="ga-btn-danger" disabled={busy} onClick={onDelete}>{busy ? 'Deleting…' : 'Delete chat'}</button></div>
  </dialog>
}

export default function AssistantHistory({ historyRef, open, history, store, locked, onClose, onSelect, onReset }) {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('active')
  const [actionsId, setActionsId] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [deleteError, setDeleteError] = useState('')
  const [notice, setNotice] = useState('')
  const [visibleCount, setVisibleCount] = useState(50)
  const rows = history.conversations.filter(row => Boolean(row.archivedAt) === (filter === 'archived') && (row.saved || row.messages?.length || row.input?.trim())
    && conversationTitle(row).toLowerCase().includes(search.trim().toLowerCase())).sort((a, b) => Date.parse(b.lastUsedAt) - Date.parse(a.lastUsedAt))
  const disabled = locked || history.working || !history.ready
  async function act(row, action) {
    if (disabled) return
    if (!await store.act(row.id, action)) {
      if (action === 'delete') setDeleteError(store.getSnapshot().error || 'Unable to delete. Please try again.')
      return
    }
    setActionsId(null); setDeleting(null); setDeleteError('')
    setNotice(action === 'archive' ? 'Chat archived. Find it in Archived.' : action === 'restore' ? 'Chat restored to Active.' : 'Chat deleted.')
    if (row.id === history.activeId && action !== 'restore') onReset()
    requestAnimationFrame(() => document.getElementById('assistant-history-search')?.focus())
  }
  return <aside ref={historyRef} id="staff-assistant-history" hidden={!open} className="ga-assistant-history" aria-labelledby="assistant-history-title" onKeyDown={event => {
    if (event.key === 'Escape') { event.preventDefault(); if (actionsId) setActionsId(null); else onClose() }
  }}>
    <div className="flex items-center justify-between gap-2"><div><h2 id="assistant-history-title" className="font-semibold text-ink">Conversation history</h2><p className="mt-1 text-xs text-muted-copy">Your saved conversations</p></div><button type="button" onClick={onClose} aria-label="Close history" className="ga-assistant-tool"><Icon name="close" /></button></div>
    <div className="ga-assistant-history-tabs" role="group" aria-label="Filter conversations">
      {['active', 'archived'].map(value => <button type="button" key={value} aria-pressed={filter === value} onClick={() => { setFilter(value); setVisibleCount(50); setActionsId(null); setNotice('') }}>{value === 'active' ? 'Active' : 'Archived'}</button>)}
    </div>
    <label htmlFor="assistant-history-search" className="sr-only">Search conversations</label>
    <div className="ga-assistant-history-search"><Icon name="search" className="size-4" /><input id="assistant-history-search" type="search" value={search} onChange={event => { setSearch(event.target.value); setVisibleCount(50) }} placeholder="Search saved chats" /></div>
    {locked && <p className="mt-3 text-xs leading-5 text-copy">Finish or cancel the current task before managing conversations.</p>}
    {notice && <p className="ga-assistant-history-notice" role="status">{notice}</p>}
    {history.working && <p className="mt-3 text-sm text-muted-copy" role="status">Updating conversation…</p>}
    <ul className="ga-assistant-history-list">
      {rows.slice(0, visibleCount).map(row => <li key={row.id} className="ga-assistant-history-row" data-current={row.id === history.activeId}>
        <div className="ga-assistant-history-row-heading">
          <button type="button" disabled={disabled || Boolean(row.archivedAt)} onClick={() => onSelect(row)} aria-label={conversationTitle(row)} aria-current={row.id === history.activeId ? 'true' : undefined} className="ga-assistant-history-item">
            <Icon name={row.archivedAt ? 'archive' : 'helpCases'} className="mt-0.5 size-4 shrink-0" /><span className="min-w-0"><span className="ga-assistant-history-title">{conversationTitle(row)}</span><span className="ga-assistant-history-date">{row.saved ? `Last used ${dateLabel(row.lastUsedAt)}` : 'Saving new chat…'}</span></span>
          </button>
          <button type="button" className="ga-assistant-tool ga-assistant-history-more" disabled={disabled} aria-label={`Actions for ${conversationTitle(row)}`} aria-expanded={actionsId === row.id} onClick={() => setActionsId(actionsId === row.id ? null : row.id)}><Icon name="more" className="size-4" /></button>
        </div>
        {actionsId === row.id && <div className="ga-assistant-history-actions" role="group" aria-label="Conversation actions">
          <button type="button" disabled={disabled} onClick={() => void act(row, row.archivedAt ? 'restore' : 'archive')}><Icon name={row.archivedAt ? 'reset' : 'archive'} className="size-4" />{row.archivedAt ? 'Restore' : 'Archive'}</button>
          <button type="button" disabled={disabled} onClick={() => { setDeleteError(''); setDeleting(row) }}><Icon name="trash" className="size-4" />Delete</button>
        </div>}
      </li>)}
    </ul>
    {rows.length > visibleCount && <button type="button" className="ga-assistant-refresh" onClick={() => setVisibleCount(count => count + 50)}>Show more conversations ({rows.length - visibleCount} remaining)</button>}
    {history.ready && !rows.length && <div className="ga-assistant-history-empty"><Icon name={filter === 'archived' ? 'archive' : 'helpCases'} className="size-7" /><p>{search.trim() ? 'No matching conversations' : filter === 'archived' ? 'No archived chats' : 'Start a conversation'}</p><span>{search.trim() ? 'Try another title or check the other view.' : filter === 'archived' ? 'Archived chats appear here. Restore one to continue it.' : 'Your chats will be saved here automatically.'}</span></div>}
    <div className="ga-assistant-history-footer">
      <div className="ga-assistant-history-footer-toolbar">
        <HistorySaveStatus history={history} store={store} />
        <button type="button" disabled={disabled || history.status === 'saving'} onClick={() => void store.load()} className="ga-assistant-refresh"><Icon name="reset" className="size-3.5" />Refresh history</button>
      </div>
      <p>All chats, including archived ones, expire after <strong>30 inactive days</strong>. Reopen to renew.</p>
      <p>Prepare task approvals again after reload.</p>
    </div>
    <DeleteChatDialog conversation={deleting} busy={history.working} error={deleteError} onCancel={() => { setDeleting(null); setDeleteError('') }} onDelete={() => void act(deleting, 'delete')} />
  </aside>
}
