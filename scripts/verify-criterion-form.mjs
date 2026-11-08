import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium, expect } from '@playwright/test'
import { createServer } from 'vite'
import { createProgramCriterionSchema } from '../../garantiyaid-backend/src/modules/programs/program.schemas.js'

const output = resolve('../output/criterion-form')
await mkdir(output, { recursive: true })
const vite = await createServer({ cacheDir: 'node_modules/.vite-verify/criterion-form', server: { host: '127.0.0.1', port: 0 } })
await vite.listen()
const browser = await chromium.launch({ headless: true, channel: 'chrome' })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
page.setDefaultTimeout(10000)
const errors = [], writes = []
page.on('pageerror', error => errors.push(error.message))
await page.emulateMedia({ reducedMotion: 'reduce' })
await page.addInitScript(() => {
  sessionStorage.setItem('garantiyaid.accessToken', 'test-token')
  sessionStorage.setItem('garantiyaid.user', JSON.stringify({ userId: 'test-staff', role: 'DSWD_STAFF', fullName: 'Test Reviewer' }))
})
const barangays = [
  { barangayId: '11111111-1111-4111-8111-111111111111', barangayName: 'Test North', city: 'Test City' },
  { barangayId: '22222222-2222-4222-8222-222222222222', barangayName: 'Test South', city: 'Test City' },
]
const program = { programId: 'test-program', programCode: 'TEST-CRITERION', programName: 'Test assistance program', programType: 'FOOD_ASSISTANCE', status: 'DRAFT', grantAmount: '100', budgetAmount: '1000', requiredDocumentTypes: [], criteria: [] }
let failSave = false, holdSave = false, releaseSave
await page.route('**/api/v1/**', async route => {
  const request = route.request(), url = new URL(request.url()), path = url.pathname.replace('/api/v1', '')
  let data = {}
  if (path === '/health') data = { status: 'ok' }
  else if (path === '/staff-notifications') data = { notifications: [], unreadCount: 0, pagination: { total: 0 } }
  else if (path === '/barangays') data = { barangays }
  else if (path === '/programs') data = { programs: [program], pagination: { page: 1, totalPages: 1, total: 1 } }
  else if (path === '/programs/test-program') data = { program }
  else if (path.startsWith('/programs/test-program/criteria')) {
    const body = request.postDataJSON()
    const checked = createProgramCriterionSchema.safeParse(body)
    assert.equal(checked.success, true, JSON.stringify(checked.error?.issues))
    writes.push({ method: request.method(), ...body })
    if (holdSave) await new Promise(resolve => { releaseSave = resolve })
    if (failSave) return route.fulfill({ status: 503, json: { error: { message: 'Test: criterion could not be saved. Retry when connected.' } } })
    const existing = program.criteria.find(criterion => path.endsWith(criterion.criterionId))
    const criterion = { ...body, criterionId: existing?.criterionId || `criterion-${program.criteria.length + 1}` }
    if (existing) Object.assign(existing, criterion)
    else program.criteria.push(criterion)
    data = { criterion }
  }
  await route.fulfill({ json: { success: true, data } })
})
await page.route('**/socket.io/**', route => route.abort())
await page.routeWebSocket(/socket\.io/, () => {})

