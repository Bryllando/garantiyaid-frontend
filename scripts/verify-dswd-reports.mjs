import assert from 'node:assert/strict'
import { mkdir, readFile } from 'node:fs/promises'
import { chromium, expect } from '@playwright/test'
import { createServer } from 'vite'
import { auditFixtures, reportFixture } from './fixtures/report-snapshots.js'

// All records and downloads are fixtures. No real account or report endpoint is used.
const output = '../output/dswd-reports'
await mkdir(output, { recursive: true })
const pdfOutput = '../output/pdf'
await mkdir(pdfOutput, { recursive: true })
const vite = await createServer({ cacheDir: '../tmp/dswd-reports-vite', define: { 'import.meta.env.VITE_API_URL': JSON.stringify('/api/v1') }, server: { host: '127.0.0.1', port: 0, hmr: false } })
await vite.listen()
const origin = `http://127.0.0.1:${vite.httpServer.address().port}`
let browser
try {
  browser = await chromium.launch({ headless: true, channel: 'chrome' })
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true })
  page.setDefaultTimeout(10000)
  page.setDefaultNavigationTimeout(45000)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const errors = [], unhandled = [], reportReads = [], eventReads = [], csvReads = [], auditReads = []
  let failReport = false, failCsv = false, failList = false, failEvent = false, shrink = false, wrongEvent = false, slowReport = false, failAi = false, failAudit = false
  let revision = 0
  const event = (n) => ({ distributionId: `event-${n}`, title: n === 105 ? 'Rain assistance' : `Community assistance ${n}`, distributionDate: '2026-11-17', status: 'OPEN', location: n === 105 ? 'District office' : 'Community hall', deliveryMode: n === 2 ? 'PHYSICAL_GOODS' : 'SIMULATED_WALLET', program: { programId: 'program-1', programName: 'Emergency assistance', programCode: 'EA' }, barangay: { barangayName: 'Poblacion' } })
  const pagination = (total = 0, number = 1, size = 20) => ({ total, page: number, pageSize: size, totalPages: Math.ceil(total / size) })
  await page.addInitScript(() => {
    sessionStorage.setItem('garantiyaid.accessToken', 'local-reports-test')
    sessionStorage.setItem('garantiyaid.user', JSON.stringify({ userId: 'staff-1', role: sessionStorage.getItem('report-role') || 'DSWD_STAFF', fullName: 'DSWD Reviewer' }))
  })
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('**/socket.io/**', (route) => route.abort())
  await page.routeWebSocket(/socket\.io/, () => {})
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname.replace('/api/v1', '')
    assert.ok(request.method() === 'GET' || (request.method() === 'POST' && path === '/reports/explain'), 'Report interactions only read records and request AI highlights')
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
    } else if (path === '/audit-logs' || path === '/audit-logs/export') {
      auditReads.push({ path, ...Object.fromEntries(url.searchParams) })
      if (failAudit) return fail()
      const filtered = auditFixtures.filter(row => (!url.searchParams.get('action') || row.action === url.searchParams.get('action').toUpperCase()) && (!url.searchParams.get('entityAffected') || row.entityAffected === url.searchParams.get('entityAffected').toUpperCase()))
      data = path.endsWith('/export') ? { generatedAt: '2026-11-17T13:15:00Z', timeZone: 'Asia/Manila', auditLogs: filtered, total: filtered.length } : { auditLogs: filtered.slice((number - 1) * size, number * size), pagination: pagination(filtered.length, number, size) }
    } else if (path === '/reports/snapshot' || path === '/reports/explain') {
      const scope = path.endsWith('/explain') ? request.postDataJSON() : Object.fromEntries(url.searchParams)
      reportReads.push({ path, ...scope })
      if (slowReport) await new Promise((resolve) => setTimeout(resolve, 650))
      if (failReport || (failAi && path.endsWith('/explain'))) return fail()
      const report = reportFixture(scope)
      const n = Number(scope.distributionId?.split('-').at(-1) || 105)
      report.event = scope.distributionId ? event(n) : null
      report.generatedAt = new Date(Date.UTC(2026, 10, 17, 1, revision++)).toISOString()
      if (scope.type === 'SUMMARY') report.data.distribution = report.event
      if (wrongEvent) report.distributionId = 'event-wrong'
      if (shrink && scope.type === 'CLAIMS') {
        report.data.claims = report.data.claims.slice(0, 1)
        report.data.summary.matchingClaimCount = 1
      }
      if (path.endsWith('/explain')) report.aiExplanation = { model: 'fixture', highlights: [report.facts[2], report.facts[0]] }
      data = { report }
    } else { unhandled.push(path); return route.fulfill({ status: 404, json: { error: { message: 'Missing fixture' } } }) }
    await route.fulfill({ json: { data } })
  })

  const go = (query = '') => page.goto(`${origin}/reports${query}`)
  const generate = () => page.getByRole('button', { name: 'Generate report', exact: true }).click()
  async function savePdf(filename) {
    const pending = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Download PDF', exact: true }).click()
    const download = await pending
    assert.match(download.suggestedFilename(), /^garantiyaid-[a-z]+-\d{4}-\d{2}-\d{2}\.pdf$/)
    await download.saveAs(`${pdfOutput}/${filename}.pdf`)
    const bytes = await readFile(`${pdfOutput}/${filename}.pdf`)
    assert.equal(bytes.subarray(0, 5).toString(), '%PDF-')
  }
  const result = page.getByRole('region', { name: 'Claim status', exact: true })
  const coverage = '?report=CLAIMS&distribution=event-105&status=CLAIMED&dateFrom=2026-11-01&dateTo=2026-11-17&monitorFrom=%2Fdswd%2Flive-dashboard%3Fdistribution%3Devent-105'
  await go(coverage)
  await expect(page.getByLabel('Distribution event')).toHaveValue('event-105')
  await expect(page.getByRole('button', { name: 'Generate report', exact: true })).toBeEnabled()
  await expect(page.getByLabel('Date from')).toHaveValue('2026-11-01')
  await expect(page.getByLabel('Date to')).toHaveValue('2026-11-17')
  await page.reload()
  await expect(page.getByLabel('Status', { exact: true })).toHaveValue('CLAIMED')
  await expect(page.getByLabel('Distribution event')).toHaveValue('event-105')
  await expect(page.getByLabel('Date from')).toHaveValue('2026-11-01')
  await expect(page.getByLabel('Date to')).toHaveValue('2026-11-17')
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

  await page.getByLabel('Date from').fill('2026-11-18')
  await generate()
  await expect(page.getByRole('alert')).toContainText('Date to must be the same as or later')
  await expect(page.getByLabel('Date to')).toBeFocused()
  assert.equal(reportReads.length, 0)
  await page.getByLabel('Date from').fill('2026-11-01')
  await generate()
  await expect(result).toBeVisible()
  await expect(result).toContainText('2026-11-01 to 2026-11-17')
  await expect(result).toContainText('Status totals cover all statuses within the date range')
  await expect(result.getByRole('cell', { name: 'QR', exact: true }).first()).toBeVisible()
  await expect(result.getByRole('cell', { name: /Simulated wallet credit/ }).first()).toBeVisible()
  assert.equal(reportReads.at(-1).status, 'CLAIMED')
  assert.equal(reportReads.at(-1).dateFrom, '2026-11-01')
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path: `${output}/claims-1440.png`, fullPage: true })

  failReport = true
  const generated = await result.getByText(/^Generated Nov/).textContent()
  await generate()
  await expect(page.getByRole('alert')).toContainText('Showing the last successful report below')
  await expect(result).toContainText(generated)
  await page.screenshot({ path: `${output}/retry-1440.png`, fullPage: true })
  failReport = false
  await page.getByRole('button', { name: 'Retry report' }).click()
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect(result.getByText(/^Generated Nov/)).not.toHaveText(generated)

  const readsBeforePaging = reportReads.length
  failReport = true
  await result.getByRole('button', { name: 'Next', exact: true }).click()
  await expect(result).toContainText('Page 2 of 2')
  assert.equal(reportReads.length, readsBeforePaging, 'Paging reads the complete generated snapshot')
  failReport = false
  await result.getByRole('button', { name: 'Previous', exact: true }).click()
  await expect(result).toContainText('Page 1 of 2')
  shrink = true
  await generate()
  await expect(result).toContainText('Page 1 of 1')
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

  failAi = true
  await page.getByRole('button', { name: 'Explain with AI', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Fixture service unavailable')
  await expect(page.getByRole('button', { name: 'Download PDF', exact: true })).toBeEnabled()
  failAi = false
  await page.getByRole('button', { name: 'Explain with AI', exact: true }).click()
  await expect(page.getByText('AI prioritized these explanations from the generated figures. The report was refreshed for this analysis.', { exact: true })).toBeVisible()
  await savePdf('claims')

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
    await savePdf(type === 'SUMMARY' ? 'combined-summary' : type.toLowerCase())
    if (type === 'SUMMARY') assert.equal('dateFrom' in reportReads.at(-1), false)
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
  await savePdf('physical-summary')

  await page.getByLabel('Report type').selectOption('CLAIMS')
  await page.getByLabel('Status', { exact: true }).selectOption('REJECTED')
  await generate()
  await expect(page.getByText('No records found', { exact: true })).toBeVisible()
  await savePdf('empty-claims')
  await page.getByLabel('Report type').selectOption('SUMMARY')

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
  await page.goto(`${origin}/audit-logs?entity=REPORT`)
  await expect(page.getByRole('heading', { name: 'Audit logs', level: 1, exact: true })).toBeVisible()
  await page.getByLabel('Action', { exact: true }).fill('REPORT_SNAPSHOT_GENERATED')
  await page.getByLabel('Date from', { exact: true }).fill('2026-11-01')
  await page.getByLabel('Date to', { exact: true }).fill('2026-11-17')
  await page.getByRole('button', { name: 'Apply', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Download PDF', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await expect(page.getByText('Page 2 of 2 · 27 records', { exact: true })).toBeVisible()
  await page.getByLabel('Action', { exact: true }).fill('UNAPPLIED_DRAFT')
  failAudit = true
  await page.getByRole('button', { name: 'Download PDF', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Fixture service unavailable')
  failAudit = false
  await savePdf('audit-logs')
  assert.equal(auditReads.at(-1).action, 'REPORT_SNAPSHOT_GENERATED')
  assert.equal(auditReads.at(-1).dateFrom, '2026-11-01T00:00:00+08:00')
  assert.equal(auditReads.at(-1).page, undefined)
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 })
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
    await page.screenshot({ path: `${output}/audit-${width}.png`, fullPage: true })
  }
  await page.evaluate(() => sessionStorage.setItem('report-role', 'BARANGAY_FACILITATOR'))
  const previousReads = reportReads.length
  await go('?distribution=event-105')
  await expect(page.getByRole('heading', { name: 'Oversight access required' })).toBeVisible()
  assert.equal(reportReads.length, previousReads)
  assert.deepEqual(errors, [])
  assert.deepEqual(unhandled, [])
  console.log('Reports passed: applied scope, event search/pagination, snapshot paging, retries, AI highlights/failure, CSV coverage, all five PDF types, combined/physical summaries, empty claims, complete filtered audit PDF, mobile and roles.')
} finally {
  await browser?.close()
  await vite.close()
}
