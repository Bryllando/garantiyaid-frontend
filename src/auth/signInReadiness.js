import { requestServerTimestamp } from './staffAuth.js'

// Only retry the public health check; credentials are submitted by the user once.
export function checkSignInReadiness(onStatus) {
  let stopped = false
  let retryTimer
  let requestController

  async function probe() {
    requestController = new AbortController()
    const timeout = setTimeout(() => requestController.abort(), 5000)
    try {
      await requestServerTimestamp({ signal: requestController.signal })
      if (!stopped) onStatus('ready')
    } catch {
      if (!stopped) {
        onStatus('unavailable')
        retryTimer = setTimeout(probe, 3000)
      }
    } finally {
      clearTimeout(timeout)
    }
  }

  onStatus('checking')
  void probe()
  return () => {
    stopped = true
    clearTimeout(retryTimer)
    requestController?.abort()
  }
}
