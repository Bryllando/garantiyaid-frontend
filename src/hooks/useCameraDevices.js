import { useCallback, useEffect, useState } from 'react'

export function useCameraDevices() {
  const [devices, setDevices] = useState([])
  const [deviceId, setDeviceId] = useState('')
  const refresh = useCallback(async () => {
    try {
      const available = await navigator.mediaDevices?.enumerateDevices?.()
      setDevices((available ?? []).filter((device) => device.kind === 'videoinput'))
    } catch { /* Camera startup reports permission and device errors. */ }
  }, [])
  useEffect(() => {
    const initial = navigator.mediaDevices?.enumerateDevices?.()
    initial?.then((available) => setDevices(available.filter((device) => device.kind === 'videoinput'))).catch(() => {})
    navigator.mediaDevices?.addEventListener?.('devicechange', refresh)
    return () => navigator.mediaDevices?.removeEventListener?.('devicechange', refresh)
  }, [refresh])
  return { devices, deviceId, setDeviceId, refresh }
}
