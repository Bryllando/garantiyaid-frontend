import assert from 'node:assert/strict'
import test from 'node:test'
import { recoveryCodePdf, recoveryCodePrintDocument, recoveryCodeText } from '../src/components/auth/recovery-code-export.js'
import { isMobileAuthenticatorDevice } from '../src/components/auth/authenticator-device.js'

const codes = Array.from({ length: 8 }, (_, index) => `ABCD-1234-5678-000${index}`)

test('recovery PDF is one A4 page containing every code exactly once', async () => {
  const blob = await recoveryCodePdf(codes)
  assert.equal(blob.type, 'application/pdf')
  const pdf = await blob.text()
  assert.match(pdf, /^%PDF-/)
  assert.equal((pdf.match(/\/Type \/Page\b/g) || []).length, 1)
  const pageSize = pdf.match(/\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/)
  assert.ok(pageSize)
  assert.ok(Math.abs(Number(pageSize[1]) - 595.28) < 0.01)
  assert.ok(Math.abs(Number(pageSize[2]) - 841.89) < 0.01)
  for (const code of codes) assert.equal(pdf.split(code).length - 1, 1)
  assert.doesNotMatch(pdf, /\/JavaScript|\/S \/Named|otpauth:|\/URI/)
})

test('print and text exports include the complete set without page UI', () => {
  const html = recoveryCodePrintDocument(codes)
  assert.match(html, /@page \{ size: A4; margin: 20mm;/)
  assert.match(html, /default-src 'none'/)
  assert.doesNotMatch(html, /<script|<button|<iframe|otpauth:/)
  for (const code of codes) {
    assert.equal(html.split(code).length - 1, 1)
    assert.equal(recoveryCodeText(codes).split(code).length - 1, 1)
  }
})

test('exports reject malformed or incomplete codes instead of unsafe or incomplete documents', async () => {
  for (const invalid of [null, [], codes.slice(1), [...codes, codes[0]], ['<script>alert(1)</script>', ...codes.slice(1)]]) {
    assert.throws(() => recoveryCodeText(invalid))
    assert.throws(() => recoveryCodePrintDocument(invalid))
    await assert.rejects(recoveryCodePdf(invalid))
  }
})

test('app launch is offered on mobile platforms, including iPad desktop mode, but not touch PCs', () => {
  for (const userAgent of ['Mozilla/5.0 (Linux; Android 15)', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0)', 'Mozilla/5.0 (iPad; CPU OS 18_0)']) {
    assert.equal(isMobileAuthenticatorDevice({ userAgent }), true)
  }
  assert.equal(isMobileAuthenticatorDevice({ userAgent: 'Macintosh', platform: 'MacIntel', maxTouchPoints: 5 }), true)
  assert.equal(isMobileAuthenticatorDevice({ userAgent: 'Windows NT 10.0', platform: 'Win32', maxTouchPoints: 10 }), false)
  assert.equal(isMobileAuthenticatorDevice({ userAgent: 'Macintosh', platform: 'MacIntel', maxTouchPoints: 0 }), false)
  assert.equal(isMobileAuthenticatorDevice(undefined), false)
})
