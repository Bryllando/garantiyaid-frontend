import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium, expect } from '@playwright/test'
import { createServer } from 'vite'
import { createBurialSchema, editBurialSchema } from '../../garantiyaid-backend/src/modules/burial/burial.schemas.js'

const output = resolve('../output/burial-editor')
await mkdir(output, { recursive: true })
const vite = await createServer({ cacheDir: 'node_modules/.vite-verify/burial-editor', server: { host: '127.0.0.1', port: 0 } })
await vite.listen()
const origin = `http://127.0.0.1:${vite.httpServer.address().port}`
const browser = await chromium.launch({ headless: true, channel: 'chrome' })
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } })
page.setDefaultTimeout(10000)
page.setDefaultNavigationTimeout(30000)
await page.emulateMedia({ reducedMotion: 'reduce' })
const errors = [], writes = [], savedByKey = new Map()
let uploads = 0, loseSave = false, referral
const applicant = { beneficiaryId: randomUUID(), firstName: 'Dana TEST', lastName: 'Reyes', status: 'ACTIVE', address: 'Test address', barangay: { barangayName: 'Test North', city: 'Test City' } }
const documents = ['ACCEPTED', 'REJECTED', 'SUPERSEDED', 'REMOVED'].map((reviewStatus, index) => ({ documentId: randomUUID(), documentType: 'VALID_ID', originalFileName: `test-id-${index}.pdf`, reviewStatus }))
const input = { deceasedName: 'Ramon TEST Reyes', deathDate: '2026-01-10', relationship: 'Child', sendingOffice: 'TEST Barangay Office', receivingOffice: 'TEST Receiving Office', receivingAddress: 'TEST Street, Test City', signatoryName: 'TEST Authorized Officer', signatoryPosition: 'Designated officer', purpose: 'Synthetic request for assessment of funeral expenses.' }
await page.addInitScript(() => {
  sessionStorage.setItem('garantiyaid.accessToken', 'test-token')
  sessionStorage.setItem('garantiyaid.user', JSON.stringify({ userId: 'test-staff', role: sessionStorage.getItem('test-role') || 'BARANGAY_FACILITATOR', fullName: 'Test Staff' }))
})
page.on('pageerror', error => errors.push(error.message))
await page.route('**/api/v1/**', async route => {
  const request = route.request(), path = new URL(request.url()).pathname.replace('/api/v1', '')
  let data = {}
  if (path === '/health') data = { status: 'ok' }
  else if (path === '/staff-notifications') data = { notifications: [], unreadCount: 0, pagination: { total: 0 } }
  else if (path === `/beneficiaries/${applicant.beneficiaryId}`) data = { beneficiary: applicant }
  else if (path.endsWith('/documents')) {
    if (request.method() === 'POST') {
      uploads++
      assert.match(request.headers()['content-type'], /multipart\/form-data/)
      const document = { documentId: randomUUID(), documentType: 'OTHER', originalFileName: 'death-certificate.pdf', reviewStatus: 'SUBMITTED' }
      documents.push(document); data = { document }
    } else data = { documents }
  } else if (path.startsWith('/burial-referrals') && ['POST', 'PATCH'].includes(request.method())) {
    const body = request.postDataJSON(), key = request.headers()['idempotency-key']
    const checked = (request.method() === 'POST' ? createBurialSchema : editBurialSchema).safeParse(body)
    assert.equal(checked.success, true, JSON.stringify(checked.error?.issues))
    writes.push({ method: request.method(), body, key })
    if (!savedByKey.has(key)) {
      referral = { ...body, referralId: referral?.referralId || randomUUID(), beneficiary: applicant, status: 'DRAFT', version: (referral?.version || 0) + 1, createdAt: new Date().toISOString(), createdBy: { fullName: 'Test Staff' } }
      savedByKey.set(key, referral)
    }
    if (loseSave) { loseSave = false; return route.abort('failed') }
    data = { referral: savedByKey.get(key) }
  } else if (path.startsWith('/burial-referrals/')) data = { referral }
  else if (path === '/burial-referrals') data = { referrals: referral ? [referral] : [], pagination: { page: 1, totalPages: 1, total: referral ? 1 : 0 } }
  await route.fulfill({ json: { success: true, data } })
})
await page.route('**/socket.io/**', route => route.abort())
await page.routeWebSocket(/socket\.io/, () => {})
const file = size => ({ name: 'test-death-certificate.pdf', mimeType: 'application/pdf', buffer: size === undefined ? Buffer.from('%PDF-1.4\nSynthetic document\n%%EOF') : Buffer.alloc(size) })

