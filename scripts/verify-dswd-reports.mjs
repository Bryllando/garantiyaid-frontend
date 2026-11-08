import assert from 'node:assert/strict'
import { mkdir, readFile } from 'node:fs/promises'
import { chromium, expect } from '@playwright/test'
import { createServer } from 'vite'

// All records and downloads are fixtures. No real account or report endpoint is used.
const output = '../output/dswd-reports'
await mkdir(output, { recursive: true })
const vite = await createServer({ cacheDir: '../tmp/dswd-reports-vite', server: { host: '127.0.0.1', port: 0 } })
await vite.listen()
const origin = `http://127.0.0.1:${vite.httpServer.address().port}`
let browser
try {
  browser = await chromium.launch({ headless: true, channel: 'chrome' })
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true })
  page.setDefaultTimeout(10000)
  page.setDefaultNavigationTimeout(45000)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const errors = [], unhandled = [], reportReads = [], eventReads = [], csvReads = []
  let failReport = false, failCsv = false, failList = false, failEvent = false, shrink = false, wrongEvent = false, slowReport = false
  let revision = 0
  const event = (n) => ({ distributionId: `event-${n}`, title: n === 105 ? 'Rain assistance' : `Community assistance ${n}`, distributionDate: '2026-10-28', status: 'OPEN', location: n === 105 ? 'District office' : 'Community hall', deliveryMode: n === 2 ? 'PHYSICAL_GOODS' : 'SIMULATED_WALLET', program: { programId: 'program-1', programName: 'Emergency assistance', programCode: 'EA' }, barangay: { barangayName: 'Poblacion' } })
  const pagination = (total = 0, number = 1, size = 20) => ({ total, page: number, pageSize: size, totalPages: Math.ceil(total / size) })
  const funds = { allocatedAmount: '15000000', netCreditedAmount: '6000000', remainingAmount: '9000000' }
  await page.addInitScript(() => {
    sessionStorage.setItem('garantiyaid.accessToken', 'local-reports-test')
    sessionStorage.setItem('garantiyaid.user', JSON.stringify({ userId: 'staff-1', role: sessionStorage.getItem('report-role') || 'DSWD_STAFF', fullName: 'DSWD Reviewer' }))
  })
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('**/socket.io/**', (route) => route.abort())
  await page.routeWebSocket(/socket\.io/, () => {})
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname.replace('/api/v1', '')
    assert.equal(request.method(), 'GET', 'Reports must not change operational records')
    const fail = () => route.fulfill({ status: 503, json: { error: { message: 'Fixture service unavailable' } } })
    const number = Number(url.searchParams.get('page') || 1), size = Number(url.searchParams.get('pageSize') || 20)
    let data
    if (path === '/health') data = { timestamp: new Date().toISOString() }
    else if (path === '/staff-notifications') data = { notifications: [], unreadCount: 0, pagination: pagination() }
    else if (path === '/staff-notifications/unread-count') data = { unreadCount: 0 }
    else if (path === '/distributions') {
      eventReads.push(Object.fromEntries(url.searchParams))
      if (failList) return fail()
      const search = (url.searchParams.get('search') || '').toLowerCase()
      const rows = Array.from({ length: 105 }, (_, index) => event(index + 1)).filter((row) => `${row.title} ${row.location}`.toLowerCase().includes(search))
      data = { distributions: rows.slice((number - 1) * size, number * size), pagination: pagination(rows.length, number, size) }
    } else if (/^\/distributions\/event-\d+$/.test(path)) {
      if (failEvent) return fail()
      data = { distribution: event(Number(path.split('-').at(-1))) }
    } else if (path.endsWith('/export.csv')) {
      csvReads.push({ path, query: url.search })
      if (failCsv) return fail()
      return route.fulfill({ body: 'beneficiaryName,claimStatus\nMaria Santos,CLAIMED\n', headers: { 'content-type': 'text/csv', 'content-disposition': 'attachment; filename="event-105.csv"' } })
    } else if (path.startsWith('/reports/')) {
      reportReads.push({ path, ...Object.fromEntries(url.searchParams) })
      if (slowReport) await new Promise((resolve) => setTimeout(resolve, 650))
      if (failReport) return fail()
      const kind = path.split('/').at(-1), n = Number(path.match(/event-(\d+)/)?.[1] || 105)
      const report = { generatedAt: `2026-10-28T01:${String(revision++).padStart(2, '0')}:00Z`, timeZone: 'Asia/Manila', distributionId: kind === 'fund-utilization' ? null : wrongEvent ? 'event-wrong' : `event-${n}` }
      if (kind === 'summary') report.data = { distribution: event(n), beneficiaries: { allocatedCount: 25, claimCompletionPercentage: 80 }, slots: { capacityUtilizationPercentage: 50 }, qrScans: { duplicateCount: 1, invalidCount: 2 }, biometrics: { noMatchCount: 0 }, fundUtilization: funds }
      else if (kind === 'claims') report.data = { summary: { matchingClaimCount: shrink ? 1 : 21, statusCounts: { CLAIMED: 21, VERIFIED: 2 } }, claims: [{ claimId: `claim-${number}`, recordedAt: '2026-10-28T01:00:00Z', beneficiaryName: number === 1 ? 'Maria Santos' : 'Elena Reyes', queueNumber: number, verificationMethod: 'QR', deliveryMode: 'SIMULATED_WALLET', releasedAt: null, allocatedAmount: '1000', claimStatus: 'CLAIMED' }], pagination: pagination(shrink ? 1 : 21, number) }
      else if (kind === 'schedules') report.data = { summary: { matchingScheduleCount: 1, statusCounts: { CHECKED_IN: 1 } }, schedules: [{ scheduleId: 'schedule-1', slotStart: '2026-10-28T01:00:00Z', beneficiaryName: 'Maria Santos', queueNumber: 1, assignedByAi: false, scheduleStatus: 'CHECKED_IN', claimStatus: 'CLAIMED' }], pagination: pagination(1) }
      else if (kind === 'anomalies') report.data = { summary: { total: 1, qrAnomalyCount: 1, biometricAnomalyCount: 0, transactionAnomalyCount: 0 }, anomalies: [{ anomalyId: 'exception-1', occurredAt: '2026-10-28T01:00:00Z', category: 'QR_SCAN', result: 'DUPLICATE', severity: 'HIGH' }], pagination: pagination(1) }
      else if (kind === 'fund-utilization') report.data = { totals: funds, distributions: [{ distribution: event(n), utilization: funds }], pagination: pagination(1) }
      else unhandled.push(path)
      data = { report }
    } else { unhandled.push(path); return route.fulfill({ status: 404, json: { error: { message: 'Missing fixture' } } }) }
    await route.fulfill({ json: { data } })
  })

  const go = (query = '') => page.goto(`${origin}/reports${query}`)
  const generate = () => page.getByRole('button', { name: 'Generate report', exact: true }).click()
  const result = page.getByRole('region', { name: 'Claim status', exact: true })
  const coverage = '?report=CLAIMS&distribution=event-105&status=CLAIMED&dateFrom=2026-10-01&dateTo=2026-10-28&monitorFrom=%2Fdswd%2Flive-dashboard%3Fdistribution%3Devent-105'
  await go(coverage)
  await expect(page.getByLabel('Distribution event')).toHaveValue('event-105')
  await expect(page.getByRole('button', { name: 'Generate report', exact: true })).toBeEnabled()
  await expect(page.getByLabel('Date from')).toHaveValue('2026-10-01')
  await expect(page.getByLabel('Date to')).toHaveValue('2026-10-28')
  await page.reload()
  await expect(page.getByLabel('Status', { exact: true })).toHaveValue('CLAIMED')
  await expect(page.getByLabel('Distribution event')).toHaveValue('event-105')
  await expect(page.getByLabel('Date from')).toHaveValue('2026-10-01')
  await expect(page.getByLabel('Date to')).toHaveValue('2026-10-28')
  await expect(page.getByRole('link', { name: 'Return to live monitoring' })).toHaveAttribute('href', '/dswd/live-dashboard?status=OPEN&distribution=event-105')
  assert.equal(reportReads.length, 0, 'No reports are generated on page load or refresh')
  assert.equal(csvReads.length, 0, 'No automatic download')

  await page.getByText('Find another event', { exact: true }).click()
  await page.getByRole('button', { name: 'Next events', exact: true }).click()
  await expect(page.getByRole('navigation', { name: 'Report event pages' })).toContainText('Page 2 of 14')
  await expect(page.getByLabel('Distribution event')).toHaveValue('event-105')
  await page.getByLabel('Find event by title or location').fill('District office')
  await page.getByRole('button', { name: 'Search events', exact: true }).click()
  await expect(page.locator('#report-event-help')).toContainText('1 of 1 matching')
  assert.ok(eventReads.some((item) => item.search === 'District office'))
  await page.getByLabel('Find event by title or location').fill('nothing matches')
  await page.getByLabel('Find event by title or location').press('Enter')
  await expect(page.getByText('No matching events. Try another title or location.')).toBeVisible()
  assert.equal(reportReads.length, 0, 'Search Enter does not generate a report')
  await expect(page.getByLabel('Distribution event')).toHaveValue('event-105')
  await page.getByText('Find another event', { exact: true }).click()

  await page.getByLabel('Date from').fill('2026-11-01')
  await generate()
  await expect(page.getByRole('alert')).toContainText('Date to must be the same as or later')
  await expect(page.getByLabel('Date to')).toBeFocused()
  assert.equal(reportReads.length, 0)
  await page.getByLabel('Date from').fill('2026-10-01')
  await generate()
  await expect(result).toBeVisible()
  await expect(result).toContainText('2026-10-01 to 2026-10-28')
  await expect(result).toContainText('Status totals cover all statuses within the date range')
  await expect(result.getByRole('cell', { name: 'QR', exact: true })).toBeVisible()
  await expect(result.getByRole('cell', { name: 'Not recorded', exact: true })).toBeVisible()
  assert.equal(reportReads.at(-1).status, 'CLAIMED')
  assert.equal(reportReads.at(-1).dateFrom, '2026-10-01')
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path: `${output}/claims-1440.png`, fullPage: true })

  failReport = true
  const generated = await result.getByText(/^Generated Oct/).textContent()
  await generate()
  await expect(page.getByRole('alert')).toContainText('Showing the last successful report below')
  await expect(result).toContainText(generated)
  await page.screenshot({ path: `${output}/retry-1440.png`, fullPage: true })
  failReport = false
  await page.getByRole('button', { name: 'Retry report' }).click()
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect(result.getByText(/^Generated Oct/)).not.toHaveText(generated)

  failReport = true
  await result.getByRole('button', { name: 'Next', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Retry report' })).toBeVisible()
  await expect(result).toContainText('Page 1 of 2')
  failReport = false
  await page.getByRole('button', { name: 'Retry report' }).click()
  await expect(result).toContainText('Page 2 of 2')
  assert.equal(reportReads.at(-1).page, '2')
  await result.getByRole('button', { name: 'Previous', exact: true }).click()
  await expect(result).toContainText('Page 1 of 2')
  shrink = true
  await result.getByRole('button', { name: 'Next', exact: true }).click()
  await expect(result).toContainText('Page 1 of 1')
  assert.deepEqual(reportReads.slice(-2).map((item) => item.page), ['2', '1'])
  shrink = false
  await generate()
  await expect(result).toContainText('Page 1 of 2')

  await page.getByText('Download full-event CSV', { exact: true }).click()
  await expect(page.getByText('Report type, date, and status filters do not apply to this CSV.')).toBeVisible()
  failCsv = true
  await page.getByRole('button', { name: 'Export selected event CSV' }).click()
  await expect(page.getByRole('alert')).toContainText('CSV download could not be prepared')
  await expect(result).toBeVisible()
  failCsv = false
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export selected event CSV' }).click()
  const download = await downloadPromise
  assert.equal(download.suggestedFilename(), 'event-105.csv')
  assert.match(await readFile(await download.path(), 'utf8'), /Maria Santos,CLAIMED/)
  assert.deepEqual(csvReads.at(-1), { path: '/reports/distributions/event-105/export.csv', query: '' })
  await expect(page.getByRole('alert')).toHaveCount(0)
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 900 })
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.screenshot({ path: `${output}/claims-${width}.png`, fullPage: true })
  }
  await page.setViewportSize({ width: 1440, height: 1000 })

  await page.getByLabel('Status', { exact: true }).selectOption('VERIFIED')
  await expect(result).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Coverage changed' })).toBeVisible()
  wrongEvent = true
  await generate()
  await expect(page.getByRole('alert')).toContainText('does not match the selected event')
  await expect(result).toHaveCount(0)
  wrongEvent = false
  await page.getByRole('button', { name: 'Retry report' }).click()
  await expect(result).toBeVisible()

  for (const [type, title] of [['SCHEDULES', 'Queue schedules'], ['ANOMALIES', 'Anomaly review'], ['SUMMARY', 'Distribution summary'], ['FUNDS', 'Simulated fund utilization']]) {
    await page.getByLabel('Report type').selectOption(type)
    if (type === 'SUMMARY') {
      await expect(page.getByLabel('Date from')).toHaveCount(0)
      assert.ok(!new URL(page.url()).searchParams.has('dateFrom'))
    }
    if (type === 'FUNDS') await page.getByLabel('Distribution event').selectOption('')
    await generate()
    await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible()
    if (type === 'SUMMARY') assert.deepEqual(Object.keys(reportReads.at(-1)), ['path'])
    if (type === 'FUNDS') {
      assert.ok(!('distributionId' in reportReads.at(-1)))
      await expect(page.getByRole('button', { name: 'Export selected event CSV' })).toBeDisabled()
      await page.setViewportSize({ width: 320, height: 900 })
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
      await page.evaluate(() => window.scrollTo(0, 0))
      await page.screenshot({ path: `${output}/funds-320.png`, fullPage: true })
    }
  }

  await page.setViewportSize({ width: 1440, height: 1000 })
  failEvent = true
  await go('?distribution=event-105')
  await expect(page.getByRole('alert')).toContainText('Selected event could not be loaded')
  await expect(page.getByLabel('Distribution event')).toHaveValue('event-105')
  await expect(page.getByRole('button', { name: 'Generate report' })).toBeDisabled()
  await page.getByText('Download full-event CSV', { exact: true }).click()
  await expect(page.getByRole('button', { name: 'Export selected event CSV' })).toBeDisabled()
  failEvent = false
  await page.getByRole('button', { name: 'Retry selected event' }).click()
  await expect(page.getByRole('button', { name: 'Generate report' })).toBeEnabled()
  failList = true
  await page.reload()
  await expect(page.getByRole('button', { name: 'Reload event choices' })).toBeVisible()
  await expect(page.getByLabel('Distribution event')).toHaveValue('event-105')
  await generate()
  await expect(page.getByRole('heading', { name: 'Distribution summary', exact: true })).toBeVisible()
  failList = false
  await page.getByRole('button', { name: 'Reload event choices' }).click()
  await expect(page.locator('#report-event-help')).toContainText('8 of 105 matching')

  await go()
  await generate()
  await expect(page.getByRole('alert')).toContainText('Select a distribution event')
  await expect(page.getByLabel('Distribution event')).toBeFocused()
  await page.getByLabel('Distribution event').selectOption('event-2')
  await expect(page.getByRole('link', { name: 'Review physical release records' })).toHaveAttribute('href', '/claim-accountability?distribution=event-2')
  await generate()
  await expect(page.getByRole('heading', { name: 'Distribution summary', exact: true })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Distribution summary' })).toContainText('Physical assistance release; wallet credits are not required.')

  slowReport = true
  await generate()
  await expect(page.getByLabel('Report type')).toBeDisabled()
  await expect(page.getByLabel('Distribution event')).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Generating report...' })).toBeDisabled()
  await page.getByRole('heading', { name: 'Distribution summary' }).waitFor()
  await expect(page.getByRole('button', { name: 'Generate report', exact: true })).toBeEnabled()
  slowReport = false

  await page.evaluate(() => sessionStorage.setItem('report-role', 'SYSTEM_ADMIN'))
  await go('?distribution=event-105')
  await expect(page.getByRole('link', { name: 'Return to event review' })).toHaveAttribute('href', '/distributions/manage?event=event-105')
  await generate()
  await expect(page.getByRole('heading', { name: 'Distribution summary', exact: true })).toBeVisible()
  await page.evaluate(() => sessionStorage.setItem('report-role', 'BARANGAY_STAFF'))
  const previousReads = reportReads.length
  await go('?distribution=event-105')
  await expect(page.getByRole('heading', { name: 'Oversight access required' })).toBeVisible()
  assert.equal(reportReads.length, previousReads)
  assert.deepEqual(errors, [])
  assert.deepEqual(unhandled, [])
  console.log('DSWD reports passed: scope, event search/pagination, retries, report pages, CSV coverage, five report types, mobile and roles.')
} finally {
  await browser?.close()
  await vite.close()
}
