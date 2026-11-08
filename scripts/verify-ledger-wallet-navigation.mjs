import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium, expect } from '@playwright/test'
import { createServer } from 'vite'

const beneficiaryId = '11111111-1111-4111-8111-111111111111'
const beneficiary = { beneficiaryId, firstName: 'Maria', lastName: 'Santos', status: 'ACTIVE', barangay: { barangayName: 'Poblacion', city: 'Sample City' } }
const program = { programId: 'program-1', programCode: 'AID-2026', programName: 'Community Assistance' }
const barangay = { barangayId: 'barangay-1', barangayName: 'Poblacion' }
let openEvent = false
let credited = false
let mismatch = false
let emptyDistributions = false
const distributionReads = []
const output = resolve('../output/transactions-ui-refinement')
await mkdir(output, { recursive: true })
const distribution = (id) => ({ distributionId: id, title: id === 'event-2' ? 'October Assistance' : 'September Assistance', distributionDate: '2026-10-10', program, barangay, status: openEvent ? 'OPEN' : 'CLOSED', deliveryMode: 'SIMULATED_WALLET' })
const claim = () => ({ claimId: 'claim-1', distributionId: 'event-2', beneficiary, schedule: { queueNumber: 1, status: 'CHECKED_IN' }, allocation: { amount: '1500', allocationStatus: 'ALLOCATED' }, claimStatus: credited ? 'CLAIMED' : 'VERIFIED', verificationMethod: 'QR', qrVerified: true, disputes: [] })
const transaction = () => ({ transactionId: 'transaction-1', referenceNo: 'SIM-TEST-001', transactionType: 'BENEFIT_CREDIT', status: 'COMPLETED', amount: '1500', createdAt: '2026-10-20T01:00:00Z', beneficiary })
const pagination = (total) => ({ page: 1, totalPages: 1, total })
const zeroFunds = { allocatedAmount: '0', netCreditedAmount: '0', remainingAmount: '0', reversedAmount: '0', failedAmount: '0' }

