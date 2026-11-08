import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium, expect } from '@playwright/test'
import { createServer } from 'vite'

// API fixtures only: no staff records, real wallet operations or emails.
const output = resolve('../output/dswd-ledger')
await mkdir(output, { recursive: true })
const vite = await createServer({ cacheDir: '../tmp/dswd-ledger-vite', server: { host: '127.0.0.1', port: 0 } })
await vite.listen()
const origin = `http://127.0.0.1:${vite.httpServer.address().port}`
let browser
try {
  browser = await chromium.launch({ headless: true, channel: 'chrome' })
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  page.setDefaultTimeout(10000)
  page.setDefaultNavigationTimeout(30000)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const errors = [], unhandled = [], keys = [], queueReads = []
  const recorded = new Set()
  let failQueue = false, failReview = false, loseResponse = false, disputed = false, closed = false
  const funds = { allocatedAmount: '151500', netCreditedAmount: '0', remainingAmount: '151500', reversedAmount: '0', failedAmount: '0' }
  const event = (id = 'event-1') => ({ distributionId: id, title: id === 'event-1' ? 'October community assistance' : 'November community assistance', distributionDate: '2026-10-27', status: 'OPEN', deliveryMode: 'SIMULATED_WALLET', verificationRequirement: 'QR', program: { programName: 'Community Assistance', programCode: 'AID-2026' }, barangay: { barangayName: 'Poblacion' } })
  const claim = (n) => ({ claimId: `claim-${n}`, distributionId: 'event-1', beneficiary: { beneficiaryId: `beneficiary-${n}`, firstName: n === 101 ? 'Elena' : 'Maria', lastName: n === 101 ? 'Ramos' : `Santos ${n}`, status: 'ACTIVE' }, distribution: { ...event(), status: closed ? 'CLOSED' : 'OPEN' }, claimStatus: recorded.has(n) ? 'CLAIMED' : 'VERIFIED', schedule: { queueNumber: n, status: 'CHECKED_IN' }, allocation: { amount: '1500', allocationStatus: 'ALLOCATED' }, qrVerified: true, verificationMethod: 'QR', disputes: disputed ? [{ status: 'OPEN' }] : [] })
  const transaction = (n) => ({ transactionId: `transaction-${n}`, walletId: `wallet-${n}`, referenceNo: `SIM-TEST-${n}`, amount: '1500', status: 'COMPLETED', transactionType: 'BENEFIT_CREDIT', beneficiary: claim(n).beneficiary, balanceBefore: '0', balanceAfter: '1500', createdAt: '2026-10-27T02:00:00Z' })
  await page.addInitScript(() => {
    sessionStorage.setItem('garantiyaid.accessToken', 'local-ledger-test')
    sessionStorage.setItem('garantiyaid.user', JSON.stringify({ userId: 'staff-1', role: sessionStorage.getItem('test-role') || 'DSWD_STAFF', fullName: 'DSWD Reviewer' }))
  })
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('**/socket.io/**', (route) => route.abort())
  await page.routeWebSocket(/socket\.io/, () => {})
  await page.route('**/api/v1/**', async (route) => {
    const req = route.request(), url = new URL(req.url()), path = url.pathname.replace('/api/v1', '')
    const fail = () => route.fulfill({ status: 503, json: { error: { message: 'Service unavailable. Please retry.' } } })
    const pagination = { page: 1, pageSize: 20, total: 0, totalPages: 0 }
    let data
    if (path === '/health') data = { timestamp: new Date().toISOString() }
    else if (path === '/staff-notifications') data = { notifications: [], unreadCount: 0, pagination }
    else if (path === '/dashboard/overview') data = { overview: { fundUtilization: funds } }
    else if (path === '/distributions') data = { distributions: [event(), event('event-2')], pagination: { ...pagination, total: 2, totalPages: 1 } }
    else if (/^\/dashboard\/distributions\//.test(path)) data = { summary: { distribution: event(path.split('/').at(-1)), fundUtilization: funds } }
    else if (path.endsWith('/creditable-claims')) {
      queueReads.push(Object.fromEntries(url.searchParams))
      if (failQueue) return fail()
      const terms = (url.searchParams.get('search') || '').toLowerCase().split(/\s+/).filter(Boolean)
      const all = Array.from({ length: 101 }, (_, i) => claim(i + 1)).filter((item) => item.claimStatus === 'VERIFIED' && terms.every((term) => `${item.beneficiary.firstName} ${item.beneficiary.lastName} ${item.claimId}`.toLowerCase().includes(term)))
      const pageNumber = Number(url.searchParams.get('page')), size = Number(url.searchParams.get('pageSize'))
      data = { claims: all.slice((pageNumber - 1) * size, pageNumber * size), summary: { creditableClaimCount: all.length }, pagination: { page: pageNumber, pageSize: size, total: all.length, totalPages: Math.ceil(all.length / size) } }
    } else if (/^\/distributions\/event-\d+\/claims\/claim-\d+$/.test(path)) {
      if (failReview) return fail()
      data = { claim: claim(Number(path.split('-').at(-1))) }
    } else if (path.endsWith('/credit')) {
      assert.equal(req.method(), 'POST')
      keys.push(req.headers()['idempotency-key'])
      const n = Number(path.split('/').at(-2).split('-').at(-1))
      if (recorded.has(n)) assert.equal(keys.at(-1), keys.at(-2), 'retry must reuse the committed request key')
      recorded.add(n)
      if (loseResponse) { loseResponse = false; return fail() }
      data = { transaction: transaction(n), wallet: { walletId: `wallet-${n}` }, lifecycle: {} }
    } else if (path.endsWith('/transactions')) data = { transactions: [], summary: {}, pagination }
    else if (path.endsWith('/reconciliation')) data = { reconciliation: { readyToClose: false, ledgerBalanced: true, deliveryMode: 'SIMULATED_WALLET', exceptions: [] }, simulation: {} }
    else if (/^\/wallets\/wallet-\d+\/transactions\/transaction-\d+\/receipt$/.test(path)) data = { receiptVersion: 'v1', issuedAt: '2026-10-27T02:00:00Z', transaction: transaction(Number(path.split('/').at(-2).split('-').at(-1))), simulation: { message: 'Simulated transaction. No real funds moved.' } }
    else { unhandled.push(path); return route.fulfill({ status: 404, json: { message: 'Missing local fixture' } }) }
    await route.fulfill({ json: { data } })
  })
  const queue = page.getByRole('region', { name: 'Ready for simulated credit' })
  const dialog = page.getByRole('dialog', { name: 'Credit this verified claim?' })
  const confirm = dialog.getByRole('button', { name: 'Credit verified claim', exact: true })
  await page.goto(origin + '/dswd/ledger?distribution=event-1&creditPage=11')
  await expect(queue.getByText('Elena Ramos', { exact: true })).toBeVisible()
  await expect(page.getByLabel('Find beneficiary').locator('..').locator('svg')).toBeVisible()
  await expect(queue.getByText('Page 11 of 11')).toBeVisible()
  assert.equal(new URL(page.url()).searchParams.get('creditPage'), '11')
  await page.getByLabel('Find beneficiary').fill('Elena Ramos')
  await page.getByRole('button', { name: 'Search', exact: true }).click()
  await expect(queue.getByText('Page 1 of 1')).toBeVisible()
  await page.reload()
  await expect(page.getByLabel('Find beneficiary')).toHaveValue('Elena Ramos')
  await expect(queue.getByText('Elena Ramos', { exact: true })).toBeVisible()
  await page.screenshot({ path: `${output}/search-desktop.png`, fullPage: true })
  await page.getByLabel('Find beneficiary').fill('No matching person')
  await page.getByRole('button', { name: 'Search', exact: true }).click()
  await expect(queue.getByRole('heading', { name: 'No matching beneficiaries' })).toBeVisible()
  failQueue = true
  await page.getByRole('button', { name: 'Clear search' }).click()
  await expect(page.getByLabel('Find beneficiary')).toBeFocused()
  await expect(queue.getByRole('alert')).toContainText('Credit queue could not be loaded')
  failQueue = false
  await queue.getByRole('button', { name: 'Retry credit queue' }).click()
  await expect(queue.getByText('Page 1 of 11')).toBeVisible()
  await page.getByRole('button', { name: 'Next claims' }).click()
  await expect(queue.getByText('Page 2 of 11')).toBeVisible()
  await page.getByRole('button', { name: 'Previous claims' }).click()
  await expect(queue.getByText('Page 1 of 11')).toBeVisible()

  failReview = true
  await queue.getByRole('button', { name: 'Review and credit', exact: true }).first().click()
  await expect(dialog.getByRole('alert')).toBeVisible()
  await expect(confirm).toBeDisabled()
  failReview = false
  disputed = true
  await dialog.getByRole('button', { name: 'Retry claim check' }).click()
  await expect(dialog.getByText('Credit unavailable', { exact: true })).toBeVisible()
  await expect(dialog).toContainText('active dispute')
  await expect(confirm).toBeDisabled()
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  disputed = false
  closed = true
  await queue.getByRole('button', { name: 'Review and credit', exact: true }).first().click()
  await expect(dialog).toContainText('must be open')
  await expect(confirm).toBeDisabled()
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  closed = false

  await page.goto(origin + '/dswd/ledger?distribution=event-1&creditPage=11')
  await queue.getByRole('button', { name: 'Review and credit', exact: true }).click()
  await expect(confirm).toBeEnabled()
  await expect(dialog).toContainText('Elena Ramos')
  await expect(dialog).toContainText('October community assistance')
  await expect(dialog).toContainText('QR validation: Complete')
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 })
    await expect(confirm).toBeInViewport()
    await page.screenshot({ path: `${output}/credit-review-${width}.png`, animations: 'disabled' })
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${width}px overflow`)
    await expect(confirm).toBeVisible()
  }
  loseResponse = true
  await confirm.click()
  await expect(dialog.getByRole('alert')).toBeFocused()
  await expect(dialog).toContainText('Elena Ramos')
  await confirm.click()
  await expect(dialog).not.toBeVisible()
  await expect(page.getByRole('heading', { name: 'Simulated credit recorded' })).toBeVisible()
  await expect(queue.getByText('Page 10 of 10')).toBeVisible()
  assert.equal(recorded.size, 1)
  assert.equal(keys.length, 2)
  assert.equal(keys[0], keys[1])
  await page.getByRole('button', { name: 'View transaction receipt', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Simulated transaction receipt' })).toBeVisible()
  await page.getByRole('button', { name: 'Close receipt', exact: true }).click()
  await expect(page.getByRole('link', { name: 'Open claim record', exact: true })).toHaveAttribute('href', '/claim-accountability?distribution=event-1&claim=claim-101')
  await page.getByRole('button', { name: 'Continue with next beneficiary' }).click()
  await expect(page.locator('#credit-queue-heading')).toBeFocused()
  await page.getByLabel('Distribution event', { exact: true }).selectOption('event-2')
  await expect(queue.getByText('Page 1 of 10')).toBeVisible()
  assert.equal(new URL(page.url()).searchParams.has('creditPage'), false)
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 900 })
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.screenshot({ path: `${output}/queue-${width}.png`, fullPage: true })
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
  }
  await page.evaluate(() => sessionStorage.setItem('test-role', 'SYSTEM_ADMIN'))
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Transactions & wallets' })).toBeVisible()
  await expect(queue.getByText('Page 1 of 10')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Review and credit', exact: true })).toHaveCount(0)
  assert.ok(queueReads.some((query) => query.page === '11' && query.pageSize === '10'))
  assert.ok(queueReads.some((query) => query.search === 'Elena Ramos'))
  assert.deepEqual(errors, [])
  assert.deepEqual(unhandled, [])
  console.log(JSON.stringify({ result: 'DSWD ledger search, pagination, stale-claim checks, idempotent retry, receipts and responsive layouts passed', recordedCredits: recorded.size, screenshots: output }))
} finally {
  await browser?.close()
  await vite.close()
}
