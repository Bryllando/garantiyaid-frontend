import assert from 'node:assert/strict'
import { chromium } from '@playwright/test'
import { createServer } from 'vite'

const vite = await createServer({ server: { host: '127.0.0.1', port: 0 } })
await vite.listen()
const baseUrl = `http://127.0.0.1:${vite.httpServer.address().port}`
const browser = await chromium.launch({ headless: true, channel: 'chrome' })
try {
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 })
const errors = []
page.on('pageerror', (error) => errors.push(error.message))
page.on('console', (message) => { if (message.type() === 'error' && !message.text().includes('WebSocket')) console.error(message.text()) })
await page.addInitScript(() => {
  sessionStorage.setItem('garantiyaid.accessToken', 'preview-token')
  sessionStorage.setItem('garantiyaid.user', JSON.stringify({ userId: 'staff-1', role: 'SYSTEM_ADMIN', fullName: 'System Administrator', email: 'admin@example.gov.ph' }))
})

const barangay = { barangayId: 'barangay-1', barangayName: 'Poblacion', city: 'Sample City' }
const programs = Array.from({ length: 15 }, (_, index) => ({ programId: `program-${index + 1}`, programCode: `AID-${index + 1}`, programName: index === 0 ? 'Community Assistance' : `Assistance Program ${index + 1}`, programType: 'CASH_ASSISTANCE', status: 'ACTIVE', grantAmount: '1500', budgetAmount: '150000', applicationStartDate: '2026-09-01', applicationEndDate: '2026-12-31', description: 'Support for eligible households.', criteria: [{ criterionId: 'criterion-1', criterionName: 'Age requirement', fieldName: 'AGE', operator: 'GREATER_THAN_OR_EQUAL', expectedValue: 18, isRequired: true }], requiredDocumentTypes: ['VALID_ID'] }))
const distributions = Array.from({ length: 15 }, (_, index) => ({ distributionId: `event-${index + 1}`, programId: 'program-1', program: programs[0], barangayId: barangay.barangayId, barangay, title: `Distribution Event ${index + 1}`, distributionDate: '2026-10-10', startTime: '08:00', endTime: '12:00', slotDurationMinutes: 30, location: 'Barangay Hall', deliveryMode: 'PHYSICAL_GOODS', verificationRequirement: 'QR', status: 'DRAFT' }))
const pagination = (total) => ({ page: 1, totalPages: 1, total })

await page.route('http://localhost:4000/api/v1/**', async (route) => {
  const url = new URL(route.request().url())
  const path = url.pathname.replace('/api/v1', '')
  let data = {}
  if (path === '/health') data = { timestamp: new Date().toISOString() }
  else if (path === '/barangays') data = { barangays: [barangay] }
  else if (path === '/programs') {
    const items = url.searchParams.get('status') === 'ACTIVE' ? programs.slice(0, 1) : programs
    data = { programs: items, pagination: pagination(items.length) }
  }
  else if (path.startsWith('/programs/')) data = { program: programs.find((program) => program.programId === path.split('/')[2]) }
  else if (path === '/distributions') {
    const items = url.searchParams.has('programId') ? [] : distributions
    data = { distributions: items, pagination: pagination(items.length) }
  }
  else if (path.startsWith('/distributions/event-')) {
    const [, , eventId, resource] = path.split('/')
    const distribution = distributions.find((item) => item.distributionId === eventId)
    if (!resource) data = { distribution }
    else if (resource === 'slots') data = { slots: [], summary: { matchingSlotCount: 0, matchingCapacity: 0, sessionCount: 0 } }
    else if (resource === 'allocations') data = { allocations: [], summary: { countsByStatus: {}, totalAmount: '0' } }
    else if (resource === 'schedules') data = { schedules: [], summary: { countsByStatus: {}, matchingScheduleCount: 0 } }
    else if (resource === 'qr-tokens') data = { qrTokens: [], summary: { matchingTokenCount: 0 } }
    else if (resource === 'eligible-enrollments') data = { enrollments: [], pagination: pagination(0), allocationAmount: '1500', summary: { serviceAreas: [], unspecifiedServiceAreaCount: 0 } }
  }
  await route.fulfill({ json: { data } })
})
await page.route('**/socket.io/**', (route) => route.abort())

await page.goto(`${baseUrl}/programs`)
await page.getByRole('heading', { name: 'Program registry' }).waitFor()
await page.getByRole('button', { name: /Assistance Program 2/ }).click()
await page.waitForTimeout(100)
assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), 'Selected program')
assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)

await page.getByRole('link', { name: 'Plan distribution' }).click()
await page.getByRole('heading', { name: 'Create distribution event' }).waitFor()
assert.equal(await page.locator('#distribution-program').inputValue(), 'program-2')
assert.equal(new URL(page.url()).searchParams.has('create'), false)
assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)

await page.getByRole('button', { name: 'Close distribution form' }).click()
await page.setViewportSize({ width: 1440, height: 900 })
await page.waitForTimeout(350)
assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)

await page.setViewportSize({ width: 390, height: 844 })
await page.goto(`${baseUrl}/distributions/manage`)
await page.getByRole('heading', { name: 'Event register' }).waitFor()
await page.getByRole('button', { name: /Distribution Event 2/ }).click()
await page.waitForTimeout(100)
assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), 'Selected distribution event')
assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)

await page.goto(`${baseUrl}/programs`)
await page.getByRole('heading', { name: 'Program registry' }).waitFor()
await page.getByRole('button', { name: 'Create program' }).click()
await page.locator('#program-name').fill('New Aid')
await page.locator('#program-code').fill('AID-NEW')
await page.locator('#program-type').fill('CASH_ASSISTANCE')
await page.locator('#program-grant').fill('2000')
await page.locator('#program-budget').fill('1000')
await page.getByRole('button', { name: 'Create draft program' }).click()
await page.getByRole('alert', { name: '' }).filter({ hasText: 'Program budget cannot be lower' }).waitFor()

await page.setViewportSize({ width: 320, height: 700 })
await page.waitForTimeout(350)
assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
assert.deepEqual(errors, [])
console.log('Program to distribution handoff check passed')
} finally {
  await browser.close()
  await vite.close()
}
