import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium, expect } from '@playwright/test'
import { createServer } from 'vite'
import { generateDistributionSlotsSchema } from '../../garantiyaid-backend/src/modules/distributions/distributionSlot.schemas.js'

// All API requests use synthetic fixtures; no live event or appointment is changed.
const output = resolve('../output/session-planner')
await mkdir(output, { recursive: true })
const vite = await createServer({ cacheDir: '../tmp/session-planner-vite', server: { host: '127.0.0.1', port: 0 } })
await vite.listen()
const origin = `http://127.0.0.1:${vite.httpServer.address().port}`
let browser
try {
  browser = await chromium.launch({ headless: true, channel: 'chrome' })
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  page.setDefaultTimeout(10_000)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.addInitScript(() => {
    sessionStorage.setItem('garantiyaid.accessToken', 'session-planner-fixture')
    sessionStorage.setItem('garantiyaid.user', JSON.stringify({ userId: 'test-admin', role: 'SYSTEM_ADMIN', fullName: 'Test Administrator' }))
  })
  const errors = [], writes = []
  page.on('pageerror', error => errors.push(error.message))
  const program = { programId: '11111111-1111-4111-8111-111111111111', programCode: 'FOOD-2026', programName: 'Community Food Assistance', status: 'ACTIVE', grantAmount: '1000' }
  const barangay = { barangayId: '22222222-2222-4222-8222-222222222222', barangayName: 'San Nicolas', city: 'Cebu City' }
  const event = { distributionId: '33333333-3333-4333-8333-333333333333', title: 'Community distribution', programId: program.programId, program, barangayId: barangay.barangayId, barangay, status: 'DRAFT', distributionDate: '2099-11-11', startTime: '08:00', endTime: '12:00', slotDurationMinutes: 40, location: 'San Nicolas Barangay Hall', verificationRequirement: 'QR', deliveryMode: 'PHYSICAL_GOODS', packageName: 'Food pack', packageUnit: 'pack', packageQuantity: 1 }
  let slots = [], unspecified = 0, areas = [{ name: 'Sitio Riverside', count: 7 }, { name: 'Purok 2', count: 5 }]
  let hold = false, fail = false, release
  const pagination = total => ({ page: 1, totalPages: 1, total })
  const slotSummary = () => ({ matchingSlotCount: slots.length, matchingCapacity: slots.reduce((total, slot) => total + slot.capacity, 0), sessionCount: new Set(slots.map(slot => slot.sessionId)).size })
  await page.route('**/socket.io/**', route => route.abort())
  await page.routeWebSocket(/socket\.io/, () => {})
  await page.route('**/api/v1/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname.replace('/api/v1', '')
    let data
    if (request.method() !== 'GET') {
      assert.equal(path, `/distributions/${event.distributionId}/slots/generate`)
      const body = request.postDataJSON()
      generateDistributionSlotsSchema.parse(body)
      assert.ok(body.sessions.every(session => !Object.hasOwn(session, 'clientId')), 'Client-side row keys must never enter the API payload')
      writes.push(body)
      if (hold) await new Promise(resolve => { release = resolve })
      if (fail) return route.fulfill({ status: 409, json: { error: { message: 'A session overlaps another event. Choose another time.' } } })
      slots = body.sessions.flatMap((session, index) => {
        const start = new Date(`${session.date}T${session.startTime}:00+08:00`).getTime()
        const end = new Date(`${session.date}T${session.endTime}:00+08:00`).getTime()
        return Array.from({ length: (end - start) / (40 * 60_000) }, (_, slot) => ({ slotId: `slot-${index}-${slot}`, sessionId: `session-${index}`, sessionLabel: session.label, serviceAreas: session.serviceAreas, location: session.location, capacity: session.capacity, slotStatus: 'AVAILABLE', slotStart: new Date(start + slot * 40 * 60_000).toISOString(), slotEnd: new Date(start + (slot + 1) * 40 * 60_000).toISOString() }))
      })
      return route.fulfill({ json: { data: { slots, summary: slotSummary() } } })
    }
    if (path === '/health') data = { timestamp: new Date().toISOString() }
    else if (path === '/staff-notifications') data = { notifications: [], unreadCount: 0 }
    else if (path === '/programs') data = { programs: [program], pagination: pagination(1) }
    else if (path === '/barangays') data = { barangays: [barangay] }
    else if (path === '/distributions') data = { distributions: [event], pagination: pagination(1) }
    else if (path === `/distributions/${event.distributionId}`) data = { distribution: event }
    else if (path.endsWith('/slots')) data = { slots, summary: slotSummary(), pagination: pagination(slots.length) }
    else if (path.endsWith('/allocations')) data = { allocations: [], summary: { countsByStatus: {}, totalAmount: '0' } }
    else if (path.endsWith('/schedules')) data = { schedules: [], summary: { countsByStatus: {}, matchingScheduleCount: 0 } }
    else if (path.endsWith('/qr-tokens')) data = { qrTokens: [], summary: { matchingTokenCount: 0 } }
    else if (path.endsWith('/eligible-enrollments')) data = { enrollments: [], pagination: pagination(areas.reduce((sum, area) => sum + area.count, unspecified)), summary: { serviceAreas: areas, unspecifiedServiceAreaCount: unspecified } }
    else throw new Error(`Unhandled fixture: ${path}`)
    await route.fulfill({ json: { data } })
  })
  const plan = page.getByRole('form', { name: 'Service session plan' })
  const row = number => plan.getByRole('group', { name: `Service session ${number}`, exact: true })
  const whole = plan.getByRole('radio', { name: 'Whole barangay', exact: true })
  const byArea = plan.getByRole('radio', { name: 'By Sitio / Purok', exact: true })
  const generate = () => plan.getByRole('button', { name: /^Generate \d+ sessions?$/ })
  async function reset() {
    slots = []
    await page.setViewportSize({ width: 1440, height: 1000 })
    await page.goto(`${origin}/distributions/manage?event=${event.distributionId}&stage=sessions`)
    await expect(plan).toBeVisible()
  }

  await reset()
  await expect(whole).toBeChecked()
  await expect(row(1)).toContainText('6 time slots × 10 people = 60 places')
  await expect(plan).toContainText('This does not automatically include every resident')
  await expect(plan.getByText('Ready check:', { exact: true })).toHaveCount(0)
  const date = row(1).getByLabel('Date', { exact: true })
  await date.focus(); await date.fill('2099-11-12')
  await expect(date).toBeFocused()
  await date.fill(event.distributionDate)
  await row(1).getByLabel('Beneficiaries per slot', { exact: true }).fill('1')
  await expect(row(1)).toContainText('6 time slots × 1 person = 6 places')
  await expect(plan).toContainText('Increase capacity if you plan to include everyone')
  await row(1).getByLabel('Beneficiaries per slot', { exact: true }).fill('10')
  await row(1).getByLabel('End time', { exact: true }).fill('11:30')
  await generate().click()
  await expect(plan.getByRole('alert')).toBeFocused()
  await expect(plan.getByRole('alert')).toContainText('40-minute slots')
  await row(1).getByLabel('End time', { exact: true }).fill('12:00')
  await byArea.check()
  await generate().click()
  await expect(plan.getByRole('alert')).toContainText('Choose at least one')
  await row(1).getByRole('checkbox', { name: 'Sitio Riverside', exact: true }).check()
  await generate().click()
  await expect(plan.getByRole('alert')).toContainText('Still missing: Purok 2')
  await row(1).getByRole('checkbox', { name: 'Purok 2', exact: true }).check()
  await whole.check(); await byArea.check()
  await expect(row(1).getByRole('checkbox', { name: 'Sitio Riverside', exact: true })).toBeChecked()
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 })
    await plan.evaluate(element => element.scrollIntoView({ block: 'start' }))
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true)
    await page.screenshot({ path: `${output}/coverage-${width}.png` })
    await row(1).evaluate(element => element.scrollIntoView({ block: 'start' }))
    await page.screenshot({ path: `${output}/session-${width}.png` })
  }

  await whole.check()
  await plan.getByRole('button', { name: 'Add another service session', exact: true }).click()
  await expect(row(2).getByLabel('Session label', { exact: true })).toBeFocused()
  await expect(row(2).getByLabel('Date', { exact: true })).toHaveValue('2099-11-12')
  await row(2).getByLabel('Session label', { exact: true }).fill('Afternoon distribution')
  await row(2).getByLabel('Date', { exact: true }).fill(event.distributionDate)
  await generate().click()
  await expect(plan.getByRole('alert')).toContainText('cannot overlap')
  await row(2).getByLabel('Start time', { exact: true }).fill('12:00')
  await row(2).getByLabel('End time', { exact: true }).fill('13:20')
  await row(1).getByRole('button', { name: 'Remove service session 1' }).click()
  await expect(row(1).getByLabel('Session label', { exact: true })).toHaveValue('Afternoon distribution')
  await expect(row(1).getByLabel('Session label', { exact: true })).toBeFocused()
  await row(1).getByLabel('Start time', { exact: true }).fill('08:00')
  await row(1).getByLabel('End time', { exact: true }).fill('12:00')
  hold = true; fail = true
  await generate().evaluate(button => { button.click(); button.click() })
  await expect.poll(() => writes.length).toBe(1)
  await expect(row(1).getByLabel('Session label', { exact: true })).toBeDisabled()
  await expect(byArea).toBeDisabled()
  assert.deepEqual(writes[0].sessions[0].serviceAreas, [], 'Whole barangay never sends hidden area selections')
  release(); hold = false
  await expect(plan.getByRole('alert')).toBeFocused()
  await expect(plan.getByRole('alert')).toContainText('overlaps another event')
  await expect(row(1).getByLabel('Session label', { exact: true })).toHaveValue('Afternoon distribution')
  fail = false
  await generate().click()
  await expect(plan).toHaveCount(0)
  await page.getByRole('navigation', { name: 'Distribution setup stages' }).getByRole('button').first().click()
  await expect(page.getByText('Whole barangay · shared queue for any Sitio/Purok', { exact: true })).toBeVisible()
  assert.equal(slots.length, 6)

  await reset(); await byArea.check()
  await row(1).getByRole('checkbox', { name: 'Sitio Riverside', exact: true }).check()
  await row(1).getByRole('checkbox', { name: 'Purok 2', exact: true }).check()
  await generate().click(); await expect(plan).toHaveCount(0)
  assert.deepEqual(writes.at(-1).sessions[0].serviceAreas, areas.map(area => area.name))

  unspecified = 1; areas = []
  await reset(); await byArea.check()
  await expect(plan).toContainText('No Sitio/Purok is recorded')
  await generate().click()
  await expect(plan.getByRole('alert')).toContainText('Update the Sitio/Purok of 1')
  const writesBefore = writes.length
  await whole.focus(); await page.keyboard.press('Space')
  await expect(whole).toBeChecked()
  assert.equal(writes.length, writesBefore)
  await plan.getByRole('button', { name: 'Add another service session' }).evaluate(button => { for (let i = 0; i < 29; i++) button.click() })
  await expect(plan.getByRole('button', { name: 'Add another service session' })).toBeDisabled()
  await expect(row(30)).toBeVisible()
  assert.deepEqual(errors, [])
  console.log(`PASS session planner: coverage explanations, capacity math, stable field focus, preserved area choices, validation, add/remove, duplicate-submit guard, backend-valid payloads, retry recovery and 320–1440px layouts. Screenshots: ${output}`)
} finally { await browser?.close(); await vite.close() }
