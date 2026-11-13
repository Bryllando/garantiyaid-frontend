import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium, expect } from '@playwright/test'
import { createServer } from 'vite'

const output = resolve('../output/barangay-queue')
await mkdir(output, { recursive: true })
const eventId = '11111111-1111-4111-8111-111111111111'
const basis = 'TEST ONLY — supervised identity review under demo instructions.'
const person = { beneficiaryId: 'person', firstName: 'DEMO', lastName: 'Participant', barangay: { barangayName: 'Demo barangay' } }
const schedules = [{ scheduleId: 'schedule', beneficiaryId: 'person', beneficiary: person, status: 'SCHEDULED', queueNumber: 1, slot: { sessionLabel: 'Morning session', slotStart: '2099-01-01T09:00:00+08:00', slotEnd: '2099-01-01T10:00:00+08:00', location: 'Demo barangay hall' } }]
const vite = await createServer({ logLevel: 'error', cacheDir: 'node_modules/.vite-queue-qa', define: { 'import.meta.env.VITE_API_URL': JSON.stringify('/api/v1') }, server: { host: '127.0.0.1', port: 0, hmr: false }, plugins: [{ name: 'queue-error-qa', configureServer(server) {
  server.middlewares.use('/__qa/error', (_req, res) => { res.setHeader('Content-Type', 'text/html'); server.transformIndexHtml('/__qa/error', '<div id="root"></div><script type="module" src="/@id/virtual:queue-error-qa"></script>').then((html) => res.end(html)) })
}, resolveId(id) { if (id === 'virtual:queue-error-qa') return id }, load(id) { if (id === 'virtual:queue-error-qa') return `import React from 'react';import{createRoot}from'react-dom/client';import{AppErrorBoundary}from'/src/pages/SystemPages.jsx';import'/src/index.css';function Crash(){throw Error('Synthetic error-recovery test')}createRoot(document.getElementById('root')).render(React.createElement(AppErrorBoundary,null,React.createElement(Crash)));` } }] })
let browser, activePage, writes = 0
const errors = []
try {
  await vite.listen()
  browser = await chromium.launch({ channel: 'chrome', headless: true })
  const base = `http://127.0.0.1:${vite.httpServer.address().port}`
  const cases = [
    ['BARANGAY_FACILITATOR', '/facilitator/queue', 'QR', true],
    ['BARANGAY_FACILITATOR', '/facilitator/queue', 'QR', false],
    ['BARANGAY_FACILITATOR', '/facilitator/queue', 'MANUAL', true],
    ['BARANGAY_FACILITATOR', '/facilitator/qr-verification', 'QR', true],
    ['DSWD_STAFF', '/dswd/verify-claims', 'QR', true],
    ['SYSTEM_ADMIN', '/admin/schedules', 'QR', false],
  ]
  for (const [role, path, method, manual] of cases) {
    console.log(`Checking ${role}: ${path}, ${method}${manual ? ' + manual' : ''}`)
    const event = { distributionId: eventId, title: 'TEST ONLY — Distribution', status: 'OPEN', verificationRequirement: method, manualVerificationBasis: manual ? basis : null, location: 'Demo barangay hall', distributionDate: '2099-01-01', startTime: '09:00', endTime: '10:00', deliveryMode: 'PHYSICAL_GOODS', barangay: person.barangay }
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' })
    await context.addInitScript((role) => {
      sessionStorage.setItem('garantiyaid.accessToken', 'queue-test-only')
      sessionStorage.setItem('garantiyaid.user', JSON.stringify({ userId: 'test-user', fullName: 'Demo User', role, barangayId: 'demo-barangay' }))
    }, role)
    await context.route(/socket\.io/, (route) => route.abort())
    await context.routeWebSocket(/socket\.io/, () => {})
    await context.route('**/api/v1/**', (route) => {
      const req = route.request(), path = new URL(req.url()).pathname.replace('/api/v1', '')
      const respond = (data) => route.fulfill({ json: { success: true, data } })
      if (req.method() !== 'GET') { writes++; return route.abort() }
      if (path === '/health') return respond({ timestamp: new Date().toISOString() })
      if (path === '/staff-notifications') return respond({ notifications: [], unreadCount: 0, pagination: { totalPages: 1 } })
      if (path === '/distributions') return respond({ distributions: new URL(req.url()).searchParams.get('status') === 'DRAFT' ? [] : [event], pagination: { totalPages: 1 } })
      if (path === `/distributions/${eventId}`) return respond({ distribution: event })
      if (path.endsWith('/schedules')) return respond({ distributionId: eventId, schedules, summary: { countsByStatus: { SCHEDULED: 1, CHECKED_IN: 0, MISSED: 0, CANCELLED: 0 }, schedulableAllocationCount: 0 }, pagination: { page: 1, total: 1, totalPages: 1 } })
      errors.push(`Unexpected API: ${path}`); return route.fulfill({ status: 400, json: { error: { code: 'UNEXPECTED', message: path } } })
    })
    const page = await context.newPage(); activePage = page
    page.on('pageerror', (err) => errors.push(err.message))
    page.on('console', (message) => { if (message.type() === 'error' && /ReferenceError|not defined/.test(message.text())) errors.push(message.text()) })
    await page.goto(`${base}${path}?distribution=${eventId}`)
    await expect(page.getByRole('heading', { name: path.includes('queue') || path.includes('schedules') ? 'Beneficiary queue' : role === 'SYSTEM_ADMIN' ? 'Check a QR claim' : 'Review a beneficiary credential', exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Unable to display this page' })).toHaveCount(0)
    if (path.includes('queue') || path.includes('schedules')) {
      await expect(page.getByText('DEMO Participant', { exact: true }).first()).toBeVisible()
      if (method === 'MANUAL') await expect(page.getByRole('link', { name: 'Review identity', exact: true }).first()).toHaveAttribute('href', /manual-verification/)
      else await expect(page.getByRole('link', { name: 'Check QR', exact: true }).first()).toHaveAttribute('href', `${role === 'SYSTEM_ADMIN' ? '/admin/verify-claims' : '/facilitator/qr-verification'}?distribution=${eventId}`)
      if (role === 'BARANGAY_FACILITATOR') {
        for (const width of [320, 390, 1440]) {
          await page.setViewportSize({ width, height: 1000 })
          await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
        }
        await expect.poll(() => page.locator('#staff-navigation').evaluate((el) => Math.abs(el.getBoundingClientRect().left) < 1 && parseFloat(getComputedStyle(el.nextElementSibling).paddingLeft) >= 250)).toBe(true)
        await page.screenshot({ path: resolve(output, `queue-${method}-${manual}.png`), fullPage: true })
        if (method === 'QR' && manual) {
          await page.setViewportSize({ width: 390, height: 900 })
          await page.getByRole('button', { name: 'Open navigation', exact: true }).click()
          await expect(page.getByRole('dialog', { name: 'Staff navigation menu' })).toBeVisible()
          await expect(page.getByRole('dialog', { name: 'Staff navigation menu' }).getByText('Barangay workspace', { exact: true })).toBeVisible()
          await page.keyboard.press('Escape')
          await expect(page.getByRole('button', { name: 'Open navigation', exact: true })).toHaveAttribute('aria-expanded', 'false')
        }
      }
    } else if (manual) await expect(page.getByRole('button', { name: 'Use permitted manual identity review' })).toBeVisible()
    if (manual && role !== 'SYSTEM_ADMIN') {
      await page.getByRole('button', { name: path.includes('queue') ? 'Open manual identity review' : 'Use permitted manual identity review' }).click()
      await expect(page).toHaveURL(`${base}/manual-verification?distribution=${eventId}`)
      await expect(page.getByRole('heading', { name: 'Manual identity review', exact: true })).toBeVisible()
    }
    await context.close(); activePage = null
  }
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  await context.addInitScript(() => { sessionStorage.setItem('garantiyaid.accessToken', 'queue-test-only'); sessionStorage.setItem('garantiyaid.user', JSON.stringify({ role: 'BARANGAY_FACILITATOR', fullName: 'Demo User' })) })
  const page = await context.newPage(); activePage = page
  await page.goto(`${base}/__qa/error`)
  await expect(page.getByRole('heading', { name: 'Unable to display this page' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Back to workspace', exact: true })).toHaveAttribute('href', '/dashboard')
  await expect(page.getByText('Staff portal', { exact: true })).toHaveCount(0)
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 1000 })
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
  await page.screenshot({ path: resolve(output, 'error-recovery.png'), fullPage: true })
  await context.close(); activePage = null
  const anonymous = await browser.newContext()
  const anonymousPage = await anonymous.newPage(); activePage = anonymousPage
  await anonymousPage.goto(`${base}/__qa/error`)
  await expect(anonymousPage.getByRole('heading', { name: 'Unable to display this page' })).toBeVisible()
  await expect(anonymousPage.getByRole('link', { name: 'Back to workspace', exact: true })).toHaveCount(0)
  await expect(anonymousPage.getByRole('link', { name: 'Return to home page', exact: true })).toHaveAttribute('href', '/')
  assert.deepEqual(errors, []); assert.equal(writes, 0)
  console.log('Passed: Barangay queue and QR views, DSWD QR, Admin queue, permitted manual alternatives, 320/390/1440 layouts and error recovery; zero writes or messages.')
} catch (error) {
  console.error(errors)
  if (activePage) { console.error((await activePage.locator('body').innerText()).slice(0, 2200)); console.error(await activePage.evaluate(() => [...document.querySelectorAll('main *')].filter((el) => el.getBoundingClientRect().right > innerWidth + 1).slice(0, 12).map((el) => ({ tag: el.tagName, class: el.className, width: el.getBoundingClientRect().width, right: el.getBoundingClientRect().right, text: el.textContent.slice(0, 70) })))); await activePage.screenshot({ path: resolve(output, 'failure.png'), fullPage: true }) }
  throw error
} finally { await browser?.close(); await vite.close() }
