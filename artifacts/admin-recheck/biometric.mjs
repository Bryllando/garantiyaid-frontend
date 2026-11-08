import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium, expect } from '@playwright/test'
import { createServer } from 'vite'

const output = resolve('../output/admin-redesign')
await mkdir(output, { recursive: true })
const vite = await createServer({ cacheDir: 'node_modules/.vite-verify/biometric-follow-up', server: { host: '127.0.0.1', port: 0 } })
await vite.listen()
const origin = `http://127.0.0.1:${vite.httpServer.address().port}`
let browser
try {
  browser = await chromium.launch({ headless: true, channel: 'chrome' })
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  page.setDefaultTimeout(10000)
  page.setDefaultNavigationTimeout(30000)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const errors = []
  const unhandled = new Set()
  const mutations = []
  let failPerson = false
  let failHistory = false
  const distribution = { distributionId: 'event-1', title: 'October community assistance', distributionDate: '2026-10-25', status: 'OPEN', deliveryMode: 'PHYSICAL_GOODS', verificationRequirement: 'BIOMETRIC_AND_SIGNATURE' }
  const beneficiary = { beneficiaryId: 'person-1', firstName: 'Maria', lastName: 'Santos', status: 'ACTIVE', barangay: { barangayId: 'barangay-1', barangayName: 'Poblacion' } }
  const base = { distributionId: 'event-1', beneficiaryId: 'person-1', verifiedById: 'barangay-staff', processor: 'SIMULATED_LOCAL', matchScore: '0.4', livenessScore: '0.9', createdAt: '2026-10-25T01:00:00Z' }
  const attempts = [
    { ...base, attemptId: 'matched', result: 'MATCHED', claimId: 'claim-1', createdAt: '2026-10-25T03:00:00Z' },
    { ...base, attemptId: 'duplicate-claim', result: 'DUPLICATE', claimId: 'claim-1' },
    { ...base, attemptId: 'duplicate-profile', result: 'DUPLICATE', claimId: null, processor: 'NOT_RUN' },
    { ...base, attemptId: 'attempt-1', result: 'NO_MATCH', createdAt: '2026-10-25T00:00:00Z' },
  ]
  await page.addInitScript(() => {
    sessionStorage.setItem('garantiyaid.accessToken', 'local-preview-token')
    sessionStorage.setItem('garantiyaid.user', JSON.stringify({ userId: sessionStorage.getItem('test-user') || 'admin-1', fullName: 'Admin Reviewer', role: sessionStorage.getItem('test-role') || 'SYSTEM_ADMIN', isActive: true, totpEnabled: true }))
  })
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('**/socket.io/**', (route) => route.abort())
  await page.routeWebSocket(/socket\.io/, () => {})
  await page.route('**/api/v1/**', async (route) => {
    const url = new URL(route.request().url())
    const path = url.pathname.replace('/api/v1', '')
    const currentPage = Number(url.searchParams.get('page') || 1)
    const pagination = { page: currentPage, totalPages: 1, total: 0 }
    if (route.request().method() !== 'GET') mutations.push(path)
    let data
    if (path === '/health') data = { timestamp: new Date().toISOString() }
    else if (path === '/staff-notifications') data = { notifications: [], unreadCount: 0, pagination }
    else if (path === '/beneficiaries') data = { beneficiaries: [], pagination }
    else if (path === '/beneficiaries/person-1') {
      if (failPerson) return route.fulfill({ status: 503, json: { error: { message: 'Beneficiary record temporarily unavailable.' } } })
      data = { beneficiary }
    } else if (path === '/distributions') data = { distributions: [], pagination }
    else if (path === '/distributions/event-1') data = { distribution }
    else if (path === '/distributions/event-1/biometric-attempts') {
      if (failHistory) return route.fulfill({ status: 503, json: { error: { message: 'Attempt history temporarily unavailable.' } } })
      const scoped = Boolean(url.searchParams.get('beneficiaryId'))
      data = { attempts: scoped ? currentPage === 1 ? attempts.slice(0, 3) : attempts.slice(3) : [attempts[3]], privacy: {}, summary: {}, pagination: { page: currentPage, totalPages: 2, total: scoped ? 4 : 2 } }
    } else { unhandled.add(path); return route.fulfill({ status: 404, json: { message: `Missing fixture: ${path}` } }) }
    await route.fulfill({ json: { data } })
  })

  const historyUrl = `${origin}/biometrics?view=history&distribution=event-1&result=NO_MATCH&page=2`
  await page.goto(historyUrl)
  await expect(page.getByLabel('Distribution', { exact: true })).toHaveValue('event-1')
  await expect(page.getByLabel('Result', { exact: true })).toHaveValue('NO_MATCH')
  await page.getByRole('button', { name: 'Review attempt', exact: true }).filter({ visible: true }).click()
  await expect(page.getByRole('heading', { name: 'Maria Santos', exact: true })).toBeVisible()
  assert.equal(new URL(page.url()).searchParams.get('page'), '2')
  await expect(page.getByRole('region', { name: 'Recorded result' })).toContainText('Face did not match')
  await expect(page.getByRole('button', { name: 'Open assistant conversation' })).toHaveCount(0)
  await expect(page.getByRole('region', { name: 'Recorded result' })).toContainText('Simulated face check')
  await page.getByRole('button', { name: 'Save review draft' }).click()
  await expect(page.getByRole('alert')).toBeFocused()
  await page.getByRole('alert').getByRole('link').click()
  await expect(page.getByLabel('Review notes', { exact: true })).toBeFocused()
  await page.getByLabel('Review notes', { exact: true }).fill('Confirm the identity record and ask Barangay staff for a fresh capture.')
  await page.getByLabel('Proposed follow-up status').selectOption('UNDER_REVIEW')
  await page.getByLabel('Next action', { exact: true }).selectOption('BARANGAY_RECAPTURE')
  await expect(page.getByText('Responsible role: Barangay staff', { exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByLabel('Review notes', { exact: true })).toHaveValue(/fresh capture/)
  await page.getByRole('button', { name: 'Save review draft' }).click()
  await expect(page.getByText('Saved draft: Under review · not submitted', { exact: true })).toBeVisible()
  await page.getByLabel('Proposed follow-up status').selectOption('RESOLVED')
  await page.getByRole('button', { name: 'Save review draft' }).click()
  await expect(page.getByRole('alert')).toContainText('Describe the follow-up outcome')
  await expect(page.getByText('Saved draft: Under review · not submitted', { exact: true })).toBeVisible()
  await page.getByLabel('Follow-up outcome').fill('Reviewed the later recorded face match. Remaining claim requirements still need checking.')
  await page.evaluate(() => {
    window.originalSetItem = Storage.prototype.setItem
    Storage.prototype.setItem = function (key, value) { if (key === 'garantiyaid.biometricFollowUps') throw new Error('Storage full'); return window.originalSetItem.call(this, key, value) }
  })
  await page.getByRole('button', { name: 'Save review draft' }).click()
  await expect(page.getByRole('alert')).toContainText('could not be saved')
  await expect(page.getByLabel('Follow-up outcome')).toHaveValue(/later recorded face match/)
  await page.evaluate(() => { Storage.prototype.setItem = window.originalSetItem })
  await page.getByRole('button', { name: 'Save review draft' }).click()
  await expect(page.getByText('Saved draft: Resolved · not submitted', { exact: true })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Recorded result' })).toContainText('Face did not match')
  await page.getByRole('link', { name: 'Back to attempt history', exact: true }).click()
  await expect(page.getByLabel('Result', { exact: true })).toHaveValue('NO_MATCH')
  await expect(page.getByText('Page 2 of 2', { exact: true })).toBeVisible()
  await expect(page.getByText('Review draft: Resolved (not submitted)', { exact: true }).filter({ visible: true })).toBeVisible()
  await page.goBack()
  await expect(page.getByLabel('Follow-up outcome')).toHaveValue(/later recorded face match/)

  const related = page.getByRole('region', { name: 'Attempts for this beneficiary' })
  failHistory = true
  await related.getByRole('button', { name: 'Refresh attempts' }).click()
  await expect(related.getByRole('alert')).toContainText('temporarily unavailable')
  failHistory = false
  await related.getByRole('button', { name: 'Retry attempt history' }).click()
  await related.getByRole('button', { name: /Review Face matched from/ }).click()
  await expect(page.getByRole('heading', { name: 'Continue with the claim record' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Save review draft' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Open claim record', exact: true })).toHaveAttribute('href', /claim=claim-1&receipt=manual/)

  await page.goto(`${origin}/biometrics?view=history&distribution=event-1&attempt=duplicate-claim&reviewBeneficiary=person-1`)
  await expect(page.getByLabel('Next action', { exact: true })).toHaveValue('CLAIM_REVIEW')
  await expect(page.getByRole('link', { name: 'Open claim record', exact: true })).toHaveAttribute('href', /claim=claim-1&receipt=manual/)
  await page.goto(`${origin}/biometrics?view=history&distribution=event-1&attempt=duplicate-profile&reviewBeneficiary=person-1`)
  await expect(page.getByLabel('Next action', { exact: true })).toHaveValue('DUPLICATE_REVIEW')
  await expect(page.getByRole('region', { name: 'Recorded result' })).toContainText('Face check not run')
  await expect(page.getByRole('link', { name: 'Open duplicate review', exact: true })).toHaveAttribute('href', /view=duplicates/)

  await page.goto(`${origin}/biometrics?view=history&distribution=event-1&attempt=missing&reviewBeneficiary=person-1`)
  await expect(page.getByRole('alert')).toContainText('not available for the selected beneficiary')
  await expect(page.getByLabel('Review notes', { exact: true })).toHaveCount(0)
  failPerson = true
  await page.goto(`${origin}/biometrics?view=history&distribution=event-1&attempt=attempt-1&reviewBeneficiary=person-1`)
  await expect(page.getByRole('alert')).toContainText('Beneficiary record temporarily unavailable')
  failPerson = false
  await page.getByRole('button', { name: 'Retry attempt review', exact: true }).click()
  await expect(page.getByLabel('Follow-up outcome')).toHaveValue(/later recorded face match/)

  for (const width of [1440, 768, 375]) {
    await page.setViewportSize({ width, height: 1000 })
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.waitForTimeout(200)
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `No overflow at ${width}px`)
    await page.screenshot({ path: `${output}/biometric-attempt-review-${width}.png`, fullPage: true })
  }
  await page.getByLabel('Review notes', { exact: true }).scrollIntoViewIfNeeded()
  await page.waitForTimeout(200)
  await page.screenshot({ path: `${output}/biometric-review-form-375.png`, fullPage: false })
  await page.setViewportSize({ width: 812, height: 375 })
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.evaluate(() => sessionStorage.setItem('test-user', 'another-admin'))
  await page.reload()
  await expect(page.getByLabel('Review notes', { exact: true })).toHaveValue('')
  for (const role of ['DSWD_STAFF', 'BARANGAY_FACILITATOR']) {
    await page.evaluate((value) => sessionStorage.setItem('test-role', value), role)
    await page.goto(`${origin}/biometrics?view=history&distribution=event-1&attempt=attempt-1&reviewBeneficiary=person-1`)
    await expect(page.getByRole('heading', { name: 'Recorded attempts', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Review attempt', exact: true })).toHaveCount(0)
    await expect(page.getByLabel('Review notes', { exact: true })).toHaveCount(0)
  }
  assert.deepEqual(mutations, [], 'Follow-up drafts cannot change verification, referrals, releases, or credits')
  assert.deepEqual([...unhandled], [])
  assert.deepEqual(errors, [])
  console.log(JSON.stringify({ result: 'Biometric follow-up UI checks passed', screenshots: output, mutations }))
} finally {
  await browser?.close()
  await vite.close()
}
