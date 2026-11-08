import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { chromium, expect } from '@playwright/test'
import { createServer } from 'vite'

// Recovery regressions use intercepted local fixtures only; no live writes or biometric processing.
const output = '../output/dswd-recovery'
await mkdir(output, { recursive: true })
const vite = await createServer({ cacheDir: '../tmp/dswd-recovery-vite', server: { host: '127.0.0.1', port: 0, hmr: false } })
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
  let failConsent = false, failClaimRead = false, failSignatureRead = false, loseTransferResponse = false
  let failBeneficiaryList = false, holdClaimRead = false, releaseClaimRead
  const savedTransfers = new Map()
  const signatureBodies = []
  let signatureBody, signatureKey, faceRequests = 0
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
      if (failBeneficiaryList) return fail(503, 'TEMPORARILY_UNAVAILABLE', 'Beneficiary search is temporarily unavailable.')
      const number = Number(url.searchParams.get('page') || 1); beneficiaryPages.push(number)
      const size = Number(url.searchParams.get('pageSize') || 20)
      const search = (url.searchParams.get('search') || '').toLowerCase()
      const people = mode === 'pages' ? [...Array.from({ length: 100 }, (_, i) => ({ ...person, beneficiaryId: `person-${i}`, firstName: 'Listed', lastName: String(i) })), person] : [person]
      const matches = people.filter((item) => `${item.firstName} ${item.lastName}`.toLowerCase().includes(search))
      data = { beneficiaries: matches.slice((number - 1) * size, number * size), pagination: pagination(matches.length, number, size) }
    } else if (path === `/beneficiaries/${person.beneficiaryId}`) data = { beneficiary: person }
    else if (path === `/beneficiaries/${person.beneficiaryId}/biometric-consents`) {
      assert.equal(request.method(), 'GET', 'profile recovery must not write consent')
      if (failConsent) return fail(503, 'TEMPORARILY_UNAVAILABLE', 'Consent records are temporarily unavailable.')
      data = { consents: [{ consentId: 'consent-1', consentStatus: 'ACTIVE', consentVersion: 'v1.0' }], pagination: pagination(1) }
    }
    else if (path === `/beneficiaries/${person.beneficiaryId}/biometrics/status`) data = { biometricProfile: { biometricId: 'profile-1', biometricStatus: 'ENROLLED' }, processing: { simulatedProcessor: true } }
    else if (path === '/distributions/event-1/schedules') data = { schedules: [{ scheduleId: 'schedule-1', beneficiaryId: person.beneficiaryId, beneficiary: person, status: faceVerified ? 'CHECKED_IN' : 'SCHEDULED', queueNumber: 1, claim: faceVerified ? { claimStatus: signatureSaved ? 'VERIFIED' : 'PENDING', releaseMethod: null } : null }, ...(mode === 'switch' ? [{ scheduleId: 'schedule-2', beneficiaryId: recipient.beneficiaryId, beneficiary: recipient, status: 'SCHEDULED', queueNumber: 2, claim: null }] : [])], summary: {}, pagination: pagination(mode === 'switch' ? 2 : 1) }
    else if (path === '/distributions/event-1/biometric-attempts') data = { attempts: [], privacy: {}, pagination: pagination(0) }
    else if (path === '/distributions/event-1/claims') {
      if (holdClaimRead && url.searchParams.get('search') === person.beneficiaryId) await new Promise((resolve) => { releaseClaimRead = resolve })
      if (failClaimRead) return fail(503, 'TEMPORARILY_UNAVAILABLE', 'Saved claim is unavailable.')
      data = { claims: faceVerified ? [claim()] : [], summary: {}, pagination: pagination(faceVerified ? 1 : 0) }
    } else if (path === '/distributions/event-1/claims/claim-1') {
      if (failSignatureRead) return fail(503, 'TEMPORARILY_UNAVAILABLE', 'Saved claim is unavailable.')
      data = { claim: claim() }
    } else if (path === '/distributions/event-1/claims/verify-biometric') {
      faceRequests++
      if (faceVerified) return fail(409, 'DUPLICATE_CLAIM', 'A claim already exists for this beneficiary and distribution event.')
      faceVerified = true
      data = { claim: claim(), verificationComplete: false, nextRequiredVerification: 'SIGNATURE' }
    } else if (path === '/distributions/event-1/claims/claim-1/signature') {
      signatureKeys.push(request.headers()['idempotency-key'])
      signatureBodies.push(request.postData())
      if (signatureSaved && request.headers()['idempotency-key'] === signatureKey) {
        assert.equal(request.postData(), signatureBody, 'signature retry reuses the exact evidence payload')
        data = { claim: claim(), signature: { signatureId: 'signature-1' }, verificationComplete: true, nextRequiredVerification: null }
      } else {
        if (signatureSaved) return fail(409, 'SIGNATURE_ALREADY_RECORDED', 'A protected signature is already recorded for this claim.')
        signatureKey = request.headers()['idempotency-key']; signatureBody = request.postData()
        signatureSaved = true
        return route.abort('connectionreset')
      }
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
      const key = request.headers()['idempotency-key']; transferKeys.push(key)
      if (savedTransfers.has(key)) data = savedTransfers.get(key)
      else {
        transfers += 1
        failWalletRefresh = transfers === 1
        data = { sourceTransaction: { referenceNo: `OUT-${transfers}`, amount: '100' }, recipientTransaction: { referenceNo: `IN-${transfers}`, amount: '100' }, sourceWallet: { walletId: 'wallet-source', balance: String(1000 - 100 * transfers), accountStatus: 'ACTIVE' }, recipientWallet: { walletId: 'wallet-target', balance: String(100 * transfers), accountStatus: 'ACTIVE' }, transferGroupId: `transfer-${transfers}`, simulation: {} }
        savedTransfers.set(key, data)
        if (loseTransferResponse) { loseTransferResponse = false; return route.abort('connectionreset') }
      }
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

  async function sign() {
    await page.getByRole('button', { name: /Typed acknowledgment/ }).click()
    await page.getByLabel('Type full legal name').fill('Maria Santos')
    await page.getByRole('checkbox').check()
    await page.getByRole('button', { name: 'Secure signature and verify claim' }).click()
  }
  async function screenshot(name) {
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 })
      await page.evaluate(() => window.scrollTo(0, 0))
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await page.screenshot({ path: `${output}/${name}-${width}.png`, fullPage: true, animations: 'disabled' })
      const overflow = await page.evaluate(() => [...document.querySelectorAll('main *')].filter((item) => item.getBoundingClientRect().right > innerWidth + 1).slice(0, 6).map((item) => ({ tag: item.tagName, class: item.className, width: item.getBoundingClientRect().width })))
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${name}: fits ${width}px ${JSON.stringify(overflow)}`)
    }
    await page.setViewportSize({ width: 1440, height: 1000 })
  }
  await page.goto(bioUrl)
  await verifyFace()
  await expect(page.getByRole('heading', { name: 'Collect beneficiary signature' })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Collect beneficiary signature' })).toBeVisible()
  assert.equal(faceRequests, 1, 'refresh resumes the saved face result without another capture')
  assert.equal(await page.locator('#verification-face-capture').count(), 0)
  await screenshot('signature-resumed')
  await sign()
  await expect(page.getByRole('heading', { name: 'Claim verification complete' })).toBeVisible()
  assert.equal(signatureKeys.length, 1, 'a saved signature is recovered by reading the claim after response loss')
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Claim verification complete' })).toBeVisible()

  faceVerified = false; signatureSaved = false; failSignatureRead = true
  await page.goto(bioUrl)
  await verifyFace()
  await sign()
  await expect(page.getByRole('alert')).toContainText('Signature confirmation unavailable')
  await expect(page.getByLabel('Type full legal name')).toBeDisabled()
  await screenshot('signature-retry')
  await page.getByRole('button', { name: 'Retry signature confirmation' }).click()
  await expect(page.getByRole('heading', { name: 'Claim verification complete' })).toBeVisible()
  assert.equal(signatureKeys.at(-1), signatureKeys.at(-2))
  assert.equal(signatureBodies.at(-1), signatureBodies.at(-2))
  failSignatureRead = false
  console.log('PASS: face/signature reload recovery, saved-result lookup, same-key and same-payload signature retry.')

  faceVerified = false; signatureSaved = false; failClaimRead = true
  await page.goto(bioUrl)
  await expect(page.getByRole('alert')).toContainText('Saved verification could not be loaded')
  await expect(page.getByRole('button', { name: 'Verify face and continue to signature' })).toBeDisabled()
  failClaimRead = false
  await page.getByRole('button', { name: 'Retry saved verification' }).click()
  await expect(page.getByRole('button', { name: 'Verify face and continue to signature' })).toBeEnabled()

  mode = 'switch'; holdClaimRead = true; faceVerified = true
  await page.goto(bioUrl)
  await expect.poll(() => Boolean(releaseClaimRead)).toBe(true)
  await page.getByLabel('Scheduled beneficiary').selectOption(recipient.beneficiaryId)
  await expect(page.getByRole('button', { name: 'Verify face and continue to signature' })).toBeEnabled()
  holdClaimRead = false
  releaseClaimRead()
  await expect(page.getByLabel('Scheduled beneficiary')).toHaveValue(recipient.beneficiaryId)
  await expect(page.getByRole('heading', { name: 'Collect beneficiary signature' })).toHaveCount(0)

  mode = 'pages'; beneficiaryPages.length = 0
  await page.goto(`${origin}/biometrics`)
  const beneficiarySearch = page.getByLabel('Find beneficiary by name', { exact: true })
  await expect(beneficiarySearch).toHaveAttribute('placeholder', 'Enter beneficiary name')
  await expect(beneficiarySearch.locator('..').locator('svg')).toBeVisible()
  for (let pageNumber = 1; pageNumber < 6; pageNumber++) {
    await expect(page.getByRole('navigation', { name: 'Beneficiary result pages' })).toContainText(`Page ${pageNumber} of 6`)
    await page.getByRole('button', { name: 'Next beneficiaries' }).click()
  }
  await expect(page.getByRole('navigation', { name: 'Beneficiary result pages' })).toContainText('Page 6 of 6')
  await page.getByLabel('Beneficiary record', { exact: true }).selectOption(person.beneficiaryId)
  await expect(page.locator('span.ga-status-success').filter({ hasText: /^Enrolled$/ })).toBeVisible()
  await page.getByRole('button', { name: 'Previous beneficiaries' }).click()
  await expect(page.getByRole('navigation', { name: 'Beneficiary result pages' })).toContainText('Page 5 of 6')
  await expect(page.getByLabel('Beneficiary record', { exact: true })).toHaveValue(person.beneficiaryId)
  failBeneficiaryList = true
  await page.getByRole('button', { name: 'Next beneficiaries', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Beneficiary search is temporarily unavailable')
  await expect(page.getByLabel('Beneficiary record', { exact: true })).toBeDisabled()
  failBeneficiaryList = false
  await page.getByRole('button', { name: 'Retry beneficiary list' }).click()
  await expect(page.getByLabel('Beneficiary record', { exact: true })).toBeEnabled()
  await expect(page.getByLabel('Beneficiary record', { exact: true })).toHaveValue(person.beneficiaryId)
  assert.ok(beneficiaryPages.includes(6))
  await page.getByLabel('Find beneficiary by name').fill('Maria')
  await page.getByRole('button', { name: 'Search beneficiaries', exact: true }).click()
  await expect(page.getByText(/1 matching beneficiary/)).toBeVisible()
  await screenshot('beneficiary-search')
  await page.getByLabel('Find beneficiary by name').fill('Nobody')
  await page.getByRole('button', { name: 'Search beneficiaries', exact: true }).click()
  await expect(page.getByText(/0 matching beneficiaries/)).toBeVisible()
  await expect(page.getByLabel('Beneficiary record', { exact: true })).toHaveValue(person.beneficiaryId)
  await page.getByRole('button', { name: 'Clear search', exact: true }).click()
  await expect(beneficiarySearch).toHaveValue('')
  await expect(beneficiarySearch).toBeFocused()
  await expect(page.getByLabel('Beneficiary record', { exact: true })).toHaveValue(person.beneficiaryId)
  console.log('PASS: beneficiary 101 is selectable through pagination/search; the selection survives pages and empty search results.')

  mode = 'consent'; failConsent = true
  await page.goto(`${origin}/biometrics?beneficiary=${person.beneficiaryId}`)
  await expect(page.getByRole('heading', { name: 'Unable to load profile' })).toBeVisible()
  assert.equal(await page.getByText('Not Recorded', { exact: true }).count(), 0)
  assert.equal(await page.getByText('Not Enrolled', { exact: true }).count(), 0)
  assert.equal(await page.getByRole('button', { name: 'Record consent decision' }).count(), 0)
  await screenshot('profile-read-error')
  failConsent = false
  await page.getByRole('button', { name: 'Retry profile' }).click()
  await expect(page.locator('span.ga-status-success').filter({ hasText: /^Enrolled$/ })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Revoke consent', exact: true })).toBeVisible()
  console.log('PASS: failed consent/profile reads show retry, hide false empty states, and block writes until recovery.')

  mode = 'wallet'
  await page.goto(`${origin}/dswd/ledger?workspace=wallets&beneficiary=${person.beneficiaryId}`)
  await expect(page.getByRole('heading', { name: 'Maria Santos' })).toBeVisible()
  async function reviewTransfer() {
    await page.getByLabel('Recipient beneficiary ID').fill(recipient.beneficiaryId)
    await page.getByLabel('Amount', { exact: true }).fill('100')
    await page.getByRole('button', { name: 'Review simulated transfer' }).click()
  }
  await reviewTransfer()
  const dialog = page.getByRole('dialog', { name: 'Confirm simulated transfer' })
  await dialog.getByRole('button', { name: 'Complete simulated transfer' }).click()
  await expect(dialog).not.toBeVisible()
  await expect(page.getByRole('heading', { name: 'Matching debit and credit recorded' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Transfer recorded; wallet details could not be refreshed' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Review simulated transfer' })).toBeDisabled()
  assert.equal(transfers, 1)
  await screenshot('transfer-refresh-error')
  failWalletRefresh = false
  await page.getByRole('button', { name: 'Refresh balances', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Transfer recorded; wallet details could not be refreshed' })).not.toBeVisible()
  await expect(page.getByRole('button', { name: 'Review simulated transfer' })).toBeEnabled()
  assert.equal(transfers, 1, 'refresh only reads; it never submits another transfer')

  loseTransferResponse = true
  await reviewTransfer()
  await dialog.getByRole('button', { name: 'Complete simulated transfer' }).click()
  await expect(dialog.getByRole('alert')).toContainText('transfer result could not be confirmed')
  await expect(dialog.getByRole('alert')).toBeFocused()
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Review simulated transfer' })).toBeDisabled()
  const findByName = page.getByRole('link', { name: 'Find beneficiary by name' })
  await expect(findByName).toBeDisabled()
  await findByName.dispatchEvent('click')
  assert.equal(new URL(page.url()).searchParams.get('workspace'), 'wallets', 'an uncertain transfer must keep its lookup context')
  await page.getByRole('button', { name: 'Check transfer result' }).click()
  await dialog.getByRole('button', { name: 'Complete simulated transfer' }).click()
  await expect(dialog).not.toBeVisible()
  await expect(page.getByRole('button', { name: 'Review simulated transfer' })).toBeEnabled()
  await expect(findByName).toBeEnabled()
  assert.equal(transfers, 2, 'only the two intentional transfers are recorded')
  assert.equal(transferKeys.at(-1), transferKeys.at(-2), 'cancel/reopen retains the uncertain request identity')
  console.log('PASS: recorded transfers survive refresh failures; lost-response retries retain their key, including after closing the dialog.')
  assert.deepEqual(unhandled, []); assert.deepEqual(errors, [])
} finally { await browser.close(); await vite.close() }
