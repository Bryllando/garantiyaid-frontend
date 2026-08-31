import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const facilitatorSource = readFileSync(new URL('../src/pages/FacilitatorOperationsPage.jsx', import.meta.url), 'utf8')
const distributionSource = readFileSync(new URL('../src/pages/DistributionManagementPage.jsx', import.meta.url), 'utf8')
const staffAuthSource = readFileSync(new URL('../src/auth/staffAuth.js', import.meta.url), 'utf8')

test('QR workflow previews identity before confirmation and keeps scanner fallbacks', () => {
  assert.match(facilitatorSource, /new window\.BarcodeDetector\(\{ formats: \['qr_code'\] \}\)/)
  assert.match(facilitatorSource, /facingMode: \{ ideal: 'environment' \}/)
  assert.match(facilitatorSource, /getTracks\(\)\.forEach\(\(track\) => track\.stop\(\)\)/)
  assert.match(facilitatorSource, /Use handheld scanner/)
  assert.match(facilitatorSource, /No queue or claim record has changed yet/)
  assert.match(facilitatorSource, /Confirm check-in/)
  assert.doesNotMatch(facilitatorSource, /id="qr-claim-token"/)
  assert.match(staffAuthSource, /claims\/preview-qr/)
  assert.match(facilitatorSource, /Continue to biometric/)
  assert.match(facilitatorSource, /role="alert"/)
  assert.match(distributionSource, /<QRCodeSVG value=\{item\.token\}/)
  assert.match(distributionSource, /window\.print\(\)/)
})
