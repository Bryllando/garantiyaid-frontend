import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { createServer as createHttpServer } from 'node:http'
import { Server } from '../../garantiyaid-backend/node_modules/socket.io/dist/index.js'
import { chromium, expect } from '@playwright/test'
import { createServer } from 'vite'

const output = '../output/admin-redesign'
await mkdir(output, { recursive: true })
const live = createHttpServer()
const io = new Server(live)
io.on('connection', (socket) => socket.emit('realtime.ready', {}))
await new Promise((resolve) => live.listen(0, '127.0.0.1', resolve))
const vite = await createServer({ cacheDir: '../tmp/claim-handoff-vite', server: { host: '127.0.0.1', port: 0, proxy: { '/socket.io': { target: `http://127.0.0.1:${live.address().port}`, ws: true } } } })
await vite.listen()
const origin = `http://127.0.0.1:${vite.httpServer.address().port}`
const browser = await chromium.launch({ headless: true, channel: 'chrome' })
const user = { userId: 'admin-1', role: 'SYSTEM_ADMIN', fullName: 'Admin Reviewer', email: 'admin@example.test' }
const beneficiary = { beneficiaryId: 'person-1', status: 'ACTIVE', firstName: 'Maria', lastName: 'Santos', barangay: { barangayName: 'Poblacion' } }
const event = { distributionId: 'event-2', title: 'October assistance', status: 'OPEN', distributionDate: '2026-10-26', location: 'Barangay hall', deliveryMode: 'PHYSICAL_GOODS', verificationRequirement: 'QR', barangay: beneficiary.barangay, program: { programCode: 'AID', programName: 'Community assistance' } }
let status = 'VERIFIED', disputed = false, hasReceipt = false, failRecords = false, failRelease = false, failIssue = false, failEvents = false, failDispute = false, resolved = false
const stats = { receiptWrites: 0, printWrites: 0, releaseWrites: 0, claimReads: 0, reverseWrites: 0, creditWrites: 0 }
const releaseKeys = []
const claim = () => ({ claimId: 'claim-1', distributionId: event.distributionId, beneficiaryId: beneficiary.beneficiaryId, beneficiary, distribution: { ...event }, schedule: { queueNumber: 12, status: 'CHECKED_IN' }, allocation: { amount: '1500', allocationStatus: 'ALLOCATED' }, claimStatus: status, verificationMethod: event.verificationRequirement, qrVerified: true, biometricVerified: false, signatureVerified: false, disputes: disputed ? [{ disputeId: 'dispute-1', referenceNo: 'CASE-001', status: 'REFERRED' }] : [], receipt: hasReceipt ? { receiptNo: 'RECEIPT-001' } : null, ...(status === 'CLAIMED' ? { releasedAt: '2026-10-26T01:00:00Z', releaseMethod: event.deliveryMode, releaseEvidenceReference: 'LOG-001', releasedBy: { fullName: 'Barangay Officer' } } : {}) })
const dispute = () => ({ disputeId: 'dispute-1', referenceNo: 'CASE-001', status: resolved ? 'RESOLVED' : 'REFERRED', reasonCode: 'BENEFICIARY_DENIES_RECEIPT', statement: 'The beneficiary disputes the recorded assistance.', filedAt: '2026-10-26T01:00:00Z', filedBy: { userId: 'other', fullName: 'Barangay Officer' }, assignedTo: { userId: 'admin-1', fullName: 'Admin Reviewer' }, claim: claim() })
const pagination = (total = 1, page = 1) => ({ page, pageSize: 20, total, totalPages: total ? Math.ceil(total / 20) : 0 })
const receipt = () => ({ receiptNo: 'RECEIPT-001', claimId: 'claim-1', receiptVersion: 'v1', evidenceHash: 'local-test-hash', issuedAt: '2026-10-26T01:00:00Z', currentClaimStatus: status, snapshot: { beneficiary: { ...beneficiary, fullName: 'Maria Santos' }, distribution: { ...event, programName: 'Community assistance', programCode: 'AID' }, assistance: { amount: '1500', deliveryMode: event.deliveryMode, evidence: { type: 'OFFICIAL_RELEASE_LOG', reference: 'LOG-001' } }, claim: claim(), service: { queueNumber: 12, sessionLabel: 'Morning' }, verificationEvidence: {} } })
const transaction = () => ({ transactionId: 'transaction-1', walletId: 'wallet-1', claimId: 'claim-1', referenceNo: 'SIM-001', transactionType: 'BENEFIT_CREDIT', status: status === 'VOIDED' ? 'REVERSED' : 'COMPLETED', amount: '1500', createdAt: '2026-10-26T01:00:00Z', beneficiary })
const funds = { allocatedAmount: '1500', netCreditedAmount: '1500', remainingAmount: '0', reversedAmount: '0', failedAmount: '0' }
const unhandled = [], errors = []
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  page.setDefaultNavigationTimeout(45_000)
  page.on('pageerror', (error) => errors.push(error.message))
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.addInitScript((user) => {
    sessionStorage.setItem('garantiyaid.accessToken', 'fixture-token')
    sessionStorage.setItem('garantiyaid.user', JSON.stringify({ ...user, role: sessionStorage.getItem('fixture-role') || user.role }))
  }, user)
  await page.route('**/api/v1/**', async (route) => {
    const url = new URL(route.request().url()), path = url.pathname.replace('/api/v1', ''), method = route.request().method()
    let data
    const failure = (message) => route.fulfill({ status: 503, json: { success: false, error: { code: 'TEMPORARY_FAILURE', message } } })
    if (path === '/health') data = { status: 'ok' }
    else if (path === '/staff-notifications') data = { notifications: [], unreadCount: 0, pagination: pagination(0) }
    else if (path === '/staff-notifications/unread-count') data = { unreadCount: 0 }
    else if (path === '/distributions') { if (failEvents) return failure('Events temporarily unavailable'); data = { distributions: [{ ...event, distributionId: 'event-1', title: 'Another event' }], pagination: pagination() } }
    else if (path === '/distributions/event-2') data = { distribution: { ...event } }
    else if (path === '/distributions/event-2/claims') { stats.claimReads++; if (failRecords) return failure('Claim records temporarily unavailable'); data = { claims: [claim()], summary: { countsByStatus: { [status]: 1 } }, pagination: pagination(41, Number(url.searchParams.get('page') || 1)) } }
    else if (path === '/distributions/event-2/claims/claim-1') data = { claim: claim() }
    else if (path === '/distributions/event-2/claims/claim-1/receipt') { assert.equal(method, 'POST'); stats.receiptWrites++; if (failIssue) return failure('Receipt service temporarily unavailable'); const created = !hasReceipt; hasReceipt = true; data = { created, receipt: receipt() } }
    else if (path === '/distributions/event-2/claims/claim-1/receipt/print-events') { stats.printWrites++; data = { receipt: receipt() } }
    else if (path === '/distributions/event-2/claims/claim-1/disputes') { if (failDispute) return failure('Dispute service temporarily unavailable'); disputed = true; data = { dispute: dispute() } }
    else if (path === '/distributions/event-2/claim-disputes/dispute-1/review') { resolved = true; disputed = false; data = { dispute: dispute() } }
    else if (path === '/distributions/event-2/claims/claim-1/release') { stats.releaseWrites++; releaseKeys.push(route.request().headers()['idempotency-key']); if (failRelease) return failure('Release service temporarily unavailable'); status = 'CLAIMED'; data = { claim: claim(), release: { evidence: { reference: 'LOG-001' } }, lifecycle: {} } }
    else if (path === '/distributions/event-2/claim-disputes') { if (failRecords) return failure('Disputes temporarily unavailable'); data = { disputes: [dispute()], summary: { countsByStatus: { REFERRED: 1 } }, pagination: pagination(41, Number(url.searchParams.get('page') || 1)) } }
    else if (path === '/dashboard/overview') data = { overview: { fundUtilization: funds } }
    else if (path === '/barangays') data = { barangays: [] }
    else if (path === '/dashboard/distributions/event-2') data = { summary: { distribution: event, fundUtilization: funds } }
    else if (path === '/distributions/event-2/transactions') data = { transactions: [transaction()], summary: {}, pagination: pagination() }
    else if (path === '/distributions/event-2/creditable-claims') data = { claims: status === 'VERIFIED' && !disputed ? [claim()] : [], summary: { creditableClaimCount: status === 'VERIFIED' && !disputed ? 1 : 0 }, pagination: pagination() }
    else if (path === '/distributions/event-2/claims/claim-1/credit') { stats.creditWrites++; status = 'CLAIMED'; data = { transaction: transaction(), wallet: { walletId: 'wallet-1' }, lifecycle: {} } }
    else if (path === '/wallets/wallet-1/transactions/transaction-1/reverse') { stats.reverseWrites++; status = 'VOIDED'; data = { originalTransaction: transaction(), reversalTransaction: { ...transaction(), transactionType: 'BENEFIT_REVERSAL' }, wallet: { walletId: 'wallet-1' }, claim: claim(), lifecycle: {} } }
    else if (path === '/distributions/event-2/reconciliation') data = { reconciliation: { readyToClose: status === 'CLAIMED', ledgerBalanced: true, exceptions: [], deliveryMode: event.deliveryMode }, simulation: {} }
    else { unhandled.push(`${method} ${path}`); return route.fulfill({ status: 404, json: { error: { message: 'Unhandled fixture' } } }) }
    await route.fulfill({ json: { success: true, data } })
  })
  const go = (query = '') => page.goto(`${origin}/claim-accountability?distribution=event-2${query}`)
  await go('&claim=claim-1&page=2')
  await expect(page.getByRole('heading', { name: 'Maria Santos' })).toBeVisible()
  await expect(page.getByText('Awaiting physical release', { exact: true })).toBeVisible()
  await expect(page.getByText('Not required for this event', { exact: true })).toHaveCount(2)
  await expect(page.getByRole('button', { name: 'Issue receipt' })).toBeDisabled()
  assert.equal(await page.getByRole('button', { name: 'Mark released', exact: true }).count(), 0)
  await expect(page.getByText(/Live claim updates connected/)).toBeVisible()
  status = 'CLAIMED'
  io.emit('claim.released', { distributionId: 'event-2' })
  await expect(page.getByText('Released', { exact: true })).toBeVisible()
  assert.equal(new URL(page.url()).searchParams.get('page'), '2')
  assert.equal(stats.receiptWrites, 0)
  await page.reload()
  await expect(page.getByRole('button', { name: 'Issue receipt' })).toBeEnabled()
  assert.equal(stats.receiptWrites, 0, 'Refresh must not issue receipts')
  failIssue = true
  await page.getByRole('button', { name: 'Issue receipt' }).click()
  await expect(page.getByText('Receipt service temporarily unavailable')).toBeVisible()
  failIssue = false
  await page.getByRole('button', { name: 'Issue receipt' }).click()
  await expect(page.getByRole('dialog', { name: 'Claim acknowledgment receipt' })).toBeVisible()
  assert.equal(stats.printWrites, 0)
  await page.getByRole('button', { name: 'Close claim receipt' }).click()
  await expect(page.getByRole('button', { name: 'View receipt' })).toBeVisible()
  await page.getByRole('button', { name: 'View receipt' }).click()
  await expect(page.getByRole('dialog', { name: 'Claim acknowledgment receipt' })).toBeVisible()
  await page.evaluate(() => { window.print = () => {} })
  await page.getByRole('button', { name: 'Print receipt' }).click()
  await expect.poll(() => stats.printWrites).toBe(1)
  await page.getByRole('button', { name: 'Close claim receipt' }).click()
  const writes = stats.receiptWrites
  await page.reload()
  await expect(page.getByRole('button', { name: 'View receipt' })).toBeVisible()
  assert.equal(stats.receiptWrites, writes)

  await page.getByRole('button', { name: 'File dispute', exact: true }).click()
  const disputeForm = page.getByRole('dialog', { name: 'File a claim dispute' })
  await disputeForm.getByRole('button', { name: 'File dispute', exact: true }).click()
  await expect(disputeForm.getByLabel('Beneficiary statement', { exact: true })).toBeFocused()
  await disputeForm.getByLabel('Beneficiary statement', { exact: true }).fill('The beneficiary reports that the recorded assistance was not received.')
  await disputeForm.getByRole('checkbox').check()
  failDispute = true
  await disputeForm.getByRole('button', { name: 'File dispute', exact: true }).click()
  await expect(disputeForm.getByRole('alert')).toContainText('Dispute service temporarily unavailable')
  io.emit('claim.updated', { distributionId: 'event-2' })
  await expect(disputeForm.getByLabel('Beneficiary statement', { exact: true })).toHaveValue('The beneficiary reports that the recorded assistance was not received.')
  await disputeForm.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(disputeForm).toHaveCount(0)
  failDispute = false

  failRecords = true
  await page.getByRole('button', { name: 'Refresh records' }).click()
  await expect(page.getByRole('alert').filter({ hasText: 'Claim records temporarily unavailable' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Maria Santos' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'View receipt' })).toBeDisabled()
  failRecords = false
  await page.getByRole('button', { name: 'Try again', exact: true }).click()
  await expect(page.getByRole('button', { name: 'View receipt' })).toBeEnabled()
  assert.equal(new URL(page.url()).searchParams.get('page'), '2')

  status = 'PENDING'; event.verificationRequirement = 'QR_AND_BIOMETRIC'
  await page.getByRole('button', { name: 'Refresh records' }).click()
  await expect(page.getByText('Awaiting face verification', { exact: true })).toBeVisible()
  assert.equal(await page.getByRole('link', { name: 'Continue identity checks' }).count(), 0)
  status = 'VERIFIED'; event.verificationRequirement = 'QR'; disputed = true
  await page.getByRole('button', { name: 'Refresh records' }).click()
  await expect(page.getByText('On hold — dispute under review', { exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'Open dispute', exact: true }).click()
  await expect(page.getByLabel('Search', { exact: true })).toHaveValue('CASE-001')
  await page.goBack()
  await expect(page.getByText('On hold — dispute under review', { exact: true })).toBeVisible()

  disputed = false
  await page.evaluate(() => sessionStorage.setItem('fixture-role', 'BARANGAY_FACILITATOR'))
  await go()
  await page.getByRole('button', { name: 'Mark released', exact: true }).click()
  const release = page.getByRole('dialog', { name: 'Record the release' })
  await release.getByRole('button', { name: 'Mark assistance released' }).click()
  await expect(release.getByLabel('Evidence reference', { exact: true })).toBeFocused()
  await expect(release.getByLabel('Evidence reference', { exact: true })).toHaveAttribute('aria-invalid', 'true')
  await expect(release.getByText('Enter the official evidence reference using 3 to 120 characters.')).toBeVisible()
  await release.getByLabel('Evidence reference', { exact: true }).fill('LOG-001')
  await release.getByLabel(/Release notes/).fill('One assistance package handed to the beneficiary.')
  await release.getByRole('checkbox').check()
  io.emit('claim.updated', { distributionId: 'event-2' })
  await expect(release.getByLabel(/Release notes/)).toHaveValue('One assistance package handed to the beneficiary.')
  failRelease = true
  await release.getByRole('button', { name: 'Mark assistance released' }).click()
  await expect(release.getByRole('alert')).toContainText('Release service temporarily unavailable')
  failRelease = false
  await release.getByRole('button', { name: 'Retry release record' }).click()
  await expect(release).not.toBeVisible()
  assert.ok(releaseKeys[0]); assert.equal(releaseKeys[0], releaseKeys[1])
  await expect(page.getByRole('button', { name: 'Released', exact: true })).toBeDisabled()
  status = 'VERIFIED'; event.status = 'CLOSED'
  await page.getByRole('button', { name: 'Refresh records' }).click()
  await expect(page.getByText('Event closed', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Mark released', exact: true })).toBeDisabled()

  event.status = 'OPEN'; event.deliveryMode = 'SIMULATED_WALLET'; disputed = true; status = 'CLAIMED'
  await page.evaluate(() => sessionStorage.setItem('fixture-role', 'DSWD_STAFF'))
  await go('&view=disputes&search=Maria&status=REFERRED&page=2')
  await page.getByRole('button', { name: 'Open case CASE-001' }).click()
  await page.getByRole('button', { name: 'Review remediation', exact: true }).filter({ visible: true }).click()
  await page.getByRole('button', { name: 'Open ledger', exact: true }).click()
  await expect(page.getByLabel('Distribution event', { exact: true })).toHaveValue('event-2')
  await expect(page.getByRole('region', { name: 'Dispute ledger context' })).toContainText('Reviewing case CASE-001')
  await expect(page.getByRole('region', { name: 'Dispute ledger context' })).toContainText('Maria Santos')
  assert.equal(stats.reverseWrites, 0, 'Opening the ledger must not reverse a credit')
  await page.getByRole('button', { name: 'Reverse', exact: true }).click()
  const reversal = page.getByRole('dialog', { name: 'Reverse this benefit credit?' })
  await reversal.getByLabel('Reason for reversal').fill('Correcting the disputed credit after independent evidence review.')
  await reversal.getByRole('button', { name: 'Reverse simulated credit' }).click()
  await expect(reversal).not.toBeVisible()
  assert.equal(stats.reverseWrites, 1)
  await page.getByRole('link', { name: 'Return to dispute review' }).click()
  await expect(page.getByRole('region', { name: 'Case details', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Back to cases', exact: true }).click()
  await expect(page.getByLabel('Search', { exact: true })).toHaveValue('Maria')
  await expect(page.getByLabel('Status', { exact: true })).toHaveValue('REFERRED')
  assert.equal(new URL(page.url()).searchParams.get('page'), '2')
  await page.getByRole('button', { name: 'Open case CASE-001' }).click()
  await page.getByRole('button', { name: 'Review remediation', exact: true }).filter({ visible: true }).click()
  const review = page.getByRole('dialog', { name: 'Complete beneficiary remediation' })
  await review.getByRole('button', { name: 'Resolve as remediated' }).click()
  await expect(review.getByLabel('Review notes and evidence', { exact: true })).toBeFocused()
  await review.getByLabel('Review notes and evidence', { exact: true }).fill('Credit reversal confirmed in the matching event ledger and beneficiary informed.')
  await review.getByRole('button', { name: 'Resolve as remediated' }).click()
  await expect(review).not.toBeVisible()
  assert.equal(resolved, true)

  disputed = false; status = 'VERIFIED'; hasReceipt = false
  await go()
  await expect(page.getByText('Awaiting simulated credit', { exact: true })).toBeVisible()
  assert.equal(await page.getByRole('button', { name: 'Mark released', exact: true }).count(), 0)
  await page.getByRole('link', { name: 'Open wallet credits', exact: true }).click()
  await page.getByRole('button', { name: 'Review and credit' }).click()
  await page.getByRole('dialog', { name: 'Credit this verified claim?' }).getByRole('button', { name: 'Credit verified claim' }).click()
  await expect.poll(() => stats.creditWrites).toBe(1)
  await go()
  await expect(page.getByText('Credited', { exact: true })).toBeVisible()
  const issuedBeforeCreditReceipt = stats.receiptWrites
  await page.getByRole('button', { name: 'Issue receipt' }).click()
  await expect(page.getByRole('dialog', { name: 'Claim acknowledgment receipt' })).toContainText('Simulated wallet')
  assert.equal(stats.receiptWrites, issuedBeforeCreditReceipt + 1)
  await page.getByRole('button', { name: 'Close claim receipt' }).click()
  await page.clock.install()
  await page.reload()
  await expect(page.getByRole('button', { name: 'View receipt' })).toBeEnabled()
  io.disconnectSockets(true)
  await expect(page.getByText(/Live connection unavailable; automatic refresh remains active/)).toBeVisible()
  const beforeFallback = stats.claimReads
  await page.clock.fastForward(61_000)
  await expect.poll(() => stats.claimReads).toBeGreaterThan(beforeFallback)
  await expect(page.getByRole('button', { name: 'View receipt' })).toBeEnabled()
  for (const width of [375, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 })
    await page.screenshot({ path: `${output}/claims-handoff-${width}.png`, fullPage: true })
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
  }
  await page.setViewportSize({ width: 812, height: 375 })
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
  failEvents = true
  await go()
  await expect(page.getByRole('alert').filter({ hasText: 'Events temporarily unavailable' })).toBeVisible()
  failEvents = false
  await page.getByRole('button', { name: 'Try again', exact: true }).click()
  await expect(page.getByLabel('Distribution event', { exact: true })).toHaveValue('event-2')
  assert.deepEqual(errors, [])
  assert.deepEqual(unhandled, [])
  console.log(JSON.stringify({ result: 'Claim handoff, live refresh, explicit receipts, role and responsive checks passed', stats }))
} finally { await browser.close(); await vite.close(); await new Promise((resolve) => io.close(resolve)) }