try {
  await page.goto(`http://127.0.0.1:${vite.httpServer.address().port}/programs`)
  const detail = page.getByRole('region', { name: 'Selected program' })
  const dialog = page.getByRole('dialog', { name: 'Add criterion', exact: true })
  const open = async () => {
    await detail.getByRole('button', { name: 'Add criterion', exact: true }).click()
    await expect(dialog.getByLabel('Criterion name', { exact: true })).toBeFocused()
    await dialog.getByLabel('Criterion name', { exact: true }).fill('Test criterion')
  }
  const save = async expected => {
    await dialog.getByRole('button', { name: 'Add criterion', exact: true }).click()
    await expect(dialog).toHaveCount(0)
    for (const [key, value] of Object.entries(expected)) assert.deepEqual(writes.at(-1)[key], value)
  }
  await open()
  await dialog.getByLabel('Criterion name', { exact: true }).fill('Adult applicant')
  await dialog.getByLabel('Age in completed years', { exact: true }).fill('18')
  await expect(dialog.getByRole('region', { name: 'Rule preview' })).toContainText('Age · At least (≥) · 18 years')
  await expect(dialog.locator('#criterion-name').locator('..').locator('svg')).toHaveAttribute('aria-hidden', 'true')
  await expect(dialog.locator('#criterion-value')).toHaveAttribute('type', 'number')

  for (const [width, height] of [[1440, 900], [768, 900], [390, 844], [320, 700], [844, 390]]) {
    await page.setViewportSize({ width, height })
    const header = await dialog.locator('header').boundingBox(), footer = await dialog.locator('footer').boundingBox()
    assert.ok(header.y >= 0 && footer.y + footer.height <= height, `Header and actions fit ${width}x${height}.`)
    assert.equal(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth + 1), true)
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
    for (const selector of ['#criterion-name', '#criterion-field', '#criterion-operator', '#criterion-value', 'input[type=checkbox]']) {
      await dialog.locator(selector).focus()
      const bounds = await dialog.locator(selector).boundingBox()
      assert.ok(bounds.y >= header.y + header.height - 1 && bounds.y + bounds.height <= footer.y + 1, `${selector} is not covered at ${width}x${height}.`)
    }
    await dialog.locator('form > div').evaluate(element => { element.scrollTop = 0 })
    await page.screenshot({ path: `${output}/age-${width}x${height}.png` })
  }
  await page.setViewportSize({ width: 1440, height: 900 })
  failSave = true
  await dialog.getByRole('button', { name: 'Add criterion', exact: true }).click()
  await expect(dialog.getByRole('alert')).toContainText('Test: criterion could not be saved.')
  await expect(dialog.getByRole('alert')).toBeFocused()
  await expect(dialog.getByLabel('Criterion name', { exact: true })).toHaveValue('Adult applicant')
  await expect(dialog.getByLabel('Age in completed years', { exact: true })).toHaveValue('18')
  failSave = false; holdSave = true
  await dialog.getByRole('button', { name: 'Add criterion', exact: true }).click()
  await expect.poll(() => typeof releaseSave).toBe('function')
  await expect(dialog.getByLabel('Criterion name', { exact: true })).toBeDisabled()
  await expect(dialog.getByRole('button', { name: 'Close criterion form' })).toBeDisabled()
  await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeDisabled()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeVisible()
  releaseSave(); holdSave = false
  await expect(dialog).toHaveCount(0)
  assert.equal(program.criteria.length, 1)
  console.log('PASS: age preview, SVG inputs, responsive focus, failed-save retention and saving guards.')

  const edit = page.getByRole('dialog', { name: 'Edit criterion', exact: true })
  await detail.getByRole('button', { name: 'Edit', exact: true }).click()
  await expect(edit.getByLabel('Age in completed years', { exact: true })).toHaveValue('18')
  await edit.getByLabel('Age in completed years', { exact: true }).fill('21')
  await edit.getByRole('button', { name: 'Save criterion', exact: true }).click()
  await expect(edit).toHaveCount(0)
  assert.equal(writes.at(-1).method, 'PATCH')
  assert.equal(writes.at(-1).expectedValue, 21)

  await open()
  await dialog.getByLabel('Condition', { exact: true }).selectOption('IN')
  await dialog.getByLabel('Ages (comma separated)', { exact: true }).fill('18, 18')
  const beforeDuplicate = writes.length
  await dialog.getByRole('button', { name: 'Add criterion', exact: true }).click()
  await expect(dialog.getByRole('alert')).toContainText('Remove duplicate criterion values.')
  assert.equal(writes.length, beforeDuplicate)
  await dialog.getByLabel('Ages (comma separated)', { exact: true }).fill('18, 60')
  await expect(dialog.getByLabel('Ages (comma separated)', { exact: true })).toHaveAttribute('inputmode', 'text')
  await save({ fieldName: 'AGE', operator: 'IN', expectedValue: [18, 60] })

  await open()
  await dialog.getByLabel('Data field', { exact: true }).selectOption('SEX')
  await dialog.getByLabel('Recorded sex', { exact: true }).selectOption('FEMALE')
  await save({ fieldName: 'SEX', operator: 'EQUALS', expectedValue: 'FEMALE' })
  await open()
  await dialog.getByLabel('Data field', { exact: true }).selectOption('SEX')
  await dialog.getByLabel('Condition', { exact: true }).selectOption('NOT_IN')
  await dialog.getByRole('checkbox', { name: 'Male', exact: true }).uncheck()
  await expect(dialog.getByRole('button', { name: 'Add criterion', exact: true })).toBeDisabled()
  await dialog.getByRole('checkbox', { name: 'Female', exact: true }).check()
  await dialog.getByRole('checkbox', { name: 'Other', exact: true }).check()
  await save({ fieldName: 'SEX', operator: 'NOT_IN', expectedValue: ['FEMALE', 'OTHER'] })

  await open()
  await dialog.getByLabel('Data field', { exact: true }).selectOption('BARANGAY_ID')
  await dialog.getByLabel('Covered Barangay', { exact: true }).selectOption(barangays[0].barangayId)
  await expect(dialog.getByRole('region', { name: 'Rule preview' })).toContainText('Test North')
  await save({ fieldName: 'BARANGAY_ID', expectedValue: barangays[0].barangayId })
  await open()
  await dialog.getByLabel('Data field', { exact: true }).selectOption('BARANGAY_ID')
  await dialog.getByLabel('Condition', { exact: true }).selectOption('IN')
  await expect(dialog.getByRole('button', { name: 'Add criterion', exact: true })).toBeDisabled()
  await dialog.getByRole('checkbox', { name: /Test North/ }).check()
  await dialog.getByRole('checkbox', { name: /Test South/ }).check()
  await expect(dialog.getByRole('region', { name: 'Rule preview' })).toContainText('Test North, Test South')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: `${output}/barangay-390.png` })
  await save({ fieldName: 'BARANGAY_ID', operator: 'IN', expectedValue: barangays.map(barangay => barangay.barangayId) })

  await open()
  await dialog.getByLabel('Data field', { exact: true }).selectOption('DOCUMENT_TYPE')
  await expect(dialog.getByLabel('Condition', { exact: true })).toBeDisabled()
  await dialog.getByLabel('Required document type', { exact: true }).selectOption('VALID_ID')
  await dialog.getByRole('checkbox', { name: /Required for enrollment approval/ }).uncheck()
  await expect(dialog.getByRole('region', { name: 'Rule preview' })).toContainText('Informational only.')
  await save({ fieldName: 'DOCUMENT_TYPE', operator: 'REQUIRED', expectedValue: 'VALID_ID', isRequired: false })

  await open()
  await dialog.getByLabel('Data field', { exact: true }).selectOption('MANUAL_REVIEW')
  await expect(dialog.getByRole('checkbox', { name: /Required for enrollment approval/ })).toBeChecked()
  await expect(dialog.getByRole('checkbox', { name: /Required for enrollment approval/ })).toBeDisabled()
  await expect(dialog.getByRole('region', { name: 'Rule preview' })).toContainText('DSWD decision and remarks')
  await save({ fieldName: 'MANUAL_REVIEW', operator: 'REQUIRED', expectedValue: true, isRequired: true })
  await open()
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(detail.getByRole('button', { name: 'Add criterion', exact: true })).toBeFocused()
  assert.deepEqual(errors, [])
  console.log('PASS: create/edit payloads pass backend schema for all five field types, single/multiple selections, optional and mandatory checks; no live writes.')
} catch (error) {
  await page.screenshot({ path: `${output}/failure.png` })
  throw error
} finally {
  releaseSave?.()
  await browser.close()
  await vite.close()
}
