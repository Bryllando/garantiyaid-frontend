import assert from 'node:assert/strict'
import test from 'node:test'
import { setImmediate } from 'node:timers/promises'
import { cameraErrorMessage, createQrDetector, watchCameraDisconnection } from '../src/utils/camera.js'

function globalValue(t, name, value) {
  const original = Object.getOwnPropertyDescriptor(globalThis, name)
  Object.defineProperty(globalThis, name, { configurable: true, value })
  t.after(() => original ? Object.defineProperty(globalThis, name, original) : delete globalThis[name])
}

function camera(t) {
  const media = new EventTarget()
  const track = new EventTarget()
  track.getSettings = () => ({ deviceId: 'usb-camera' })
  const stream = { getVideoTracks: () => [track] }
  globalValue(t, 'navigator', { mediaDevices: media })
  return { media, track, stream }
}

test('busy and disconnected cameras provide different recovery instructions', (t) => {
  globalValue(t, 'isSecureContext', true)
  assert.match(cameraErrorMessage({ name: 'NotReadableError' }), /busy.*Close other apps/)
  assert.match(cameraErrorMessage({ name: 'OverconstrainedError' }), /selected camera.*choose another/)
})

test('an ended camera track reports disconnection only once', (t) => {
  const { stream, track } = camera(t)
  let calls = 0
  const unwatch = watchCameraDisconnection(stream, () => calls++)
  track.dispatchEvent(new Event('ended'))
  track.dispatchEvent(new Event('ended'))
  assert.equal(calls, 1)
  unwatch()
})

test('devicechange detects removal of the active camera but ignores other cameras', async (t) => {
  const { media, stream } = camera(t)
  let devices = [{ kind: 'videoinput', deviceId: 'usb-camera' }]
  media.enumerateDevices = async () => devices
  let calls = 0
  const unwatch = watchCameraDisconnection(stream, () => calls++)
  media.dispatchEvent(new Event('devicechange'))
  await setImmediate()
  assert.equal(calls, 0)
  devices = []
  media.dispatchEvent(new Event('devicechange'))
  await setImmediate()
  assert.equal(calls, 1)
  unwatch()
})

test('cleanup ignores a pending device inventory response and detached track events', async (t) => {
  const { media, stream, track } = camera(t)
  let finish
  media.enumerateDevices = () => new Promise(resolve => { finish = resolve })
  let calls = 0
  const unwatch = watchCameraDisconnection(stream, () => calls++)
  media.dispatchEvent(new Event('devicechange'))
  unwatch()
  finish([])
  track.dispatchEvent(new Event('ended'))
  await setImmediate()
  assert.equal(calls, 0)
})

test('native QR detection is used only when the browser supports QR format', async (t) => {
  class Detector {
    static async getSupportedFormats() { return ['qr_code'] }
    constructor(options) { assert.deepEqual(options, { formats: ['qr_code'] }) }
  }
  globalValue(t, 'BarcodeDetector', Detector)
  assert.ok(await createQrDetector() instanceof Detector)
})
