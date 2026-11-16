import { useCallback, useEffect, useRef, useState } from 'react'

export function useCameraDevices() {
  const [devices, setDevices] = useState([])
  const [deviceId, setDeviceId] = useState('')
  const requestRef = useRef(0)
  const refresh = useCallback(async () => {
    const requestId = ++requestRef.current
    try {
      const available = await navigator.mediaDevices?.enumerateDevices?.()
      if (requestId === requestRef.current) setDevices((available ?? []).filter((device) => device.kind === 'videoinput'))
    } catch { /* Camera startup reports permission and device errors. */ }
  }, [])
  useEffect(() => {
    const requestId = ++requestRef.current
    const initial = navigator.mediaDevices?.enumerateDevices?.()
    initial?.then((available) => {
      if (requestId === requestRef.current) setDevices(available.filter((device) => device.kind === 'videoinput'))
    }).catch(() => {})
    navigator.mediaDevices?.addEventListener?.('devicechange', refresh)
    return () => {
      requestRef.current += 1
      navigator.mediaDevices?.removeEventListener?.('devicechange', refresh)
    }
  }, [refresh])
  return { devices, deviceId, setDeviceId, refresh }
}
