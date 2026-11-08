import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium, expect } from '@playwright/test'
import { createServer } from 'vite'
import { createProgramSchema, updateProgramSchema } from '../../garantiyaid-backend/src/modules/programs/program.schemas.js'

const vite = await createServer({ cacheDir: 'node_modules/.vite-verify/program-distribution-handoff', server: { host: '127.0.0.1', port: 0 } })
await vite.listen()
const baseUrl = `http://127.0.0.1:${vite.httpServer.address().port}`
const browser = await chromium.launch({ headless: true, channel: 'chrome' })
const output = resolve('../output/program-multiple-documents')
await mkdir(output, { recursive: true })
try {
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 })
page.setDefaultTimeout(10000)
await page.emulateMedia({ reducedMotion: 'reduce' })
const errors = []
page.on('pageerror', (error) => errors.push(error.message))
page.on('console', (message) => { if (message.type() === 'error' && !message.text().includes('WebSocket')) console.error(message.text()) })
await page.addInitScript(() => {
  sessionStorage.setItem('garantiyaid.accessToken', 'preview-token')
  const role = sessionStorage.getItem('test-role') || 'SYSTEM_ADMIN'
  sessionStorage.setItem('garantiyaid.user', JSON.stringify({ userId: 'staff-1', role, fullName: role === 'DSWD_STAFF' ? 'DSWD Reviewer' : 'System Administrator', email: 'staff@example.test' }))
})

const barangay = { barangayId: 'barangay-1', barangayName: 'Poblacion', city: 'Sample City' }
const programs = Array.from({ length: 15 }, (_, index) => ({ programId: `program-${index + 1}`, programCode: `AID-${index + 1}`, programName: index === 0 ? 'Community Assistance' : `Assistance Program ${index + 1}`, programType: 'CASH_ASSISTANCE', status: 'ACTIVE', grantAmount: '1500', budgetAmount: '150000', applicationStartDate: '2026-09-01', applicationEndDate: '2026-12-31', description: 'Support for eligible households.', criteria: [{ criterionId: 'criterion-1', criterionName: 'Age requirement', fieldName: 'AGE', operator: 'GREATER_THAN_OR_EQUAL', expectedValue: 18, isRequired: true }], requiredDocumentTypes: ['VALID_ID'] }))
const distributions = Array.from({ length: 15 }, (_, index) => ({ distributionId: `event-${index + 1}`, programId: 'program-1', program: programs[0], barangayId: barangay.barangayId, barangay, title: `Distribution Event ${index + 1}`, distributionDate: '2026-10-10', startTime: '08:00', endTime: '12:00', slotDurationMinutes: 30, location: 'Barangay Hall', deliveryMode: 'PHYSICAL_GOODS', verificationRequirement: 'QR', status: 'DRAFT' }))
const pagination = (total) => ({ page: 1, totalPages: 1, total })
const uploadedDocuments = []
const beneficiary = { beneficiaryId: 'person-1', firstName: 'Maria', lastName: 'Santos', birthDate: '1990-01-01', sex: 'FEMALE', address: 'Test Road', status: 'ACTIVE', barangay, barangayId: barangay.barangayId }
const enrollment = () => ({ enrollmentId: 'enrollment-1', programId: programs[0].programId, program: programs[0], beneficiaryId: beneficiary.beneficiaryId, beneficiary: { ...beneficiary, documents: uploadedDocuments }, status: 'FOR_VALIDATION', submittedById: 'different-staff', submittedBy: { fullName: 'Barangay Staff' }, enrollmentDate: '2026-11-08', createdAt: '2026-11-08', eligibilityEvaluation: { overallStatus: 'ELIGIBLE', results: [] } })
const writes = []
let failCreate = false, holdCreate = false, validationFailure = false, releaseCreate

