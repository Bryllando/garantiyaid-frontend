import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { createServer as createHttpServer } from 'node:http'
import { Server } from '../../garantiyaid-backend/node_modules/socket.io/dist/index.js'
import { chromium, expect } from '@playwright/test'
import { createServer } from 'vite'

const output = '../output/dswd-disputes'
await mkdir(output, { recursive: true })
const live = createHttpServer()
const io = new Server(live)
io.on('connection', (socket) => socket.emit('realtime.ready', {}))
await new Promise((resolve) => live.listen(0, '127.0.0.1', resolve))
const vite = await createServer({ cacheDir: '../tmp/dispute-review-vite', server: { host: '127.0.0.1', port: 0, proxy: { '/socket.io': { target: `http://127.0.0.1:${live.address().port}`, ws: true } } } })
await vite.listen()
const origin = `http://127.0.0.1:${vite.httpServer.address().port}`
const browser = await chromium.launch({ headless: true, channel: 'chrome' })
const user = { userId: 'reviewer', role: 'DSWD_STAFF', fullName: 'Ana Reyes', email: 'reviewer@example.test' }
const beneficiary = { beneficiaryId: 'person-1', firstName: 'Maria', middleName: 'Lopez', lastName: 'Santos', barangay: { barangayName: 'Poblacion' } }
const event = { distributionId: 'event-1', title: 'October community assistance', status: 'OPEN', distributionDate: '2026-10-28', location: 'Barangay hall', deliveryMode: 'SIMULATED_WALLET', verificationRequirement: 'QR', barangay: beneficiary.barangay, program: { programName: 'Emergency assistance' } }
const statement = 'I attended the morning distribution and completed the identity checks. The record shows that assistance was credited, but I could not confirm receiving the amount.\nPlease compare my receipt with the release record and explain the result before closing this concern.'
let state = 'UNDER_REVIEW', assigned = user, filer = { userId: 'filer', fullName: 'Barangay Officer' }, claimStatus = 'CLAIMED'
let claimVersion = '2026-10-28T00:30:00.000Z'
let version = '2026-10-28T01:00:00.000Z', notes = '', outcome = null, failDetail = false, failEvidence = false, failSave = false, missing = false, mismatched = false
const writes = [], errors = [], unhandled = []
const claim = () => ({ claimId: 'claim-1', updatedAt: claimVersion, distributionId: mismatched ? 'wrong-event' : event.distributionId, beneficiary, allocation: { amount: '1500' }, schedule: { queueNumber: 12 }, distribution: { ...event }, claimStatus, qrVerified: true, verificationMethod: 'QR', verifiedBy: { fullName: 'Registration Officer' }, releaseMethod: event.deliveryMode, releasedAt: '2026-10-28T00:30:00.000Z', releasedBy: { fullName: 'Disbursing Officer' }, releaseEvidenceType: event.deliveryMode === 'PHYSICAL_GOODS' ? 'OFFICIAL_RELEASE_LOG' : null, releaseEvidenceReference: event.deliveryMode === 'PHYSICAL_GOODS' ? 'LOG-2026-001' : null, releaseNotes: event.deliveryMode === 'PHYSICAL_GOODS' ? 'One food package acknowledged by the beneficiary.' : null, receipt: { receiptNo: 'GYA-CLM-20261028-001' } })
const dispute = () => ({ disputeId: 'case-1', referenceNo: 'GYA-DSP-20261028-001', status: state, reasonCode: 'BENEFICIARY_DENIES_RECEIPT', statement, filedAt: '2026-10-28T00:45:00.000Z', filedBy: filer, assignedTo: assigned, reviewedAt: state === 'OPEN' ? null : version, reviewedBy: outcome ? user : null, resolvedAt: state === 'RESOLVED' ? version : null, updatedAt: version, reviewNotes: notes, outcome, claim: claim() })
const pagination = (page = 1) => ({ page, pageSize: 20, total: 21, totalPages: 2 })

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } })
  page.setDefaultNavigationTimeout(45_000)
  page.on('pageerror', (error) => errors.push(error.message))
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.addInitScript((user) => {
    sessionStorage.setItem('garantiyaid.accessToken', 'fixture-token')
    sessionStorage.setItem('garantiyaid.user', JSON.stringify({ ...user, role: sessionStorage.getItem('fixture-role') || user.role }))
  }, user)
  await page.route('**/api/v1/**', async (route) => {
    const url = new URL(route.request().url()), path = url.pathname.replace('/api/v1', ''), method = route.request().method()
    const failure = (message, status = 503) => route.fulfill({ status, json: { success: false, error: { message, code: status === 409 ? 'CLAIM_DISPUTE_CONCURRENT_CHANGE' : 'TEMPORARY_FAILURE' } } })
    let data
    if (method !== 'GET') writes.push({ path, body: route.request().postDataJSON() })
    if (path === '/health') data = { status: 'ok' }
    else if (path === '/staff-notifications') data = { notifications: [], unreadCount: 0, pagination: pagination() }
    else if (path === '/staff-notifications/unread-count') data = { unreadCount: 0 }
    else if (path === '/distributions') data = { distributions: [event], pagination: { page: 1, pageSize: 100, total: 1, totalPages: 1 } }
    else if (path === '/distributions/event-1') data = { distribution: event }
    else if (path === '/distributions/event-1/claim-disputes') {
      if (failDetail && url.searchParams.get('search') === 'case-1') return failure('Case service temporarily unavailable')
      data = { disputes: missing ? [] : [dispute()], summary: { countsByStatus: { [state]: 21 } }, pagination: pagination(Number(url.searchParams.get('page') || 1)) }
    } else if (path === '/distributions/event-1/claims/claim-1') {
      if (failEvidence) return failure('Claim evidence temporarily unavailable')
      data = { claim: claim() }
    } else if (path === '/distributions/event-1/claims') {
      data = { claims: [claim()], summary: { countsByStatus: { [claimStatus]: 1 } }, pagination: pagination() }
    } else if (path === '/distributions/event-1/claim-disputes/case-1/review') {
      const body = route.request().postDataJSON()
      if (failSave) return failure('Decision service temporarily unavailable')
      if (body.expectedUpdatedAt !== version) return failure('This case changed after you opened it. Close the decision form and review the refreshed case before continuing.', 409)
      if (body.action !== 'START_REVIEW' && body.expectedClaimUpdatedAt !== claimVersion) return failure('The claim evidence changed after you opened this case. Close the decision form and review the refreshed evidence before continuing.', 409)
      if (body.action === 'START_REVIEW') { state = 'UNDER_REVIEW'; assigned = user }
      else { notes = body.reviewNotes; outcome = body.action === 'REFER_FOR_INVESTIGATION' ? 'REFERRED_FOR_INVESTIGATION' : body.action === 'CONFIRM_CLAIM' ? 'CLAIM_CONFIRMED' : 'BENEFICIARY_REMEDIATION'; state = body.action === 'REFER_FOR_INVESTIGATION' ? 'REFERRED' : 'RESOLVED' }
      version = new Date(new Date(version).getTime() + 1000).toISOString()
      data = { dispute: dispute() }
    } else { unhandled.push(`${method} ${path}`); return failure(`Unhandled fixture: ${path}`, 404) }
    await route.fulfill({ json: { success: true, data } })
  })
  const listPath = '/claim-accountability?distribution=event-1&view=disputes&search=Maria&status=UNDER_REVIEW&page=2&monitorFrom=%2Fdswd%2Flive-dashboard%3Fdistribution%3Devent-1'
  const go = (detail = true) => page.goto(origin + listPath + (detail ? '&case=case-1' : ''))
  const detail = page.getByRole('region', { name: 'Case details', exact: true })
  const nextAction = page.getByRole('complementary', { name: 'Case next action' })
  await go(false)
  await expect(page.getByRole('button', { name: 'Open case GYA-DSP-20261028-001' })).toBeVisible()
  await page.screenshot({ path: `${output}/list-1440.png`, fullPage: true })
  await page.getByRole('button', { name: 'Open case GYA-DSP-20261028-001' }).focus()
  await page.keyboard.press('Enter')
  await expect(detail.getByRole('heading', { name: 'Maria Lopez Santos' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Beneficiary statement' })).toContainText(statement)
  await expect(page.getByRole('region', { name: 'Claim evidence' })).toContainText('GYA-CLM-20261028-001')
  await expect(nextAction).toContainText('Before remediation')
  await expect(page.getByRole('region', { name: 'Recorded review' })).toContainText('No review notes recorded.')
  assert.equal(writes.length, 0, 'Opening a case must not issue a receipt, assign a reviewer or change a record')
  await expect(page.getByRole('link', { name: 'Return to live monitoring' })).toBeVisible()
  assert.equal(new URL(await page.getByRole('link', { name: 'Review matching ledger' }).getAttribute('href'), origin).searchParams.get('returnTo'), listPath + '&case=case-1')
  await expect(nextAction.getByRole('button', { name: 'Confirm record' })).toBeEnabled()
  await page.screenshot({ path: `${output}/case-1440.png`, fullPage: true })
  await page.reload()
  await expect(nextAction.getByRole('button', { name: 'Confirm record' })).toBeEnabled()
  await page.goBack()
  await expect(page.getByLabel('Search', { exact: true })).toHaveValue('Maria')
  await page.goForward()
  await expect(detail.getByRole('heading', { name: 'Maria Lopez Santos' })).toBeVisible()
  await page.getByRole('link', { name: 'Open claim record' }).click()
  await expect(page.getByRole('heading', { name: 'Maria Lopez Santos' })).toBeVisible()
  assert.equal(new URL(page.url()).searchParams.get('claim'), 'claim-1')
  assert.equal(writes.length, 0)
  await page.goBack()
  await expect(nextAction.getByRole('button', { name: 'Confirm record' })).toBeEnabled()

  failEvidence = true
  await page.getByRole('button', { name: 'Refresh case', exact: true }).click()
  await expect(detail.getByRole('alert')).toContainText('Previously loaded details remain visible')
  await expect(nextAction.getByRole('button', { name: 'Confirm record' })).toBeDisabled()
  await expect(page.getByRole('region', { name: 'Beneficiary statement' })).toContainText(statement)
  failEvidence = false
  await page.getByRole('button', { name: 'Refresh case', exact: true }).click()
  await expect(nextAction.getByRole('button', { name: 'Confirm record' })).toBeEnabled()

  await nextAction.getByRole('button', { name: 'Confirm record' }).click()
  const form = page.getByRole('dialog', { name: 'Confirm recorded claim' })
  await form.getByRole('button', { name: 'Confirm claim', exact: true }).click()
  await expect(form.getByLabel('Review notes and evidence', { exact: true })).toBeFocused()
  const decisionNotes = 'The receipt and matching release record were checked with the beneficiary. The recorded claim is supported by the available evidence.'
  await form.getByLabel('Review notes and evidence', { exact: true }).fill(decisionNotes)
  version = '2026-10-28T02:00:00.000Z'; assigned = { userId: 'other', fullName: 'Elena Cruz' }
  await form.getByRole('button', { name: 'Confirm claim', exact: true }).click()
  await expect(form.getByRole('alert')).toContainText('case changed')
  await expect(form.getByLabel('Review notes and evidence', { exact: true })).toHaveValue(decisionNotes)
  await expect(form.getByRole('button', { name: 'Confirm claim', exact: true })).toBeDisabled()
  await form.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(nextAction).toContainText('Elena Cruz')
  await expect(nextAction.getByRole('button', { name: 'Confirm record' })).toHaveCount(0)
  assigned = user
  await page.getByRole('button', { name: 'Refresh case', exact: true }).click()
  await nextAction.getByRole('button', { name: 'Confirm record' }).click()
  await form.getByLabel('Review notes and evidence', { exact: true }).fill(decisionNotes)
  claimVersion = '2026-10-28T03:00:00.000Z'
  await form.getByRole('button', { name: 'Confirm claim', exact: true }).click()
  await expect(form.getByRole('alert')).toContainText('claim evidence changed')
  await expect(form.getByRole('button', { name: 'Confirm claim', exact: true })).toBeDisabled()
  await expect(form.getByLabel('Review notes and evidence', { exact: true })).toHaveValue(decisionNotes)
  assert.equal(writes.at(-1).body.expectedClaimUpdatedAt, '2026-10-28T00:30:00.000Z')
  await form.getByRole('button', { name: 'Close', exact: true }).click()
  await nextAction.getByRole('button', { name: 'Confirm record' }).click()
  await form.getByLabel('Review notes and evidence', { exact: true }).fill(decisionNotes)
  failSave = true
  await form.getByRole('button', { name: 'Confirm claim', exact: true }).click()
  await expect(form.getByRole('alert')).toContainText('Decision service temporarily unavailable')
  await expect(form.getByLabel('Review notes and evidence', { exact: true })).toHaveValue(decisionNotes)
  failSave = false
  await form.getByRole('button', { name: 'Confirm claim', exact: true }).click()
  await expect(form).toHaveCount(0)
  await expect(page.getByRole('region', { name: 'Recorded review' })).toContainText(decisionNotes)
  await expect(nextAction).toContainText('Review completed')
  await page.reload()
  await expect(page.getByRole('region', { name: 'Recorded review' })).toContainText('Ana Reyes')
  await expect(nextAction.getByRole('button')).toHaveCount(0)
  await page.screenshot({ path: `${output}/resolved-1440.png`, fullPage: true })
  await page.getByRole('button', { name: 'Back to cases', exact: true }).click()
  await expect(page.getByLabel('Search', { exact: true })).toHaveValue('Maria')
  await expect(page.getByLabel('Status', { exact: true })).toHaveValue('UNDER_REVIEW')
  assert.equal(new URL(page.url()).searchParams.get('page'), '2')

  state = 'OPEN'; assigned = null; notes = ''; outcome = null; filer = user
  await go()
  await expect(nextAction).toContainText('Independent reviewer required')
  await expect(nextAction.getByRole('button')).toHaveCount(0)
  filer = { userId: 'filer', fullName: 'Barangay Officer' }
  await page.getByRole('button', { name: 'Refresh case', exact: true }).click()
  await nextAction.getByRole('button', { name: 'Start review' }).click()
  await expect(nextAction).toContainText('Assigned to you')

  event.deliveryMode = 'PHYSICAL_GOODS'
  await page.getByRole('button', { name: 'Refresh case', exact: true }).click()
  await expect(page.getByRole('region', { name: 'Claim evidence' })).toContainText('LOG-2026-001')
  await expect(page.getByRole('link', { name: 'Review matching ledger' })).toHaveCount(0)
  await expect(nextAction).not.toContainText('Before remediation')
  await expect(page.locator('[data-sonner-toast]')).toHaveCount(0, { timeout: 10_000 })
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 })
    await expect(nextAction.getByRole('button', { name: 'Review remediation' })).toBeVisible()
    try {
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth), { message: `No overflow at ${width}px` }).toBeLessThanOrEqual(width)
    } catch (error) {
      await page.screenshot({ path: `${output}/overflow-${width}.png`, fullPage: true })
      console.log(await page.evaluate(() => [...document.querySelectorAll('body *')].filter((element) => element.getBoundingClientRect().right > innerWidth + 1).map((element) => ({ tag: element.tagName, className: element.className, right: element.getBoundingClientRect().right })).slice(0, 12)))
      throw error
    }
    await page.screenshot({ path: `${output}/case-${width}.png`, fullPage: true })
  }
  await page.getByRole('button', { name: 'Back to cases', exact: true }).click()
  await expect(page.getByRole('button', { name: /Filter cases/ })).toHaveAttribute('aria-expanded', 'false')
  await page.screenshot({ path: `${output}/list-320.png`, fullPage: true })
  await page.getByRole('button', { name: /Filter cases/ }).click()
  await expect(page.getByLabel('Search', { exact: true })).toHaveValue('Maria')
  await page.evaluate(() => sessionStorage.setItem('fixture-role', 'BARANGAY_FACILITATOR'))
  await go()
  await expect(nextAction).toContainText('authorized Admin or DSWD reviewer')
  await expect(nextAction.getByRole('button')).toHaveCount(0)
  await page.evaluate(() => sessionStorage.setItem('fixture-role', 'SYSTEM_ADMIN'))
  await go()
  await expect(nextAction.getByRole('button', { name: 'Confirm record' })).toBeEnabled()
  await nextAction.getByRole('button', { name: 'Refer for investigation' }).click()
  const referral = page.getByRole('dialog', { name: 'Refer for investigation' })
  await referral.getByLabel('Review notes and evidence', { exact: true }).fill('Refer the release reference for independent confirmation against the original log.')
  await referral.getByRole('button', { name: 'Refer case', exact: true }).click()
  await expect(referral).toHaveCount(0)
  await expect(nextAction.getByRole('heading', { name: 'Referred for investigation' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Recorded review' })).toContainText('Refer the release reference')
  await nextAction.getByRole('button', { name: 'Review remediation' }).click()
  const remediation = page.getByRole('dialog', { name: 'Complete beneficiary remediation' })
  await expect(remediation).toContainText('No wallet reversal is required')
  await remediation.getByRole('button', { name: 'Close', exact: true }).click()

  failDetail = true
  await go()
  await expect(detail.getByRole('alert')).toContainText('Case service temporarily unavailable')
  await expect(nextAction).toHaveCount(0)
  failDetail = false; missing = true
  await page.getByRole('button', { name: 'Refresh case', exact: true }).click()
  await expect(detail.getByRole('alert')).toContainText('not found in the selected event')
  missing = false; mismatched = true
  await page.getByRole('button', { name: 'Refresh case', exact: true }).click()
  await expect(detail.getByRole('alert')).toContainText('does not match this case')
  await page.goto(`${origin}/claim-accountability?view=disputes&case=case-1`)
  await expect(page.getByRole('alert')).toContainText('case link is missing its event')
  await expect(page.getByRole('button', { name: 'Back to cases', exact: true })).toBeEnabled()
  assert.equal(writes.every(({ path }) => path.endsWith('/claim-disputes/case-1/review')), true)
  assert.deepEqual(unhandled, [])
  assert.deepEqual(errors, [])
  console.log(JSON.stringify({ result: 'Dispute details, evidence, permissions, stale decisions, navigation, error recovery and mobile layouts passed', writes: writes.length, screenshots: output }))
} finally {
  await browser.close()
  io.close()
  await vite.close()
  live.close()
}
