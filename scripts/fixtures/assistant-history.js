import { randomUUID } from 'node:crypto'

export function historyApiFixture() {
  const rows = new Map(), deleted = new Set()
  let writes = 0, failWrites = false, loseResponse = false
  const fail = (status, message) => { throw Object.assign(new Error(message), { status }) }
  const metadata = row => { const { messages: _messages, lastMutationId: _lastMutationId, ...meta } = row; return structuredClone(meta) }
  const find = id => rows.get(id) ?? fail(404, 'This conversation was deleted or expired.')
  const activity = () => ({ lastUsedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 30 * 86400000).toISOString() })
  const api = {
    async list(offset = 0) {
      const all = [...rows.values()].filter(row => Date.parse(row.expiresAt) > Date.now()).sort((a, b) => b.lastUsedAt.localeCompare(a.lastUsedAt))
      return { conversations: all.slice(offset, offset + 100).map(metadata), nextOffset: all.length > offset + 100 ? offset + 100 : null }
    },
    async get(id, offset = 0) {
      const row = find(id)
      return { conversation: metadata(row), messages: structuredClone(row.messages.slice(offset, offset + 100)), nextOffset: row.messages.length > offset + 100 ? offset + 100 : null }
    },
    async save(id, body, create) {
      if (failWrites) fail(503, 'Unable to save while offline.')
      let row = rows.get(id)
      if (row?.lastMutationId === body.mutationId) return { conversation: metadata(row) }
      if (deleted.has(id) || !row && !create) fail(404, 'This conversation was deleted or expired.')
      if (row && (create || row.revision !== body.revision || row.archivedAt)) fail(409, 'This conversation changed in another window.')
      row ??= { id, revision: 0, messages: [], messageCount: 0, archivedAt: null, ...activity(), createdAt: new Date().toISOString() }
      if (!row.messageCount) row.title = (body.messages.find(message => message.role === 'user')?.content || body.messages[0]?.content || body.input || 'New conversation').slice(0, 90)
      row.messages.push(...structuredClone(body.messages))
      Object.assign(row, { language: body.language, input: body.input, unfinished: body.unfinished, messageCount: row.messages.length, revision: row.revision + 1, lastMutationId: body.mutationId, ...activity() })
      rows.set(id, row); writes++
      if (loseResponse) { loseResponse = false; fail(503, 'The save response was interrupted.') }
      return { conversation: metadata(row) }
    },
    async action(id, action, revision) {
      const row = find(id)
      if (action !== 'touch' && row.revision !== revision) fail(409, 'This conversation changed in another window.')
      if (action === 'delete') { rows.delete(id); deleted.add(id); return { conversation: null } }
      if (action === 'touch') Object.assign(row, activity())
      else { row.archivedAt = action === 'archive' ? new Date().toISOString() : null; row.revision++; if (action === 'restore') Object.assign(row, activity()) }
      return { conversation: metadata(row) }
    },
  }
  return { api, rows, get writes() { return writes }, set failWrites(value) { failWrites = value }, set loseResponse(value) { loseResponse = value },
    async seed(title, count = 2) {
      const id = randomUUID()
      await api.save(id, { revision: 0, mutationId: randomUUID(), language: 'en', input: '', unfinished: false, messages: Array.from({ length: count }, (_, n) => ({ role: n % 2 ? 'assistant' : 'user', content: n === 0 ? title : `Reply ${n}`, local: false })) }, true)
      return id
    },
    async route(route) {
      const url = new URL(route.request().url()), segments = url.pathname.split('/conversations')[1].split('/').filter(Boolean)
      try {
        const method = route.request().method(), body = ['POST', 'PATCH'].includes(method) ? route.request().postDataJSON() : null
        const data = !segments.length ? await api.list(Number(url.searchParams.get('offset') || 0))
          : segments[1] === 'actions' ? await api.action(segments[0], body.action, body.revision)
            : method === 'GET' ? await api.get(segments[0], Number(url.searchParams.get('offset') || 0))
              : await api.save(segments[0], body, method === 'POST')
        return route.fulfill({ json: { data } })
      } catch (error) { return route.fulfill({ status: error.status || 500, json: { error: { message: error.message } } }) }
    },
  }
}