const vite = await createServer({ cacheDir: '../tmp/ledger-navigation-vite', server: { host: '127.0.0.1', port: 0 } })
await vite.listen()
const baseUrl = `http://127.0.0.1:${vite.httpServer.address().port}`
const browser = await chromium.launch({ headless: true, channel: 'chrome' })
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.addInitScript(() => {
    sessionStorage.setItem('garantiyaid.accessToken', 'preview-token')
    sessionStorage.setItem('garantiyaid.user', JSON.stringify({ userId: 'staff-1', role: sessionStorage.getItem('local-test-role') || 'SYSTEM_ADMIN', fullName: 'System Administrator', email: 'admin@example.gov.ph' }))
  })
  await page.route('**/socket.io/**', (route) => route.abort())
  await page.routeWebSocket(/socket\.io/, () => {})
  await page.route('**/api/v1/**', async (route) => {
    const url = new URL(route.request().url())
    const path = url.pathname.replace('/api/v1', '')
    let data = {}
    if (path === '/health') data = { timestamp: new Date().toISOString() }
    else if (path === '/dashboard/overview') data = { overview: { fundUtilization: zeroFunds } }
    else if (path === '/barangays') data = { barangays: [barangay] }
    else if (path === '/enrollments') data = { enrollments: [], pagination: pagination(0) }
    else if (path === '/programs') data = { programs: [], pagination: pagination(0) }
    else if (path === '/beneficiaries') data = { beneficiaries: [beneficiary], pagination: pagination(1) }
    else if (path === `/beneficiaries/${beneficiaryId}`) data = { beneficiary: { ...beneficiary, birthDate: '1985-01-01', sex: 'FEMALE', address: 'Poblacion' } }
    else if (path === `/beneficiaries/${beneficiaryId}/documents`) data = { documents: [] }
    else if (path === '/distributions') {
      distributionReads.push(Object.fromEntries(url.searchParams))
      const empty = emptyDistributions || url.searchParams.get('status') === 'DRAFT'
      data = { distributions: empty ? [] : [distribution('event-1')], pagination: pagination(empty ? 0 : 1) }
    }
    else if (path === '/distributions/event-2') data = { distribution: distribution('event-2') }
    else if (path === '/dashboard/distributions/event-2' || path === '/dashboard/distributions/event-1') data = { summary: { distribution: distribution(path.split('/').at(-1)), fundUtilization: zeroFunds } }
    else if (/^\/distributions\/event-[12]\/transactions$/.test(path)) data = { transactions: credited ? [transaction()] : [], summary: {}, pagination: pagination(credited ? 1 : 0) }
    else if (/^\/distributions\/event-[12]\/creditable-claims$/.test(path)) data = { claims: credited ? [] : [claim()], summary: { creditableClaimCount: credited ? 0 : 1 }, pagination: pagination(credited ? 0 : 1) }
    else if (path === '/distributions/event-2/claims/claim-1') data = { claim: claim() }
    else if (path === '/distributions/event-2/claims/claim-1/credit') {
      credited = true
      data = { transaction: transaction(), wallet: { walletId: 'wallet-1' }, lifecycle: {} }
    }
    else if (/^\/distributions\/event-[12]\/reconciliation$/.test(path)) data = { reconciliation: { readyToClose: !mismatch && (!openEvent || credited), ledgerBalanced: !mismatch, deliveryMode: 'SIMULATED_WALLET', expectedWalletCreditedAmount: credited ? '1500' : '0', netCreditedAmount: credited ? '1500' : '0', completedBenefitCreditCount: credited ? 1 : 0, reversedBenefitCreditCount: 0, exceptions: mismatch ? [{ code: 'WALLET_LEDGER_BALANCE_MISMATCH', walletId: 'wallet-1', beneficiaryId, storedBalance: '2500', calculatedBalance: '1500' }] : openEvent && !credited ? [{ code: 'VERIFIED_CLAIM_AWAITING_CREDIT', claimId: 'claim-1' }] : [] }, simulation: {} }
    else if (path === `/wallets/beneficiaries/${beneficiaryId}`) data = { beneficiary, wallet: { walletId: 'wallet-1', balance: '2500', accountStatus: 'ACTIVE' }, simulation: {} }
    else if (path === '/wallets/wallet-1/transactions') data = { transactions: [], pagination: pagination(0), simulation: {} }
    await route.fulfill({ json: { data } })
  })

  await page.goto(`${baseUrl}/dswd/ledger?distribution=event-2`)
  await page.getByRole('heading', { name: 'Transactions & wallets' }).waitFor()
  try { await page.getByLabel('Distribution event').waitFor({ timeout: 8000 }) }
  catch (error) { console.error((await page.locator('body').innerText()).slice(0, 2500)); throw error }
  assert.equal(await page.getByLabel('Distribution event').inputValue(), 'event-2')
  assert.equal(await page.getByRole('link', { name: 'View event setup' }).getAttribute('href'), '/distributions/manage?event=event-2')
  await page.getByText('Reconciled', { exact: true }).waitFor()
  assert.equal(await page.getByText('Ready to close', { exact: true }).count(), 0)
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)

  await page.getByRole('button', { name: 'Individual wallets' }).click()
  assert.equal(new URL(page.url()).searchParams.get('workspace'), 'wallets')
  await page.goto(`${baseUrl}/dswd/ledger?workspace=wallets&beneficiary=${beneficiaryId}`)
  await page.getByRole('heading', { name: 'Maria Santos' }).waitFor()
  assert.equal(await page.getByLabel('Beneficiary ID').inputValue(), beneficiaryId)
  assert.equal(await page.getByRole('link', { name: 'View beneficiary record' }).getAttribute('href'), `/beneficiaries?beneficiary=${beneficiaryId}`)
  assert.equal(await page.getByRole('button', { name: 'Record simulated transfer' }).count(), 0)
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
  await page.getByRole('link', { name: 'View beneficiary record' }).click()
  await page.getByText('Other record services', { exact: true }).click()
  await page.getByRole('link', { name: 'View simulated wallet' }).waitFor()
  await page.getByRole('link', { name: 'View simulated wallet' }).click()
  await page.getByRole('heading', { name: 'Maria Santos' }).waitFor()
  await page.setViewportSize({ width: 320, height: 700 })
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
  await page.setViewportSize({ width: 1440, height: 900 })
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)

  openEvent = true
  await page.goto(`${baseUrl}/dswd/ledger?distribution=event-2`)
  const reconciliation = page.getByRole('region', { name: 'Distribution reconciliation' })
  await expect(reconciliation.getByText('Maria Santos', { exact: true })).toBeVisible()
  await expect(reconciliation.getByText('DSWD staff', { exact: true })).toBeVisible()
  assert.equal(await page.getByRole('button', { name: 'Review and credit', exact: true }).count(), 0, 'Admin reviews but cannot credit')
  await page.evaluate(() => sessionStorage.setItem('local-test-role', 'DSWD_STAFF'))
  await page.reload()
  await page.getByRole('button', { name: 'Review and credit', exact: true }).click()
  const confirmation = page.getByRole('dialog', { name: 'Credit this verified claim?' })
  await expect(confirmation).toContainText('Maria Santos')
  await confirmation.getByRole('button', { name: 'Credit verified claim' }).click()
  await expect(confirmation).not.toBeVisible()
  await expect(reconciliation.getByText('Reconciled', { exact: true })).toBeVisible()
  assert.equal(credited, true)
  await page.evaluate(() => sessionStorage.removeItem('local-test-role'))
  await page.reload()
  await expect(reconciliation.getByText('Reconciled', { exact: true })).toBeVisible()
  assert.equal(await page.getByRole('button', { name: 'Reverse', exact: true }).count(), 0)
  assert.equal(await page.getByText('Event closed', { exact: true }).count(), 0)
  mismatch = true
  await page.getByRole('button', { name: 'Refresh ledger' }).click()
  await expect(reconciliation.getByText('Wallet balance does not match its ledger')).toBeVisible()
  await expect(reconciliation.getByText('Maria Santos', { exact: true })).toBeVisible()
  await reconciliation.getByRole('link', { name: 'Review wallet', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Maria Santos' })).toBeVisible()
  assert.equal(new URL(page.url()).searchParams.get('distribution'), 'event-2')
  assert.equal(new URL(page.url()).searchParams.get('beneficiary'), beneficiaryId)
  await page.goBack()
  await expect(reconciliation.getByText('Wallet balance does not match its ledger')).toBeVisible()
  await page.goForward()
  await expect(page.getByRole('heading', { name: 'Maria Santos' })).toBeVisible()

  await page.goto(`${baseUrl}/dswd/ledger`)
  const filters = page.getByRole('form', { name: 'Dashboard filters' })
  await expect(filters.getByRole('heading', { name: 'Filter distribution events' })).toBeVisible()
  await filters.getByLabel('Distribution status').selectOption('DRAFT')
  await filters.getByLabel('Date from', { exact: true }).fill('2026-11-01')
  await filters.getByLabel('Date to', { exact: true }).fill('2026-11-30')
  await filters.getByRole('button', { name: 'Apply filters' }).click()
  await expect(page.getByRole('heading', { name: 'No distributions match your filters' })).toBeVisible()
  assert.equal(distributionReads.at(-1).status, 'DRAFT')
  assert.equal(distributionReads.at(-1).dateFrom, '2026-11-01')
  assert.equal(distributionReads.at(-1).dateTo, '2026-11-30')
  await page.getByRole('button', { name: 'Show all distributions' }).click()
  await expect(page.getByLabel('Distribution event', { exact: true })).toBeVisible()
  await expect(filters.getByLabel('Distribution status')).toHaveValue('')
  await expect(filters.getByLabel('Date from', { exact: true })).toHaveValue('')
  await expect(filters.getByLabel('Date to', { exact: true })).toHaveValue('')
  await expect(filters.getByLabel('Distribution status')).toBeFocused()
  assert.equal(distributionReads.at(-1).status, undefined)
  await filters.getByLabel('Date from', { exact: true }).fill('2026-11-30')
  await filters.getByLabel('Date to', { exact: true }).fill('2026-11-01')
  const requestsBeforeInvalidDates = distributionReads.length
  await filters.getByRole('button', { name: 'Apply filters' }).click()
  await expect(filters.getByRole('alert')).toContainText('Date to must be the same as or later than Date from.')
  assert.equal(distributionReads.length, requestsBeforeInvalidDates)
  await filters.getByRole('button', { name: 'Clear filters' }).click()
  await expect(filters.getByRole('alert')).toHaveCount(0)

  emptyDistributions = true
  await page.goto(`${baseUrl}/dswd/ledger`)
  await expect(page.getByRole('heading', { name: 'No distributions in this scope' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'View distribution events' })).toHaveAttribute('href', '/distributions/manage')
  await expect(page.locator('#empty-ledger-heading').locator('..').locator('..').locator('svg').first()).toBeVisible()
  for (const width of [1440, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 })
    await page.evaluate(() => window.scrollTo(0, 0))
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `ledger overflow at ${width}`)
    await page.screenshot({ path: `${output}/ledger-${width}.png`, fullPage: true })
  }
  await page.evaluate(() => sessionStorage.setItem('local-test-role', 'DSWD_STAFF'))
  await page.reload()
  await expect(page.getByText('Ask your system administrator', { exact: false })).toBeVisible()
  await expect(page.getByRole('link', { name: 'View distribution events' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Refresh ledger' })).toBeVisible()
  await page.evaluate(() => sessionStorage.removeItem('local-test-role'))

  await page.goto(`${baseUrl}/dswd/ledger?workspace=wallets`)
  const idInput = page.getByLabel('Beneficiary ID', { exact: true })
  await expect(idInput).toHaveAttribute('placeholder', 'Paste beneficiary ID')
  await expect(idInput.locator('..').locator('svg')).toBeVisible()
  await page.getByRole('button', { name: 'Find wallet', exact: true }).click()
  await expect(idInput).toBeFocused()
  await idInput.fill('not-a-beneficiary-id')
  await page.getByRole('button', { name: 'Find wallet', exact: true }).click()
  await expect(page.locator('#wallet-lookup-error')).toContainText('Enter a valid beneficiary ID')
  await idInput.fill('')
  await page.reload()
  for (const width of [1440, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 })
    await page.evaluate(() => window.scrollTo(0, 0))
    await expect(page.getByRole('link', { name: 'Find beneficiary by name' })).toBeVisible()
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `wallet overflow at ${width}`)
    await page.screenshot({ path: `${output}/wallet-lookup-${width}.png`, fullPage: true })
  }
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.getByRole('link', { name: 'Find beneficiary by name' }).click()
  assert.equal(new URL(page.url()).pathname, '/beneficiaries')
  await page.getByRole('button', { name: 'Open record', exact: true }).filter({ visible: true }).first().click()
  await page.getByText('Other record services', { exact: true }).click()
  await page.getByRole('link', { name: 'View simulated wallet' }).click()
  await expect(page.getByRole('heading', { name: 'Maria Santos' })).toBeVisible()
  await expect(idInput).toHaveValue(beneficiaryId)
  await page.evaluate(() => sessionStorage.setItem('local-test-role', 'DSWD_STAFF'))
  await page.goto(`${baseUrl}/beneficiaries?beneficiary=${beneficiaryId}`)
  await page.getByText('Other record services', { exact: true }).click()
  await page.getByRole('link', { name: 'View simulated wallet' }).click()
  await expect(page.getByRole('heading', { name: 'Maria Santos' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Record simulated transfer' })).toBeVisible()
  assert.deepEqual(errors, [])
  console.log('Ledger and wallet navigation, filter recovery, lookup guidance, role permissions and 1440/1024/768/390/320px layouts passed')
} finally {
  await browser.close()
  await vite.close()
}
