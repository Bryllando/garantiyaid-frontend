import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium, expect } from '@playwright/test'
import { createServer } from 'vite'
import { createBeneficiarySchema, updateBeneficiarySchema } from '../../garantiyaid-backend/src/modules/beneficiaries/beneficiary.schemas.js'

const output = resolve('../output/beneficiary-form')
await mkdir(output, { recursive: true })
const vite = await createServer({ cacheDir: 'node_modules/.vite-verify/beneficiary-form', server: { host: '127.0.0.1', port: 0 } })
await vite.listen()
const origin = `http://127.0.0.1:${vite.httpServer.address().port}`
const browser = await chromium.launch({ headless: true, channel: 'chrome' })
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
page.setDefaultTimeout(10000)
page.setDefaultNavigationTimeout(30000)
await page.emulateMedia({ reducedMotion: 'reduce' })
const errors = [], writes = [], beneficiaries = []
page.on('pageerror', error => errors.push(error.message))
await page.addInitScript(() => {
  sessionStorage.setItem('garantiyaid.accessToken', 'test-token')
  const role = sessionStorage.getItem('test-role') || 'SYSTEM_ADMIN'
  sessionStorage.setItem('garantiyaid.user', JSON.stringify({ userId: 'test-staff', role, fullName: 'Test Staff', barangayId: '11111111-1111-4111-8111-111111111111', barangay: { barangayName: 'Test North' } }))
})
const barangay = { barangayId: '11111111-1111-4111-8111-111111111111', barangayName: 'Test North', city: 'Test City', isActive: true }
const pagination = total => ({ page: 1, totalPages: 1, total })
let failSave = false, holdSave = false, releaseSave
await page.route('**/api/v1/**', async route => {
  const request = route.request(), path = new URL(request.url()).pathname.replace('/api/v1', '')
  let data = {}
  if (path === '/health') data = { status: 'ok' }
  else if (path === '/staff-notifications') data = { notifications: [], unreadCount: 0, pagination: pagination(0) }
  else if (path === '/barangays') data = { barangays: [barangay] }
  else if (path === '/programs') data = { programs: [], pagination: pagination(0) }
  else if (path === '/enrollments') data = { enrollments: [], pagination: pagination(0) }
  else if ((path === '/beneficiaries' && request.method() === 'POST') || (path.startsWith('/beneficiaries/') && request.method() === 'PATCH')) {
    const body = request.postDataJSON(), method = request.method()
    const checked = (method === 'POST' ? createBeneficiarySchema : updateBeneficiarySchema).safeParse(body)
    assert.equal(checked.success, true, JSON.stringify(checked.error?.issues))
    writes.push({ method, body })
    if (holdSave) await new Promise(resolve => { releaseSave = resolve })
    if (failSave) return route.fulfill({ status: 503, json: { error: { message: 'Test: record could not be saved. Your reviewed details remain available.' } } })
    const existing = beneficiaries.find(person => path.endsWith(person.beneficiaryId))
    const person = { ...body, beneficiaryId: existing?.beneficiaryId || `test-person-${beneficiaries.length + 1}`, barangayId: barangay.barangayId, barangay, status: body.status || 'ACTIVE' }
    if (existing) Object.assign(existing, person)
    else beneficiaries.push(person)
    data = { beneficiary: person }
  } else if (path === '/beneficiaries') data = { beneficiaries, pagination: pagination(beneficiaries.length) }
  else if (path.endsWith('/documents')) data = { documents: [] }
  else if (path.startsWith('/beneficiaries/')) data = { beneficiary: beneficiaries.find(person => path.endsWith(person.beneficiaryId)) }
  await route.fulfill({ json: { success: true, data } })
})
await page.route('**/socket.io/**', route => route.abort())
await page.routeWebSocket(/socket\.io/, () => {})

