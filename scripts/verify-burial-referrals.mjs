import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { chromium, expect } from '@playwright/test'
import { createServer } from 'vite'
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
    await as('barangay', `/beneficiaries?beneficiary=${browserApplicant.beneficiaryId}`)
    await page.getByRole('button', { name: 'Prepare burial referral', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Prepare burial referral', exact: true })).toBeVisible()
    for (const key of ['deceasedName', 'deathDate', 'relationship', 'sendingOffice', 'receivingOffice', 'receivingAddress', 'signatoryName', 'signatoryPosition', 'purpose']) await page.locator(`#burial-${key}`).fill(fields[key])
    await page.getByRole('radio', { name: 'Upload a new document', exact: true }).check()
    await page.getByLabel('New document description', { exact: true }).fill('Death certificate (synthetic fixture)')
    await page.locator('#burial-upload-file').setInputFiles({ name: 'death-certificate.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\nSynthetic fixture only\n%%EOF') })
    const uploaded = page.waitForResponse(response => response.request().method() === 'POST' && response.url().endsWith(`/beneficiaries/${browserApplicant.beneficiaryId}/documents`), { timeout: 30000 })
    await page.getByRole('button', { name: 'Upload and attach', exact: true }).click()
    const uploadedResponse = await uploaded
    assert.equal(uploadedResponse.status(), 201, await uploadedResponse.text())
    await expect(page.getByRole('button', { name: 'Remove Death certificate (synthetic fixture)' })).toBeVisible({ timeout: 15000 })
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
    await page.getByRole('button', { name: 'Submit for review', exact: true }).click()
    await expect(page.getByText('Awaiting review', { exact: true })).toBeVisible()
    await as('dswd', path)
    await expect(page.getByRole('button', { name: 'Prepare letter for signature', exact: true })).toBeDisabled()
    await page.getByRole('button', { name: 'Accept document', exact: true }).click()
    await expect(page.getByText(/death-certificate.pdf.*ACCEPTED/)).toBeVisible()
    await page.getByRole('checkbox').check()
    await page.getByRole('button', { name: 'Prepare letter for signature', exact: true }).click()
    await expect(page.getByText('Ready for signature', { exact: true })).toBeVisible()
    check('Real browser entry from beneficiary, upload, safe recovery of saved draft and DSWD review')
    await screenshot('reviewed-referral', 1440)
    await page.getByRole('button', { name: 'Preview letter', exact: true }).click()
    const letter = page.getByRole('dialog', { name: 'Referral for burial assistance assessment' })
    await expect(letter).toContainText('FOR SIGNATURE')
    await expect(letter).toContainText('Ana Synthetic')
    await expect(letter).toContainText('Juan Synthetic')
    const beforePrint = (await request('barangay', `/burial-referrals/${referralId}`)).data.referral
    await page.evaluate(() => { window.printCalls = 0; window.print = () => { window.printCalls++ } })
    await letter.getByRole('button', { name: 'Print / Save PDF', exact: true }).click()
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
    await page.getByLabel('Signed-original / dispatch reference', { exact: true }).fill('BROWSER-SIGNED-ORIGINAL-01')
    await page.getByRole('checkbox').check()
    await page.getByRole('button', { name: 'Record signed issuance', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Record receiving-office response', exact: true })).toBeVisible()
    await page.getByLabel('Reported outcome', { exact: true }).selectOption('OTHER')
    await page.getByLabel('Response / withdrawal document reference', { exact: true }).fill('BROWSER-RESPONSE-01')
    await page.getByLabel('Response details and responding office', { exact: true }).fill('Synthetic office returned the case to its own service desk; no payment recorded here.')
    await page.getByRole('button', { name: 'Save response and close referral', exact: true }).click()
    await expect(page.getByText('Response recorded', { exact: true })).toBeVisible()
    await as('admin', path)
    await expect(page.getByText('Read-only oversight.', { exact: false })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Record signed issuance', exact: true })).toHaveCount(0)
    for (const width of [1440, 390, 320]) await screenshot('completed-referral', width)
    await page.getByRole('button', { name: 'Preview letter', exact: true }).click()
    await expect(letter).toContainText('ISSUED RECORD COPY')
    await page.emulateMedia({ media: 'print' })
    await page.pdf({ path: resolve(output, 'issued-record-copy.pdf'), format: 'A4', preferCSSPageSize: true, printBackground: true })
    await page.emulateMedia({ media: 'screen' })
    await letter.getByRole('button', { name: 'Close preview', exact: true }).click()
    await as('barangay', '/burial-referrals')
    await page.getByLabel('Applicant or deceased name', { exact: true }).fill('Ana')
    await page.getByRole('button', { name: 'Search', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Open referral', exact: true })).toHaveCount(1)
    await screenshot('referral-list', 1440)
    assert.equal((await prisma.burialReferral.findUniqueOrThrow({ where: { referralId } })).status, 'CLOSED')
    assert.equal(await prisma.claim.count(), 0)
    assert.deepEqual(errors, [])
    check('Signed issuance, external-response recording, read-only Admin and searchable list through actual API')
    const long = value => value.repeat(20)
    const attachments = [...beforePrint.attachments]
    for (const name of ['Applicant identification', 'Funeral statement of account']) {
      const form = new FormData(); form.set('documentType', 'OTHER')
      form.set('file', new Blob(['%PDF-1.4\nSynthetic fixture only\n%%EOF'], { type: 'application/pdf' }), 'supporting-document.pdf')
      const document = (await request('barangay', `/beneficiaries/${browserApplicant.beneficiaryId}/documents`, { method: 'POST', form, status: 201 })).data.document
      await post('dswd', `/beneficiaries/${browserApplicant.beneficiaryId}/documents/${document.documentId}/review`, { decision: 'ACCEPTED' })
      attachments.push({ documentId: document.documentId, label: `${name} (synthetic)` })
    }
    const longInput = { ...fields, beneficiaryId: browserApplicant.beneficiaryId, deceasedName: long('Synthetic Long Name ').slice(0, 150), receivingOffice: long('Synthetic Office ').slice(0, 150), receivingAddress: long('Synthetic address ').slice(0, 300), purpose: long('Synthetic assessment details for testing long paragraphs only. ').repeat(2).slice(0, 1500), attachments }
    let lengthy = (await post('barangay', '/burial-referrals', longInput, { key: randomUUID(), status: 201 })).data.referral
    lengthy = (await post('barangay', `/burial-referrals/${lengthy.referralId}/actions`, { action: 'submit', version: lengthy.version }, { key: randomUUID() })).data.referral
    lengthy = (await post('dswd', `/burial-referrals/${lengthy.referralId}/actions`, { action: 'prepare', version: lengthy.version, confirmed: true }, { key: randomUUID() })).data.referral
    await as('dswd', `/burial-referrals?referral=${lengthy.referralId}`)
    await page.getByRole('button', { name: 'Preview letter', exact: true }).click()
    await expect(letter).toBeVisible()
    await page.emulateMedia({ media: 'print' })
    await page.pdf({ path: resolve(output, 'long-referral-letter.pdf'), format: 'A4', preferCSSPageSize: true, printBackground: true })
    assert.deepEqual(errors, [])
    check('Long names, office address, multiple attachments and maximum-length purpose export without shortening the reviewed record')
  } catch (error) {
    if (page) await page.screenshot({ path: resolve(output, 'failure.png'), fullPage: true })
    throw error
  } finally { await browser?.close(); await vite.close() }
}
