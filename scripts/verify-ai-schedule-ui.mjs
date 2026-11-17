import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium, expect } from '@playwright/test'
import { createServer } from 'vite'

// All endpoints, including AI inference and saving, use synthetic fixtures.
const output = resolve('../output/ai-schedule')
await mkdir(output, { recursive: true })
const vite = await createServer({ logLevel: 'error', cacheDir: 'node_modules/.vite-ai-schedule', define: { 'import.meta.env.VITE_API_URL': JSON.stringify('/api/v1') }, server: { host: '127.0.0.1', port: 0, hmr: false } })
const errors = []
let browser
try {
  await vite.listen()
  browser = await chromium.launch({ channel: 'chrome', headless: true })
  const origin = `http://127.0.0.1:${vite.httpServer.address().port}`
  for (const role of ['SYSTEM_ADMIN', 'BARANGAY_FACILITATOR']) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' })
    await context.addInitScript(role => {
      sessionStorage.setItem('garantiyaid.accessToken', 'ai-schedule-fixture')
      sessionStorage.setItem('garantiyaid.user', JSON.stringify({ userId: 'test-staff', role, fullName: 'Test Staff', barangayId: 'area-1' }))
    }, role)
    const barangay = { barangayId: 'area-1', barangayName: 'Demo barangay', serviceAreas: [] }
    const program = { programId: 'program-1', programCode: 'TEST', programName: 'Demo program', status: 'ACTIVE', grantAmount: '10' }
    const event = { distributionId: 'event-1', title: 'TEST AI schedule', barangay, barangayId: barangay.barangayId, program, programId: program.programId, status: 'DRAFT', distributionDate: '2099-12-11', startTime: '09:00', endTime: '10:00', slotDurationMinutes: 30, location: 'Demo hall', deliveryMode: 'PHYSICAL_GOODS', packageName: 'Demo package', packageUnit: 'set', packageQuantity: 1, verificationRequirement: 'QR' }
    const slots = [1, 2].map((number, index) => ({ slotId: `slot-${number}`, distributionId: event.distributionId, sessionId: 'session-1', sessionLabel: 'Morning session', serviceAreas: [], location: 'Demo hall', slotStart: `2099-12-11T09:${index ? '30' : '00'}:00+08:00`, slotEnd: `2099-12-11T${index ? '10:00' : '09:30'}:00+08:00`, capacity: 1, slotStatus: 'AVAILABLE', occupied: 0 }))
    const allocations = [1, 2].map(number => ({ allocationId: `allocation-${number}`, beneficiaryId: `person-${number}`, beneficiaryName: `Demo Beneficiary ${number}`, eligibleSlotIds: slots.map(slot => slot.slotId), beneficiary: { firstName: 'Demo', lastName: `Beneficiary ${number}`, barangay } }))
    const pagination = { page: 1, totalPages: 1, total: 2 }
    const saves = []
    let previews = 0, saved = false
    await context.route(/socket\.io/, route => route.abort())
    await context.routeWebSocket(/socket\.io/, () => {})
    await context.route('**/api/v1/**', async route => {
      const request = route.request(), url = new URL(request.url()), path = url.pathname.replace('/api/v1', '')
      const respond = data => route.fulfill({ json: { success: true, data } })
      if (path.endsWith('/schedules/ai-draft')) {
        previews++
        assert.equal(saves.length, 0, 'Preview cannot save appointments')
        if (previews === 1) return route.fulfill({ status: 503, json: { error: { code: 'AI_SCHEDULER_UNAVAILABLE', message: 'AI provider temporarily unavailable. No appointments were saved.' } } })
        return respond({ draftId: 'draft-1', expiresAt: new Date(Date.now() + 900_000).toISOString(), summary: 'Distribute one appointment into each eligible slot to balance occupancy.', model: 'synthetic-model', allocations, slots, assignments: allocations.map((allocation, index) => ({ allocationId: allocation.allocationId, slotId: slots[index].slotId })) })
      }
      if (path.endsWith('/schedules/ai-confirm')) {
        saves.push({ body: request.postDataJSON(), key: request.headers()['idempotency-key'] })
        assert.equal(saves.at(-1).body.confirmed, true)
        saved = true
        if (saves.length === 1) return route.fulfill({ status: 503, json: { error: { message: 'Response interrupted after saving.' } } })
        assert.deepEqual(saves[1], saves[0], 'Retry must preserve both assignments and key')
        return respond({ generatedScheduleCount: 2, assignedSlotCount: 2, draftId: 'draft-1' })
      }
      if (request.method() !== 'GET') { errors.push(`Unexpected write: ${path}`); return route.abort() }
      if (path === '/health') return respond({ timestamp: new Date().toISOString() })
      if (path === '/staff-notifications') return respond({ notifications: [], unreadCount: 0, pagination })
      if (path === '/programs') return respond({ programs: [program], pagination })
      if (path === '/barangays') return respond({ barangays: [barangay] })
      if (path === '/distributions') return respond({ distributions: !url.searchParams.get('status') || url.searchParams.get('status') === event.status ? [event] : [], pagination })
      if (path === '/distributions/event-1') return respond({ distribution: event })
      if (path.endsWith('/slots')) return respond({ slots, summary: { matchingSlotCount: 2, matchingCapacity: 2, sessionCount: 1 }, pagination })
      if (path.endsWith('/eligible-enrollments')) return respond({ enrollments: [], pagination: { ...pagination, total: 0 }, summary: { serviceAreas: [], unspecifiedServiceAreaCount: 0 } })
      if (path.endsWith('/allocations')) return respond({ allocations, summary: { countsByStatus: { ALLOCATED: 2 }, totalAmount: '20' }, pagination })
      if (path.endsWith('/schedules')) return respond({ schedules: saved ? saves[0].body.assignments.map((row, index) => ({ scheduleId: `schedule-${index}`, ...row, status: 'SCHEDULED', queueNumber: 1, assignedByAi: false, beneficiary: allocations[index].beneficiary, slot: slots.find(slot => slot.slotId === row.slotId) })) : [], summary: { countsByStatus: { SCHEDULED: saved ? 2 : 0 }, matchingScheduleCount: saved ? 2 : 0, schedulableAllocationCount: saved ? 0 : 2 }, pagination })
      if (path.endsWith('/qr-tokens')) return respond({ qrTokens: [], summary: {} })
      if (path.endsWith('/qr-eligible-schedules')) return respond({ schedules: [], summary: { qrEligibleScheduleCount: 0 } })
      errors.push(`Unexpected read: ${path}`)
      return route.fulfill({ status: 404, json: { error: { message: 'Missing test fixture' } } })
    })
    const page = await context.newPage()
    page.setDefaultTimeout(12_000)
    page.on('pageerror', error => errors.push(error.message))
    const path = role === 'SYSTEM_ADMIN' ? '/distributions/manage?event=event-1&stage=queue' : '/facilitator/queue?distribution=event-1'
    await page.goto(`${origin}${path}`)
    await page.getByRole('button', { name: 'Generate AI draft', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Review AI schedule draft' })
    await expect(dialog.getByRole('alert')).toContainText('AI provider temporarily unavailable')
    await expect(dialog.getByRole('button', { name: 'Confirm and save draft schedule', exact: true })).toHaveCount(0)
    await dialog.getByRole('button', { name: 'Try AI again' }).click()
    const save = dialog.getByRole('button', { name: 'Confirm and save draft schedule', exact: true })
    await expect(save).toBeDisabled()
    await expect(dialog.getByText('Distribute one appointment into each eligible slot to balance occupancy.')).toBeVisible()
    const consent = dialog.getByRole('checkbox')
    await consent.check()
    await dialog.getByLabel('Time slot for Demo Beneficiary 1', { exact: true }).selectOption('slot-2')
    await expect(consent).not.toBeChecked()
    await expect(dialog.getByRole('alert')).toContainText('over capacity')
    await expect(save).toBeDisabled()
    await dialog.getByLabel('Time slot for Demo Beneficiary 2', { exact: true }).selectOption('slot-1')
    await expect(dialog.getByRole('alert')).toHaveCount(0)
    await consent.check()
    for (const [width, height] of [[375, 900], [812, 375], [1440, 1000]]) {
      await page.setViewportSize({ width, height })
      await expect.poll(() => dialog.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true)
    }
    await page.screenshot({ path: resolve(output, `${role}-review.png`), fullPage: true })
    await save.click()
    await expect(dialog.getByRole('alert')).toContainText('result is not yet confirmed')
    await expect(dialog.getByLabel('Time slot for Demo Beneficiary 1', { exact: true })).toBeDisabled()
    await dialog.getByRole('button', { name: 'Retry same save', exact: true }).click()
    await expect(dialog).not.toBeVisible()
    await expect(page.getByRole('main').getByText('2 appointments saved from the reviewed AI draft. The event is still a draft.', { exact: true })).toBeVisible()
    assert.equal(saves.length, 2)
    assert.equal(event.status, 'DRAFT')
    event.status = 'OPEN'
    await page.reload()
    await expect(page.getByRole('button', { name: 'Generate AI draft', exact: true })).toHaveCount(0)
    await context.close()
  }
  assert.deepEqual(errors, [])
  console.log('PASS: Admin/Barangay AI review, provider errors, editable drafts, capacity checks, explicit consent, idempotent save recovery, open-event lock and 375/812/1440 layouts. Synthetic API only.')
} finally {
  await browser?.close()
  await vite.close()
}
