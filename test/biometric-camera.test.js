import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('../src/pages/BiometricIdentityPage.jsx', import.meta.url), 'utf8')

test('live biometric capture requests the front camera, cleans streams, and keeps an upload fallback', () => {
  assert.match(source, /navigator\.mediaDevices\?\.getUserMedia/)
  assert.match(source, /facingMode: 'user'/)
  assert.match(source, /getTracks\(\)\.forEach\(\(track\) => track\.stop\(\)\)/)
  assert.match(source, /cameraRequestRef\.current/)
  assert.match(source, /new DataTransfer\(\)/)
  assert.match(source, /Upload instead/)
  assert.match(source, /aria-live="polite"/)
  assert.match(source, /role="alert"/)
  assert.match(source, /AI recognition configured:/)
  assert.match(source, /anti-spoofing protection/)
})
