export function confirmationSnapshot(preview, payload) {
  if (!preview.approvalId || !preview.approvalExpiresAt) throw new Error('Refresh the application and request a new preview. The server did not return an approval.')
  return Object.freeze({ ...preview, request: Object.freeze({ ...payload }) })
}

export function uncertainConfirmation(error) {
  return !error.status || error.status >= 500 || [401, 408, 429].includes(error.status) || error.code === 'ASSISTANT_CONCURRENT_CHANGE'
}

export const retryConfirmationMessage = 'The result is not yet confirmed. Retry this same confirmation to recover its result without submitting a new task. Keep this page open until the result is known.'

// Store only the submitted request, never recipient previews or authentication tokens.
export function pendingConfirmation(userId, attempt) {
  if (!userId || typeof window === 'undefined') return null
  try {
    const key = `garantiyaid:pending-confirmation:${userId}`
    if (attempt === null) window.sessionStorage.removeItem(key)
    else if (attempt !== undefined) window.sessionStorage.setItem(key, JSON.stringify(attempt))
    const stored = JSON.parse(window.sessionStorage.getItem(key) || 'null')
    return stored && ['distribution', 'reminder'].includes(stored.kind) && stored.approvalId && stored.request ? stored : null
  } catch { return null }
}
