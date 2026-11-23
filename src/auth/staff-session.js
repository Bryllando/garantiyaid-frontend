const tokenKey = 'garantiyaid.accessToken'
const clockKey = 'garantiyaid.sessionClockOffset'
const continuationKey = 'garantiyaid.sessionContinuation'
let workspaceToken = null
let liveToken = null

// Keep the page's session identity stable when only its short-lived bearer changes.
export function bindStaffToken(stored) {
  if (stored !== liveToken) {
    workspaceToken = stored
    liveToken = stored
  }
  return workspaceToken
}

export function currentStaffToken(token) {
  return token && token === workspaceToken ? liveToken : token
}

export function staffTokenTimes(token) {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
    if (!Number.isFinite(payload.exp) || !Number.isFinite(payload.iat)) return null
    return { issued: payload.iat * 1000, expires: payload.exp * 1000, final: payload.exp === payload.session_end }
  } catch { return null }
}

export function noteLoginTime(data) {
  const timing = data?.accessToken && staffTokenTimes(data.accessToken)
  return timing ? { ...data, clockOffset: timing.issued - Date.now() } : data
}

export function storeLoginToken({ accessToken: token, continuationToken, clockOffset = 0 }) {
  sessionStorage.setItem(clockKey, String(clockOffset))
  if (continuationToken) sessionStorage.setItem(continuationKey, continuationToken)
  else sessionStorage.removeItem(continuationKey)
  sessionStorage.setItem(tokenKey, token)
  bindStaffToken(token)
}

export function clearLoginToken() {
  sessionStorage.removeItem(tokenKey)
  sessionStorage.removeItem(clockKey)
  sessionStorage.removeItem(continuationKey)
  bindStaffToken(null)
}

export function watchStaffSession(token, { renew, expire, warn, dismiss }) {
  let stopped = false
  let busy = false
  let timer
  let lastAttempt = -Infinity
  let warnedToken
  const activityEvents = ['pointerdown', 'keydown', 'wheel', 'input', 'click']
  const owns = () => !stopped && token === workspaceToken && liveToken === sessionStorage.getItem(tokenKey)
  const serverNow = () => Date.now() + (Number(sessionStorage.getItem(clockKey)) || 0)

  function check() {
    clearTimeout(timer)
    if (!owns()) return
    const timing = staffTokenTimes(liveToken)
    if (!timing || timing.expires <= serverNow()) return expire()
    const remaining = timing.expires - serverNow()
    if (remaining <= 120000 && warnedToken !== liveToken) {
      warnedToken = liveToken
      warn(timing.final || !sessionStorage.getItem(continuationKey), () => continueSession(true))
    }
    timer = setTimeout(check, Math.max(1, remaining > 120000 ? remaining - 120000 : remaining))
  }

  async function continueSession(explicit = false) {
    if (!owns() || busy || document.visibilityState === 'hidden') return
    const before = liveToken
    const timing = staffTokenTimes(before)
    const now = serverNow()
    if (!timing || timing.expires <= now) return check()
    const proof = sessionStorage.getItem(continuationKey)
    if (!proof || timing.final || (!explicit && (now - timing.issued < 60000 || Date.now() - lastAttempt < 15000))) return
    busy = true
    lastAttempt = Date.now()
    try {
      const updated = await renew(before, proof)
      if (!owns() || liveToken !== before || !staffTokenTimes(updated)) return
      sessionStorage.setItem(tokenKey, updated)
      liveToken = updated
      warnedToken = null
      dismiss()
      check()
    } catch (error) {
      if (owns() && liveToken === before && error.status === 401) expire()
    } finally { busy = false }
  }

  function onActivity(event) {
    if (event.isTrusted) void continueSession()
  }
  for (const event of activityEvents) window.addEventListener(event, onActivity, { capture: true, passive: true })
  document.addEventListener('visibilitychange', check)
  window.addEventListener('pageshow', check)
  check()
  return () => {
    stopped = true
    clearTimeout(timer)
    dismiss()
    for (const event of activityEvents) window.removeEventListener(event, onActivity, true)
    document.removeEventListener('visibilitychange', check)
    window.removeEventListener('pageshow', check)
  }
}
