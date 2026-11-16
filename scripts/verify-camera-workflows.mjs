import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { QRCodeSVG } from 'qrcode.react'
import { chromium, expect } from '@playwright/test'
import { createServer } from 'vite'

// Every API and camera is mocked. No real biometric enrollment, release, or message is possible.
const output = resolve('../output/camera-workflows')
await mkdir(output, { recursive: true })
const eventId = '11111111-1111-4111-8111-111111111111'
const personId = '22222222-2222-4222-8222-222222222222'
const secondId = '33333333-3333-4333-8333-333333333333'
const people = [personId, secondId].map((beneficiaryId, i) => ({ beneficiaryId, firstName: 'Camera QA', lastName: i ? 'Second' : 'Participant', barangayId: 'qa-area', barangay: { barangayName: 'QA service area' }, birthDate: '1996-01-09', beneficiaryStatus: 'ACTIVE' }))
const event = { distributionId: eventId, title: 'Camera workflow QA', distributionDate: '2099-01-01', startTime: '09:00', endTime: '12:00', status: 'OPEN', verificationRequirement: 'QR_OR_BIOMETRIC', deliveryMode: 'PHYSICAL_GOODS', location: 'QA service desk', barangay: people[0].barangay }
const schedules = people.map((beneficiary, i) => ({ scheduleId: `qa-schedule-${i}`, beneficiaryId: beneficiary.beneficiaryId, beneficiary, status: 'SCHEDULED', queueNumber: i + 1, slot: { location: event.location, slotStart: '2099-01-01T09:00:00+08:00', slotEnd: '2099-01-01T09:30:00+08:00' } }))
const processing = { processorMode: 'REMOTE', simulatedProcessor: false, antiSpoofingEnabled: true, model: 'ArcFace' }
const pagination = { page: 1, total: 2, totalPages: 1 }
const calls = { preview: 0, qr: 0, face: 0, enrollment: 0, forbidden: 0 }
let previewFailure = null, faceFailure = null, profileStatus = 'NOT_ENROLLED', consentActive = true
let holdPreview, releasePreview
const errors = []
const vite = await createServer({ cacheDir: 'node_modules/.vite-camera-qa', logLevel: 'error', define: { 'import.meta.env.VITE_API_URL': JSON.stringify('/api/v1') }, server: { host: '127.0.0.1', port: 0, hmr: false } })
let browser, page
try {
  await vite.listen()
  browser = await chromium.launch({ channel: 'chrome', headless: true })
  const context = await browser.newContext({ viewport: { width: 1366, height: 1000 }, reducedMotion: 'reduce' })
  await context.addInitScript(() => {
    sessionStorage.setItem('garantiyaid.accessToken', 'mock-camera-test')
    if (!sessionStorage.getItem('garantiyaid.user')) sessionStorage.setItem('garantiyaid.user', JSON.stringify({ userId: 'qa-facilitator', fullName: 'Camera QA Facilitator', role: 'BARANGAY_FACILITATOR', barangayId: 'qa-area' }))
    const media = new EventTarget()
    const qa = window.cameraQA = { mode: 'ready', decode: 'none', pendingMedia: [], pendingDecode: [], streams: [], devices: [{ kind: 'videoinput', deviceId: 'integrated', label: 'Integrated QA Camera' }, { kind: 'videoinput', deviceId: 'usb', label: 'USB QA Camera' }] }
    const makeStream = id => {
      const canvas = document.createElement('canvas')
      canvas.width = 640; canvas.height = 480
      const paint = () => {
        const drawing = canvas.getContext('2d')
        drawing.fillStyle = '#dce4ed'; drawing.fillRect(0, 0, 640, 480)
        drawing.fillStyle = '#475569'; drawing.font = '22px sans-serif'; drawing.fillText('Mock camera preview', 205, 240)
      }
      const stream = canvas.captureStream(10)
      const timer = setInterval(paint, 100)
      paint()
      const track = stream.getVideoTracks()[0]
      Object.defineProperty(track, 'label', { value: id === 'usb' ? 'USB QA Camera' : 'Integrated QA Camera' })
      track.getSettings = () => ({ deviceId: id, width: 640, height: 480 })
      const stop = track.stop.bind(track)
      track.stop = () => { clearInterval(timer); stop() }
      qa.streams.push(stream)
      return stream
    }
    media.enumerateDevices = async () => qa.devices.map(device => ({ ...device }))
    media.getUserMedia = async constraints => {
      const id = constraints.video.deviceId?.exact || 'integrated'
      if (qa.mode === 'pending') return new Promise(resolve => qa.pendingMedia.push(() => resolve(makeStream(id))))
      if (qa.mode === 'denied') throw new DOMException('Mock permission denied', 'NotAllowedError')
      if (qa.mode === 'busy') throw new DOMException('Mock camera busy', 'NotReadableError')
      if (!qa.devices.some(device => device.deviceId === id)) throw new DOMException('Mock device unavailable', 'NotFoundError')
      return makeStream(id)
    }
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: media })
    qa.disconnect = id => { qa.devices = qa.devices.filter(device => device.deviceId !== id); media.dispatchEvent(new Event('devicechange')) }
    window.BarcodeDetector = class {
      static async getSupportedFormats() { return ['qr_code'] }
      async detect() {
        if (qa.decode === 'pending') return new Promise(resolve => qa.pendingDecode.push(resolve))
        return qa.decode === 'token' ? [{ rawValue: 'qa-credential-for-mocked-api' }] : []
      }
    }
    const toBlob = HTMLCanvasElement.prototype.toBlob
    HTMLCanvasElement.prototype.toBlob = function (...args) {
      if (qa.delayCapture) { qa.finishCapture = () => toBlob.apply(this, args); return }
      return toBlob.apply(this, args)
    }
  })
  await context.routeWebSocket(/socket\.io/, () => {})
  await context.route(/socket\.io/, route => route.abort())
  await context.route('**/api/v1/**', async route => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1', '')
    const ok = data => route.fulfill({ json: { success: true, data } })
    const fail = (code, message, status = 409) => route.fulfill({ status, json: { success: false, error: { code, message } } })
    if (/release|receipt|enqueue|send|assistant-confirm/.test(path)) { calls.forbidden++; return route.abort() }
    if (path === '/health') return ok({ timestamp: new Date().toISOString() })
    if (path === '/staff-notifications') return ok({ notifications: [], unreadCount: 0, pagination })
    if (path === '/distributions') return ok({ distributions: [event], pagination })
    if (path === `/distributions/${eventId}`) return ok({ distribution: event })
    if (path === '/beneficiaries') return ok({ beneficiaries: people, pagination })
    if (people.some(person => path === `/beneficiaries/${person.beneficiaryId}`)) return ok({ beneficiary: people.find(person => path.endsWith(person.beneficiaryId)) })
    if (path.endsWith('/schedules')) return ok({ schedules, summary: {}, pagination })
    if (path.endsWith('/biometric-attempts')) return ok({ attempts: [], pagination, privacy: {} })
    if (path.endsWith('/biometric-consents')) return ok({ consents: consentActive ? [{ consentId: 'qa-consent', consentStatus: 'ACTIVE', consentGiven: true, retentionUntil: '2099-12-31T23:59:59Z', consentVersion: 'v1.0' }] : [], pagination })
    if (path.endsWith('/biometrics/status')) return ok({ biometricProfile: { biometricStatus: profileStatus, ...(profileStatus === 'NOT_ENROLLED' ? {} : { biometricId: 'qa-profile', createdAt: '2026-01-01T00:00:00Z', verificationCount: 0 }) }, processing })
    if (path.endsWith('/claims')) return ok({ claims: [], pagination, summary: {} })
    if (path.endsWith('/claims/preview-qr')) {
      calls.preview++
      if (holdPreview) await new Promise(resolve => { releasePreview = resolve })
      if (previewFailure) return fail(previewFailure.code, previewFailure.message, previewFailure.status)
      return ok({ beneficiary: people[0], schedule: schedules[0], distribution: event, checksInBeneficiary: true, verificationCompleteAfterConfirm: true, nextRequiredVerification: null })
    }
    if (path.endsWith('/claims/verify-qr') || path.endsWith('/claims/verify-biometric')) {
      const face = path.endsWith('/verify-biometric')
      calls[face ? 'face' : 'qr']++
      if (faceFailure && face) return fail(faceFailure.code, faceFailure.message, faceFailure.status || 422)
      assert.ok(route.request().headers()['idempotency-key'])
      return ok({ claim: { claimId: 'qa-claim', distributionId: eventId, beneficiaryId: personId, beneficiary: people[0], schedule: schedules[0], claimStatus: 'VERIFIED', verificationMethod: face ? 'BIOMETRIC' : 'QR', qrVerified: !face, biometricVerified: face }, verificationComplete: true, nextRequiredVerification: null })
    }
    if (path.endsWith('/biometrics/enroll') || path.endsWith('/biometrics/re-enroll')) {
      calls.enrollment++
      if (faceFailure) return fail(faceFailure.code, faceFailure.message, faceFailure.status || 503)
      profileStatus = 'PENDING_DUPLICATE_REVIEW'
      return ok({ biometricProfile: { biometricId: 'qa-profile', biometricStatus: profileStatus }, processing, duplicateReview: { required: true } })
    }
    errors.push(`Unexpected mock API: ${path}`)
    return fail('UNEXPECTED_TEST_API', 'Unexpected mock API', 400)
  })
  page = await context.newPage()
  page.on('pageerror', error => errors.push(error.message))
  const base = `http://127.0.0.1:${vite.httpServer.address().port}`
  const qr = () => page.goto(`${base}/facilitator/qr-verification?distribution=${eventId}`)
  const face = (view = 'verify') => page.goto(`${base}/biometrics?view=${view}&distribution=${eventId}&beneficiary=${personId}`)
  const openQr = async () => { await page.getByRole('button', { name: 'Scan with this device' }).click(); return page.getByRole('dialog', { name: 'Scan the beneficiary QR card' }) }
  const twoFrames = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  const allStopped = () => page.evaluate(() => cameraQA.streams.every(stream => stream.getTracks().every(track => track.readyState === 'ended')))
  const upload = async () => {
    const png = await page.evaluate(() => { const canvas = document.createElement('canvas'); canvas.width = 320; canvas.height = 240; const drawing = canvas.getContext('2d'); drawing.fillStyle = '#dce4ed'; drawing.fillRect(0, 0, 320, 240); return canvas.toDataURL('image/png').split(',')[1] })
    await page.locator('input[name="faceCapture"]').setInputFiles({ name: 'qa-photo.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') })
  }

  await qr()
  await page.evaluate(() => { cameraQA.mode = 'denied' })
  let dialog = await openQr()
  await expect(dialog.getByRole('alert')).toContainText('permission')
  await page.evaluate(() => { cameraQA.mode = 'ready' })
  await dialog.getByRole('button', { name: 'Retry camera', exact: true }).click()
  await expect(dialog.getByRole('status')).toContainText('Camera ready')
  await dialog.getByLabel('Camera', { exact: true }).selectOption('usb')
  await expect(dialog.getByText('Using: USB QA Camera', { exact: true })).toBeVisible()
  await page.screenshot({ path: resolve(output, 'qr-camera-desktop.png') })
  await page.evaluate(() => cameraQA.disconnect('usb'))
  await expect(dialog.getByRole('alert')).toContainText('disconnected')
  await expect.poll(allStopped).toBe(true)
  await expect(dialog.getByLabel('Camera', { exact: true })).toHaveValue('usb')
  await dialog.getByLabel('Camera', { exact: true }).selectOption('integrated')
  await expect(dialog.getByText('Using: Integrated QA Camera', { exact: true })).toBeVisible()
  await dialog.getByRole('button', { name: 'Stop camera', exact: true }).click()
  await expect(dialog.getByRole('status')).toContainText('paused')
  assert.equal(await allStopped(), true)
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: 'Scan with this device' })).toBeFocused()
  await qr(); await page.evaluate(() => { cameraQA.mode = 'busy' }); dialog = await openQr()
  await expect(dialog.getByRole('alert')).toContainText('camera is busy')
  await page.keyboard.press('Escape')
  await qr(); await page.evaluate(() => { cameraQA.devices = [] }); dialog = await openQr()
  await expect(dialog.getByRole('alert')).toContainText('selected camera is unavailable')
  await dialog.getByRole('button', { name: 'Use handheld scanner', exact: true }).click()
  await expect(page.locator('#qr-scanner-input')).toBeFocused()
  console.log('Passed: QR permission recovery, camera selection, disconnection, stop and focus restoration.')

  for (const pending of ['media', 'decode']) {
    await qr()
    await page.evaluate(kind => { cameraQA[kind === 'media' ? 'mode' : 'decode'] = 'pending' }, pending)
    dialog = await openQr()
    await expect.poll(() => page.evaluate(kind => cameraQA[kind === 'media' ? 'pendingMedia' : 'pendingDecode'].length, pending)).toBeGreaterThan(0)
    await page.keyboard.press('Escape')
    await page.evaluate(kind => { if (kind === 'media') cameraQA.pendingMedia[0](); else cameraQA.pendingDecode[0]([{ rawValue: 'qa-cancelled-credential' }]) }, pending)
    await twoFrames()
    assert.equal(calls.preview, 0)
    await expect.poll(allStopped).toBe(true)
  }
  await qr()
  await page.evaluate(() => { cameraQA.mode = 'pending' })
  dialog = await openQr()
  await expect.poll(() => page.evaluate(() => cameraQA.pendingMedia.length)).toBe(1)
  await dialog.getByLabel('Camera', { exact: true }).selectOption('usb')
  await expect.poll(() => page.evaluate(() => cameraQA.pendingMedia.length)).toBe(2)
  await page.evaluate(() => { cameraQA.pendingMedia[0](); cameraQA.pendingMedia[1]() })
  await expect(dialog.getByText('Using: USB QA Camera', { exact: true })).toBeVisible()
  assert.equal(await page.evaluate(() => cameraQA.streams[0].getTracks()[0].readyState), 'ended')
  holdPreview = true
  await page.evaluate(() => { cameraQA.decode = 'token' })
  await expect(page.getByText('Reviewing credential...', { exact: true })).toBeVisible()
  assert.equal(calls.preview, 1); assert.equal(calls.qr, 0)
  holdPreview = false; releasePreview()
  await expect(page.getByRole('button', { name: 'Confirm check-in' })).toBeFocused()
  assert.equal(await allStopped(), true)
  await page.getByRole('button', { name: 'Confirm check-in' }).click()
  await expect(page.getByRole('heading', { name: 'Claim verification complete' })).toBeVisible()
  assert.equal(calls.preview, 1); assert.equal(calls.qr, 1); assert.equal(calls.forbidden, 0)
  console.log('Passed: pending permission/decode cancellation, old camera cleanup, one QR review and explicit confirmation only.')

  for (const failure of [
    { code: 'QR_TOKEN_EXPIRED', message: 'This QR credential has expired.', status: 410 },
    { code: 'QR_TOKEN_ALREADY_USED', message: 'This QR credential has already been used.', status: 409 },
    { code: 'INVALID_QR_TOKEN', message: 'The QR credential is invalid for this distribution event.', status: 404 },
  ]) {
    previewFailure = failure
    await qr(); await page.evaluate(() => { cameraQA.decode = 'token' }); await openQr()
    await expect(page.locator('#qr-token-error')).toContainText(failure.message)
    assert.equal(calls.qr, 1)
  }
  previewFailure = null

  await face()
  const verify = page.getByRole('button', { name: 'Verify beneficiary identity', exact: true })
  await expect(verify).toBeDisabled()
  await page.evaluate(() => { cameraQA.mode = 'pending' })
  await page.getByRole('button', { name: 'Start live camera', exact: true }).click()
  await expect(page.getByText('Waiting for usable camera frames. No photo has been taken.')).toBeVisible()
  await expect(page.getByText('Camera ready', { exact: true })).toHaveCount(0)
  await page.evaluate(() => { cameraQA.pendingMedia[0]() })
  await expect(page.getByRole('button', { name: 'Capture live photo', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: 'Capture live photo', exact: true }).click()
  await expect(page.getByAltText('Captured beneficiary face preview')).toBeVisible()
  await expect(verify).toBeEnabled()
  assert.equal(calls.face, 0); assert.equal(await allStopped(), true)
  await page.screenshot({ path: resolve(output, 'face-photo-desktop.png'), fullPage: true })
  await page.getByRole('button', { name: 'Retake live photo', exact: true }).click()
  await expect(verify).toBeDisabled()
  assert.equal(await page.locator('input[name="faceCapture"]').evaluate(input => input.files.length), 0)
  await page.evaluate(() => { cameraQA.pendingMedia.at(-1)() })
  await expect(page.getByRole('button', { name: 'Capture live photo', exact: true })).toBeEnabled()
  await page.evaluate(() => { cameraQA.delayCapture = true })
  await page.getByRole('button', { name: 'Capture live photo', exact: true }).click()
  await page.getByLabel('Scheduled beneficiary', { exact: true }).selectOption(secondId)
  await page.evaluate(() => { cameraQA.finishCapture() })
  await twoFrames()
  await expect(page.getByAltText('Captured beneficiary face preview')).toHaveCount(0)
  await expect(verify).toBeDisabled()
  assert.equal(await allStopped(), true)
  console.log('Passed: face startup readiness, capture, retake, stopped streams and ignored old-beneficiary photo callback.')

  await face(); await upload()
  await expect(page.getByText('Uploaded photo', { exact: true })).toBeVisible()
  const photoUrl = await page.getByAltText('Uploaded beneficiary photo preview').getAttribute('src')
  faceFailure = { code: 'BIOMETRIC_SERVICE_UNAVAILABLE', message: 'The biometric service is currently unavailable.', status: 503 }
  await verify.click()
  await expect(page.getByRole('alert').filter({ hasText: 'Identity verification was not confirmed' })).toContainText('Your photo is still here')
  await expect(page.getByAltText('Uploaded beneficiary photo preview')).toHaveAttribute('src', photoUrl)
  await expect(verify).toBeEnabled()
  for (const failure of [
    { code: 'BIOMETRIC_NO_MATCH', message: 'The live face did not match the enrolled beneficiary.' },
    { code: 'BIOMETRIC_LIVENESS_FAILED', message: 'The face liveness check failed.' },
  ]) {
    faceFailure = failure; await verify.click()
    await expect(page.getByRole('alert').filter({ hasText: 'Identity verification was not confirmed' })).toContainText(failure.message)
    await expect(page.getByAltText('Uploaded beneficiary photo preview')).toHaveAttribute('src', photoUrl)
  }
  faceFailure = { code: 'BIOMETRIC_PROFILE_REQUIRED', message: 'The beneficiary has no enrolled biometric profile.' }
  await verify.click()
  await expect(page.getByRole('button', { name: 'Review consent & enrollment' })).toBeVisible()
  await expect(verify).toBeDisabled()
  consentActive = false
  await page.getByRole('button', { name: 'Review consent & enrollment' }).click()
  await expect(page.getByText('Enrollment locked:', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Start live camera', exact: true })).toHaveCount(0)
  assert.ok(page.url().includes(`beneficiary=${personId}`)); assert.ok(page.url().includes(`distribution=${eventId}`))

  faceFailure = null; consentActive = true
  await face('enrollment'); await upload()
  await page.getByRole('button', { name: 'Save face profile', exact: true }).click()
  await expect(page.getByText('Authorized review pending', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Start live camera', exact: true })).toHaveCount(0)
  assert.equal(calls.enrollment, 1)
  console.log('Passed: upload distinction, service failure photo retention, mismatch/liveness errors, missing profile/consent and duplicate hold.')

  profileStatus = 'NOT_ENROLLED'
  await page.evaluate(() => sessionStorage.setItem('garantiyaid.user', JSON.stringify({ userId: 'qa-admin', fullName: 'Camera QA Admin', role: 'SYSTEM_ADMIN' })))
  await face('enrollment')
  await expect(page.getByText('Enrollment is assigned to facilitators.', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Start live camera', exact: true })).toHaveCount(0)
  await expect(page.getByRole('tab', { name: 'Claim verification', exact: true })).toHaveCount(0)
  await page.evaluate(() => sessionStorage.setItem('garantiyaid.user', JSON.stringify({ userId: 'qa-facilitator', fullName: 'Camera QA Facilitator', role: 'BARANGAY_FACILITATOR', barangayId: 'qa-area' })))

  for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }, { width: 320, height: 568 }]) {
    await page.setViewportSize(viewport)
    await qr(); dialog = await openQr()
    await expect(dialog.getByRole('status')).toContainText('Camera ready')
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
    await dialog.getByRole('button', { name: 'Stop camera', exact: true }).click()
    await expect(dialog.getByRole('button', { name: 'Start camera', exact: true })).toBeVisible()
    await page.screenshot({ path: resolve(output, `qr-camera-${viewport.width}.png`) })
    await page.keyboard.press('Escape')
    await face(); await upload()
    await expect(verify).toBeEnabled()
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
    await page.screenshot({ path: resolve(output, `face-photo-${viewport.width}.png`), fullPage: true })
  }

  const svg = renderToStaticMarkup(createElement(QRCodeSVG, { value: 'qa-qr-decoder-roundtrip', size: 320, marginSize: 4, level: 'M' })).replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ')
  const fallbackRead = await page.evaluate(async svgMarkup => {
    delete window.BarcodeDetector
    const image = new Image()
    image.src = `data:image/svg+xml;base64,${btoa(svgMarkup)}`
    await image.decode()
    Object.defineProperties(image, { videoWidth: { value: image.naturalWidth }, videoHeight: { value: image.naturalHeight } })
    const { createQrDetector } = await import('/src/utils/camera.js')
    return (await (await createQrDetector()).detect(image))[0]?.rawValue === 'qa-qr-decoder-roundtrip'
  }, svg)
  assert.equal(fallbackRead, true)
  assert.equal(calls.forbidden, 0)
  assert.deepEqual(errors, [])
  console.log('Passed: role visibility, 320/390/844 landscape layouts, native scanning and real jsQR image decoding; zero real API actions or notifications.')
} catch (error) {
  if (page) await page.screenshot({ path: resolve(output, 'failure.png'), fullPage: true }).catch(() => {})
  throw error
} finally { await browser?.close(); await vite.close() }
