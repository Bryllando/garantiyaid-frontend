import assert from 'node:assert/strict'
import { chromium } from '@playwright/test'
import { createServer } from 'vite'

const beneficiaryId = '11111111-1111-4111-8111-111111111111'
const beneficiary = { beneficiaryId, firstName: 'Maria', lastName: 'Santos', status: 'ACTIVE', barangay: { barangayName: 'Poblacion', city: 'Sample City' } }
const program = { programId: 'program-1', programCode: 'AID-2026', programName: 'Community Assistance' }
const barangay = { barangayId: 'barangay-1', barangayName: 'Poblacion' }
const distribution = (id) => ({ distributionId: id, title: id === 'event-2' ? 'October Assistance' : 'September Assistance', distributionDate: '2026-10-10', program, barangay, status: 'CLOSED', deliveryMode: 'SIMULATED_WALLET' })
const pagination = (total) => ({ page: 1, totalPages: 1, total })
const zeroFunds = { allocatedAmount: '0', netCreditedAmount: '0', remainingAmount: '0', reversedAmount: '0', failedAmount: '0' }

const vite = await createServer({ server: { host: '127.0.0.1', port: 0 } })
await vite.listen()
const baseUrl = `http://127.0.0.1:${vite.httpServer.address().port}`
const browser = await chromium.launch({ headless: true, channel: 'chrome' })
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.addInitScript(() => {
    sessionStorage.setItem('garantiyaid.accessToken', 'preview-token')
    sessionStorage.setItem('garantiyaid.user', JSON.stringify({ userId: 'staff-1', role: 'SYSTEM_ADMIN', fullName: 'System Administrator', email: 'admin@example.gov.ph' }))
  })
  await page.route('**/socket.io/**', (route) => route.abort())
  await page.routeWebSocket('ws://localhost:4000/socket.io/**', () => {})
  await page.route('http://localhost:4000/api/v1/**', async (route) => {
    const url = new URL(route.request().url())
    const path = url.pathname.replace('/api/v1', '')
    let data = {}
    if (path === '/health') data = { timestamp: new Date().toISOString() }
    else if (path === '/dashboard/overview') data = { overview: { fundUtilization: zeroFunds } }
    else if (path === '/barangays') data = { barangays: [barangay] }
    else if (path === '/programs') data = { programs: [], pagination: pagination(0) }
    else if (path === '/beneficiaries') data = { beneficiaries: [beneficiary], pagination: pagination(1) }
    else if (path === `/beneficiaries/${beneficiaryId}`) data = { beneficiary: { ...beneficiary, birthDate: '1985-01-01', sex: 'FEMALE', address: 'Poblacion' } }
    else if (path === `/beneficiaries/${beneficiaryId}/documents`) data = { documents: [] }
    else if (path === '/distributions') data = { distributions: [distribution('event-1')], pagination: pagination(1) }
    else if (path === '/distributions/event-2') data = { distribution: distribution('event-2') }
    else if (path === '/dashboard/distributions/event-2' || path === '/dashboard/distributions/event-1') data = { summary: { distribution: distribution(path.split('/').at(-1)), fundUtilization: zeroFunds } }
    else if (/^\/distributions\/event-[12]\/transactions$/.test(path)) data = { transactions: [], summary: {}, pagination: pagination(0) }
    else if (/^\/distributions\/event-[12]\/reconciliation$/.test(path)) data = { reconciliation: { readyToClose: true, ledgerBalanced: true, deliveryMode: 'SIMULATED_WALLET', expectedWalletCreditedAmount: '0', netCreditedAmount: '0', completedBenefitCreditCount: 0, reversedBenefitCreditCount: 0, exceptions: [] }, simulation: {} }
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
  await page.getByRole('link', { name: 'View simulated wallet' }).waitFor()
  await page.getByRole('link', { name: 'View simulated wallet' }).click()
  await page.getByRole('heading', { name: 'Maria Santos' }).waitFor()
  await page.setViewportSize({ width: 320, height: 700 })
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
  await page.setViewportSize({ width: 1440, height: 900 })
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
  assert.deepEqual(errors, [])
  console.log('Ledger and wallet navigation check passed')
} finally {
  await browser.close()
  await vite.close()
}
