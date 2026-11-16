import { useEffect, useState } from 'react'
import { getApiRetryAfterSeconds, subscribeApiCooldown } from '../auth/staffAuth.js'

export function useApiCooldown(accessToken) {
  const [seconds, setSeconds] = useState(() => getApiRetryAfterSeconds(accessToken))
  useEffect(() => {
    let timer
    const sync = () => {
      clearTimeout(timer)
      const remaining = getApiRetryAfterSeconds(accessToken)
      setSeconds(remaining)
      if (remaining) timer = setTimeout(sync, 1000)
    }
    const unsubscribe = subscribeApiCooldown(accessToken, sync)
    // oxlint-disable-next-line react/set-state-in-effect -- reconcile the account's external API cooldown.
    sync()
    return () => { unsubscribe(); clearTimeout(timer) }
  }, [accessToken])
  return seconds
}
