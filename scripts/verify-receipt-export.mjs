import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { chromium, expect } from '@playwright/test'
import { createServer } from 'vite'

// All records and API writes are mocked; no live receipt, release, email or SMS is created.
const output = '../output/claim-receipts'
await mkdir(output, { recursive: true })
const vite = await createServer({ cacheDir: '../tmp/receipt-export-vite', server: { host: '127.0.0.1', port: 0 } })
await vite.listen()
let browser
try {
  browser = await chromium.launch({ channel: 'chrome', headless: true })
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  page.setDefaultTimeout(15000); page.setDefaultNavigationTimeout(30000)
  const origin = `http://127.0.0.1:${vite.httpServer.address().port}`
  const distributionId = '11111111-1111-4111-8111-111111111111', claimId = '22222222-2222-4222-8222-222222222222'
  const event = { distributionId, title: 'Synthetic community distribution', distributionDate: '2026-11-17', startTime: '16:30', endTime: '17:00', status: 'OPEN', deliveryMode: 'PHYSICAL_GOODS', verificationRequirement: 'QR_OR_BIOMETRIC', location: 'Synthetic Barangay Hall', barangay: { barangayName: 'Bacayan' }, program: { programCode: 'SYNTHETIC-AID', programName: 'Community Assistance' } }
  const beneficiary = { beneficiaryId: '33333333-3333-4333-8333-333333333333', firstName: 'Synthetic', lastName: 'Recipient', status: 'ACTIVE', barangay: event.barangay }
  const staff = { fullName: 'Synthetic Facilitator', employeeId: 'BSTF-SYNTHETIC' }
  const receipt = { receiptNo: 'GA-20261117-SYNTHETIC-001', receiptVersion: 'v1', claimId, currentClaimStatus: 'CLAIMED', evidenceHash: 'a1b2c3d4'.repeat(8), issuedAt: '2026-11-17T09:00:00Z', snapshot: {
    beneficiary: { ...beneficiary, fullName: 'Synthetic Recipient', barangayName: 'Bacayan', sitioPurok: 'Synthetic service area' },
    distribution: { ...event, ...event.program },
    claim: { claimId, claimStatus: 'CLAIMED', verificationMethod: 'QR', claimedAt: '2026-11-17T08:55:00Z' },
    service: { queueNumber: 1, sessionLabel: 'Afternoon session' },
    assistance: { amount: '300.00', deliveryMode: 'PHYSICAL_GOODS', package: { name: 'FAMILY FOOD PACK', quantity: 1, unit: 'pack' }, releasedAt: '2026-11-17T08:55:00Z', releasedBy: staff, evidence: { type: 'SIGNED_ACKNOWLEDGEMENT', reference: 'SYNTHETIC-LOG-23', notes: 'Practice handover recorded.' } },
    verificationEvidence: { verifiedBy: staff },
  } }
  const claim = () => ({ ...receipt.snapshot.claim, distributionId, beneficiaryId: beneficiary.beneficiaryId, beneficiary, distribution: event, schedule: { queueNumber: 1, status: 'CHECKED_IN' }, allocation: { amount: '300.00' }, qrVerified: true, biometricVerified: false, signatureVerified: false, releaseMethod: event.deliveryMode, releasedAt: receipt.snapshot.assistance.releasedAt, releasedBy: staff, releasedPackageName: 'FAMILY FOOD PACK', releasedQuantity: 1, releasedPackageUnit: 'pack', releaseEvidenceReference: 'SYNTHETIC-LOG-23', receipt: { receiptNo: receipt.receiptNo }, disputes: [] })
  let receiptRequests = 0, printRequests = 0, failPrintAudit = false
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.addInitScript(() => {
    sessionStorage.setItem('garantiyaid.accessToken', 'synthetic-receipt-session')
    sessionStorage.setItem('garantiyaid.user', JSON.stringify({ userId: 'staff-1', role: 'BARANGAY_FACILITATOR', fullName: 'Synthetic Facilitator', barangayId: 'barangay-1' }))
    window.printCalls = 0
    window.print = () => { window.dispatchEvent(new Event('beforeprint')); window.printCalls++; window.dispatchEvent(new Event('afterprint')) }
    const decode = Image.prototype.decode
    Image.prototype.decode = async function () {
      if (window.failPdf) throw new Error('Synthetic image conversion failure')
      if (window.holdPdf) await new Promise(resolve => { window.releasePdf = () => { window.holdPdf = false; resolve() } })
      return decode.call(this)
    }
  })
  await page.route('**/socket.io/**', route => route.abort())
  await page.routeWebSocket(/socket\.io/, () => {})
  await page.route('**/api/v1/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname.replace('/api/v1', '')
    let data
    const prefix = `/distributions/${distributionId}`
    if (path === '/health') data = { timestamp: new Date().toISOString() }
    else if (path === '/staff-notifications') data = { notifications: [], unreadCount: 0 }
    else if (path === '/distributions') data = { distributions: [event], pagination: { page: 1, totalPages: 1, total: 1 } }
    else if (path === prefix) data = { distribution: event }
    else if (path === `${prefix}/claims`) data = { claims: [claim()], summary: { countsByStatus: { CLAIMED: 1 } }, pagination: { page: 1, totalPages: 1, total: 1 } }
    else if (path === `${prefix}/claims/${claimId}`) data = { claim: claim() }
    else if (path === `${prefix}/claims/${claimId}/receipt`) { assert.equal(request.method(), 'POST'); receiptRequests++; data = { created: false, receipt } }
    else if (path === `${prefix}/claims/${claimId}/receipt/print-events`) {
      assert.equal(request.method(), 'POST'); printRequests++
      if (failPrintAudit) return route.fulfill({ status: 503, json: { error: { message: 'Synthetic print record unavailable. Retry.' } } })
      data = { receipt }
    } else throw new Error(`Unhandled receipt fixture: ${request.method()} ${path}`)
    await route.fulfill({ json: { success: true, data } })
  })
  const dialog = page.getByRole('dialog', { name: 'Claim acknowledgment receipt', exact: true })
  async function open() {
    await page.goto(`${origin}/claim-accountability?distribution=${distributionId}`)
    await page.getByRole('button', { name: 'View receipt', exact: true }).click()
    await expect(dialog).toBeVisible()
  }
  async function download(name) {
    const pending = page.waitForEvent('download')
    await dialog.getByRole('button', { name: 'Save as PDF', exact: true }).click()
    const file = await pending
    assert.equal(file.suggestedFilename(), `garantiyaid-receipt-${receipt.receiptNo}.pdf`)
    await file.saveAs(`${output}/${name}.pdf`)
  }
  await open()
  const original = JSON.stringify(receipt)
  await download('physical-download')
  assert.equal(printRequests, 0, 'Saving a PDF is not a print event or a new issuance')
  assert.equal(receiptRequests, 1)
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 })
    await dialog.getByRole('button', { name: 'Save as PDF', exact: true }).scrollIntoViewIfNeeded()
    assert.ok(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth + 1))
    for (const label of ['Save as PDF', 'Print receipt']) {
      const box = await dialog.getByRole('button', { name: label, exact: true }).boundingBox()
      assert.ok(box.width >= 44 && box.height >= 44)
    }
    await page.screenshot({ path: `${output}/actions-${width}.png` })
  }
  await page.setViewportSize({ width: 1440, height: 1000 })
  // Reproduce the reported condition: receipt scrolled to its footer before printing.
  await dialog.getByRole('button', { name: 'Print receipt', exact: true }).scrollIntoViewIfNeeded()
  await page.emulateMedia({ media: 'print' })
  await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')))
  await expect(page.locator('body > [data-claim-receipt-print-root]')).toBeVisible()
  await expect(page.locator('[data-claim-receipt-print-root] button')).toHaveCount(0)
  assert.equal(await page.locator('#root').evaluate(element => getComputedStyle(element).display), 'none')
  await page.pdf({ path: `${output}/physical-print.pdf`, format: 'A4', preferCSSPageSize: true, printBackground: false })
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')))
  await page.emulateMedia({ media: 'screen' })
  await expect(page.locator('[data-claim-receipt-print-root]')).toHaveCount(0)
  await expect(dialog).toBeVisible()
  failPrintAudit = true
  await dialog.getByRole('button', { name: 'Print receipt', exact: true }).click()
  await expect(dialog.getByRole('alert')).toContainText('Synthetic print record unavailable')
  assert.equal(await page.evaluate(() => window.printCalls), 0)
  failPrintAudit = false
  await dialog.getByRole('button', { name: 'Print receipt', exact: true }).click()
  await expect.poll(() => page.evaluate(() => window.printCalls)).toBe(1)
  await expect(page.locator('[data-claim-receipt-print-root]')).toHaveCount(0)
  await page.evaluate(() => { window.failPdf = true })
  await dialog.getByRole('button', { name: 'Save as PDF', exact: true }).click()
  await expect(dialog.getByRole('alert')).toBeFocused()
  await expect(dialog.getByRole('alert')).toContainText('PDF could not be saved')
  await page.evaluate(() => { window.failPdf = false; window.holdPdf = true })
  await dialog.getByRole('button', { name: 'Save as PDF', exact: true }).evaluate(button => { button.click(); button.click() })
  await expect(dialog.getByRole('button', { name: 'Saving PDF...', exact: true })).toBeDisabled()
  await expect(dialog.getByRole('button', { name: 'Print receipt', exact: true })).toBeDisabled()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeVisible()
  const retry = page.waitForEvent('download')
  await expect.poll(() => page.evaluate(() => typeof window.releasePdf)).toBe('function')
  await page.evaluate(() => window.releasePdf())
  await retry
  assert.equal(JSON.stringify(receipt), original, 'Exporting preserves the original snapshot and reference')
  receipt.snapshot.beneficiary.fullName = 'Maria Peña – 李安'
  receipt.snapshot.assistance.evidence.notes = `${'A long recorded release note with preserved details. '.repeat(35)}END-OF-RELEASE-NOTES`
  await open()
  await download('long-unicode-download')
  receipt.snapshot.assistance.deliveryMode = 'SIMULATED_WALLET'
  receipt.snapshot.assistance.package = null
  receipt.snapshot.beneficiary.fullName = 'Synthetic Recipient'
  receipt.snapshot.verificationEvidence.transaction = { referenceNo: 'SYNTHETIC-LEDGER-001', processedBy: staff }
  event.deliveryMode = 'SIMULATED_WALLET'
  await open()
  await download('wallet-download')
  assert.deepEqual(errors, [])
  await writeFile(`${output}/expected.json`, JSON.stringify({ receiptNo: receipt.receiptNo, evidenceHash: receipt.evidenceHash, qr: `${origin}/claim-accountability?distribution=${distributionId}&claim=${claimId}&receipt=${encodeURIComponent(receipt.receiptNo)}&hash=${receipt.evidenceHash}` }))
  console.log('PASS: direct PDF, scrolled-modal A4 print, QR inclusion, snapshot preservation, error recovery, print auditing, double-click guard and 320–1440px controls; all APIs mocked.')
} finally {
  await browser?.close()
  await vite.close()
}
