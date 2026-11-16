import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { chromium, expect } from '@playwright/test'
import { createServer } from 'vite'
import { jsPDF } from 'jspdf'
import { env } from '../../garantiyaid-backend/src/config/env.js'

export async function runBurialJourney({ staff, browserApplicant, fields, prisma, baseUrl, output, check, request, post }) {
  const root = fileURLToPath(new URL('..', import.meta.url))
  const vite = await createServer({ root, configFile: resolve(root, 'vite.config.js'), cacheDir: resolve(output, '../../tmp/burial-vite'), server: { host: '127.0.0.1', port: 0, strictPort: false, proxy: { '/api/v1': { target: baseUrl, changeOrigin: true }, '/socket.io': { target: baseUrl, changeOrigin: true, ws: true } } } })
  await vite.listen()
  const origin = `http://127.0.0.1:${vite.httpServer.address().port}`
  env.corsOrigins.push(origin)
  let browser, page
  try {
    browser = await chromium.launch({ headless: true, channel: 'chrome' })
    page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
    page.setDefaultTimeout(15000)
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto(origin)
    async function as(role, path) {
      await page.evaluate(session => {
        sessionStorage.setItem('garantiyaid.accessToken', session.accessToken)
        sessionStorage.setItem('garantiyaid.user', JSON.stringify(session.user))
      }, staff[role])
      await page.goto(origin + path)
    }
    async function screenshot(name, width) {
      await page.setViewportSize({ width, height: 1000 })
      await page.screenshot({ path: resolve(output, `${name}-${width}.png`), fullPage: !name.includes('preview') })
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${name}: horizontal overflow at ${width}`)
    }
    function supportingFile(name) {
      const pdf = new jsPDF()
      pdf.setFontSize(16)
      pdf.text('TEST ONLY - Synthetic supporting document', 18, 25)
      pdf.setFontSize(11)
      pdf.text(name, 18, 40)
      pdf.text('For capstone software testing only. Not an official document.', 18, 55)
      return Buffer.from(pdf.output('arraybuffer'))
    }
    await as('barangay', `/beneficiaries?beneficiary=${browserApplicant.beneficiaryId}`)
    await page.getByRole('button', { name: 'Prepare burial referral', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Prepare burial referral', exact: true })).toBeVisible()
    for (const key of ['deceasedName', 'deathDate', 'relationship', 'sendingOffice', 'receivingOffice', 'receivingAddress', 'signatoryName', 'signatoryPosition', 'purpose']) await page.locator(`#burial-${key}`).fill(fields[key])
    await page.getByRole('radio', { name: 'Upload a new document', exact: true }).check()
    await page.getByLabel('New document description', { exact: true }).fill('TEST ONLY synthetic supporting record')
    await page.locator('#burial-upload-file').setInputFiles({ name: 'test-only-supporting.pdf', mimeType: 'application/pdf', buffer: supportingFile('TEST ONLY supporting record for Maria Santos') })
    const uploaded = page.waitForResponse(response => response.request().method() === 'POST' && response.url().endsWith(`/beneficiaries/${browserApplicant.beneficiaryId}/documents`), { timeout: 30000 })
    await page.getByRole('button', { name: 'Upload and attach', exact: true }).click()
    const uploadedResponse = await uploaded
    assert.equal(uploadedResponse.status(), 201, await uploadedResponse.text())
    await expect(page.getByRole('button', { name: 'Remove TEST ONLY synthetic supporting record' })).toBeVisible({ timeout: 15000 })
    await screenshot('prepare-referral', 390)
    const keys = []
    await page.route('**/api/v1/burial-referrals', async route => {
      if (route.request().method() !== 'POST') return route.continue()
      keys.push(route.request().headers()['idempotency-key'])
      const response = await route.fetch()
      assert.equal(response.status(), 201)
      if (keys.length === 1) await route.abort('failed')
      else await route.fulfill({ response })
    })
    await page.getByRole('button', { name: 'Save draft', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Retry last save', exact: true })).toBeVisible()
    await expect(page.locator('#burial-deceasedName')).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Back to referrals', exact: true })).toBeDisabled()
    await page.getByRole('button', { name: 'Retry last save', exact: true }).click()
    await expect(page).toHaveURL(/referral=/)
    await page.unroute('**/api/v1/burial-referrals')
    const referralId = new URL(page.url()).searchParams.get('referral')
    const path = `/burial-referrals?referral=${referralId}`
    assert.equal(keys.length, 2); assert.equal(keys[0], keys[1])
    assert.equal(await prisma.burialReferral.count({ where: { beneficiaryId: browserApplicant.beneficiaryId } }), 1)
    await page.reload()
    await expect(page.getByText('Draft', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Submit for review', exact: true }).click()
    await expect(page.getByText('Awaiting review', { exact: true })).toBeVisible()
    await as('dswd', path)
    await expect(page.getByRole('button', { name: 'Prepare letter for signature', exact: true })).toBeDisabled()
    await page.getByLabel('What needs correction?', { exact: true }).fill('TEST ONLY: correct the receiving-office address.')
    await page.getByRole('button', { name: 'Return for correction', exact: true }).click()
    await expect(page.getByText('Needs correction', { exact: true })).toBeVisible()
    await as('barangay', path)
    await page.getByRole('button', { name: 'Edit details', exact: true }).click()
    await page.locator('#burial-receivingAddress').fill('TEST ONLY corrected receiving-office address, Test City')
    await page.getByRole('button', { name: 'Save draft', exact: true }).click()
    await expect(page.getByText('Needs correction', { exact: true })).toBeVisible()
    assert.equal(new URL(page.url()).searchParams.get('referral'), referralId)
    await page.getByRole('button', { name: 'Submit for review', exact: true }).click()
    await expect(page.getByText('Awaiting review', { exact: true })).toBeVisible()
    await as('dswd', path)
    await expect(page.getByRole('region', { name: 'Referral steps', exact: true })).toContainText('Step 2 of 4')
    const beforeView = (await request('dswd', `/burial-referrals/${referralId}`)).data.referral
    await page.getByRole('button', { name: 'View document', exact: true }).click()
    const documentPreview = page.getByRole('dialog', { name: 'Document preview', exact: true })
    await expect(documentPreview.locator('iframe')).toBeVisible()
    await expect(documentPreview).toContainText('Previewing does not accept the document.')
    await page.keyboard.press('Escape')
    await expect(page.getByRole('button', { name: 'View document', exact: true })).toBeFocused()
    assert.deepEqual((await request('dswd', `/burial-referrals/${referralId}`)).data.referral, beforeView)
    await page.getByRole('button', { name: 'Accept document', exact: true }).click()
    await expect(page.getByText(/test-only-supporting.pdf.*ACCEPTED/)).toBeVisible()
    await page.getByRole('checkbox').check()
    await page.getByRole('button', { name: 'Prepare letter for signature', exact: true }).click()
    await expect(page.getByText('Ready for signature', { exact: true })).toBeVisible()
    await page.reload()
    await expect(page.getByText('Ready for signature', { exact: true })).toBeVisible()
    check('Real browser living-applicant entry, valid TEST ONLY PDF upload, safe save retry, same-case correction/resubmission and DSWD review')
    await screenshot('reviewed-referral', 1440)
    await page.getByRole('button', { name: 'Preview letter', exact: true }).click()
    const letter = page.getByRole('dialog', { name: 'Referral for burial assistance assessment' })
    await expect(letter).toContainText('FOR SIGNATURE')
    await expect(letter).toContainText('TEST Maria Santos')
    await expect(letter).toContainText('TEST Jose Santos')
    const beforePrint = (await request('barangay', `/burial-referrals/${referralId}`)).data.referral
    const download = page.waitForEvent('download')
    await letter.getByRole('button', { name: 'Save PDF', exact: true }).click()
    await (await download).saveAs(resolve(output, 'referral-download.pdf'))
    await page.evaluate(() => { window.printCalls = 0; window.print = () => { window.printCalls++ } })
    await letter.getByRole('button', { name: 'Print letter', exact: true }).click()
    assert.equal(await page.evaluate(() => window.printCalls), 1)
    await page.emulateMedia({ media: 'print' })
    await page.pdf({ path: resolve(output, 'referral-letter.pdf'), format: 'A4', preferCSSPageSize: true, printBackground: true })
    assert.equal(await page.locator('#root').evaluate(element => getComputedStyle(element).display), 'none')
    await page.emulateMedia({ media: 'screen' })
    for (const width of [1440, 390, 320]) {
      await screenshot('letter-preview', width)
      assert.equal(await letter.evaluate(element => element.scrollWidth <= element.clientWidth), true, `Letter overflow at ${width}`)
    }
    assert.deepEqual((await request('barangay', `/burial-referrals/${referralId}`)).data.referral, beforePrint)
    await page.keyboard.press('Escape')
    await expect(letter).not.toBeVisible()
    await expect(page.getByRole('button', { name: 'Preview letter', exact: true })).toBeFocused()
    check('A4 PDF export, keyboard dialog focus and 1440/390/320px letter preview; printing has no mutation')
    await as('barangay', path)
    await expect(page.getByRole('region', { name: 'Referral steps', exact: true })).toContainText('Step 3 of 4')
    await expect(page.getByLabel('Signed-original / dispatch reference', { exact: true })).toHaveAccessibleDescription(/logbook entry.*not the referral status/)
    await expect(page.getByRole('button', { name: 'Record signed issuance', exact: true })).toBeDisabled()
    await screenshot('issuance-form', 1440)
    await screenshot('issuance-form', 320)
    await page.getByLabel('Signed-original / dispatch reference', { exact: true }).fill('TEST-ISSUE-01')
    await page.getByRole('checkbox').check()
    await page.getByRole('button', { name: 'Record signed issuance', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Record receiving-office response', exact: true })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Referral steps', exact: true })).toContainText('Step 4 of 4')
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Record receiving-office response', exact: true })).toBeVisible()
    await page.getByLabel('Reported outcome', { exact: true }).selectOption('OTHER')
    await page.getByLabel('Response / withdrawal document reference', { exact: true }).fill('TEST-RESPONSE-01')
    await page.getByLabel('Response details and responding office', { exact: true }).fill('TEST ONLY simulated office response. No actual government decision or payment.')
    await page.getByRole('button', { name: 'Save response and close referral', exact: true }).click()
    await expect(page.getByText('Response recorded', { exact: true })).toBeVisible()
    await as('admin', path)
    await expect(page.getByText('Read-only oversight.', { exact: false })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Record signed issuance', exact: true })).toHaveCount(0)
    for (const width of [1440, 390, 320]) await screenshot('completed-referral', width)
    await page.getByRole('button', { name: 'Preview letter', exact: true }).click()
    await expect(letter).toContainText('ISSUED RECORD COPY')
    const issuedDownload = page.waitForEvent('download')
    await letter.getByRole('button', { name: 'Save PDF', exact: true }).click()
    await (await issuedDownload).saveAs(resolve(output, 'issued-download.pdf'))
    await page.emulateMedia({ media: 'print' })
    await page.pdf({ path: resolve(output, 'issued-record-copy.pdf'), format: 'A4', preferCSSPageSize: true, printBackground: true })
    await page.emulateMedia({ media: 'screen' })
    await letter.getByRole('button', { name: 'Close preview', exact: true }).click()
    await as('barangay', '/burial-referrals')
    await page.getByLabel('Applicant or deceased name', { exact: true }).fill('TEST Maria Santos')
    await page.getByRole('button', { name: 'Search', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Open referral', exact: true })).toHaveCount(1)
    await screenshot('referral-list', 1440)
    assert.equal((await prisma.burialReferral.findUniqueOrThrow({ where: { referralId } })).status, 'CLOSED')
    assert.equal(await prisma.claim.count(), 0)
    assert.equal(await prisma.transaction.count(), 0)
    assert.deepEqual(errors, [])
    check('Signed issuance, external-response recording, read-only Admin and searchable list through actual API')
    const long = value => value.repeat(20)
    const attachments = [...beforePrint.attachments]
    for (const name of ['Applicant identification', 'Funeral statement of account']) {
      const form = new FormData(); form.set('documentType', 'OTHER')
      form.set('file', new Blob([supportingFile(`TEST ONLY ${name}`)], { type: 'application/pdf' }), 'test-only-supporting-document.pdf')
      const document = (await request('barangay', `/beneficiaries/${browserApplicant.beneficiaryId}/documents`, { method: 'POST', form, status: 201 })).data.document
      await post('dswd', `/beneficiaries/${browserApplicant.beneficiaryId}/documents/${document.documentId}/review`, { decision: 'ACCEPTED' })
      attachments.push({ documentId: document.documentId, label: `TEST ONLY ${name} - ${name.repeat(5)}`.slice(0, 100) })
    }
    await prisma.beneficiary.update({ where: { beneficiaryId: browserApplicant.beneficiaryId }, data: { firstName: long('TEST Long Applicant ').slice(0, 100), lastName: long('Long Surname ').slice(0, 100), address: long('TEST ONLY long address ').slice(0, 300) } })
    assert.deepEqual((await request('barangay', `/burial-referrals/${referralId}`)).data.referral.letterSnapshot, beforePrint.letterSnapshot)
    const longInput = { ...fields, beneficiaryId: browserApplicant.beneficiaryId, deceasedName: long('TEST Long Deceased Name ').slice(0, 150), signatoryName: long('TEST Long Authorized Officer ').slice(0, 150), receivingOffice: long('TEST Office ').slice(0, 150), receivingAddress: long('TEST ONLY address ').slice(0, 300), purpose: ('TEST ONLY Unicode rendering: María Peña / José Niño / 李明. ' + long('TEST ONLY assessment details for testing long paragraphs. ').repeat(2)).slice(0, 1500), attachments }
    let lengthy = (await post('barangay', '/burial-referrals', longInput, { key: randomUUID(), status: 201 })).data.referral
    lengthy = (await post('barangay', `/burial-referrals/${lengthy.referralId}/actions`, { action: 'submit', version: lengthy.version }, { key: randomUUID() })).data.referral
    lengthy = (await post('dswd', `/burial-referrals/${lengthy.referralId}/actions`, { action: 'prepare', version: lengthy.version, confirmed: true }, { key: randomUUID() })).data.referral
    await as('dswd', `/burial-referrals?referral=${lengthy.referralId}`)
    await page.getByRole('button', { name: 'Preview letter', exact: true }).click()
    await expect(letter).toBeVisible()
    for (const width of [1440, 390, 320]) {
      await screenshot('long-letter-preview', width)
      assert.equal(await letter.evaluate(element => element.scrollWidth <= element.clientWidth), true, `Long letter overflow at ${width}`)
    }
    const longDownload = page.waitForEvent('download')
    await letter.getByRole('button', { name: 'Save PDF', exact: true }).click()
    await (await longDownload).saveAs(resolve(output, 'long-download.pdf'))
    await page.emulateMedia({ media: 'print' })
    await page.pdf({ path: resolve(output, 'long-referral-letter.pdf'), format: 'A4', preferCSSPageSize: true, printBackground: true })
    assert.deepEqual(errors, [])
    check('Long names, office address, multiple attachments and maximum-length purpose export without shortening the reviewed record')
  } catch (error) {
    if (page) await page.screenshot({ path: resolve(output, 'failure.png'), fullPage: true })
    throw error
  } finally { await browser?.close(); await vite.close() }
}
