export function CameraDeviceSelect({ id, devices, deviceId, onChange, activeLabel = '', disabled = false }) {
  const selectedUnavailable = deviceId && !devices.some((device) => device.deviceId === deviceId)
  return <div className="mb-3">
    <label htmlFor={id} className="ga-label">Camera</label>
    <select id={id} value={deviceId} disabled={disabled} aria-describedby={`${id}-help`} onChange={(event) => onChange(event.target.value)} className="ga-input mt-2">
      <option value="">Browser default camera</option>
      {selectedUnavailable && <option value={deviceId} disabled>Selected camera unavailable</option>}
      {devices.filter((device) => device.deviceId).map((device, index) => <option key={device.deviceId} value={device.deviceId}>{device.label || `Camera ${index + 1}`}</option>)}
    </select>
    <p id={`${id}-help`} className="mt-2 text-xs leading-5 text-muted-copy">Choose your USB webcam if connected. Device names appear after camera permission is granted.</p>
    {activeLabel && <p className="mt-1 text-xs font-semibold text-copy [overflow-wrap:anywhere]">Using: {activeLabel}</p>}
  </div>
}
