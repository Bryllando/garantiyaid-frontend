import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium, expect } from '@playwright/test'
import { createServer } from 'vite'
import { readEnrollmentLocation } from '../src/utils/enrollmentLocation.js'
import { readReportScope } from '../src/utils/reportScope.js'

// Intercept all service traffic so layout and recovery checks never touch live records.
const output = resolve('../output/admin-overview-review')
await mkdir(output, { recursive: true })
const vite = await createServer({ cacheDir: resolve(output, '.vite'), logLevel: 'error', define: { 'import.meta.env.VITE_API_URL': JSON.stringify('/api/v1') }, server: { host: '127.0.0.1', port: 0, hmr: false } })
const user = { userId: 'admin-preview', role: 'SYSTEM_ADMIN', fullName: 'Development Admin', employeeId: 'DEV-ADMIN' }
const overview = { generatedAt: '2026-11-17T20:46:43+08:00', scope: { global: true }, programs: { activeProgramCount: 4 }, distributions: { totalMatchingDistributionCount: 10, upcomingDistributionCount: 2, openDistributionCount: 8, statusCounts: { DRAFT: 2, OPEN: 8 } }, beneficiaries: { approvedBeneficiaryCount: 13, unclaimedAllocationCount: 23 }, anomalies: { duplicateAttemptCount: 2 }, fundUtilization: { remainingAmount: '6514.00' } }
const enrollment = { enrollmentId: 'review-1', beneficiary: { firstName: 'Maria', lastName: 'Santos' }, program: { programName: 'Community assistance' }, status: 'PENDING', createdAt: '2026-11-17T00:15:00+08:00', submittedById: user.userId }
const drafts = [{ distributionId: 'draft-1', title: 'Community assistance — November distribution', barangay: { barangayName: 'Apas' }, distributionDate: '2026-11-18' }, { distributionId: 'draft-2', title: 'TEST CONSULT 02 - AI Schedule Review', barangay: { barangayName: 'Apas' }, distributionDate: '2026-11-17' }]
let browser, page, empty = false, failRecords = false, failOverview = false, unavailable = false
let releaseRecords
const recordsReady = new Promise(resolve => { releaseRecords = resolve })
const errors = [], unexpected = []
try {
  await vite.listen()
  browser = await chromium.launch({ channel: 'chrome', headless: true })
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' })
  await context.addInitScript(staff => {
    sessionStorage.setItem('garantiyaid.accessToken', 'overview-read-only-fixture')
    sessionStorage.setItem('garantiyaid.user', JSON.stringify(staff))
  }, user)
  await context.route('**/socket.io/**', route => route.abort())
  await context.routeWebSocket(/socket\.io/, () => {})
  await context.route('**/api/v1/**', async route => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname.replace('/api/v1', '')
    if (request.method() !== 'GET') { unexpected.push(`${request.method()} ${path}`); return route.abort() }
    let data
    if (path === '/health') data = { timestamp: '2026-11-17T12:47:00Z' }
    else if (path === '/auth/account') data = { user, security: {} }
    else if (path === '/dashboard/overview') {
      if (failOverview) return route.fulfill({ status: 503, json: { error: { message: 'Service temporarily unavailable.' } } })
      data = { overview: unavailable ? { ...overview, fundUtilization: null, programs: {}, distributions: {} } : overview }
    } else if (path === '/enrollments' || path === '/distributions') {
      await recordsReady
      if (failRecords) return route.fulfill({ status: 503, json: { error: { message: 'Records temporarily unavailable.' } } })
      if (path === '/distributions') data = { distributions: empty ? [] : drafts, pagination: { total: empty ? 0 : 2 } }
      else {
        const pending = url.searchParams.get('status') === 'PENDING'
        const rows = empty ? [] : pending ? [enrollment] : [{ ...enrollment, enrollmentId: 'review-2', status: 'FOR_VALIDATION', submittedById: 'another-staff', createdAt: '2026-11-16T23:45:00+08:00', beneficiary: { firstName: 'Alexandra Maria Victoria', lastName: 'Dela Cruz' }, program: { programName: 'Emergency assistance for families in crisis situations' } }]
        data = { enrollments: rows, pagination: { total: rows.length } }
      }
    } else if (path === '/staff-notifications') data = { notifications: [], unreadCount: 0, pagination: { total: 0 } }
    else { unexpected.push(path); return route.abort() }
    return route.fulfill({ json: { success: true, data } })
  })
  page = await context.newPage()
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(`http://127.0.0.1:${vite.httpServer.address().port}/dashboard`)
  const main = page.locator('.ga-admin-overview')
  await expect(main.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible()
  await expect(main.getByLabel('Loading enrollment reviews')).toBeVisible()
  await expect(main.getByLabel('Loading draft distributions')).toBeVisible()
  releaseRecords()
  await expect(main.getByRole('link', { name: 'Review enrollment for Maria Santos', exact: true })).toBeVisible()
  await expect(main.getByRole('link', { name: /Resume setup for Community assistance/ })).toBeVisible()
  await expect(main.getByText('Another Admin or DSWD reviewer must assess your submission.', { exact: true })).toBeVisible()
  await expect(main.getByText('Awaiting review', { exact: true })).toBeVisible()
  await expect(main.getByText('Under validation', { exact: true })).toBeVisible()
  await expect(main.getByText('TEST CONSULT 02 - AI Schedule Review', { exact: true })).toBeVisible()
  const updated = main.locator('.ga-overview-update time')
  await expect(updated).toHaveText(/17 Nov 2026, 8:46 pm PHT/)
  await expect(main.locator('.ga-overview-drafts time').first()).toHaveText('18 Nov 2026')
  const links = new Map(await main.locator('a').evaluateAll(items => items.map(item => [item.textContent.trim(), item.getAttribute('href')])))
  assert.equal(links.get('View active programs'), '/programs')
  assert.equal(links.get('View approved beneficiaries'), '/enrollments?status=APPROVED')
  assert.equal(links.get('View draft distributions'), '/distributions/manage?status=DRAFT')
  assert.equal(links.get('View open distributions'), '/distributions/manage?status=OPEN')
  assert.equal(links.get('View all enrollments'), '/enrollments')
  assert.deepEqual(readEnrollmentLocation(new URL(links.get('Review enrollment for Maria Santos'), 'http://localhost').search), { filters: { search: '', status: 'PENDING', programId: '' }, page: 1, selectedId: 'review-1' })
  assert.equal(links.get('Resume setup for Community assistance — November distribution'), '/distributions/manage?event=draft-1')
  assert.equal(links.get('Review allocations'), '/distributions/manage')
  assert.equal(readReportScope(new URL(links.get('Review verification reports'), 'http://localhost').search).type, 'ANOMALIES')
  assert.equal(links.get('Review transactions'), '/dswd/ledger')
  assert.equal(links.get('View live monitoring'), '/dswd/live-dashboard')
  await main.getByRole('button', { name: 'Refresh', exact: true }).focus()
  assert.equal(await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle), 'solid')
  await main.getByRole('heading', { name: 'Overview', exact: true }).click()

  for (const width of [1920, 1440, 1280, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 })
    await page.evaluate(() => window.scrollTo(0, 0))
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    const title = await main.getByRole('heading', { name: 'Overview', exact: true }).boundingBox()
    const header = await page.locator('.ga-staff-header').boundingBox()
    assert.ok(title.y >= header.y + header.height + 16, `Heading overlaps header at ${width}px`)
    await page.screenshot({ path: resolve(output, `overview-${width}.png`), fullPage: true })
  }
  const longName = main.locator('.ga-overview-enrollments .ga-overview-record-name').last()
  const originalName = await longName.textContent()
  await longName.evaluate(node => { node.textContent = 'Alexandra'.repeat(10) })
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'Unbroken names must wrap without horizontal overflow')
  await longName.evaluate((node, name) => { node.textContent = name }, originalName)

  failRecords = true
  await main.getByRole('button', { name: 'Refresh', exact: true }).click()
  await expect(main.getByRole('alert').filter({ hasText: 'Enrollment reviews could not be loaded' })).toBeVisible()
  await expect(main.getByRole('alert').filter({ hasText: 'Draft distributions could not be loaded' })).toBeVisible()
  await expect(main.getByText('No enrollments awaiting review', { exact: true })).toHaveCount(0)
  await page.screenshot({ path: resolve(output, 'record-errors-320.png'), fullPage: true })
  failRecords = false
  await main.getByRole('button', { name: 'Try again', exact: true }).first().click()
  await expect(main.getByRole('link', { name: 'Review enrollment for Maria Santos', exact: true })).toBeVisible()

  failOverview = true
  const savedTime = await updated.textContent()
  await main.getByRole('button', { name: 'Refresh', exact: true }).click()
  await expect(page.getByText('Latest figures could not be loaded. Showing the last available update.', { exact: false })).toBeVisible()
  await expect(updated).toHaveText(savedTime)
  failOverview = false
  empty = true
  await main.getByRole('button', { name: 'Refresh', exact: true }).click()
  await expect(main.getByText('No enrollments awaiting review', { exact: true })).toBeVisible()
  await expect(main.getByText('No draft distributions', { exact: true })).toBeVisible()
  await page.screenshot({ path: resolve(output, 'empty-320.png'), fullPage: true })
  unavailable = true
  await main.getByRole('button', { name: 'Refresh', exact: true }).click()
  await expect(main.locator('.ga-overview-follow-up').getByText('Unavailable', { exact: true })).toBeVisible()
  assert.equal(await main.getByLabel('Operations summary').locator('.ga-overview-total').first().textContent(), '—')
  assert.deepEqual(errors, [])
  assert.deepEqual(unexpected, [])
  console.log(`PASS: loading, populated, long names, independent review, empty, failure/retry, preserved timestamps, unavailable figures, destination links, keyboard focus, header clearance and 320–1920px layouts. Screenshots: ${output}`)
} catch (error) {
  await page?.screenshot({ path: resolve(output, 'failure.png'), fullPage: true }).catch(() => {})
  throw error
} finally {
  releaseRecords()
  await browser?.close()
  await vite.close()
}