try {
  await page.goto(`${origin}/burial-referrals?beneficiary=${applicant.beneficiaryId}`)
  const editor = page.getByRole('region', { name: 'Prepare burial referral', exact: true })
  await expect(editor).toContainText('Dana TEST Reyes')
  for (const [key, value] of Object.entries(input)) await page.locator(`#burial-${key}`).fill(value)
  await expect(page.locator('#burial-deceasedName').locator('..').locator('svg')).toHaveAttribute('aria-hidden', 'true')
  for (const width of [1920, 1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 })
    await page.evaluate(() => window.scrollTo(0, 0))
    await expect.poll(() => editor.evaluate(element => {
      const main = document.querySelector('#dashboard-content').getBoundingClientRect(), bounds = element.getBoundingClientRect()
      return Math.abs(main.x + main.width / 2 - bounds.x - bounds.width / 2)
    }), { message: `Form centered in workspace at ${width}px.` }).toBeLessThanOrEqual(2)
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
    await page.screenshot({ path: `${output}/prepare-${width}.png`, fullPage: true })
  }
  await page.setViewportSize({ width: 1440, height: 1000 })
  const existing = page.getByRole('radio', { name: 'Use an existing document', exact: true })
  const upload = page.getByRole('radio', { name: 'Upload a new document', exact: true })
  await expect(existing).toBeChecked()
  await expect(page.locator('#burial-existing-doc option')).toHaveCount(2)
  await page.locator('#burial-existing-doc').selectOption(documents[0].documentId)
  await page.locator('#burial-doc-label').fill('   ')
  await expect(page.getByRole('button', { name: 'Add to this referral', exact: true })).toBeDisabled()
  await page.locator('#burial-doc-label').fill('Applicant ID')
  await page.getByRole('button', { name: 'Add to this referral', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'document attached' })).toContainText('1 document attached')
  await expect(page.locator('#burial-existing-doc option')).toHaveCount(1)
  await page.getByRole('button', { name: 'Remove Applicant ID', exact: true }).click()
  await expect(page.locator('#burial-existing-doc option')).toHaveCount(2)
  await page.locator('#burial-existing-doc').selectOption(documents[0].documentId)
  await page.locator('#burial-doc-label').fill('Applicant ID')
  await page.getByRole('button', { name: 'Add to this referral', exact: true }).click()
  await existing.focus(); await page.keyboard.press('ArrowRight')
  await expect(upload).toBeChecked()
  await page.locator('#burial-upload-label').fill('Death certificate')
  await page.locator('#burial-upload-file').setInputFiles(file(0))
  await page.getByRole('button', { name: 'Upload and attach', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('not empty')
  await page.locator('#burial-upload-file').setInputFiles(file(5 * 1024 * 1024 + 1))
  await page.getByRole('button', { name: 'Upload and attach', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('5 MB or smaller')
  assert.equal(uploads, 0)
  await page.locator('#burial-upload-file').setInputFiles(file())
  await existing.check(); await upload.check()
  await expect(page.locator('#burial-upload-label')).toHaveValue('Death certificate')
  assert.equal(await page.locator('#burial-upload-file').evaluate(element => element.files.length), 1)
  await page.getByRole('button', { name: 'Upload and attach', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Remove Death certificate', exact: true })).toBeVisible()
  assert.equal(uploads, 1)
  await page.locator('#burial-upload-label').fill('Unattached description')
  await page.screenshot({ path: `${output}/attachments-1440.png`, fullPage: true })
  console.log('PASS: centered 1920–320px layout, SVG labels, existing/upload selection, file retention, remove/re-add, rejected/superseded exclusion and upload limits.')

  loseSave = true
  await page.getByRole('button', { name: 'Save draft', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Retry last save', exact: true })).toBeVisible()
  await expect(page.locator('#burial-deceasedName')).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Back to referrals', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: 'Retry last save', exact: true }).click()
  await expect(page).toHaveURL(/referral=/)
  await expect(page.getByRole('button', { name: 'Edit details', exact: true })).toBeVisible()
  assert.deepEqual(writes[0], writes[1])
  assert.equal(savedByKey.size, 1)
  assert.equal(referral.attachments.length, 2)
  assert.equal(referral.status, 'DRAFT')
  await page.getByRole('button', { name: 'Edit details', exact: true }).click()
  await expect(page.locator('#burial-deceasedName')).toHaveValue(input.deceasedName)
  await page.locator('#burial-purpose').fill('Corrected synthetic purpose for assessment.')
  await page.getByRole('button', { name: 'Save draft', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Edit details', exact: true })).toBeVisible()
  assert.equal(writes.at(-1).method, 'PATCH')
  assert.equal(writes.at(-1).body.version, 1)
  assert.equal(referral.version, 2)
  console.log('PASS: draft save/edit schema compatibility; incomplete add-document forms do not block draft save; interrupted save retries retain the original body/key.')

  for (let index = 0; index < 10; index++) {
    const document = { documentId: randomUUID(), documentType: 'OTHER', originalFileName: `extra-${index}.pdf`, reviewStatus: 'SUBMITTED' }
    documents.push(document); referral.attachments.push({ documentId: document.documentId, label: `Synthetic supporting file ${index}` })
  }
  await page.reload()
  await page.getByRole('button', { name: 'Edit details', exact: true }).click()
  await expect(page.getByText('The 12-document limit is reached.', { exact: false })).toBeVisible()
  await expect(upload).toHaveCount(0)
  await page.getByRole('button', { name: 'Remove Applicant ID', exact: true }).click()
  await expect(upload).toBeVisible()
  await page.getByRole('button', { name: 'Cancel editing', exact: true }).click()
  for (const role of ['SYSTEM_ADMIN', 'DSWD_STAFF']) {
    await page.evaluate(role => sessionStorage.setItem('test-role', role), role)
    await page.reload()
    await expect(page.getByRole('button', { name: 'Edit details', exact: true })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Save draft', exact: true })).toHaveCount(0)
  }
  assert.deepEqual(errors, [])
  console.log('PASS: 12-attachment limit and recovery after removal; Admin/DSWD cannot edit a Barangay draft; no page errors or live writes.')
} catch (error) {
  await page.screenshot({ path: `${output}/failure.png`, fullPage: true })
  throw error
} finally {
  await browser.close()
  await vite.close()
}
