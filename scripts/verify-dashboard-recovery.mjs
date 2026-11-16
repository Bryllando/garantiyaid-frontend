import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium, expect } from '@playwright/test'
import { createServer } from 'vite'
import { historyApiFixture } from './fixtures/assistant-history.js'

// Every application request is intercepted; no live account, claim or notification is changed.
const output = resolve('../output/dashboard-recovery')
await mkdir(output, { recursive: true })
const vite = await createServer({ cacheDir: resolve(output, '.vite'), logLevel: 'error', define: { 'import.meta.env.VITE_API_URL': JSON.stringify('/api/v1') }, server: { host: '127.0.0.1', port: 0, hmr: false }, plugins: [{
  name: 'controlled-dashboard-events', enforce: 'pre',
  transform(source, id) {
    if (id.replaceAll('\\', '/').endsWith('/src/realtime/staffRealtime.js')) {
      const patched = source.replace(/createSocket\s*=\s*io\)/g, 'createSocket = globalThis.__dashboardTestSocket || io)')
      assert.notEqual(patched, source, 'The test must control real-time events')
      return patched
    }
  },
}] })
let browser, activePage, reads = 0, writes = 0, limited = 0
const errors = []
const counts = {}
const overview = { generatedAt: '14 Nov 2026, 10:00 PM PHT', scope: { global: true }, programs: { activeProgramCount: 2 }, distributions: { totalMatchingDistributionCount: 2, upcomingDistributionCount: 1, openDistributionCount: 1, statusCounts: { DRAFT: 1, OPEN: 1 } }, beneficiaries: { approvedBeneficiaryCount: 3, unclaimedAllocationCount: 2, verifiedBeneficiaryCount: 1, claimedBeneficiaryCount: 1, claimCompletionPercentage: 33 }, queue: { scheduledCount: 2 }, anomalies: { duplicateAttemptCount: 0 }, fundUtilization: { remainingAmount: '1500.00' } }
async function contextFor(role = 'SYSTEM_ADMIN', failure = '') {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' })
  await context.addInitScript(role => {
    sessionStorage.setItem('garantiyaid.accessToken', 'dashboard-fixture')
    sessionStorage.setItem('garantiyaid.user', JSON.stringify({ userId: 'fixture-user', fullName: 'Test Staff', role, barangayId: 'fixture-barangay' }))
    const sockets = []
    globalThis.__dashboardTestSocket = () => {
      const handlers = {}
      const socket = { on(name, callback) { handlers[name] = callback; return socket }, disconnect() { sockets.splice(sockets.indexOf(handlers), 1) } }
      sockets.push(handlers)
      return socket
    }
    globalThis.__dashboardEmit = (name, payload = {}) => sockets.forEach(handlers => handlers[name]?.(payload))
    globalThis.__dashboardSocketEvents = () => sockets.map(handlers => Object.keys(handlers))
  }, role)
  const history = historyApiFixture()
  let failedOnce = false, overviewReads = 0, offlineRecovered = false
  await context.route('**/api/v1/**', async route => {
    const req = route.request(), path = new URL(req.url()).pathname.replace('/api/v1', '')
    if (path.includes('/staff-assistant/conversations')) return history.route(route)
    if (req.method() !== 'GET') { writes++; return route.abort() }
    if (req.headers().authorization) { reads++; counts[path] = (counts[path] ?? 0) + 1 }
    if (path === '/dashboard/overview') overviewReads++
    if (path === '/dashboard/overview' && failure === 'offline' && !offlineRecovered) return route.abort('connectionrefused')
    if (path === '/dashboard/overview' && ['limited', 'stale'].includes(failure) && !failedOnce && (failure !== 'stale' || overviewReads === 2)) {
      failedOnce = true
      limited++
      return route.fulfill({ status: 429, headers: { 'Retry-After': '30' }, json: { error: { code: 'RATE_LIMIT_EXCEEDED', scope: 'garantiyaid-api', retryAfterSeconds: 30, message: 'Too many requests. Try again in 30 seconds.' } } })
    }
    if (reads > 300 && !failure) {
      limited++
      return route.fulfill({ status: 429, headers: { 'Retry-After': '600' }, json: { error: { code: 'RATE_LIMIT_EXCEEDED', scope: 'garantiyaid-api', retryAfterSeconds: 600, message: 'Too many requests. Try again in 10 minutes.' } } })
    }
    const data = path === '/health' ? { timestamp: new Date().toISOString() }
      : path === '/dashboard/overview' ? { overview }
      : path === '/distributions' ? { distributions: [], pagination: { total: 0, totalPages: 1 } }
      : path === '/enrollments' ? { enrollments: [], pagination: { total: 0, totalPages: 1 } }
      : path === '/staff-notifications' ? { notifications: [], unreadCount: 0, pagination: { total: 0, totalPages: 1 } }
      : null
    if (!data) { errors.push(`Unhandled API: ${path}`); return route.abort() }
    return route.fulfill({ json: { success: true, data } })
  })
  const page = await context.newPage(); activePage = page
  page.on('pageerror', issue => errors.push(issue.message))
  await page.clock.install()
  return { context, page, recover: () => { offlineRecovered = true } }
}
try {
  await vite.listen()
  browser = await chromium.launch({ channel: 'chrome', headless: true })
  const origin = `http://127.0.0.1:${vite.httpServer.address().port}`
  const stress = await contextFor()
  await stress.page.goto(`${origin}/dashboard`)
  await expect(stress.page.getByRole('heading', { name: 'Administration overview', exact: true })).toBeVisible()
  assert.ok((await stress.page.evaluate(() => __dashboardSocketEvents())).some(events => events.includes('dashboard.metrics.updated')), 'Dashboard event subscription must exist before the burst')
  await stress.page.evaluate(() => __dashboardEmit('realtime.ready'))
  for (let index = 0; index < 85; index++) {
    await stress.page.evaluate(() => { __dashboardEmit('dashboard.metrics.updated'); __dashboardEmit('staff.notification.created') })
    await stress.page.clock.runFor(1000)
    await new Promise(done => setTimeout(done, 30))
  }
  await writeFile(resolve(output, 'request-counts.json'), JSON.stringify({ reads, limited, counts, errors }, null, 2))
  assert.equal(limited, 0, `Live events exhausted the staff budget: ${reads} reads, ${limited} limited requests`)
  assert.ok(reads < 60, `85 live events should be coalesced, saw ${reads} requests`)
  await stress.page.screenshot({ path: resolve(output, 'last-saved-overview.png'), fullPage: true })
  await stress.context.close()

  for (const role of ['SYSTEM_ADMIN', 'DSWD_STAFF', 'BARANGAY_FACILITATOR']) {
    const test = await contextFor(role, 'limited')
    await test.page.goto(`${origin}/dashboard`)
    await expect(test.page.getByRole('heading', { name: 'Dashboard updates paused' })).toBeVisible()
    await expect(test.page.getByRole('button', { name: /Retry in/ })).toBeDisabled()
    if (role === 'SYSTEM_ADMIN') {
      for (const width of [320, 390, 1440]) {
        await test.page.setViewportSize({ width, height: 1000 })
        await expect.poll(() => test.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
        await test.page.screenshot({ path: resolve(output, `paused-${width}.png`), fullPage: true })
      }
    }
    const before = reads
    for (let index = 0; index < 4; index++) await test.page.evaluate(() => __dashboardEmit('dashboard.metrics.updated'))
    await test.page.clock.runFor(2000)
    assert.equal(reads, before, 'No HTTP retry during the server cooldown')
    await test.page.clock.runFor(30_000)
    const heading = role === 'SYSTEM_ADMIN' ? 'Administration overview' : role === 'DSWD_STAFF' ? 'DSWD overview' : 'Barangay overview'
    await expect(test.page.getByRole('heading', { name: heading, exact: true })).toBeVisible()
    await expect(test.page.getByRole('heading', { name: 'Dashboard updates paused' })).toHaveCount(0)
    await test.context.close()
  }
  const stale = await contextFor('SYSTEM_ADMIN', 'stale')
  await stale.page.goto(`${origin}/dashboard`)
  await expect(stale.page.getByRole('heading', { name: 'Administration overview', exact: true })).toBeVisible()
  await stale.page.getByRole('button', { name: 'Refresh records', exact: true }).click()
  await expect(stale.page.getByRole('heading', { name: 'Dashboard updates paused' })).toBeVisible()
  await expect(stale.page.getByRole('heading', { name: 'Administration overview', exact: true })).toBeVisible()
  await expect(stale.page.getByText('Your last successful figures are still shown.', { exact: false })).toBeVisible()
  await stale.page.screenshot({ path: resolve(output, 'paused-with-saved-figures.png'), fullPage: true })
  await stale.context.close()
  const offline = await contextFor('SYSTEM_ADMIN', 'offline')
  await offline.page.goto(`${origin}/dashboard`)
  await expect(offline.page.getByRole('heading', { name: 'Dashboard could not be loaded' })).toBeVisible()
  for (const width of [320, 390, 1440]) {
    await offline.page.setViewportSize({ width, height: 1000 })
    await expect.poll(() => offline.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await offline.page.screenshot({ path: resolve(output, `recovery-${width}.png`), fullPage: true })
  }
  offline.recover()
  await offline.page.getByRole('button', { name: 'Try again', exact: true }).click()
  await expect(offline.page.getByRole('heading', { name: 'Administration overview', exact: true })).toBeVisible()
  assert.equal(writes, 0); assert.deepEqual(errors, [])
  console.log('PASS: live-event bursts stay below the request budget; all roles wait for Retry-After and recover; offline retry and 320/390/1440 layouts work; no writes or notifications.')
} catch (error) {
  console.error(JSON.stringify({ reads, writes, limited, counts, errors }))
  await activePage?.screenshot({ path: resolve(output, 'failure.png'), fullPage: true }).catch(() => {})
  throw error
} finally { await browser?.close(); await vite.close() }
