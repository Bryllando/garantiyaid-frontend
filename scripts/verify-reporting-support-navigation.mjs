import assert from 'node:assert/strict'
import { chromium } from '@playwright/test'
import { createServer } from 'vite'

const event = (distributionId, title) => ({ distributionId, title, distributionDate: '2026-10-10', status: 'OPEN', program: { programName: 'Community Assistance', programCode: 'AID-2026' }, barangay: { barangayName: 'Poblacion' }, deliveryMode: 'PHYSICAL_GOODS' })
const pagination = (total = 0) => ({ page: 1, totalPages: 1, total })
const auditFilters = []
const vite = await createServer({ server: { host: '127.0.0.1', port: 0 } })
await vite.listen()
const baseUrl = `http://127.0.0.1:${vite.httpServer.address().port}`
const browser = await chromium.launch({ headless: true, channel: 'chrome' })

try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, acceptDownloads: true })
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.addInitScript(() => {
    sessionStorage.setItem('garantiyaid.accessToken', 'preview-token')
    sessionStorage.setItem('garantiyaid.user', JSON.stringify({ userId: 'admin-1', role: 'SYSTEM_ADMIN', fullName: 'System Administrator', email: 'admin@example.gov.ph' }))
  })
  await page.route('**/socket.io/**', (route) => route.abort())
  await page.routeWebSocket('ws://localhost:4000/socket.io/**', () => {})
  await page.route('http://localhost:4000/api/v1/**', async (route) => {
    const url = new URL(route.request().url())
    const path = url.pathname.replace('/api/v1', '')
    let data = {}
    if (path === '/health') data = { timestamp: new Date().toISOString() }
    else if (path === '/distributions') data = { distributions: [event('event-1', 'Current event')], pagination: pagination(1) }
    else if (path === '/distributions/event-2') data = { distribution: event('event-2', 'Linked event') }
    else if (path === '/reports/distributions/event-2/summary') data = { report: { generatedAt: '2026-09-26T08:00:00.000Z', timeZone: 'Asia/Manila', data: { distribution: event('event-2', 'Linked event'), beneficiaries: { allocatedCount: 10, claimCompletionPercentage: 80 }, slots: { capacityUtilizationPercentage: 50 }, qrScans: { duplicateCount: 0, invalidCount: 0 }, biometrics: { noMatchCount: 0 } } } }
    else if (path === '/reports/distributions/event-2/claims') data = { report: { generatedAt: '2026-09-26T08:00:00.000Z', timeZone: 'Asia/Manila', data: { summary: { matchingClaimCount: 0, statusCounts: {} }, claims: [], pagination: pagination() } } }
    else if (path === '/reports/distributions/event-2/export.csv') return route.fulfill({ body: 'id,status\nevent-2,OPEN\n', headers: { 'content-type': 'text/csv', 'content-disposition': 'attachment; filename="event-2.csv"' } })
    else if (path === '/audit-logs') { auditFilters.push(url.searchParams.get('entityAffected')); data = { auditLogs: [], pagination: pagination() } }
    else if (path === '/notifications') data = { notifications: [], pagination: pagination() }
    else if (path === '/notifications/summary') data = { total: 0, byStatus: {} }
    else if (path === '/notifications/queue/health') data = { status: 'ready', counts: {} }
    else if (path === '/chatbot/escalations') data = { escalations: [{ sessionId: 'case-1', status: 'ESCALATED', messageCount: 1, lastActivityAt: '2026-09-26T08:00:00.000Z', beneficiary: { firstName: 'Maria', lastName: 'Santos' } }], pagination: pagination(1) }
    else if (path === '/chatbot/escalations/case-1') data = { session: { sessionId: 'case-1', status: 'ESCALATED', language: 'en', lastActivityAt: '2026-09-26T08:00:00.000Z', beneficiary: { firstName: 'Maria', lastName: 'Santos' } }, messages: [{ messageId: 'message-1', senderType: 'BENEFICIARY', messageText: 'Where is my schedule?', createdAt: '2026-09-26T08:00:00.000Z' }] }
    await route.fulfill({ json: { data } })
  })

  await page.goto(`${baseUrl}/reports?distribution=event-2`)
  await page.getByRole('heading', { name: 'Operational reports' }).waitFor()
  await page.getByLabel('Distribution event').selectOption('event-2')
  assert.equal(await page.getByLabel('Distribution event').inputValue(), 'event-2')
  await page.getByRole('button', { name: 'Generate report' }).click()
  await page.getByRole('heading', { name: 'Distribution summary' }).waitFor()
  await page.getByLabel('Report type').selectOption('CLAIMS')
  await page.getByRole('button', { name: 'Generate report' }).click()
  await page.getByRole('heading', { name: 'Claim status' }).waitFor()
  await page.getByLabel('Status', { exact: true }).selectOption('CLAIMED')
  assert.equal(await page.getByRole('heading', { name: 'Claim status' }).count(), 0, 'changing report filters must clear the old result')
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export selected event CSV' }).click()
  assert.match((await download).suggestedFilename(), /\.csv$/)
  await page.getByRole('link', { name: 'Review export in audit logs' }).click()
  await page.getByRole('heading', { name: 'Audit logs', exact: true }).waitFor()
  assert.equal(await page.getByLabel('Entity').inputValue(), 'REPORT')
  assert.ok(auditFilters.includes('REPORT'))
  await page.getByRole('button', { name: 'Reset' }).click()
  assert.equal(await page.getByLabel('Entity').inputValue(), '')
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
  await page.setViewportSize({ width: 320, height: 700 })
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)

  await page.goto(`${baseUrl}/notifications?distribution=event-2`)
  await page.getByRole('heading', { name: 'SMS delivery' }).waitFor()
  await page.getByText('Filter delivery history', { exact: false }).click()
  await page.getByLabel('Distribution', { exact: true }).selectOption('event-2')
  assert.equal(await page.getByLabel('Distribution', { exact: true }).inputValue(), 'event-2')
  assert.equal(await page.getByRole('button', { name: 'Refresh history' }).count(), 1)
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)

  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(`${baseUrl}/help-cases`)
  await page.getByRole('button', { name: /Maria Santos/ }).click()
  await page.getByRole('heading', { name: 'Maria Santos' }).waitFor()
  assert.equal(await page.evaluate(() => document.activeElement?.textContent?.includes('Back to conversations')), true)
  await page.getByRole('button', { name: 'Back to conversations' }).click()
  assert.equal(await page.evaluate(() => document.activeElement?.textContent?.includes('Conversations')), true)
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
  await page.setViewportSize({ width: 1440, height: 900 })
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
  assert.deepEqual(errors, [])
  console.log('Reporting and support navigation check passed')
} finally {
  await browser.close()
  await vite.close()
}
