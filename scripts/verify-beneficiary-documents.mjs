import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { chromium, expect } from '@playwright/test'
import { createServer } from 'vite'
import { jsPDF } from 'jspdf'

// Real forms, fixture APIs only: no documents or beneficiary records reach a backend.
const output = '../output/beneficiary-documents'
await mkdir(output, { recursive: true })
const vite = await createServer({ cacheDir: '../tmp/barangay-documents-vite', server: { host: '127.0.0.1', port: 0 } })
await vite.listen()
let browser
try {
  browser = await chromium.launch({ headless: true, channel: 'chrome' })
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  page.setDefaultTimeout(15000)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const barangay = { barangayId: 'barangay-1', barangayName: 'Poblacion', city: 'Cebu City', province: 'Cebu' }
  const beneficiary = { beneficiaryId: 'person-1', firstName: 'Maria', lastName: 'Santos', status: 'ACTIVE', barangayId: barangay.barangayId, barangay, birthDate: '1990-01-01', sex: 'FEMALE', address: 'Community Road' }
  const documents = [{ documentId: 'rejected-1', documentType: 'VALID_ID', reviewStatus: 'REJECTED', originalFileName: 'old-id.pdf', reviewNotes: 'Upload a clear copy.' }]
  const programs = [
    { programId: 'program-1', programCode: 'TEST-CASH', programName: 'TEST Community assistance', status: 'ACTIVE', requiredDocumentTypes: ['VALID_ID', 'OTHER'], otherRequiredDocumentNames: ['Request letter', 'Voter ID'] },
    { programId: 'program-2', programCode: 'TEST-MED', programName: 'TEST Medical assistance', status: 'ACTIVE', requiredDocumentTypes: ['OTHER'], otherRequiredDocumentNames: ['Hospital statement'] },
    { programId: 'program-3', programCode: 'TEST-ID', programName: 'TEST ID-only program', status: 'ACTIVE', requiredDocumentTypes: ['VALID_ID'] },
    { programId: 'program-legacy', programCode: 'TEST-LEGACY', programName: 'TEST Legacy unnamed requirement', status: 'ACTIVE', requiredDocumentTypes: ['OTHER'] },
  ]
  const pagination = { page: 1, pageSize: 20, total: 1, totalPages: 1 }
  const errors = [], unhandled = []
  const pdf = new jsPDF(); pdf.text('TEST supporting document preview', 20, 30)
  const pdfBuffer = Buffer.from(pdf.output('arraybuffer'))
  const imagePage = await browser.newPage({ viewport: { width: 600, height: 400 } })
  await imagePage.setContent('<main style="padding:40px;font:24px Arial;color:#173052"><h1>TEST uploaded document</h1><p>Image preview sample — no personal records.</p></main>')
  const imageBuffers = { png: await imagePage.screenshot(), jpg: await imagePage.screenshot({ type: 'jpeg' }) }
  await imagePage.close()
  let previewFailure = false, removalFailure = false, removals = 0
  let writes = 0, documentReads = 0, failUpload = false, finishUpload
  const firstUpload = new Promise(resolve => { finishUpload = resolve })
  await page.addInitScript(() => {
    if (window.top !== window || !['http:', 'https:'].includes(location.protocol)) return
    sessionStorage.setItem('garantiyaid.accessToken', 'local-batch1')
    sessionStorage.setItem('garantiyaid.user', JSON.stringify({ userId: 'facilitator', role: 'BARANGAY_FACILITATOR', fullName: 'Barangay Staff', barangayId: 'barangay-1' }))
    window.documentBlobUrls = { created: [], revoked: [] }
    const create = URL.createObjectURL.bind(URL), revoke = URL.revokeObjectURL.bind(URL)
    URL.createObjectURL = blob => { const url = create(blob); window.documentBlobUrls.created.push(url); return url }
    URL.revokeObjectURL = url => { window.documentBlobUrls.revoked.push(url); revoke(url) }
  })
  page.on('pageerror', error => errors.push(error.message))
  await page.route('**/socket.io/**', route => route.abort())
  await page.routeWebSocket(/socket\.io/, () => {})
  await page.route('**/api/v1/**', async route => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1', '')
    let data
    if (path === '/health') data = { timestamp: new Date().toISOString() }
    else if (path === '/staff-notifications') data = { notifications: [], unreadCount: 0, pagination }
    else if (path === '/staff-notifications/unread-count') data = { unreadCount: 0 }
    else if (path === '/barangays') data = { barangays: [barangay] }
    else if (path === '/programs') data = { programs, pagination }
    else if (path === '/enrollments') data = { enrollments: [], pagination }
    else if (path === '/beneficiaries') data = { beneficiaries: [beneficiary], pagination }
    else if (path === '/beneficiaries/person-1') data = { beneficiary }
    else if (path.startsWith('/beneficiaries/person-1/documents')) {
      if (path.endsWith('/download')) {
        assert.match(route.request().headers().authorization, /^Bearer /)
        if (previewFailure) return route.fulfill({ status: 503, json: { error: { message: 'Preview service unavailable. Try again.' } } })
        if (path.includes('/image-')) {
          const extension = path.includes('image-png') ? 'png' : 'jpg'
          return route.fulfill({ contentType: extension === 'png' ? 'image/png' : 'image/jpeg', body: imageBuffers[extension] })
        }
        return route.fulfill({ contentType: 'application/pdf', body: pdfBuffer })
      }
      if (route.request().method() === 'DELETE') {
        removals++
        if (removalFailure) return route.fulfill({ status: 409, json: { error: { message: 'This document is attached to a burial referral. Detach it first.' } } })
        const documentId = path.split('/').at(-1), index = documents.findIndex(item => item.documentId === documentId)
        if (index >= 0) documents.splice(index, 1)
        return route.fulfill({ json: { data: { removed: true, documentId } } })
      }
      if (route.request().method() === 'GET') { documentReads++; data = { documents } }
      else {
        writes++
        if (writes === 1) await firstUpload
        if (failUpload) return route.fulfill({ status: 503, json: { error: { message: 'Document service unavailable. Try again.' } } })
        if (path.endsWith('/rejected-1/replacement')) {
          Object.assign(documents[0], { reviewStatus: 'SUBMITTED', originalFileName: 'corrected-id.pdf', reviewNotes: null })
          data = { document: documents[0] }
        } else {
          const multipart = route.request().postDataBuffer().toString('utf8')
          const documentType = multipart.match(/name="documentType"\r\n\r\n([^\r\n]+)/)?.[1]
          const documentName = multipart.match(/name="documentName"\r\n\r\n([^\r\n]+)/)?.[1]
          assert.ok(['VALID_ID', 'OTHER'].includes(documentType), 'Dropdown values must reach the API as real document types')
          const document = { documentId: `new-${writes}`, documentType, documentName, reviewStatus: 'SUBMITTED', originalFileName: documentName ? `${documentName}.pdf` : writes === 1 ? 'new-document.pdf' : 'retry-document.pdf' }
          documents.push(document)
          data = { document }
        }
      }
    } else { unhandled.push(path); return route.fulfill({ status: 404, json: { error: { message: `Missing fixture: ${path}` } } }) }
    return route.fulfill({ json: { data } })
  })
  const file = name => ({ name, mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n%Mock upload content') })
  await page.goto(`http://127.0.0.1:${vite.httpServer.address().port}/beneficiaries?beneficiary=person-1`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  const upload = page.getByLabel('Choose document', { exact: true })
  const uploadForm = page.getByRole('form', { name: 'Upload supporting document' })
  await page.getByRole('button', { name: 'Upload for review', exact: true }).click()
  await expect(uploadForm.getByRole('alert')).toContainText('not empty')
  await expect(upload).toBeFocused()
  assert.equal(writes, 0, 'Missing file shows an inline error without sending a request')
  await upload.setInputFiles({ name: 'too-large.pdf', mimeType: 'application/pdf', buffer: Buffer.alloc(5 * 1024 * 1024 + 1) })
  await page.getByRole('button', { name: 'Upload for review', exact: true }).click()
  await expect(uploadForm.getByRole('alert')).toContainText('5 MB or smaller')
  await upload.setInputFiles({ name: 'not-a-document.txt', mimeType: 'text/plain', buffer: Buffer.from('Synthetic unsupported file') })
  await page.getByRole('button', { name: 'Upload for review', exact: true }).click()
  await expect(uploadForm.getByRole('alert')).toContainText('not supported')
  assert.equal(writes, 0, 'Invalid files must not reach the API')
  await upload.setInputFiles(file('new-document.pdf'))
  await page.getByRole('button', { name: 'Upload for review', exact: true }).click()
  await expect.poll(() => writes).toBe(1)
  await expect(page.getByRole('button', { name: 'Uploading document...' })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Replace document' })).toBeDisabled()
  await upload.locator('xpath=ancestor::form').dispatchEvent('submit')
  finishUpload()
  await expect(page.getByText('new-document.pdf', { exact: true })).toBeVisible()
  assert.equal(writes, 1, 'Repeated submission while saving must be ignored')
  await expect(upload).toHaveValue('')
  await expect(page.getByText(/Unable to connect to GarantiyAid/)).toHaveCount(0)

  await page.getByLabel('Upload corrected Valid Id', { exact: true }).setInputFiles(file('corrected-id.pdf'))
  await page.getByRole('button', { name: 'Replace document', exact: true }).click()
  await expect(page.getByText('corrected-id.pdf', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Replace document' })).toHaveCount(0)
  assert.equal(writes, 2)

  failUpload = true
  const beforeFailure = documentReads
  await upload.setInputFiles(file('retry-document.pdf'))
  await page.getByRole('button', { name: 'Upload for review', exact: true }).click()
  await expect(page.getByText('Document service unavailable. Try again.', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Upload for review', exact: true })).toBeEnabled()
  await expect(upload).not.toHaveValue('')
  assert.equal(documentReads, beforeFailure, 'Failed save must not imply a successful document refresh')
  failUpload = false
  await page.getByRole('button', { name: 'Upload for review', exact: true }).click()
  await expect(page.getByText('retry-document.pdf', { exact: true })).toBeVisible()
  await expect(upload).toHaveValue('')
  assert.equal(writes, 4)
  assert.equal(documents.length, 3)
  const type = page.getByLabel('Document type', { exact: true })
  const program = page.getByLabel('Active program', { exact: true })
  const checklist = page.getByRole('region', { name: 'Program document checklist' })
  await program.selectOption('program-3')
  await expect(type.locator('option[value="OTHER"]')).toHaveCount(0)
  await expect(type.locator('option[value^="OTHER:"]')).toHaveCount(0)
  await program.selectOption('program-1')
  await page.getByRole('button', { name: 'Upload for review', exact: true }).click()
  await expect(uploadForm.getByRole('alert')).toContainText('Choose the type of document')
  await expect(type).toBeFocused()
  await expect(type.locator('option[value="OTHER"]')).toHaveCount(0)
  await expect(type.locator('option[value^="OTHER:"]')).toHaveCount(2)
  await expect(type.locator('option[value="OTHER:Hospital statement"]')).toHaveCount(0)
  await expect(checklist).toContainText('Request letter')
  await expect(checklist).toContainText('Voter ID')
  await expect(page.getByRole('button', { name: 'Submit enrollment', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: 'Upload Request letter', exact: true }).click()
  await expect(type).toHaveValue('OTHER:Request letter')
  await expect(upload).toBeFocused()
  await expect(page.getByLabel('Other document name', { exact: true })).toHaveCount(0)
  await upload.setInputFiles(file('request-letter.pdf'))
  failUpload = true
  await page.getByRole('button', { name: 'Upload for review', exact: true }).click()
  await expect(uploadForm.getByRole('alert')).toContainText('Document service unavailable')
  await expect(type).toHaveValue('OTHER:Request letter')
  await expect(upload).not.toHaveValue('')
  failUpload = false
  await page.getByRole('button', { name: 'Upload for review', exact: true }).click()
  await expect(page.getByText('Request letter.pdf', { exact: true })).toBeVisible()
  await expect(checklist).not.toContainText('Request letter')
  await expect(checklist).toContainText('Voter ID')
  await expect(page.getByRole('button', { name: 'Submit enrollment', exact: true })).toBeDisabled()
  await type.selectOption('OTHER:Voter ID')
  await upload.setInputFiles(file('voter-id.pdf'))
  await page.getByRole('button', { name: 'Upload for review', exact: true }).click()
  await expect(page.getByText('Voter ID.pdf', { exact: true })).toBeVisible()
  assert.deepEqual(documents.filter(item => item.documentType === 'OTHER').map(item => item.documentName), ['Request letter', 'Voter ID'])
  await expect(page.getByRole('button', { name: 'Submit enrollment', exact: true })).toBeEnabled()
  await expect(checklist).toContainText('Documents ready.')
  await program.selectOption('program-2')
  await expect(type.locator('option[value^="OTHER:"]')).toHaveCount(1)
  await expect(type.locator('option[value="OTHER:Request letter"]')).toHaveCount(0)
  await page.getByRole('button', { name: 'Upload Hospital statement', exact: true }).click()
  await expect(type).toHaveValue('OTHER:Hospital statement')
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 })
    await uploadForm.evaluate(element => window.scrollTo(0, scrollY + element.getBoundingClientRect().top - 135))
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `Documents fit ${width}px`)
    await page.screenshot({ path: `${output}/documents-${width}.png`, animations: 'disabled', style: '[data-sonner-toaster] { visibility: hidden !important; }' })
  }
  await program.selectOption('program-legacy')
  await type.selectOption('OTHER')
  const customName = page.getByLabel('Other document name', { exact: true })
  await customName.fill('   ')
  await upload.setInputFiles(file('legacy.pdf'))
  await page.getByRole('button', { name: 'Upload for review', exact: true }).click()
  await expect(uploadForm.getByRole('alert')).toContainText('Enter the document name')
  await expect(customName).toBeFocused()
  await expect(upload).not.toHaveValue('')
  await customName.fill('Legacy supporting letter')
  await page.getByRole('button', { name: 'Upload for review', exact: true }).click()
  await expect(page.getByText('Legacy supporting letter.pdf', { exact: true })).toBeVisible()
  const documentSection = page.getByRole('region', { name: 'Supporting documents' })
  const card = name => documentSection.getByRole('listitem').filter({ has: page.getByText(name, { exact: true }) })
  const previewButton = card('Legacy supporting letter.pdf').getByRole('button', { name: 'Preview', exact: true })
  previewFailure = true
  await previewButton.click()
  const preview = page.getByRole('dialog', { name: 'Document preview' })
  await expect(preview.getByRole('alert')).toContainText('Preview service unavailable')
  previewFailure = false
  await preview.getByRole('button', { name: 'Try preview again' }).click()
  await expect(preview.locator('iframe')).toHaveAttribute('src', /^blob:/)
  const downloaded = page.waitForEvent('download')
  await preview.getByRole('link', { name: 'Download file' }).click()
  assert.equal((await downloaded).suggestedFilename(), 'Legacy supporting letter.pdf')
  await preview.getByRole('button', { name: 'Close document preview' }).focus()
  await page.keyboard.press('Escape')
  await expect(preview).toHaveCount(0)
  await expect(previewButton).toBeFocused()
  assert.equal(await page.evaluate(() => window.documentBlobUrls.created.every(url => window.documentBlobUrls.revoked.includes(url))), true)
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 })
    await previewButton.click()
    await expect(preview.locator('iframe')).toHaveAttribute('src', /^blob:/)
    assert.ok(await preview.evaluate(element => element.getBoundingClientRect().width <= innerWidth), 'Preview fits viewport')
    await expect.poll(() => preview.locator('iframe').evaluate(element => element.contentDocument?.readyState)).toBe('complete')
    // Chrome's native PDF surface paints after the frame DOM finishes loading.
    if (width === 1440) await new Promise(resolve => setTimeout(resolve, 4000))
    await page.screenshot({ path: `${output}/preview-${width}.png`, animations: 'disabled', style: '[data-sonner-toaster] { visibility: hidden !important; }' })
    await preview.getByRole('button', { name: 'Close document preview' }).click()
  }
  await program.selectOption('program-1')
  const removeButton = card('Request letter.pdf').getByRole('button', { name: 'Remove', exact: true })
  await removeButton.click()
  const confirm = page.getByRole('dialog', { name: 'Remove this upload?' })
  await expect(confirm).toContainText('Request letter.pdf')
  await confirm.getByRole('button', { name: 'Cancel', exact: true }).click()
  assert.equal(removals, 0, 'Cancel must not send a removal request')
  removalFailure = true
  await removeButton.click()
  await confirm.getByRole('button', { name: 'Remove upload', exact: true }).click()
  await expect(confirm.getByRole('alert')).toContainText('attached to a burial referral')
  await expect(card('Request letter.pdf')).toHaveCount(1)
  removalFailure = false
  await confirm.getByRole('button', { name: 'Remove upload', exact: true }).click()
  await expect(confirm).toHaveCount(0)
  await expect(card('Request letter.pdf')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Supporting documents' })).toBeFocused()
  await expect(page.getByRole('button', { name: 'Submit enrollment', exact: true })).toBeDisabled()
  await expect(checklist).toContainText('Documents to upload (1)')
  documents[0].reviewStatus = 'ACCEPTED'
  for (const extension of ['png', 'jpg']) documents.push({ documentId: `image-${extension}`, originalFileName: `sample-image.${extension}`, documentType: 'OTHER', reviewStatus: 'ACCEPTED' })
  await page.reload()
  await expect(card('corrected-id.pdf').getByRole('button', { name: 'Remove', exact: true })).toHaveCount(0)
  await expect(card('corrected-id.pdf').getByRole('button', { name: 'Preview', exact: true })).toBeVisible()
  for (const extension of ['png', 'jpg']) {
    await card(`sample-image.${extension}`).getByRole('button', { name: 'Preview', exact: true }).click()
    await expect(preview.getByRole('img')).toBeVisible()
    await expect.poll(() => preview.getByRole('img').evaluate(element => element.naturalWidth)).toBe(600)
    await page.screenshot({ path: `${output}/preview-${extension}-320.png`, animations: 'disabled', style: '[data-sonner-toaster] { visibility: hidden !important; }' })
    await preview.getByRole('button', { name: 'Close document preview' }).click()
  }
  assert.deepEqual(errors, [])
  assert.deepEqual(unhandled, [])
  console.log('PASS: inline file validation, upload/replacement, repeat-submit protection and failed-upload retention/retry.')
  console.log('PASS: program-specific named document options, one-click missing requirements, separate OTHER metadata and enrollment gate; 1440/390/320px layouts.')
  console.log('PASS: authenticated PDF preview/retry/download, Escape/focus return, blob cleanup, responsive dialog; confirmed removal, cancel, failure retry, accepted protection and enrollment gate refresh.')
} finally { await browser?.close(); await vite.close() }
