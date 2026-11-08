import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium, expect } from '@playwright/test'
import { createServer } from 'vite'
import { jsPDF } from 'jspdf'

// Every API request is intercepted; review decisions only change these fixtures.
const output = resolve('../output/dswd-enrollment')
await mkdir(output, { recursive: true })
const vite = await createServer({ cacheDir: '../tmp/enrollment-review-vite', server: { host: '127.0.0.1', port: 0 } })
await vite.listen()
const origin = `http://127.0.0.1:${vite.httpServer.address().port}`
let browser
try {
  browser = await chromium.launch({ headless: true, channel: 'chrome' })
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  page.setDefaultTimeout(10000)
  page.setDefaultNavigationTimeout(30000)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const errors = []
  const unhandled = []
  const writes = []
  let status = 'FOR_VALIDATION'
  let documents = []
  let manualRequired = false
  let manualDecision = null
  let ownSubmission = false
  let failDetail = false
  let failSave = false
  let failPreview = false
  let previewReads = 0
  let conflict = false
  let reviewNotes = ''
  const user = { userId: 'dswd-1', role: 'DSWD_STAFF', fullName: 'DSWD Reviewer', employeeId: 'DSWD-001', email: 'reviewer@example.test', isActive: true, totpEnabled: true }
  const barangay = { barangayId: 'barangay-1', barangayName: 'Poblacion', city: 'Cebu City', province: 'Cebu', isActive: true }
  const program = { programId: 'program-1', programName: 'Community Assistance', programCode: 'AID-2026', programType: 'CASH_ASSISTANCE', status: 'ACTIVE', grantAmount: '1500', requiredDocumentTypes: ['VALID_ID'] }
  const beneficiary = { beneficiaryId: 'beneficiary-1', firstName: 'Maria', lastName: 'Santos', birthDate: '1990-01-01', sex: 'FEMALE', address: 'Barangay Hall Road', barangay, barangayId: barangay.barangayId, status: 'ACTIVE' }
  const document = { documentId: 'document-1', documentType: 'VALID_ID', reviewStatus: 'SUBMITTED', originalFileName: 'valid-id.pdf' }
  const pdf = new jsPDF(); pdf.text('TEST beneficiary document for DSWD review', 20, 30)
  const pdfBuffer = Buffer.from(pdf.output('arraybuffer'))
  function enrollment() {
    const results = [{ criterionId: 'age', criterionName: 'Age requirement', fieldName: 'AGE', operator: 'GREATER_THAN_OR_EQUAL', expectedValue: 18, actualValue: 36, outcome: 'MET', isRequired: true, blocking: false }]
    if (manualRequired) results.push({ criterionId: 'manual', criterionName: 'Household assessment', fieldName: 'MANUAL_REVIEW', outcome: manualDecision ? 'MET' : 'REVIEW_REQUIRED', actualValue: manualDecision, isRequired: true, blocking: !manualDecision })
    return { enrollmentId: 'enrollment-1', beneficiaryId: beneficiary.beneficiaryId, beneficiary: { ...beneficiary, documents }, program, programId: program.programId, status, reviewNotes, submittedById: ownSubmission ? user.userId : 'facilitator-1', submittedBy: { fullName: 'Barangay Facilitator' }, createdAt: '2026-10-13T02:00:00Z', eligibilityEvaluation: { overallStatus: manualRequired && !manualDecision ? 'REVIEW_REQUIRED' : 'ELIGIBLE', referenceDate: '2026-10-13', results } }
  }
  await page.addInitScript((staff) => {
    if (window.top !== window || !['http:', 'https:'].includes(location.protocol)) return
    sessionStorage.setItem('garantiyaid.accessToken', 'local-enrollment-test')
    sessionStorage.setItem('garantiyaid.user', JSON.stringify(staff))
  }, user)
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('**/socket.io/**', (route) => route.abort())
  await page.routeWebSocket(/socket\.io/, () => {})
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const path = url.pathname.replace('/api/v1', '')
    const pagination = { page: Number(url.searchParams.get('page') || 1), totalPages: 3, total: 41 }
    let data
    if (request.method() !== 'GET') {
      writes.push(path)
      if (failSave) return route.fulfill({ status: 503, json: { error: { message: 'Review service unavailable. Please try again.' } } })
      if (conflict) { status = 'NEEDS_CORRECTION'; return route.fulfill({ status: 409, json: { error: { message: 'Another reviewer has updated this case. Review the latest status.' } } }) }
      if (path === '/enrollments/enrollment-1/start-review') status = 'FOR_VALIDATION'
      else if (path === '/enrollments/enrollment-1/approve') {
        assert.equal(status, 'FOR_VALIDATION')
        assert.ok(documents.some((item) => item.reviewStatus === 'ACCEPTED'))
        if (manualRequired) {
          const decisions = request.postDataJSON().manualDecisions
          assert.equal(decisions.length, 1)
          assert.equal(decisions[0].passed, true)
          assert.ok(decisions[0].remarks.length >= 5)
          manualDecision = decisions[0]
        }
        status = 'APPROVED'
      } else if (path === '/enrollments/enrollment-1/request-correction' || path === '/enrollments/enrollment-1/reject') {
        assert.ok(request.postDataJSON().reason.length >= 5)
        reviewNotes = request.postDataJSON().reason
        status = path.endsWith('/reject') ? 'REJECTED' : 'NEEDS_CORRECTION'
      } else if (path === '/beneficiaries/beneficiary-1/documents/document-1/review') {
        documents = [{ ...document, reviewStatus: request.postDataJSON().decision }]
        data = { document: documents[0] }
      } else { unhandled.push(`${request.method()} ${path}`); return route.abort() }
      data ??= { enrollment: enrollment() }
    } else if (path === '/beneficiaries/beneficiary-1/documents/document-1/download') {
      assert.equal(request.headers().authorization, 'Bearer local-enrollment-test')
      previewReads++
      if (failPreview) return route.fulfill({ status: 503, json: { error: { message: 'Preview unavailable. Try again.' } } })
      return route.fulfill({ contentType: 'application/pdf', body: pdfBuffer })
    } else if (path === '/health') data = { timestamp: new Date().toISOString() }
    else if (path === '/staff-notifications') data = { notifications: [], unreadCount: 0, pagination }
    else if (path === '/programs') data = { programs: [program], pagination }
    else if (path === '/barangays') data = { barangays: [barangay] }
    else if (path === '/beneficiaries') data = { beneficiaries: [beneficiary], pagination }
    else if (path === '/beneficiaries/beneficiary-1') data = { beneficiary }
    else if (path === '/beneficiaries/beneficiary-1/documents') data = { documents }
    else if (path === '/distributions') data = { distributions: [], pagination: { ...pagination, totalPages: 1, total: 0 } }
    else if (path === '/enrollments') data = { enrollments: [enrollment()], pagination: { ...pagination, totalPages: url.searchParams.get('pageSize') === '100' ? 1 : 3 } }
    else if (path === '/enrollments/enrollment-1') {
      if (failDetail) return route.fulfill({ status: 503, json: { error: { message: 'Review evidence unavailable.' } } })
      data = { enrollment: enrollment() }
    } else { unhandled.push(`${request.method()} ${path}`); return route.fulfill({ status: 404, json: { message: 'Missing test fixture.' } }) }
    await route.fulfill({ json: { data } })
  })
  const selected = '/enrollments?search=Maria+Santos&status=FOR_VALIDATION&programId=program-1&page=2&enrollment=enrollment-1'
  const readiness = page.locator('#readiness-heading')
  const approve = page.getByRole('button', { name: 'Approve enrollment', exact: true })
  const dialog = page.getByRole('dialog')
  async function openCase() {
    await page.goto(origin + selected)
    await expect(readiness).not.toHaveText('Checking review requirements…')
  }
  await openCase()
  await expect(readiness).toHaveText('Documents incomplete')
  await expect(page.getByText('Required eligibility criteria met', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('Eligible for approval', { exact: true })).toHaveCount(0)
  await expect(page.getByText('Not uploaded:', { exact: true })).toBeVisible()
  await expect(approve).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Open assistant conversation' })).toHaveCount(0)
  await page.screenshot({ path: `${output}/documents-incomplete-desktop.png`, fullPage: true })

  documents = [document]
  await openCase()
  const previewButton = page.getByRole('region', { name: 'Required documents' }).getByRole('button', { name: 'Preview', exact: true })
  const preview = page.getByRole('dialog', { name: 'Document preview' })
  const beforePreviewWrites = writes.length
  failPreview = true
  await previewButton.click()
  await expect(preview.getByRole('alert')).toContainText('Preview unavailable')
  failPreview = false
  await preview.getByRole('button', { name: 'Try preview again' }).click()
  await expect(preview.locator('iframe')).toHaveAttribute('src', /^blob:/)
  await expect(preview).toContainText('valid-id.pdf')
  await expect(preview).toContainText('submitted')
  await preview.getByRole('button', { name: 'Close document preview' }).focus()
  await page.keyboard.press('Escape')
  await expect(preview).toHaveCount(0)
  await expect(previewButton).toBeFocused()
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 })
    await previewButton.click()
    await expect(preview.locator('iframe')).toHaveAttribute('src', /^blob:/)
    assert.ok(await preview.evaluate(element => element.getBoundingClientRect().width <= innerWidth), `Preview fits ${width}px`)
    await page.screenshot({ path: `${output}/document-preview-${width}.png`, animations: 'disabled' })
    await preview.getByRole('button', { name: 'Close document preview' }).click()
  }
  assert.ok(previewReads >= 4)
  assert.equal(writes.length, beforePreviewWrites, 'Preview must not accept/reject documents or decide the enrollment')
  assert.equal(documents[0].reviewStatus, 'SUBMITTED')
  await expect(approve).toBeDisabled()
  await page.setViewportSize({ width: 1440, height: 1000 })
  console.log('PASS DSWD authenticated document preview, retry, unchanged review status, focus return and 1440/390/320px dialog')
  await page.getByRole('button', { name: 'Open full record' }).click()
  await expect(page.getByRole('link', { name: /Return to enrollment review/ })).toBeVisible()
  await page.getByRole('button', { name: 'Accept', exact: true }).click()
  failSave = true
  await dialog.getByRole('button', { name: 'Accept document', exact: true }).click()
  await expect(dialog.getByRole('alert')).toBeFocused()
  failSave = false
  await dialog.getByRole('button', { name: 'Accept document', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await page.getByRole('link', { name: /Return to enrollment review/ }).click()
  await expect(page).toHaveURL(origin + selected)
  await expect(page.getByLabel('Beneficiary', { exact: true })).toHaveValue('Maria Santos')
  await expect(page.getByLabel('Status', { exact: true })).toHaveValue('FOR_VALIDATION')
  await expect(page.getByLabel('Assistance program', { exact: true })).toHaveValue('program-1')
  await expect(readiness).toHaveText('Ready for decision')
  await expect(approve).toBeEnabled()
  await page.reload()
  await expect(page).toHaveURL(origin + selected)
  await expect(readiness).toHaveText('Ready for decision')

  manualRequired = true
  await openCase()
  await expect(readiness).toHaveText('Eligibility review pending')
  await expect(approve).toBeDisabled()
  await page.getByRole('radio', { name: 'Satisfied', exact: true }).check()
  await page.getByLabel('Evidence remarks').fill('No')
  await expect(approve).toBeDisabled()
  await page.getByLabel('Evidence remarks').fill('Household evidence checked against the submitted record.')
  await expect(readiness).toHaveText('Ready for decision')
  await page.getByRole('radio', { name: 'Not satisfied', exact: true }).check()
  await expect(readiness).toHaveText('Eligibility requirement not met')
  await expect(approve).toBeDisabled()
  await page.getByRole('radio', { name: 'Satisfied', exact: true }).check()
  await approve.click()
  await dialog.getByRole('button', { name: 'Approve enrollment', exact: true }).click()
  await expect(readiness).toHaveText('Review complete')
  await expect(page.getByRole('heading', { name: 'Approved for the program' })).toBeVisible()
  await expect(approve).toHaveCount(0)

  manualRequired = false
  manualDecision = null
  status = 'FOR_VALIDATION'
  await openCase()
  await page.getByRole('button', { name: 'Request correction', exact: true }).click()
  await expect(dialog.getByRole('button', { name: 'Send correction request' })).toBeDisabled()
  await dialog.getByLabel('Required correction').fill('Please submit a readable copy of the valid ID.')
  failSave = true
  await dialog.getByRole('button', { name: 'Send correction request' }).click()
  await expect(dialog.getByRole('alert')).toBeFocused()
  await expect(dialog.getByLabel('Required correction')).toHaveValue('Please submit a readable copy of the valid ID.')
  failSave = false
  await dialog.getByRole('button', { name: 'Send correction request' }).click()
  await expect(readiness).toHaveText('Awaiting corrected submission')
  await expect(approve).toHaveCount(0)

  status = 'FOR_VALIDATION'
  await openCase()
  await page.getByRole('button', { name: 'Reject enrollment', exact: true }).click()
  await expect(dialog.getByRole('button', { name: 'Reject enrollment', exact: true })).toBeDisabled()
  await dialog.getByLabel('Rejection reason').fill('The application does not meet this program requirement.')
  await dialog.getByRole('button', { name: 'Reject enrollment', exact: true }).click()
  await expect(readiness).toHaveText('Review closed')

  status = 'FOR_VALIDATION'
  ownSubmission = true
  await openCase()
  await expect(readiness).toHaveText('Another reviewer required')
  await expect(previewButton).toBeEnabled()
  await previewButton.click()
  await expect(preview.locator('iframe')).toHaveAttribute('src', /^blob:/)
  await preview.getByRole('button', { name: 'Close document preview' }).click()
  await expect(approve).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Request correction', exact: true })).toHaveCount(0)
  ownSubmission = false

  // A stale decision cannot be retried after a concurrent change.
  await openCase()
  await approve.click()
  conflict = true
  await dialog.getByRole('button', { name: 'Approve enrollment', exact: true }).click()
  await expect(dialog.getByRole('alert')).toContainText('Another reviewer')
  await expect(dialog.getByRole('button', { name: 'Approve enrollment', exact: true })).toBeDisabled()
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(readiness).toHaveText('Awaiting corrected submission')
  conflict = false

  documents = [document]
  status = 'FOR_VALIDATION'
  await openCase()
  await page.getByRole('button', { name: 'Reject', exact: true }).click()
  await dialog.getByLabel('Correction reason').fill('The ID scan is unreadable. Please upload a clearer copy.')
  await dialog.getByRole('button', { name: 'Reject document', exact: true }).click()
  await expect(readiness).toHaveText('Documents incomplete')
  await expect(approve).toBeDisabled()
  documents = [{ ...document, reviewStatus: 'ACCEPTED' }]

  // Detail failure after selecting from the queue must not expose enabled decisions.
  status = 'FOR_VALIDATION'
  failDetail = true
  await page.goto(origin + selected)
  await expect(page.getByRole('heading', { name: 'Select an enrollment' })).toHaveCount(0)
  await expect(page.getByText('Eligibility evidence could not be loaded', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Try again', exact: true })).toBeVisible()
  await page.goto(origin + '/enrollments')
  await page.getByRole('button', { name: 'Review case', exact: true }).click()
  await expect(readiness).toHaveText('Review needs a refresh')
  await expect(approve).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Request correction', exact: true })).toBeDisabled()
  failDetail = false
  await page.getByRole('button', { name: 'Try again', exact: true }).click()
  await expect(readiness).toHaveText('Ready for decision')

  // The first review action belongs in the summary, before the four-document list.
  program.requiredDocumentTypes = ['VALID_ID', 'BARANGAY_CERTIFICATE', 'OTHER']
  program.otherRequiredDocumentNames = ['Request letter', 'Voter ID']
  documents = [document, { ...document, documentId: 'document-2', documentType: 'BARANGAY_CERTIFICATE', originalFileName: 'barangay-certificate.pdf' }, ...['Request letter', 'Voter ID'].map((documentName, index) => ({ ...document, documentId: `other-${index}`, documentType: 'OTHER', documentName, originalFileName: `supporting-${index}.pdf` }))]
  status = 'PENDING'
  reviewNotes = ''
  await openCase()
  const summary = page.getByRole('region', { name: 'Ready to start validation' })
  const start = page.getByRole('button', { name: 'Start validation', exact: true })
  await expect(start).toHaveCount(1)
  await expect(summary.getByRole('button', { name: 'Start validation', exact: true })).toBeVisible()
  await expect(page.getByRole('list', { name: 'Enrollment review progress' }).locator('[aria-current="step"]')).toContainText('Submitted')
  await expect(page.getByRole('button', { name: 'Accept', exact: true })).toHaveCount(0)
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 })
    await page.evaluate(() => window.scrollTo(0, 0))
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), { message: `Four-document pending case fits ${width}px after responsive layout settles` }).toBe(true)
    await page.screenshot({ path: `${output}/refined-pending-${width}.png`, fullPage: true, style: '[data-sonner-toaster] { visibility: hidden !important; }' })
  }
  failSave = true
  await start.click()
  await expect(summary.getByRole('alert')).toContainText('Review service unavailable')
  await expect(start).toBeEnabled()
  assert.equal(status, 'PENDING')
  failSave = false
  await start.click()
  await expect(readiness).toHaveText('Documents incomplete')
  await expect(page.locator('#enrollment-documents-heading')).toBeFocused()
  await expect(page.getByRole('list', { name: 'Enrollment review progress' }).locator('[aria-current="step"]')).toContainText('Validation')
  await expect(page.getByRole('button', { name: 'Accept', exact: true })).toHaveCount(4)
  await expect(approve).toBeDisabled()
  await expect(page.getByText('Age · at least 18 years', { exact: true })).toBeVisible()
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 })
    await page.evaluate(() => window.scrollTo(0, 0))
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), { message: `Four-document validation fits ${width}px after responsive layout settles` }).toBe(true)
    await page.screenshot({ path: `${output}/refined-validation-${width}.png`, fullPage: true, style: '[data-sonner-toaster] { visibility: hidden !important; }' })
  }
  program.requiredDocumentTypes = ['VALID_ID']
  delete program.otherRequiredDocumentNames
  documents = [{ ...document, reviewStatus: 'ACCEPTED' }]
  console.log('PASS four-document pending/validation layouts, one primary action in the summary, inline failure recovery and focus to required documents')

  status = 'PENDING'
  reviewNotes = ''
  await openCase()
  await expect(readiness).toHaveText('Ready to start validation')
  await expect(approve).toHaveCount(0)
  await page.getByRole('button', { name: 'Start validation', exact: true }).click()
  await expect(readiness).toHaveText('Ready for decision')
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 })
    await page.evaluate(() => window.scrollTo(0, 0))
    const overflow = await page.evaluate(() => [...document.querySelectorAll('main *')].filter(el => el.getBoundingClientRect().right > innerWidth + 1 && el.getBoundingClientRect().width > 0).map(el => ({ tag: el.tagName, class: el.className, width: el.getBoundingClientRect().width, text: el.textContent.slice(0, 80) })).slice(0, 12))
    await page.screenshot({ path: `${output}/layout-${width}.png`, fullPage: true })
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${width}px overflow: ${JSON.stringify(overflow)}`)
    await page.screenshot({ path: `${output}/ready-${width}.png`, fullPage: true })
    await page.getByRole('link', { name: 'Go to decision', exact: true }).click()
    await expect(page.locator('#enrollment-decision-heading')).toBeFocused()
    await approve.click()
    await expect(dialog).toBeVisible()
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${width}px dialog overflow`)
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  }
  await page.getByRole('button', { name: 'Back to review queue', exact: true }).click()
  await expect(page.locator('#enrollment-list-heading')).toBeFocused()
  assert.deepEqual(errors, [])
  assert.deepEqual(unhandled, [])
  console.log(JSON.stringify({ result: 'DSWD review readiness, documents, return context, decisions, failure recovery and desktop/mobile layouts passed', fixtureWrites: writes.length, screenshots: output }))
} finally {
  await browser?.close()
  await vite.close()
}
