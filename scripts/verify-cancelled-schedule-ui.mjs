import assert from 'node:assert/strict'
import { chromium, expect } from '@playwright/test'
import { createServer } from 'vite'

const vite = await createServer({ logLevel: 'error', cacheDir: 'node_modules/.vite-verify/cancelled-schedule', define: { 'import.meta.env.VITE_API_URL': JSON.stringify('/api/v1') }, server: { host: '127.0.0.1', port: 0, hmr: false } })
let browser, reactivated = 0, generated = 0
const errors = []
const barangay = { barangayId: 'area-1', barangayName: 'Demo barangay', isActive: true }
const program = { programId: 'program-1', programCode: 'TEST-SMS', programName: 'SMS demo', status: 'ACTIVE' }
const distribution = { distributionId: 'event-1', title: 'TEST SMS Notification Demo', barangay, program, status: 'DRAFT', distributionDate: '2099-12-11', startTime: '08:50', endTime: '09:50', location: 'Demo hall', deliveryMode: 'PHYSICAL_GOODS', verificationRequirement: 'QR' }
const slot = { slotId: 'slot-1', sessionId: 'session-1', sessionLabel: 'Demo session', location: 'Demo hall', serviceAreas: [], slotStart: '2099-12-11T08:50:00+08:00', slotEnd: '2099-12-11T09:00:00+08:00', capacity: 2, slotStatus: 'AVAILABLE' }
const alpha = { scheduleId: 'alpha', status: 'CANCELLED', queueNumber: 1, slot, beneficiary: { beneficiaryId: 'alpha-person', firstName: 'SMS Demo', lastName: 'Alpha', barangay } }
const beta = { scheduleId: 'beta', status: 'SCHEDULED', queueNumber: 2, slot, beneficiary: { beneficiaryId: 'beta-person', firstName: 'SMS Demo', lastName: 'Beta', barangay } }
try {
  await vite.listen()
  browser = await chromium.launch({ channel: 'chrome', headless: true })
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' })
  page.on('pageerror', error => errors.push(error.message))
  await page.addInitScript(() => {
    sessionStorage.setItem('garantiyaid.accessToken', 'cancelled-fixture')
    sessionStorage.setItem('garantiyaid.user', JSON.stringify({ userId: 'admin-fixture', fullName: 'Demo Admin', role: 'SYSTEM_ADMIN' }))
  })
  await page.route(/socket\.io/, route => route.abort())
  await page.routeWebSocket(/socket\.io/, () => {})
  await page.route('**/api/v1/**', async route => {
    const url = new URL(route.request().url()), path = url.pathname.replace('/api/v1', '')
    const pagination = { page: 1, totalPages: 1, total: 2 }
    const respond = data => route.fulfill({ json: { success: true, data } })
    if (path.endsWith('/schedules/alpha/reactivate')) { reactivated++; alpha.status = 'SCHEDULED'; return respond({ schedule: alpha }) }
    if (path.endsWith('/schedules/generate')) { generated++; throw new Error('Cancelled schedules must not be regenerated') }
    if (path === '/health') return respond({ timestamp: new Date().toISOString() })
    if (path === '/staff-notifications') return respond({ notifications: [], unreadCount: 0, pagination })
    if (path === '/programs') return respond({ programs: [program], pagination })
    if (path === '/barangays') return respond({ barangays: [barangay] })
    if (path === '/distributions') {
      const events = url.searchParams.get('status') && url.searchParams.get('status') !== distribution.status ? [] : [distribution]
      return respond({ distributions: events, pagination: { ...pagination, total: events.length } })
    }
    if (path === '/distributions/event-1') return respond({ distribution })
    if (path.endsWith('/slots')) return respond({ slots: [slot], summary: { matchingSlotCount: 1, matchingCapacity: 2, sessionCount: 1 } })
    if (path.endsWith('/allocations')) return respond({ allocations: [], summary: { countsByStatus: { ALLOCATED: 2 }, totalAmount: '2' }, pagination })
    if (path.endsWith('/schedules')) return respond({ schedules: [alpha, beta].filter(row => !url.searchParams.get('status') || row.status === url.searchParams.get('status')), summary: { countsByStatus: reactivated ? { SCHEDULED: 2 } : { SCHEDULED: 1, CANCELLED: 1 }, matchingScheduleCount: 2, schedulableAllocationCount: 0 }, pagination })
    if (path.endsWith('/eligible-enrollments')) return respond({ enrollments: [], pagination, summary: { serviceAreas: [] } })
    if (path.endsWith('/qr-tokens')) return respond({ qrTokens: [], summary: {} })
    errors.push(`Unexpected API path: ${path}`)
    return route.fulfill({ status: 404, json: { error: { message: 'Unexpected fixture request' } } })
  })
  const base = `http://127.0.0.1:${vite.httpServer.address().port}`
  await page.goto(`${base}/distributions/manage?event=event-1&stage=queue`)
  await expect(page.getByText('1 cancelled schedule to review', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Schedule 1 remaining', exact: true })).toHaveCount(0)
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    const metrics = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth, overflow: [...document.querySelectorAll('main *')].filter(el => el.getBoundingClientRect().right > innerWidth + 1).slice(0, 5).map(el => ({ tag: el.tagName, className: el.className, text: el.textContent.slice(0, 60) })) }))
    assert.ok(metrics.scrollWidth <= width, JSON.stringify(metrics))
  }
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.getByRole('button', { name: 'Review cancelled schedules', exact: true }).click()
  await expect(page).toHaveURL(/\/admin\/schedules\?distribution=event-1&status=CANCELLED/)
  await expect(page.getByRole('button', { name: 'Assign remaining', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Reactivate', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Reactivate schedule', exact: true }).click()
  await expect(page.getByText('Schedule reactivated.', { exact: true })).toBeVisible()
  await page.goto(`${base}/distributions/manage?event=event-1&stage=queue`)
  await expect(page.getByText('2 of 2 allocations scheduled', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Review cancelled schedules', exact: true })).toHaveCount(0)
  assert.equal(reactivated, 1)
  assert.equal(generated, 0)
  assert.deepEqual(errors, [])
  console.log('PASS: cancelled schedule guidance, exact event/status handoff, existing reactivation confirmation, no duplicate generation, refreshed coverage, and mobile layout. Mock APIs only; no real schedule or SMS changed.')
} finally {
  await browser?.close()
  await vite.close()
}
