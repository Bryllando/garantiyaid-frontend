export const PUSH_DRAFTS_KEY = 'garantiyaid.pushDrafts'
export const pushAudiences = { SCHEDULED: 'Scheduled beneficiaries', ACTIVE: 'All non-cancelled assignments', SELECTED: 'Choose beneficiaries' }

export function emptyPushEditor(distributionId = '') {
  return { id: '', distributionId, audience: 'SCHEDULED', selectedIds: [], title: '', message: '' }
}

export function pushRecipients(schedules, audience, selectedIds = []) {
  const selected = new Set(selectedIds)
  const unique = new Map()
  for (const schedule of schedules) {
    const id = schedule.beneficiary?.beneficiaryId
    if (!id || !['SCHEDULED', 'CHECKED_IN', 'MISSED'].includes(schedule.status)) continue
    if (audience === 'SCHEDULED' && schedule.status !== 'SCHEDULED') continue
    if (audience === 'SELECTED' && !selected.has(id)) continue
    if (!Object.hasOwn(pushAudiences, audience)) continue
    if (!unique.has(id)) unique.set(id, schedule)
  }
  return [...unique.values()]
}

export function pushDraftErrors(editor, recipientCount) {
  const errors = {}
  if (!editor.distributionId) errors.distributionId = 'Select a distribution event.'
  if (!recipientCount) errors.recipients = 'Select at least one beneficiary with a non-cancelled assignment.'
  if (!editor.title.trim() || editor.title.trim().length > 80) errors.title = 'Enter a title between 1 and 80 characters.'
  if (!editor.message.trim() || editor.message.trim().length > 500) errors.message = 'Enter a message between 1 and 500 characters.'
  return errors
}

// shortcut: drafts are tab-local; use shared staff records when push delivery is connected.
export function readPushWorkspace(storage, userId, distributionId = '') {
  const fallback = { editor: emptyPushEditor(distributionId), drafts: [] }
  const raw = storage.getItem(PUSH_DRAFTS_KEY)
  if (!raw) return fallback
  const saved = JSON.parse(raw)
  if (saved.userId !== userId) return fallback
  const validEditor = (item) => item && typeof item.id === 'string' && typeof item.distributionId === 'string'
    && Object.hasOwn(pushAudiences, item.audience) && Array.isArray(item.selectedIds) && item.selectedIds.every((id) => typeof id === 'string')
    && typeof item.title === 'string' && item.title.length <= 80 && typeof item.message === 'string' && item.message.length <= 500
  if (!validEditor(saved.editor) || !Array.isArray(saved.drafts) || !saved.drafts.every((item) => validEditor(item) && item.id && item.status === 'DRAFT' && Number.isInteger(item.recipientCount) && item.recipientCount > 0 && Number.isFinite(Date.parse(item.savedAt)))) {
    throw new Error('Saved drafts could not be read. Keep this tab open and contact your system administrator before clearing it.')
  }
  return { editor: distributionId && saved.editor.distributionId !== distributionId ? emptyPushEditor(distributionId) : saved.editor, drafts: saved.drafts }
}

export function savePushWorkspace(storage, userId, workspace) {
  storage.setItem(PUSH_DRAFTS_KEY, JSON.stringify({ userId, ...workspace }))
}
