export function cameraConstraints(deviceId, facingMode = 'user') {
  return { audio: false, video: { ...(deviceId ? { deviceId: { exact: deviceId } } : { facingMode: { ideal: facingMode } }), width: { ideal: 1280 }, height: { ideal: facingMode === 'user' ? 960 : 720 } } }
}

export function cameraErrorMessage(error) {
  if (!globalThis.isSecureContext) return 'Camera access needs HTTPS or localhost. Open the secure app address and allow camera access.'
  if (error?.name === 'NotAllowedError') return 'Camera access was blocked. Allow camera permission in your browser and Windows camera settings, then try again.'
  if (['NotFoundError', 'OverconstrainedError'].includes(error?.name)) return 'The selected camera is unavailable. Connect the USB webcam or choose another camera, then start it again.'
  return 'The camera could not be opened. Close other apps using it, check the USB connection, then try again.'
}

export async function createQrDetector() {
  if (globalThis.BarcodeDetector) {
    try {
      if ((await globalThis.BarcodeDetector.getSupportedFormats()).includes('qr_code')) return new globalThis.BarcodeDetector({ formats: ['qr_code'] })
    } catch { /* Use the bundled decoder when native QR detection is unavailable. */ }
  }
  const { default: decode } = await import('jsqr')
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('QR image processing is unavailable in this browser.')
  return { async detect(video) {
    if (!video.videoWidth || !video.videoHeight) return []
    const scale = Math.min(1, 960 / video.videoWidth)
    canvas.width = Math.round(video.videoWidth * scale)
    canvas.height = Math.round(video.videoHeight * scale)
    context.drawImage(video, 0, 0, canvas.width, canvas.height)
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height)
    const qr = decode(pixels.data, pixels.width, pixels.height)
    return qr?.data ? [{ rawValue: qr.data }] : []
  } }
}
