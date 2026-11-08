import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { chromium, expect } from '@playwright/test'
import { createServer } from 'vite'

// Review probes use local fixtures only. Assertions describe the current defects, not desired behavior.
const output = '../output/dswd-review'
await mkdir(output, { recursive: true })
const vite = await createServer({ cacheDir: '../tmp/dswd-review-vite', server: { host: '127.0.0.1', port: 0, hmr: false } })
await vite.listen()
const origin = `http://127.0.0.1:${vite.httpServer.address().port}`
const browser = await chromium.launch({ headless: true, channel: 'chrome' })
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  page.setDefaultTimeout(12000)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.addInitScript(() => {
    sessionStorage.setItem('garantiyaid.accessToken', 'local-review')
    sessionStorage.setItem('garantiyaid.user', JSON.stringify({ userId: 'reviewer', role: 'DSWD_STAFF', fullName: 'DSWD Reviewer' }))
  })
  const person = { beneficiaryId: '11111111-1111-4111-8111-111111111111', firstName: 'Maria', lastName: 'Santos', status: 'ACTIVE', birthDate: '1990-01-01', barangay: { barangayName: 'Poblacion', city: 'Sample City' } }
  const recipient = { ...person, beneficiaryId: '22222222-2222-4222-8222-222222222222', firstName: 'Juan', lastName: 'Reyes' }
  const event = { distributionId: 'event-1', title: 'Assistance distribution', status: 'OPEN', verificationRequirement: 'BIOMETRIC_AND_SIGNATURE', deliveryMode: 'SIMULATED_WALLET', distributionDate: '2026-10-30', startTime: '08:00', endTime: '17:00', location: 'Community hall' }
  const pagination = (total, page = 1, pageSize = 100) => ({ page, pageSize, total, totalPages: Math.ceil(total / pageSize) })
  const funds = { allocatedAmount: '1500', netCreditedAmount: '0', remainingAmount: '1500', reversedAmount: '0', failedAmount: '0' }
  let faceVerified = false, signatureSaved = false, mode = 'signature', transfers = 0, failWalletRefresh = false
  const signatureKeys = [], transferKeys = [], beneficiaryPages = [], unhandled = [], errors = []
  const claim = () => ({ claimId: 'claim-1', distributionId: 'event-1', beneficiaryId: person.beneficiaryId, beneficiary: person, distribution: event, claimStatus: signatureSaved ? 'VERIFIED' : 'PENDING', verificationMethod: event.verificationRequirement, biometricVerified: faceVerified, signatureVerified: signatureSaved })
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('**/socket.io/**', (route) => route.abort())
  await page.routeWebSocket(/socket\.io/, () => {})
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname.replace('/api/v1', '')
    const fail = (status, code, message) => route.fulfill({ status, json: { error: { code, message } } })
    let data
    if (path === '/health') data = { timestamp: new Date().toISOString() }
    else if (path === '/staff-notifications') data = { notifications: [], unreadCount: 0, pagination: pagination(0) }
    else if (path === '/staff-notifications/unread-count') data = { unreadCount: 0 }
    else if (path === '/distributions') data = { distributions: [event], pagination: pagination(1) }
    else if (path === '/beneficiaries') {
      const number = Number(url.searchParams.get('page') || 1); beneficiaryPages.push(number)
      data = mode === 'pages' ? { beneficiaries: number === 1 ? Array.from({ length: 100 }, (_, i) => ({ ...person, beneficiaryId: `person-${i}`, firstName: 'Listed', lastName: String(i) })) : [person], pagination: pagination(101, number) } : { beneficiaries: [person], pagination: pagination(1) }
    } else if (path === `/beneficiaries/${person.beneficiaryId}`) data = { beneficiary: person }
    else if (path === `/beneficiaries/${person.beneficiaryId}/biometric-consents`) return fail(503, 'TEMPORARILY_UNAVAILABLE', 'Consent records are temporarily unavailable.')
    else if (path === `/beneficiaries/${person.beneficiaryId}/biometrics/status`) data = { biometricProfile: { biometricId: 'profile-1', biometricStatus: 'ENROLLED' }, processing: { simulatedProcessor: true } }
    else if (path === '/distributions/event-1/schedules') data = { schedules: [{ scheduleId: 'schedule-1', beneficiaryId: person.beneficiaryId, beneficiary: person, status: faceVerified ? 'CHECKED_IN' : 'SCHEDULED', queueNumber: 1, claim: faceVerified ? { claimStatus: signatureSaved ? 'VERIFIED' : 'PENDING', releaseMethod: null } : null }], summary: {}, pagination: pagination(1) }
    else if (path === '/distributions/event-1/biometric-attempts') data = { attempts: [], privacy: {}, pagination: pagination(0) }
    else if (path === '/distributions/event-1/claims/verify-biometric') {
      if (faceVerified) return fail(409, 'DUPLICATE_CLAIM', 'A claim already exists for this beneficiary and distribution event.')
      faceVerified = true
      data = { claim: claim(), verificationComplete: false, nextRequiredVerification: 'SIGNATURE' }
    } else if (path === '/distributions/event-1/claims/claim-1/signature') {
      signatureKeys.push(request.headers()['idempotency-key'])
      if (signatureSaved) return fail(409, 'SIGNATURE_ALREADY_RECORDED', 'A protected signature is already recorded for this claim.')
      signatureSaved = true
      return route.abort('connectionreset')
    } else if (path === '/dashboard/overview') data = { overview: { fundUtilization: funds } }
    else if (path === '/dashboard/distributions/event-1') data = { summary: { distribution: event, fundUtilization: funds } }
    else if (path === '/distributions/event-1/transactions') data = { transactions: [], summary: {}, pagination: pagination(0) }
    else if (path === '/distributions/event-1/creditable-claims') data = { claims: [], summary: { creditableClaimCount: 0 }, pagination: pagination(0) }
    else if (path === '/distributions/event-1/reconciliation') data = { reconciliation: { readyToClose: true, ledgerBalanced: true, deliveryMode: event.deliveryMode, exceptions: [] }, simulation: {} }
    else if (path.startsWith('/wallets/beneficiaries/')) {
      if (failWalletRefresh) return fail(503, 'TEMPORARILY_UNAVAILABLE', 'Wallet balance refresh unavailable.')
      const source = path.endsWith(person.beneficiaryId)
      data = { beneficiary: source ? person : recipient, wallet: { walletId: source ? 'wallet-source' : 'wallet-target', balance: source ? String(1000 - 100 * transfers) : String(100 * transfers), accountStatus: 'ACTIVE' }, simulation: {} }
    } else if (path === '/wallets/wallet-source/transfers') {
      transferKeys.push(request.headers()['idempotency-key']); transfers += 1
      failWalletRefresh = transfers === 1
      data = { sourceTransaction: { referenceNo: `OUT-${transfers}`, amount: '100' }, recipientTransaction: { referenceNo: `IN-${transfers}`, amount: '100' }, sourceWallet: { walletId: 'wallet-source' }, recipientWallet: { walletId: 'wallet-target' }, transferGroupId: `transfer-${transfers}`, simulation: {} }
    } else if (/^\/wallets\/wallet-(source|target)\/transactions$/.test(path)) data = { transactions: [], pagination: pagination(0), simulation: {} }
    else { unhandled.push(path); return fail(404, 'MISSING_FIXTURE', path) }
    await route.fulfill({ json: { data } })
  })
  const bioUrl = `${origin}/biometrics?view=verify&distribution=event-1&beneficiary=${person.beneficiaryId}`
  const faceImage = { name: 'fixture.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jZQAAAABJRU5ErkJggg==', 'base64') }
  async function verifyFace() {
    await page.locator('#verification-face-capture').setInputFiles(faceImage)
    await page.getByRole('button', { name: 'Verify face and continue to signature' }).click()
  }
  await page.goto(bioUrl)
  await verifyFace()
  await expect(page.getByRole('heading', { name: 'Collect beneficiary signature' })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('button', { name: 'Verify face and continue to signature' })).toBeVisible()
  assert.equal(await page.getByRole('heading', { name: 'Collect beneficiary signature' }).count(), 0)
  await verifyFace()
  await expect(page.getByRole('alert')).toContainText('A claim already exists')
  await page.screenshot({ path: `${output}/signature-resume-blocked.png`, fullPage: true })
  console.log('REPRODUCED: refreshing after the face check loses signature continuation; repeating the face check is rejected as duplicate.')

  faceVerified = false
  await page.goto(bioUrl)
  await verifyFace()
  await page.getByRole('button', { name: /Typed acknowledgment/ }).click()
  await page.getByLabel('Type full legal name').fill('Maria Santos')
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Secure signature and verify claim' }).click()
  await expect(page.getByRole('alert')).toContainText('Identity verification was not confirmed')
  await page.getByRole('button', { name: 'Secure signature and verify claim' }).click()
  await expect(page.getByRole('alert')).toContainText('A protected signature is already recorded')
  assert.equal(signatureKeys.length, 2); assert.notEqual(signatureKeys[0], signatureKeys[1])
  console.log('REPRODUCED: signature retry generates a new request key after the response is lost; the saved result is not recovered.')

  mode = 'pages'
  beneficiaryPages.length = 0
  await page.goto(`${origin}/biometrics`)
  await expect(page.getByLabel('Beneficiary record')).toBeVisible()
  assert.equal(await page.getByLabel('Beneficiary record').locator('option').count(), 101)
  assert.equal(await page.getByLabel('Beneficiary record').locator(`option[value="${person.beneficiaryId}"]`).count(), 0)
  assert.deepEqual([...new Set(beneficiaryPages)], [1])
  console.log('REPRODUCED: profile picker offers only the first 100 active beneficiaries although the server reports 101.')

  mode = 'consent'
  await page.goto(`${origin}/biometrics?beneficiary=${person.beneficiaryId}`)
  await expect(page.getByRole('heading', { name: 'Informed consent' })).toBeVisible()
  await expect(page.getByText('Not Recorded', { exact: true })).toBeVisible()
  await expect(page.getByText('Not Enrolled', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Record consent decision' })).toBeEnabled()
  assert.equal(await page.getByRole('button', { name: 'Revoke consent', exact: true }).count(), 0)
  await page.screenshot({ path: `${output}/consent-load-failure.png`, fullPage: true })
  console.log('REPRODUCED: failed consent loading displays Not Recorded and Not Enrolled despite an enrolled profile, and keeps the consent write form enabled.')

  mode = 'wallet'
  await page.goto(`${origin}/dswd/ledger?workspace=wallets&beneficiary=${person.beneficiaryId}`)
  await expect(page.getByRole('heading', { name: 'Maria Santos' })).toBeVisible()
  await page.getByLabel('Recipient beneficiary ID').fill(recipient.beneficiaryId)
  await page.getByLabel('Amount', { exact: true }).fill('100')
  await page.getByRole('button', { name: 'Review simulated transfer' }).click()
  const dialog = page.getByRole('dialog', { name: 'Confirm simulated transfer' })
  await dialog.getByRole('button', { name: 'Complete simulated transfer' }).click()
  await expect(page.locator('#wallet-lookup-error')).toContainText('Wallet balance refresh unavailable')
  assert.equal(transfers, 1)
  await expect(dialog).toBeVisible()
  assert.equal(await dialog.getByRole('alert').count(), 0)
  await page.screenshot({ path: `${output}/transfer-saved-refresh-failed.png` })
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  failWalletRefresh = false
  await page.getByRole('button', { name: 'Review simulated transfer' }).click()
  await dialog.getByRole('button', { name: 'Complete simulated transfer' }).click()
  await expect(dialog).not.toBeVisible()
  assert.equal(transfers, 2); assert.notEqual(transferKeys[0], transferKeys[1])
  console.log('REPRODUCED: a successful transfer followed by a refresh error is shown as unsuccessful; cancel/review submits the same amount again with a new key.')
  assert.deepEqual(unhandled, []); assert.deepEqual(errors, [])
} finally { await browser.close(); await vite.close() }
