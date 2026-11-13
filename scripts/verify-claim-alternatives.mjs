import assert from 'node:assert/strict'
import { mkdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium, expect } from '@playwright/test'
import { createServer } from 'vite'

// All application APIs are intercepted. This harness cannot release real assistance or send messages.
const output = resolve('../output/claim-alternatives')
await mkdir(output, { recursive: true })
const eventId = '11111111-1111-4111-8111-111111111111'
const personId = '22222222-2222-4222-8222-222222222222'
const person = { beneficiaryId: personId, firstName: 'DEMO', lastName: 'Participant', barangay: { barangayName: 'Demo barangay' } }
const event = { distributionId: eventId, title: 'TEST ONLY — manual claim', distributionDate: '2099-01-01', startTime: '09:00', endTime: '12:00', status: 'OPEN', verificationRequirement: 'MANUAL', deliveryMode: 'PHYSICAL_GOODS', manualVerificationBasis: 'TEST ONLY — supervised participant and appointment review, not government policy.', packageName: 'Demo pack', packageUnit: 'pack', packageQuantity: 1, program: { programName: 'Demo program' }, barangay: person.barangay }
const schedule = { scheduleId: 'demo-schedule', beneficiaryId: personId, beneficiary: person, status: 'SCHEDULED', queueNumber: 1, slot: { location: 'Demo desk', sessionLabel: 'Demo session', slotStart: '2099-01-01T09:00:00+08:00', slotEnd: '2099-01-01T12:00:00+08:00' } }
const vite = await createServer({ cacheDir: 'node_modules/.vite-claim-qa', logLevel: 'error', define: { 'import.meta.env.VITE_API_URL': JSON.stringify('/api/v1') }, server: { host: '127.0.0.1', port: 0, hmr: false } })
let browser, page, claim = null, reviewCalls = 0, signatureCalls = 0, releaseCalls = 0, receiptCalls = 0, messageCalls = 0
const errors = []
try {
  await vite.listen()
  browser = await chromium.launch({ channel: 'chrome', headless: true })
  const context = await browser.newContext({ viewport: { width: 1366, height: 1000 }, reducedMotion: 'reduce' })
  await context.addInitScript(() => {
    sessionStorage.setItem('garantiyaid.accessToken', 'mock-claim-test')
    sessionStorage.setItem('garantiyaid.user', JSON.stringify({ userId: 'demo-facilitator', fullName: 'Demo Facilitator', role: 'BARANGAY_FACILITATOR', barangayId: 'demo-barangay' }))
  })
  await context.routeWebSocket(/socket\.io/, () => {})
  await context.route(/socket\.io/, (route) => route.abort())
  await context.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1', '')
    const respond = (data) => route.fulfill({ json: { success: true, data } })
    if (/enqueue|send|notifications\/assistant-confirm/.test(path)) { messageCalls++; return route.abort() }
    if (path === '/health') return respond({ timestamp: new Date().toISOString() })
    if (path === '/staff-notifications') return respond({ notifications: [], unreadCount: 0, pagination: { totalPages: 1 } })
    if (path === '/distributions') return respond({ distributions: [event], pagination: { page: 1, total: 1, totalPages: 1 } })
    if (path === `/distributions/${eventId}`) return respond({ distribution: event })
    if (path.endsWith('/schedules')) return respond({ schedules: [schedule], summary: {}, pagination: { page: 1, total: 1, totalPages: 1 } })
    if (path.endsWith('/claims/verify-manual')) {
      reviewCalls++
      const body = route.request().postDataJSON()
      assert.equal(body.confirmed, true)
      assert.ok(route.request().headers()['idempotency-key'])
      claim = { claimId: 'saved-claim', beneficiaryId: personId, distributionId: eventId, beneficiary: person, claimStatus: 'PENDING', verificationMethod: 'MANUAL', signatureVerified: false,
        allocation: { amount: '1.00', allocationStatus: 'ALLOCATED' }, schedule, distribution: event, disputes: [], qrVerified: false, biometricVerified: false,
        manualVerification: { basis: event.manualVerificationBasis, evidenceReference: body.evidenceReference, notes: body.notes, confirmed: true, verifiedById: 'demo-facilitator', verifiedAt: new Date().toISOString() } }
      return respond({ claim, verificationComplete: false, nextRequiredVerification: 'SIGNATURE' })
    }
    if (path.endsWith('/signature')) {
      signatureCalls++
      const body = route.request().postDataJSON()
      assert.equal(body.signatureMethod, 'TYPED'); assert.equal(body.attestation, true)
      claim = { ...claim, signatureVerified: true, claimStatus: 'VERIFIED' }
      return respond({ claim, signature: { evidenceStored: true }, verificationComplete: true })
    }
    if (path.endsWith('/release')) {
      releaseCalls++
      const body = route.request().postDataJSON()
      assert.equal(body.beneficiaryAcknowledged, true); assert.equal(body.releasedQuantity, 1)
      claim = { ...claim, claimStatus: 'CLAIMED', releaseMethod: 'PHYSICAL_GOODS', releasedAt: new Date().toISOString(), releasedBy: { fullName: 'Demo Facilitator', employeeId: 'DEMO-001' }, releasedPackageName: 'Demo pack', releasedPackageUnit: 'pack', releasedQuantity: 1, releaseEvidenceType: body.evidenceType, releaseEvidenceReference: body.evidenceReference }
      return respond({ claim, release: { evidence: { reference: body.evidenceReference } }, lifecycle: { claimStatus: 'CLAIMED' } })
    }
    if (path.endsWith('/receipt')) {
      receiptCalls++
      const created = !claim.receipt
      claim.receipt ||= { receiptNo: 'TEST-RECEIPT-01' }
      return respond({ created, receipt: { ...claim.receipt, receiptVersion: 'v1', currentClaimStatus: 'CLAIMED', issuedAt: claim.releasedAt, evidenceHash: 'a'.repeat(64), snapshot: {
        beneficiary: { ...person, fullName: 'DEMO Participant', barangayName: 'Demo barangay' }, distribution: { ...event, programCode: 'TEST', programName: 'Demo program', location: 'Demo desk' }, service: schedule.slot,
        claim, assistance: { amount: '1.00', deliveryMode: 'PHYSICAL_GOODS', releasedAt: claim.releasedAt, releasedBy: claim.releasedBy, package: { name: 'Demo pack', quantity: 1, unit: 'pack' }, evidence: { type: claim.releaseEvidenceType, reference: claim.releaseEvidenceReference } },
        verificationEvidence: { manual: claim.manualVerification, signature: { imageSha256: 'b'.repeat(64) } },
      } } })
    }
    if (path.endsWith('/claim-disputes')) return respond({ disputes: [], summary: {}, pagination: { page: 1, total: 0, totalPages: 1 } })
    if (path.endsWith('/claims')) return respond({ claims: claim ? [claim] : [], summary: {}, pagination: { page: 1, total: claim ? 1 : 0, totalPages: 1 } })
    if (path.endsWith('/claims/saved-claim')) return respond({ claim })
    errors.push(`Unexpected API: ${path}`)
    return route.fulfill({ status: 400, json: { error: { code: 'UNEXPECTED_TEST_API', message: path } } })
  })
  page = await context.newPage()
  page.on('pageerror', (error) => errors.push(error.message))
  const base = `http://127.0.0.1:${vite.httpServer.address().port}`
  await page.goto(`${base}/manual-verification?distribution=${eventId}&beneficiary=${personId}`)
  await page.getByLabel('Identity-review evidence reference').fill('DEMO-ID-01 / row 1')
  await page.getByLabel('Review notes', { exact: true }).fill('Reviewed the consenting demo participant and appointment in person.')
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Confirm review and continue to acknowledgment' }).click()
  await expect(page.getByRole('heading', { name: 'Identity reviewed — acknowledgment pending' })).toBeVisible()
  await expect(page.getByText('Face verified', { exact: true })).toHaveCount(0)
  assert.equal(signatureCalls, 0)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Identity reviewed — acknowledgment pending' })).toBeVisible()
  await page.getByRole('button', { name: /Typed acknowledgment/ }).click()
  await page.getByLabel('Type full legal name').fill('DEMO Participant')
  await page.getByRole('checkbox', { name: /I confirm this acknowledgment/ }).check()
  await page.getByRole('button', { name: 'Secure signature and verify claim' }).click()
  await expect(page.getByRole('heading', { name: 'Identity verified — awaiting release' })).toBeVisible()
  assert.equal(reviewCalls, 1); assert.equal(signatureCalls, 1)
  for (const width of [320, 390, 1366]) {
    await page.setViewportSize({ width, height: 1000 })
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
  await page.screenshot({ path: resolve(output, 'manual-verified.png'), fullPage: true })
  await page.getByRole('button', { name: 'Open releases & receipts' }).click()
  await page.getByRole('button', { name: 'Mark released', exact: true }).click()
  await page.getByLabel('Quantity handed over', { exact: true }).fill('1')
  await page.getByLabel('Evidence reference', { exact: true }).fill('TEST-LOG-01 / page 1 / row 1')
  await page.getByRole('checkbox', { name: /Handover completed/ }).check()
  await page.getByRole('button', { name: 'Mark assistance released', exact: true }).click()
  await expect(page.getByText('Released — receipt pending', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Issue receipt', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Claim acknowledgment receipt' })).toBeVisible()
  await expect(page.getByText('TEST-RECEIPT-01', { exact: true }).first()).toBeVisible()
  await page.getByRole('button', { name: 'Close claim receipt' }).click()
  await expect(page.getByText('Completed — released and receipted', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'View receipt', exact: true }).click()
  await expect(page.getByText('TEST-RECEIPT-01', { exact: true }).first()).toBeVisible()
  assert.equal(releaseCalls, 1); assert.equal(receiptCalls, 2)
  await page.getByRole('button', { name: 'Close claim receipt' }).click()
  await page.screenshot({ path: resolve(output, 'transaction-completed.png'), fullPage: true })

  // Decode the actual backend-issued card rendered from its PDF, without exposing its raw credential in output.
  const image = await readFile(resolve('../garantiyaid-backend/recovery/claim-demo-20261112/qr-preview.png'))
  const saved = JSON.parse(await readFile(resolve('../garantiyaid-backend/recovery/claim-demo-20261112/credentials.json'), 'utf8'))
  const expectedToken = saved.cards.find((item) => item.distribution.verificationRequirement === 'QR').tokens[0].token
  const decoded = await page.evaluate(async (data) => {
    const { createQrDetector } = await import('/src/utils/camera.js')
    delete window.BarcodeDetector
    const image = new Image()
    image.src = `data:image/png;base64,${data}`
    await image.decode()
    Object.defineProperties(image, { videoWidth: { value: image.naturalWidth }, videoHeight: { value: image.naturalHeight } })
    return (await (await createQrDetector()).detect(image))[0]?.rawValue
  }, image.toString('base64'))
  assert.equal(decoded, expectedToken, 'The printed PDF QR must decode to the issued backend credential')
  assert.equal(messageCalls, 0); assert.deepEqual(errors, [])
  console.log('Passed: manual review → saved pending acknowledgment → reload → typed acknowledgment → verified → one release → original receipt reopened; responsive 320/390/1366; real issued PDF QR decoded; zero message sends. Actual hardware and face matching were not tested.')
} catch (error) {
  console.error(errors)
  if (page) { console.error((await page.locator('body').innerText()).slice(0, 4000)); await page.screenshot({ path: resolve(output, 'failure.png'), fullPage: true }) }
  throw error
} finally { await browser?.close(); await vite.close() }