try {
  await page.goto(`${origin}/beneficiaries`)
  await page.getByRole('button', { name: 'Register beneficiary', exact: true }).click()
  const form = page.getByRole('dialog')
  await expect(form.getByLabel('First name', { exact: true })).toBeFocused()
  for (const [id, length] of [['beneficiary-first-name', 100], ['beneficiary-middle-name', 100], ['beneficiary-last-name', 100], ['beneficiary-philsys', 50], ['beneficiary-sitio-purok', 120], ['beneficiary-email', 150], ['beneficiary-address', 2000]]) {
    await expect(form.locator(`#${id}`)).toHaveAttribute('maxlength', String(length))
  }
  await form.locator('#beneficiary-first-name').fill('Juan')
  await form.locator('#beneficiary-last-name').fill('Test Santos')
  await form.locator('#beneficiary-birth-date').fill('1995-01-15')
  await form.locator('#beneficiary-sex').selectOption('MALE')
  await form.locator('#beneficiary-barangay').selectOption(barangay.barangayId)
  await form.locator('#beneficiary-sitio-purok').fill('Purok Test')
  await form.locator('#beneficiary-address').fill('TEST House 1, Sample Street, Test North, Test City')
  await form.locator('#beneficiary-contact').fill('0917')
  await form.locator('#beneficiary-contact').blur()
  await expect(form.locator('#beneficiary-contact')).toHaveAttribute('aria-invalid', 'true')
  await form.getByRole('button', { name: 'Review beneficiary details', exact: true }).click()
  assert.equal(writes.length, 0)
  await expect(form.getByRole('heading', { name: 'Register a beneficiary', exact: true })).toBeVisible()
  await form.locator('#beneficiary-contact').fill('09171234567')
  await form.locator('#beneficiary-contact').blur()
  await expect(form.locator('#beneficiary-contact')).toHaveValue('0917 123 4567')
  await form.locator('#beneficiary-email').fill('juan@example.test')

  for (const [width, height] of [[1440, 900], [768, 900], [640, 900], [390, 844], [320, 700], [844, 390]]) {
    await page.setViewportSize({ width, height })
    const header = await form.locator('header').boundingBox(), footer = await form.locator('footer').boundingBox()
    assert.ok(header.y >= 0 && footer.y + footer.height <= height, `Header and buttons fit ${width}x${height}.`)
    assert.equal(await form.evaluate(element => element.scrollWidth <= element.clientWidth + 1), true)
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
    for (const selector of ['#beneficiary-first-name', '#beneficiary-birth-date', '#beneficiary-barangay', '#beneficiary-address', '#beneficiary-contact', '#beneficiary-email']) {
      await form.locator(selector).focus()
      const bounds = await form.locator(selector).boundingBox()
      assert.ok(bounds.y >= header.y + header.height - 1 && bounds.y + bounds.height <= footer.y + 1, `${selector} remains uncovered at ${width}x${height}.`)
    }
    await form.locator('form > div').evaluate(element => { element.scrollTop = 0 })
    await page.screenshot({ path: `${output}/details-${width}x${height}.png` })
    await form.locator('form > div').evaluate(element => { element.scrollTop = element.scrollHeight })
    await page.screenshot({ path: `${output}/contact-${width}x${height}.png` })
  }
  await page.setViewportSize({ width: 1440, height: 1000 })
  await form.locator('#beneficiary-first-name').fill('   ')
  await form.getByRole('button', { name: 'Review beneficiary details', exact: true }).click()
  await expect(form.getByRole('alert')).toContainText('first name')
  await expect(form.getByRole('alert')).toBeFocused()
  assert.equal(writes.length, 0)
  await form.locator('#beneficiary-first-name').fill('Juan')
  await form.getByRole('button', { name: 'Review beneficiary details', exact: true }).click()
  await expect(form.getByRole('heading', { name: 'Details to save', exact: true })).toBeFocused()
  await expect(form).toContainText('Juan Test Santos')
  await expect(form).toContainText('Test North')
  assert.equal(writes.length, 0, 'Review never creates a beneficiary.')
  await page.screenshot({ path: `${output}/review-1440.png` })
  await form.getByRole('button', { name: 'Change details', exact: true }).click()
  await expect(form.getByLabel('First name', { exact: true })).toBeFocused()
  await expect(form.locator('#beneficiary-address')).toHaveValue('TEST House 1, Sample Street, Test North, Test City')
  await form.getByRole('button', { name: 'Review beneficiary details', exact: true }).click()
  failSave = true
  await form.getByRole('button', { name: 'Register beneficiary', exact: true }).click()
  await expect(form.getByRole('alert')).toContainText('Test: record could not be saved.')
  await expect(form.getByRole('alert')).toBeFocused()
  await expect(form).toContainText('Juan Test Santos')
  failSave = false; holdSave = true
  await form.getByRole('button', { name: 'Register beneficiary', exact: true }).click()
  await expect.poll(() => typeof releaseSave).toBe('function')
  await expect(form.getByRole('button', { name: 'Close beneficiary form' })).toBeDisabled()
  await expect(form.getByRole('button', { name: 'Change details', exact: true })).toBeDisabled()
  await page.keyboard.press('Escape')
  await expect(form).toBeVisible()
  await page.keyboard.press('Enter')
  assert.equal(writes.length, 2, 'Busy form cannot submit another request.')
  releaseSave(); holdSave = false
  await expect(form).toHaveCount(0)
  assert.equal(beneficiaries.length, 1)
  assert.equal(writes.at(-1).body.barangayId, barangay.barangayId)
  assert.equal(Object.hasOwn(writes.at(-1).body, 'status'), false)
  console.log('PASS: Admin registration, validation, review/back, failed-save retention, saving guards and responsive keyboard focus.')

  await page.getByText('Personal and contact details', { exact: true }).click()
  await page.getByRole('button', { name: 'Edit verified details', exact: true }).click()
  await form.locator('#beneficiary-middle-name').fill('TEST')
  await form.locator('#beneficiary-status').selectOption('INACTIVE')
  await form.getByRole('button', { name: 'Review beneficiary details', exact: true }).click()
  await form.getByRole('button', { name: 'Save changes', exact: true }).click()
  await expect(form).toHaveCount(0)
  assert.equal(writes.at(-1).method, 'PATCH')
  assert.equal(writes.at(-1).body.status, 'INACTIVE')
  assert.equal(writes.at(-1).body.middleName, 'TEST')

  await page.evaluate(() => sessionStorage.setItem('test-role', 'BARANGAY_FACILITATOR'))
  await page.goto(`${origin}/beneficiaries`)
  await page.getByRole('button', { name: 'Register beneficiary', exact: true }).click()
  await expect(form.locator('#beneficiary-barangay')).toHaveCount(0)
  await expect(form).toContainText('Test North')
  await form.locator('#beneficiary-first-name').fill('Ana')
  await form.locator('#beneficiary-last-name').fill('Test Reyes')
  await form.locator('#beneficiary-birth-date').fill('1990-03-12')
  await form.locator('#beneficiary-sex').selectOption('FEMALE')
  await form.locator('#beneficiary-address').fill('TEST Barangay address')
  await page.setViewportSize({ width: 390, height: 844 })
  await form.locator('#beneficiary-address').focus()
  await page.screenshot({ path: `${output}/barangay-390.png` })
  await form.getByRole('button', { name: 'Review beneficiary details', exact: true }).click()
  await expect(form).toContainText('Test North')
  await expect(form).toContainText('Not provided')
  await form.getByRole('button', { name: 'Register beneficiary', exact: true }).click()
  await expect(form).toHaveCount(0)
  assert.equal(Object.hasOwn(writes.at(-1).body, 'barangayId'), false)
  assert.equal(Object.hasOwn(writes.at(-1).body, 'status'), false)
  assert.equal(writes.at(-1).body.contactNumber, '')
  assert.equal(beneficiaries.length, 2)

  await page.evaluate(() => sessionStorage.setItem('test-role', 'DSWD_STAFF'))
  await page.goto(`${origin}/beneficiaries`)
  await expect(page.getByRole('heading', { name: 'Beneficiary management', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Register beneficiary', exact: true })).toHaveCount(0)
  assert.deepEqual(errors, [])
  console.log('PASS: Admin editing, Barangay assigned-area payload, optional blank fields and DSWD read access; all save payloads pass backend schemas. No live writes.')
} catch (error) {
  await page.screenshot({ path: `${output}/failure.png` })
  throw error
} finally {
  releaseSave?.()
  await browser.close()
  await vite.close()
}