// All program writes use local fixtures; no live programs are changed.
await page.route('**/api/v1/**', async (route) => {
  const url = new URL(route.request().url())
  const path = url.pathname.replace('/api/v1', '')
  let data = {}
  if (path === '/health') data = { timestamp: new Date().toISOString() }
  else if (path === '/staff-notifications') data = { notifications: [], unreadCount: 0, pagination: pagination(0) }
  else if (path === '/barangays') data = { barangays: [barangay] }
  else if (path === '/beneficiaries') data = { beneficiaries: [beneficiary], pagination: pagination(1) }
  else if (path === '/beneficiaries/person-1') data = { beneficiary }
  else if (path === '/beneficiaries/person-1/documents') {
    if (route.request().method() === 'POST') {
      const match = route.request().postDataBuffer().toString('utf8').match(/name="documentName"\r\n\r\n([^\r\n]+)/)
      assert.ok(match, 'the upload includes the named document metadata')
      const document = { documentId: `doc-${uploadedDocuments.length}`, documentType: 'OTHER', documentName: match[1], reviewStatus: 'SUBMITTED', originalFileName: 'sample.pdf' }
      uploadedDocuments.push(document); data = { document }
    } else data = { documents: uploadedDocuments }
  }
  else if (path === '/enrollments') data = { enrollments: [enrollment()], pagination: pagination(1) }
  else if (path === '/enrollments/enrollment-1') data = { enrollment: enrollment() }
  else if ((path === '/programs' && route.request().method() === 'POST') || (path.startsWith('/programs/') && route.request().method() === 'PATCH')) {
    const body = route.request().postDataJSON()
    const checked = (route.request().method() === 'POST' ? createProgramSchema : updateProgramSchema).safeParse(body)
    if (!checked.success) return route.fulfill({ status: 400, json: { error: { code: 'VALIDATION_ERROR', message: 'Request validation failed.', details: { fields: checked.error.issues.map(issue => ({ field: issue.path.join('.'), message: issue.message })) } } } })
    if (validationFailure) { validationFailure = false; return route.fulfill({ status: 400, json: { error: { code: 'VALIDATION_ERROR', message: 'Request validation failed.', details: { fields: [{ field: 'programType', message: 'Use underscores instead of spaces.' }] } } } }) }
    writes.push({ method: route.request().method(), body })
    if (holdCreate) await new Promise((resolve) => { releaseCreate = resolve })
    if (failCreate) return route.fulfill({ status: 503, json: { error: { message: 'Program could not be saved. Please retry.' } } })
    const existing = programs.find((program) => program.programId === path.split('/')[2])
    if (existing) Object.assign(existing, body)
    else programs.push({ ...body, programId: 'program-created', status: 'DRAFT', criteria: [] })
    data = { program: existing || programs.at(-1) }
  }
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
await page.routeWebSocket(/socket\.io/, () => {})

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
await page.evaluate(() => sessionStorage.setItem('test-role', 'DSWD_STAFF'))
await page.reload()
await page.getByRole('button', { name: 'Create program' }).click()
const dialog = page.getByRole('dialog', { name: 'Create assistance program' })
const documents = dialog.getByRole('group', { name: 'Required documents', exact: true })
await expect(dialog.getByLabel('Program name', { exact: true })).toBeFocused()
await expect(documents.getByRole('checkbox')).toHaveCount(8)
await expect(documents.getByRole('status')).toHaveText('0 of 8 selected')
await expect(dialog.getByLabel('Other document name', { exact: true })).toHaveCount(0)
await documents.getByText('Identification document', { exact: true }).click()
await expect(documents.getByRole('checkbox', { name: 'Valid ID', exact: true })).toBeChecked()
await expect(documents.getByRole('checkbox', { name: 'Valid ID', exact: true }).locator('..')).toHaveClass(/border-brand-blue/)
await documents.getByRole('checkbox', { name: 'Birth Certificate', exact: true }).check()
await documents.getByRole('checkbox', { name: 'PWD ID', exact: true }).focus()
await page.keyboard.press('Space')
await documents.getByRole('checkbox', { name: 'Other', exact: true }).check()
await expect(documents.getByRole('status')).toHaveText('4 of 8 selected')
const otherName = dialog.getByLabel('Other document name', { exact: true })
await expect(otherName).toBeVisible()
await expect(otherName).toBeFocused()
await expect(otherName).toHaveAttribute('required', '')
await expect(otherName).toHaveAttribute('maxlength', '150')
await otherName.fill(' Request letter ')
await documents.getByRole('checkbox', { name: 'Other', exact: true }).uncheck()
await expect(otherName).toHaveCount(0)
await documents.getByRole('checkbox', { name: 'Other', exact: true }).check()
await expect(otherName).toHaveValue(' Request letter ')
await documents.getByRole('checkbox', { name: 'Valid ID', exact: true }).uncheck()
await expect(documents.getByRole('status')).toHaveText('3 of 8 selected')
await page.locator('#program-name').fill('New Aid')
await page.locator('#program-code').fill('aid-new')
await page.locator('#program-type').fill('cash_assistance')
await page.locator('#program-grant').fill('2000')
await page.locator('#program-budget').fill('1000')
await page.getByRole('button', { name: 'Create draft program' }).click()
await page.getByRole('alert', { name: '' }).filter({ hasText: 'Program budget cannot be lower' }).waitFor()
await expect(dialog.getByRole('alert')).toBeFocused()
assert.equal(writes.length, 0, 'invalid amounts must not reach the API')
await page.locator('#program-budget').fill('10000')
await otherName.fill('   ')
await dialog.getByRole('button', { name: 'Create draft program' }).click()
await expect(dialog.getByRole('alert')).toContainText('Add at least one other required document.')
assert.equal(writes.length, 0)
await otherName.fill(' Request letter ')
await page.locator('#program-start').fill('2026-11-08')
await dialog.getByRole('button', { name: 'Add document', exact: true }).click()
await expect(otherName).toHaveValue('')
await expect(dialog.getByRole('button', { name: 'Remove Request letter', exact: true })).toBeVisible()
await otherName.fill('request LETTER')
await dialog.getByRole('button', { name: 'Add document', exact: true }).click()
await expect(dialog.getByRole('alert')).toContainText('already in the list')
await otherName.fill('Certificate of indigency')
await page.keyboard.press('Enter')
await expect(dialog.getByRole('button', { name: 'Remove Certificate of indigency', exact: true })).toBeVisible()
await dialog.getByRole('button', { name: 'Remove Certificate of indigency', exact: true }).click()
await otherName.fill('Certificate of indigency')
await dialog.getByRole('button', { name: 'Add document', exact: true }).click()
await page.locator('#program-end').fill('2026-12-31')
await page.locator('#program-description').fill('TEST PROGRAM. Other: supporting request letter.')

const scrollArea = dialog.locator('form > div')
for (const [width, height] of [[1440, 900], [1024, 900], [768, 900], [390, 844], [375, 812], [320, 700], [844, 390]]) {
  await page.setViewportSize({ width, height })
  await scrollArea.evaluate((el) => { el.scrollTop = 0 })
  const header = await dialog.locator('header').boundingBox(), footer = await dialog.locator('footer').boundingBox()
  assert.ok(header.y >= 0 && footer.y + footer.height <= height, `fixed dialog actions fit at ${width}x${height}`)
  assert.equal(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth + 1), true, `dialog overflow at ${width}`)
  assert.equal(await scrollArea.evaluate((el) => el.scrollWidth <= el.clientWidth + 1), true, `form fields overflow at ${width}`)
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
  await page.screenshot({ path: `${output}/program-details-${width}.png` })
  await scrollArea.evaluate((el) => { const docs = el.querySelector('fieldset fieldset'); el.scrollTop += docs.getBoundingClientRect().top - el.getBoundingClientRect().top - 20 })
  await expect(documents.getByRole('checkbox', { name: 'Valid ID', exact: true })).toBeVisible()
  await page.screenshot({ path: `${output}/required-documents-${width}.png` })
  const other = documents.getByRole('checkbox', { name: 'Other', exact: true })
  await documents.getByRole('checkbox', { name: 'Senior Citizen ID', exact: true }).focus()
  await page.keyboard.press('Tab')
  await expect(other).toBeFocused()
  const focused = await other.boundingBox()
  assert.ok(focused.y >= header.y + header.height && focused.y + focused.height <= footer.y, `focused checkbox is not covered at ${width}: ${JSON.stringify({ header, footer, focused })}`)
  if (width === 320) await page.screenshot({ path: `${output}/required-documents-end-${width}.png` })
  await page.keyboard.press('Tab')
  await expect(otherName).toBeFocused()
  const nameBox = await otherName.boundingBox()
  assert.ok(nameBox.y >= header.y + header.height && nameBox.y + nameBox.height <= footer.y, `Other name input is not covered at ${width}`)
  if ([1440, 390, 320].includes(width)) await page.screenshot({ path: `${output}/other-document-${width}.png` })
}

validationFailure = true
await dialog.getByRole('button', { name: 'Create draft program' }).click()
await expect(dialog.getByRole('alert')).toContainText('Program type: Use underscores instead of spaces.')
await expect(dialog.getByRole('button', { name: 'Remove Request letter' })).toBeVisible()
await dialog.getByLabel('Program type', { exact: true }).fill('CASH_ASSISTANCE')
failCreate = true; holdCreate = true
await dialog.getByRole('button', { name: 'Create draft program' }).click()
await expect.poll(() => Boolean(releaseCreate)).toBe(true)
await expect(dialog.getByRole('button', { name: 'Close program form' })).toBeDisabled()
await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeDisabled()
await expect(documents.getByRole('checkbox', { name: 'Other', exact: true })).toBeDisabled()
await page.keyboard.press('Escape')
await expect(dialog).toBeVisible()
releaseCreate()
await expect(dialog.getByRole('alert')).toContainText('Program could not be saved')
await expect(dialog.getByRole('alert')).toBeFocused()
await expect(dialog.getByLabel('Program name', { exact: true })).toHaveValue('New Aid')
await expect(documents.getByRole('checkbox', { name: 'PWD ID', exact: true })).toBeChecked()
await expect(documents.getByRole('status')).toHaveText('3 of 8 selected')
await expect(otherName).toHaveValue('')
await expect(dialog.getByRole('button', { name: 'Remove Certificate of indigency' })).toBeVisible()
failCreate = false; holdCreate = false
await dialog.getByRole('button', { name: 'Create draft program' }).click()
await expect(dialog).toHaveCount(0)
assert.equal(writes.length, 2)
assert.deepEqual(writes[0].body, writes[1].body, 'a failed save retains all submitted values')
assert.equal(writes[1].body.programCode, 'AID-NEW')
assert.equal(writes[1].body.programType, 'CASH_ASSISTANCE')
assert.equal(writes[1].body.grantAmount, '2000')
assert.equal(writes[1].body.budgetAmount, '10000')
assert.equal(writes[1].body.applicationStartDate, '2026-11-08')
assert.equal(writes[1].body.applicationEndDate, '2026-12-31')
assert.deepEqual(writes[1].body.requiredDocumentTypes, ['BIRTH_CERTIFICATE', 'PWD_ID', 'OTHER'])
assert.deepEqual(writes[1].body.otherRequiredDocumentNames, ['Request letter', 'Certificate of indigency'])
await expect(page.getByText('Other — Request letter', { exact: true })).toBeVisible()

await page.getByRole('button', { name: 'Edit details', exact: true }).click()
const editDialog = page.getByRole('dialog', { name: 'Edit draft program' })
await expect(editDialog.getByRole('checkbox', { name: 'PWD ID', exact: true })).toBeChecked()
await expect(editDialog.getByRole('checkbox', { name: 'Valid ID', exact: true })).not.toBeChecked()
await expect(editDialog.getByRole('button', { name: 'Remove Request letter' })).toBeVisible()
await editDialog.getByRole('button', { name: 'Remove Certificate of indigency' }).click()
await editDialog.getByLabel('Other document name', { exact: true }).fill('Household assessment')
await editDialog.getByRole('button', { name: 'Add document', exact: true }).click()
await editDialog.getByRole('button', { name: 'Save program', exact: true }).click()
await expect(editDialog).toHaveCount(0)
assert.deepEqual(writes.at(-1).body.otherRequiredDocumentNames, ['Request letter', 'Household assessment'])
await page.getByRole('button', { name: 'Edit details', exact: true }).click()
await expect(editDialog.getByRole('button', { name: 'Remove Household assessment' })).toBeVisible()
await editDialog.getByRole('checkbox', { name: 'Other', exact: true }).uncheck()
await editDialog.getByRole('checkbox', { name: 'Senior Citizen ID', exact: true }).check()
await editDialog.getByRole('button', { name: 'Save program', exact: true }).click()
await expect(editDialog).toHaveCount(0)
assert.equal(writes.at(-1).method, 'PATCH')
assert.deepEqual(writes.at(-1).body.requiredDocumentTypes, ['BIRTH_CERTIFICATE', 'PWD_ID', 'SENIOR_CITIZEN_ID'])
assert.deepEqual(writes.at(-1).body.otherRequiredDocumentNames, [])
await expect(page.getByText('Other — Household assessment', { exact: true })).toHaveCount(0)
await page.getByRole('button', { name: 'Edit details', exact: true }).click()
for (const option of await editDialog.getByRole('checkbox').all()) await option.uncheck()
await editDialog.getByRole('button', { name: 'Save program', exact: true }).click()
await expect(editDialog).toHaveCount(0)
assert.deepEqual(writes.at(-1).body.requiredDocumentTypes, [], 'an empty document selection remains supported')

await page.evaluate(() => sessionStorage.removeItem('test-role'))
await page.reload()
const createButton = page.getByRole('button', { name: 'Create program', exact: true })
await createButton.click()
await expect(documents.getByRole('status')).toHaveText('0 of 8 selected')
await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
await expect(createButton).toBeFocused()
await page.evaluate(() => sessionStorage.setItem('test-role', 'BARANGAY_FACILITATOR'))
await page.reload()
await expect(page.getByRole('heading', { name: 'Assistance program browser' })).toBeVisible()
await expect(page.getByRole('button', { name: 'Create program', exact: true })).toHaveCount(0)
programs[0].requiredDocumentTypes = ['OTHER']
programs[0].otherRequiredDocumentNames = ['Request letter', 'Certificate of indigency']
await page.goto(`${baseUrl}/beneficiaries?beneficiary=person-1`)
await page.getByLabel('Active program', { exact: true }).selectOption('program-1')
await expect(page.getByRole('region', { name: 'Program document checklist' })).toContainText('Request letter')
await expect(page.getByRole('region', { name: 'Program document checklist' })).toContainText('Certificate of indigency')
await expect(page.getByRole('button', { name: 'Submit enrollment', exact: true })).toBeDisabled()
for (const [index, name] of ['Request letter', 'Certificate of indigency'].entries()) {
  await page.getByLabel('Document type', { exact: true }).selectOption(`OTHER:${name}`)
  await page.getByLabel('Choose document', { exact: true }).setInputFiles({ name: 'sample.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\nTest document') })
  await page.getByRole('button', { name: 'Upload for review', exact: true }).click()
  await expect.poll(() => uploadedDocuments.length).toBe(index + 1)
  if (index === 0) await expect(page.getByRole('button', { name: 'Submit enrollment', exact: true })).toBeDisabled()
}
await expect(page.getByRole('button', { name: 'Submit enrollment', exact: true })).toBeEnabled()
await page.evaluate(() => sessionStorage.setItem('test-role', 'DSWD_STAFF'))
await page.goto(`${baseUrl}/enrollments?enrollment=enrollment-1`)
await expect(page.getByText('Other documents required', { exact: true })).toBeVisible()
await expect(page.getByText('Other — Request letter', { exact: true })).toBeVisible()
await expect(page.getByRole('button', { name: 'Approve enrollment', exact: true })).toBeDisabled()
uploadedDocuments[0].reviewStatus = 'ACCEPTED'
await page.reload()
await expect(page.getByRole('button', { name: 'Approve enrollment', exact: true })).toBeDisabled()
uploadedDocuments[1].reviewStatus = 'ACCEPTED'
await page.reload()
await expect(page.getByRole('button', { name: 'Approve enrollment', exact: true })).toBeEnabled()

await page.setViewportSize({ width: 320, height: 700 })
await page.waitForTimeout(350)
assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
assert.deepEqual(errors, [])
console.log('Program handoff, DSWD create/edit, document selection, failed-save recovery, saving guards, role access, 320–1440px dialogs and phone landscape checks passed')
} finally {
  await browser.close()
  await vite.close()
}
