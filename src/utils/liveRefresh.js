import { getApiRetryAfterSeconds } from '../auth/staffAuth.js'

export const LIVE_REFRESH_INTERVAL_MS = 20_000

// Coalesce sustained event streams, not just events arriving in the same short burst.
export function createLiveRefresh(accessToken, refresh, { leading = false } = {}) {
  let timer
  let stopped = false
  let lastRefresh = leading ? -Infinity : Date.now()
  function run() {
    timer = undefined
    if (stopped) return
    const wait = Math.max(
      lastRefresh + LIVE_REFRESH_INTERVAL_MS - Date.now(),
      getApiRetryAfterSeconds(accessToken) * 1000,
      typeof document !== 'undefined' && document.visibilityState === 'hidden' ? LIVE_REFRESH_INTERVAL_MS : 0,
    )
    if (wait > 0) { timer = setTimeout(run, wait); return }
    lastRefresh = Date.now()
    refresh()
  }
  function schedule() {
    if (!stopped && timer === undefined) timer = setTimeout(run, Math.max(250, lastRefresh + LIVE_REFRESH_INTERVAL_MS - Date.now()))
  }
  schedule.cancel = () => { stopped = true; clearTimeout(timer); timer = undefined }
  return schedule
}
