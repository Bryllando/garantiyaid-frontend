import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium, expect } from '@playwright/test'
import { createServer } from 'vite'
import { generateDistributionSlotsSchema } from '../../garantiyaid-backend/src/modules/distributions/distributionSlot.schemas.js'

// Synthetic API fixtures only; this check never changes a saved event.
const output = resolve('../output/barangay-sessions')
await mkdir(output, { recursive: true })
const vite = await createServer({ logLevel: 'error', cacheDir: 'node_modules/.vite-barangay-sessions', define: { 'import.meta.env.VITE_API_URL': JSON.stringify('/api/v1') }, server: { host: '127.0.0.1', port: 0, hmr: false } })
const barangay = { barangayId: 'barangay-1', barangayName: 'Demo barangay', serviceAreas: ['Purok 1'] }
const event = { distributionId: 'event-1', barangay, barangayId: barangay.barangayId, title: 'TEST service sessions', status: 'DRAFT', distributionDate: '2099-12-11', startTime: '08:00', endTime: '09:00', slotDurationMinutes: 30, location: 'Demo hall', deliveryMode: 'PHYSICAL_GOODS', verificationRequirement: 'QR' }
const second = { ...event, distributionId: 'event-2', title: 'TEST second event', location: 'Second hall' }
const summary = slots => ({ matchingSlotCount: slots.length, matchingCapacity: slots.reduce((sum, slot) => sum + slot.capacity, 0), sessionCount: new Set(slots.map(slot => slot.sessionId)).size })
const pagination = { page: 1, totalPages: 1, total: 0 }
let browser, failLoad = true, failGenerate = true, releaseGeneration, slots = []
const errors = [], writes = []
try {
  await vite.listen()
  browser = await chromium.launch({ channel: 'chrome', headless: true })
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' })
  page.setDefaultTimeout(10_000)
  page.on('pageerror', error => errors.push(error.message))
  await page.addInitScript(() => {
    sessionStorage.setItem('garantiyaid.accessToken', 'barangay-session-fixture')
    sessionStorage.setItem('garantiyaid.user', JSON.stringify({ userId: 'facilitator', fullName: 'Test Facilitator', role: 'BARANGAY_FACILITATOR', barangayId: 'barangay-1' }))
  })
  await page.route(/socket\.io/, route => route.abort())
  await page.routeWebSocket(/socket\.io/, () => {})
  await page.route('**/api/v1/**', async route => {
    const req = route.request(), url = new URL(req.url()), path = url.pathname.replace('/api/v1', '')
    const respond = data => route.fulfill({ json: { success: true, data } })
    const fail = (status, message) => route.fulfill({ status, json: { error: { message } } })
    if (req.method() !== 'GET') {
      writes.push({ path, method: req.method(), body: req.postDataJSON() })
      if (path === '/distributions/event-1/slots/generate') {
        const body = req.postDataJSON()
        generateDistributionSlotsSchema.parse(body)
        if (failGenerate) return fail(409, 'A service session overlaps another event. Choose another time.')
        await new Promise(resolve => { releaseGeneration = resolve })
        slots = body.sessions.flatMap((session, index) => {
          const start = new Date(`${session.date}T${session.startTime}:00+08:00`).getTime()
          const end = new Date(`${session.date}T${session.endTime}:00+08:00`).getTime()
          return Array.from({ length: (end - start) / 1_800_000 }, (_, i) => ({ slotId: `slot-${index}-${i}`, sessionId: `session-${index}`, sessionLabel: session.label, location: session.location, serviceAreas: session.serviceAreas, capacity: session.capacity, slotStatus: 'AVAILABLE', slotStart: new Date(start + i * 1_800_000).toISOString(), slotEnd: new Date(start + (i + 1) * 1_800_000).toISOString() }))
        })
        return respond({ slots, summary: summary(slots) })
      }
      if (req.method() === 'PATCH' && path === '/distributions/event-1/slots/slot-0-0') {
        const { capacity } = req.postDataJSON()
        if (capacity < 3) return fail(409, 'Three beneficiaries are already scheduled in this slot.')
        slots[0].capacity = capacity
        return respond({ slot: slots[0] })
      }
      errors.push(`Unexpected write: ${path}`)
      return fail(400, 'Unexpected fixture write')
    }
    if (path === '/health') return respond({ timestamp: new Date().toISOString() })
    if (path === '/staff-notifications') return respond({ notifications: [], unreadCount: 0, pagination })
    if (path === '/distributions') return respond({ distributions: [event, second].filter(item => item.status === url.searchParams.get('status')), pagination })
    if (path === '/distributions/event-1') return respond({ distribution: event })
    if (path.endsWith('/slots')) {
      if (failLoad) return fail(503, 'Service sessions are temporarily unavailable.')
      const rows = path.includes('event-1') ? slots : []
      return respond({ slots: rows, summary: summary(rows), pagination })
    }
    if (path.endsWith('/eligible-enrollments')) return respond({ enrollments: [], pagination, summary: { serviceAreas: [{ name: 'Purok 1', count: 3 }], unspecifiedServiceAreaCount: 0 } })
    if (path.endsWith('/schedules')) return respond({ schedules: [], summary: { countsByStatus: {}, schedulableAllocationCount: 0 }, pagination })
    errors.push(`Unexpected read: ${path}`)
    return fail(404, 'Unexpected fixture request')
  })
  const origin = `http://127.0.0.1:${vite.httpServer.address().port}`
  await page.goto(`${origin}/facilitator/queue?distribution=event-1`)
  await expect(page.getByText('Service sessions are temporarily unavailable.', { exact: true })).toBeVisible()
  failLoad = false
  await page.getByRole('button', { name: 'Reload service sessions' }).click()
  await expect(page.getByRole('form', { name: 'Service session plan' })).toBeVisible()
  for (const [width, height] of [[375, 900], [812, 375], [1440, 1000]]) {
    await page.setViewportSize({ width, height })
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
  await page.screenshot({ path: resolve(output, 'planner-desktop.png'), fullPage: true })
  await page.getByLabel('End time', { exact: true }).fill('09:10')
  await page.getByRole('button', { name: 'Generate 1 session', exact: true }).click()
  await expect(page.getByRole('alert').filter({ hasText: 'divide evenly' })).toBeVisible()
  assert.equal(writes.length, 0)
  await page.getByLabel('End time', { exact: true }).fill('09:00')
  await page.getByRole('button', { name: 'Generate 1 session', exact: true }).click()
  await expect(page.getByRole('alert').filter({ hasText: 'overlaps another event' })).toBeVisible()
  failGenerate = false
  await page.getByRole('button', { name: 'Generate 1 session', exact: true }).click()
  await expect.poll(() => Boolean(releaseGeneration)).toBe(true)
  await expect(page.getByLabel('Distribution event', { exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Generating sessions...' })).toBeDisabled()
  releaseGeneration()
  await expect(page.getByText('1 service session · 2 time slots · 20 places', { exact: true })).toBeVisible()
  await expect(page.getByRole('form', { name: 'Service session plan' })).toHaveCount(0)
  await page.getByText('View time slots and edit capacity', { exact: true }).click()
  await page.getByRole('button', { name: /Edit capacity for/ }).first().click()
  const dialog = page.getByRole('dialog', { name: 'Edit time-slot capacity' })
  await dialog.getByLabel('Beneficiaries in this time slot').fill('2')
  await dialog.getByRole('button', { name: 'Save capacity', exact: true }).click()
  await expect(dialog.getByRole('alert')).toHaveText('Three beneficiaries are already scheduled in this slot.')
  await dialog.getByLabel('Beneficiaries in this time slot').fill('12')
  await dialog.getByRole('button', { name: 'Save capacity', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await expect(page.getByText('1 service session · 2 time slots · 22 places', { exact: true })).toBeVisible()
  await page.setViewportSize({ width: 375, height: 900 })
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: resolve(output, 'capacity-mobile.png'), fullPage: true })
  await page.getByLabel('Distribution event', { exact: true }).selectOption('event-2')
  await expect(page.getByRole('form', { name: 'Service session plan' })).toBeVisible()
  await expect(page.getByLabel('Venue', { exact: true })).toHaveValue('Second hall')
  await page.getByLabel('Distribution event', { exact: true }).selectOption('event-1')
  await expect(page.getByText('1 service session · 2 time slots · 22 places', { exact: true })).toBeVisible()
  event.status = 'OPEN'
  await page.getByRole('button', { name: 'Refresh queue', exact: true }).click()
  await expect(page.getByText('Sessions and capacity are locked because this event is open.', { exact: true })).toBeVisible()
  await expect(page.getByText('View time slots', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: /Edit capacity for/ })).toHaveCount(0)
  assert.equal(writes.length, 4)
  assert.deepEqual(errors, [])
  console.log('PASS: Barangay slot generation, capacity editing, validation, failed-load retry, save errors, busy controls, event switching, open-event lock and responsive layouts. Mock API only.')
} finally {
  await browser?.close()
  await vite.close()
}
