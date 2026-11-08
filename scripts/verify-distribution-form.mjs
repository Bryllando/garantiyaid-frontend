import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium, expect } from '@playwright/test'
import { createServer } from 'vite'
import { createDistributionSchema, updateDistributionSchema, VERIFICATION_REQUIREMENTS } from '../../garantiyaid-backend/src/modules/distributions/distribution.schemas.js'

// Every API request is intercepted; saves only update these synthetic fixtures.
const output = resolve('../output/distribution-form')
await mkdir(output, { recursive: true })
const vite = await createServer({ cacheDir: '../tmp/distribution-form-vite', server: { host: '127.0.0.1', port: 0 } })
await vite.listen()
const origin = `http://127.0.0.1:${vite.httpServer.address().port}`
let browser
try {
  browser = await chromium.launch({ headless: true, channel: 'chrome' })
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  page.setDefaultTimeout(10_000)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const errors = [], writes = [], events = []
  let failSave = false, holdSave = false, releaseSave
  page.on('pageerror', error => errors.push(error.message))
  await page.addInitScript(() => {
    sessionStorage.setItem('garantiyaid.accessToken', 'synthetic-distribution-form')
    sessionStorage.setItem('garantiyaid.user', JSON.stringify({ userId: 'admin-test', role: 'SYSTEM_ADMIN', fullName: 'Test Administrator' }))
  })
  const program = { programId: '11111111-1111-4111-8111-111111111111', programName: 'Community Food Assistance', programCode: 'FOOD-2026', status: 'ACTIVE', grantAmount: '1000', budgetAmount: '100000' }
  const barangay = { barangayId: '22222222-2222-4222-8222-222222222222', barangayName: 'San Nicolas', city: 'Cebu City', isActive: true }
  const pagination = total => ({ page: 1, totalPages: total ? 1 : 0, total })
  await page.route('**/socket.io/**', route => route.abort())
  await page.routeWebSocket(/socket\.io/, () => {})
  await page.route('**/api/v1/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname.replace('/api/v1', '')
    let data
    if (request.method() !== 'GET') {
      assert.ok(path === '/distributions' || /^\/distributions\/44444444-/.test(path), `Unexpected write: ${path}`)
      const body = request.postDataJSON()
      assert.equal(request.headers().authorization, 'Bearer synthetic-distribution-form')
      const schema = request.method() === 'PATCH' ? updateDistributionSchema : createDistributionSchema
      schema.parse(body)
      writes.push({ method: request.method(), body })
      if (holdSave) await new Promise(resolve => { releaseSave = resolve })
      if (failSave) return route.fulfill({ status: 503, json: { error: { message: 'Test: event could not be saved. Please retry.' } } })
      let saved = events.find(event => path.endsWith(`/${event.distributionId}`))
      if (saved) Object.assign(saved, body)
      else {
        saved = { ...body, distributionId: `44444444-4444-4444-8444-${String(events.length + 1).padStart(12, '0')}`, status: 'DRAFT', program, barangay, createdAt: new Date().toISOString() }
        events.push(saved)
      }
      return route.fulfill({ status: request.method() === 'PATCH' ? 200 : 201, json: { success: true, data: { distribution: saved } } })
    }
    if (path === '/health') data = { timestamp: new Date().toISOString() }
    else if (path === '/staff-notifications') data = { notifications: [], unreadCount: 0 }
    else if (path === '/programs') data = { programs: [program], pagination: pagination(1) }
    else if (path === '/barangays') data = { barangays: [barangay] }
    else if (path === '/distributions') data = { distributions: events, pagination: pagination(events.length) }
    else if (path.startsWith('/distributions/')) {
      const [, , eventId, resource] = path.split('/')
      if (!resource) data = { distribution: events.find(event => event.distributionId === eventId) }
      else if (resource === 'slots') data = { slots: [], summary: { matchingSlotCount: 0, matchingCapacity: 0, sessionCount: 0 } }
      else if (resource === 'allocations') data = { allocations: [], summary: { countsByStatus: {}, totalAmount: '0' } }
      else if (resource === 'schedules') data = { schedules: [], summary: { countsByStatus: {}, matchingScheduleCount: 0 } }
      else if (resource === 'qr-tokens') data = { qrTokens: [], summary: { matchingTokenCount: 0 } }
      else if (resource === 'eligible-enrollments') data = { enrollments: [], pagination: pagination(0), allocationAmount: '1000', summary: { serviceAreas: [], unspecifiedServiceAreaCount: 0 } }
      else throw new Error(`Unhandled distribution resource: ${path}`)
    } else throw new Error(`Unhandled distribution fixture: ${path}`)
    await route.fulfill({ json: { success: true, data } })
  })

  const dialog = page.getByRole('dialog')
  const verification = dialog.getByRole('group', { name: 'Allowed verification methods', exact: true })
  const guide = dialog.getByRole('region', { name: 'At the claim desk', exact: true })
  const expectedChecks = { QR: 1, BIOMETRIC: 1, QR_AND_BIOMETRIC: 2, QR_OR_BIOMETRIC: 2, BIOMETRIC_AND_SIGNATURE: 2 }
  const expectedLabels = { QR: 'QR code only', BIOMETRIC: 'Live face match', QR_AND_BIOMETRIC: 'QR code + live face match (both required)', QR_OR_BIOMETRIC: 'QR code OR live face match', BIOMETRIC_AND_SIGNATURE: 'Live face match + signature' }
  for (const method of VERIFICATION_REQUIREMENTS) {
    await page.setViewportSize({ width: 1440, height: 1000 })
    await page.goto(origin + '/distributions/manage?create=1')
    await expect(dialog.getByRole('heading', { name: 'Create distribution event', exact: true })).toBeVisible()
    await expect(dialog.locator('#distribution-verification')).toBeAttached()
    await expect(dialog.locator('select#distribution-verification')).toHaveCount(0)
    await expect(verification.getByRole('checkbox', { name: 'QR code', exact: true })).toBeChecked()
    await expect(dialog.locator('input[name="verificationRequirement"]')).toHaveCount(0)
    await dialog.getByRole('button', { name: 'Review event details', exact: true }).click()
    await expect(dialog.getByLabel('Event title', { exact: true })).toBeFocused()
    await dialog.getByLabel('Event title', { exact: true }).fill(`TEST event — ${method}`)
    await dialog.getByLabel('Active assistance program', { exact: true }).selectOption(program.programId)
    await dialog.getByLabel('Service barangay', { exact: true }).selectOption(barangay.barangayId)
    await dialog.getByLabel('Venue or location', { exact: true }).fill('San Nicolas covered court')
    await dialog.getByLabel('Package or item name', { exact: true }).fill('Family food pack')
    await dialog.getByLabel('Quantity per beneficiary', { exact: true }).fill('3')
    if (method !== 'QR') {
      await verification.getByRole('checkbox', { name: 'Live face match', exact: true }).check()
      if (['BIOMETRIC', 'BIOMETRIC_AND_SIGNATURE'].includes(method)) await verification.getByRole('checkbox', { name: 'QR code', exact: true }).uncheck()
      if (method === 'QR_AND_BIOMETRIC') await verification.getByRole('checkbox', { name: /^Require both methods/ }).check()
      if (method === 'BIOMETRIC_AND_SIGNATURE') {
        await verification.getByRole('checkbox', { name: /^Require a signature/ }).check()
        await expect(verification.getByRole('checkbox', { name: 'QR code', exact: true })).toBeDisabled()
      }
    }
    await expect(verification.getByRole('status')).toHaveText(expectedLabels[method])
    await expect(guide.getByRole('list', { name: 'Verification steps' }).getByRole('listitem')).toHaveCount(expectedChecks[method])
    await dialog.locator('details > summary').click()
    await expect(dialog.getByText('Lost or damaged QR credential', { exact: true })).toHaveCount(['QR', 'QR_AND_BIOMETRIC', 'QR_OR_BIOMETRIC'].includes(method) ? 1 : 0)
    await expect(dialog.getByText('Face profile, camera, or matching issue', { exact: true })).toHaveCount(method === 'QR' ? 0 : 1)
    await expect(dialog.getByText('Beneficiary cannot complete the signature', { exact: true })).toHaveCount(method === 'BIOMETRIC_AND_SIGNATURE' ? 1 : 0)

    if (method === 'QR') {
      await expect(guide).toContainText('without a phone')
      await verification.getByRole('checkbox', { name: 'QR code', exact: true }).uncheck()
      await dialog.getByRole('button', { name: 'Review event details', exact: true }).click()
      await expect(dialog.getByRole('alert')).toContainText('Select at least one')
      await verification.getByRole('checkbox', { name: 'QR code', exact: true }).check()
      await dialog.getByLabel('End time', { exact: true }).fill('07:00')
      await dialog.getByRole('button', { name: 'Review event details', exact: true }).click()
      await expect(dialog.getByRole('alert')).toBeFocused()
      await expect(dialog.getByLabel('End time', { exact: true })).toHaveAttribute('aria-invalid', 'true')
      await dialog.getByLabel('End time', { exact: true }).fill('12:00')
      await dialog.getByLabel('Queue slot duration', { exact: true }).fill('35')
      await dialog.getByRole('button', { name: 'Review event details', exact: true }).click()
      await expect(dialog.getByRole('alert')).toContainText('divide evenly')
      await dialog.getByLabel('Queue slot duration', { exact: true }).fill('30')
    }
    if (method === 'BIOMETRIC_AND_SIGNATURE') {
      await dialog.getByRole('radio', { name: 'Simulated wallet', exact: true }).check()
      await expect(dialog.getByLabel('Package or item name', { exact: true })).toHaveCount(0)
      await dialog.getByRole('radio', { name: 'Physical assistance', exact: true }).check()
      await expect(dialog.getByLabel('Package or item name', { exact: true })).toHaveValue('Family food pack')
      await dialog.getByRole('radio', { name: 'Simulated wallet', exact: true }).check()
    }
    if (method === 'QR_OR_BIOMETRIC') {
      await expect(guide).toContainText('Complete ONE')
      await expect(dialog.getByText('Use the other allowed method', { exact: true })).toBeVisible()
      for (const width of [1440, 768, 390, 320]) {
        await page.setViewportSize({ width, height: 900 })
        await dialog.getByLabel('Event title', { exact: true }).scrollIntoViewIfNeeded()
        await page.screenshot({ path: `${output}/details-${width}.png` })
        await verification.scrollIntoViewIfNeeded()
        await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
        assert.ok(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth + 1), `Dialog fits ${width}px`)
        await expect(dialog.getByRole('button', { name: 'Close distribution form', exact: true })).toBeInViewport()
        await expect(dialog.getByRole('button', { name: 'Review event details', exact: true })).toBeInViewport()
        const bounds = await dialog.evaluate(element => ({ dialog: element.getBoundingClientRect().toJSON(), header: element.querySelector('header').getBoundingClientRect().toJSON(), footer: element.querySelector('footer').getBoundingClientRect().toJSON() }))
        assert.ok(bounds.header.top >= bounds.dialog.top && bounds.footer.bottom <= bounds.dialog.bottom + 1, 'Header and footer remain inside the visible dialog')
        await page.screenshot({ path: `${output}/verification-${width}.png` })
      }
    }

    await dialog.getByRole('button', { name: 'Review event details', exact: true }).click()
    await expect(dialog.getByRole('heading', { name: 'Distribution details', exact: true })).toBeFocused()
    await expect(dialog.locator('dt').filter({ hasText: /^Claim verification$/ }).locator('..').locator('dd')).toHaveText(expectedLabels[method])
    await dialog.getByRole('button', { name: 'Change details', exact: true }).click()
    await expect(verification.getByRole('status')).toHaveText(expectedLabels[method])
    await expect(dialog.getByLabel('Event title', { exact: true })).toHaveValue(`TEST event — ${method}`)
    await dialog.getByRole('button', { name: 'Review event details', exact: true }).click()
    const writesBefore = writes.length
    failSave = method === 'QR'
    holdSave = method === 'BIOMETRIC_AND_SIGNATURE'
    await dialog.getByRole('button', { name: 'Create draft event', exact: true }).click()
    if (holdSave) {
      await expect.poll(() => typeof releaseSave).toBe('function')
      await expect(dialog.getByRole('button', { name: 'Saving...', exact: true })).toBeDisabled()
      await expect(dialog.getByRole('button', { name: 'Close distribution form', exact: true })).toBeDisabled()
      await page.keyboard.press('Escape')
      await expect(dialog).toBeVisible()
      assert.equal(writes.length, writesBefore + 1, 'Pending saves cannot be dismissed or submitted twice')
      releaseSave(); holdSave = false
    }
    if (failSave) {
      await expect(dialog.getByRole('alert')).toBeFocused()
      await expect(dialog.getByRole('alert')).toContainText('could not be saved')
      assert.equal(writes.length, writesBefore + 1)
      failSave = false
      await dialog.getByRole('button', { name: 'Create draft event', exact: true }).click()
    }
    await expect(dialog).toHaveCount(0)
    const saved = events.at(-1)
    assert.equal(saved.verificationRequirement, method)
    assert.equal(saved.status, 'DRAFT')
    assert.equal(saved.deliveryMode, method === 'BIOMETRIC_AND_SIGNATURE' ? 'SIMULATED_WALLET' : 'PHYSICAL_GOODS')
    assert.equal(saved.packageQuantity, saved.deliveryMode === 'PHYSICAL_GOODS' ? 3 : null)
    console.log(`PASS ${method}: supported checklist, exception guidance, preserved review state and backend-valid draft payload`)
  }
  await page.setViewportSize({ width: 1440, height: 1000 })
  for (const method of ['QR_AND_BIOMETRIC', 'QR_OR_BIOMETRIC']) {
    const existing = events.find(event => event.verificationRequirement === method)
    await page.goto(`${origin}/distributions/manage?event=${existing.distributionId}`)
    await page.getByRole('button', { name: 'Edit details', exact: true }).click()
    await expect(verification.getByRole('status')).toHaveText(expectedLabels[method])
    await expect(verification.getByRole('checkbox', { name: /^Require both methods/ })).toBeChecked({ checked: method === 'QR_AND_BIOMETRIC' })
    await dialog.getByRole('button', { name: 'Review event details', exact: true }).click()
    await dialog.getByRole('button', { name: 'Save event changes', exact: true }).click()
    await expect(dialog).toHaveCount(0)
    assert.equal(existing.verificationRequirement, method, 'Editing must not silently weaken an existing rule')
  }
  await page.goto(`${origin}/distributions/manage?event=${events[0].distributionId}`)
  await page.getByRole('navigation', { name: 'Distribution setup stages' }).getByRole('button').last().click()
  await page.getByRole('button', { name: 'Edit assistance package', exact: true }).click()
  await expect(dialog.getByRole('heading', { name: 'Edit assistance package', exact: true })).toBeVisible()
  await expect(verification).toHaveCount(0)
  await expect(dialog.getByLabel('Package or item name', { exact: true })).toHaveValue('Family food pack')
  await dialog.getByLabel('Quantity per beneficiary', { exact: true }).fill('4')
  await dialog.getByRole('button', { name: 'Review event details', exact: true }).click()
  await dialog.getByRole('button', { name: 'Save event changes', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  assert.deepEqual(Object.keys(writes.at(-1).body).sort(), ['packageName', 'packageQuantity', 'packageUnit'])
  assert.equal(events[0].packageQuantity, 4)
  assert.equal(events[0].verificationRequirement, 'QR')
  assert.deepEqual(errors, [])
  assert.equal(events.length, VERIFICATION_REQUIREMENTS.length)
  console.log(`PASS distribution form: required inputs, time/slot validation, save failure recovery, delivery switching, fixed controls and 320–1440px layouts. Screenshots: ${output}`)
} finally {
  await browser?.close()
  await vite.close()
}
