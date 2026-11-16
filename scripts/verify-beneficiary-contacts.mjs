import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import { chromium, expect } from '@playwright/test'
import readXlsxFile from 'read-excel-file/node'

// Synthetic workbook and mocked APIs only. No records, emails or SMS are created.
const root = fileURLToPath(new URL('../', import.meta.url))
const output = fileURLToPath(new URL('../artifacts/beneficiary-contacts/', import.meta.url))
const original = fileURLToPath(new URL('../../outputs/linked-imports-20261116/02-linked-beneficiaries-10.xlsx', import.meta.url))
const updated = fileURLToPath(new URL('../../outputs/beneficiary-contacts-20261116/02-linked-beneficiaries-10-with-contacts.xlsx', import.meta.url))
const barangaySheets = await readXlsxFile(fileURLToPath(new URL('../../outputs/linked-imports-20261116/01-cebu-city-barangays-10.xlsx', import.meta.url)))
const barangays = barangaySheets[0].data.slice(1).map(([barangayName, barangayCode, city, province], index) => ({ barangayId: `22222222-2222-4222-8222-${String(index + 1).padStart(12, '0')}`, barangayName, barangayCode, city, province, isActive: true }))
const actor = { userId: '11111111-1111-4111-8111-111111111111', fullName: 'Maria Santos', role: 'SYSTEM_ADMIN', isActive: true, archivedAt: null }
Object.assign(process.env, { NODE_ENV: 'test', DEV_QUICK_LOGIN_ENABLED: 'false', DATABASE_URL: 'postgresql://none:none@127.0.0.1:1/import_fixture_unconnected', SMS_PROVIDER_MODE: 'SIMULATED', EMAIL_PROVIDER_MODE: 'DISABLED' })
const { validateBeneficiaryImport } = await import('../../garantiyaid-backend/src/modules/beneficiaries/beneficiaryImport.service.js')
const database = { barangay: { findMany: async () => barangays }, beneficiary: { findMany: async () => [] } }
const fixture = `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div><script type="module">
import React from 'react';import {createRoot} from 'react-dom/client';import Dialog from '/src/components/beneficiaries/BeneficiaryImportDialog.jsx';import '/src/index.css';
const root=createRoot(document.getElementById('root')),noop=()=>{};
root.render(React.createElement(Dialog,{accessToken:'contacts-fixture',user:${JSON.stringify(actor)},barangays:${JSON.stringify(barangays)},programs:[],onClose:()=>root.unmount(),onImported:noop,onNavigate:noop,onSessionExpired:()=>{throw new Error('Unexpected expiry')}}));
</script></body></html>`
const vite = await createServer({ root, cacheDir: `${root}/node_modules/.vite-beneficiary-contacts`, logLevel: 'error', define: { 'import.meta.env.VITE_API_URL': JSON.stringify('https://beneficiary-contacts.example.test/api/v1') }, server: { host: '127.0.0.1', port: 0, hmr: false }, plugins: [{ name: 'beneficiary-contact-fixture', configureServer(server) { server.middlewares.use(async (req, res, next) => { if (!req.url.startsWith('/__contact-check')) return next(); res.setHeader('Content-Type', 'text/html'); res.end(await server.transformIndexHtml(req.url, fixture)) }) } }] })
let browser, writes = 0
const previews = [], errors = [], checks = []
try {
  await mkdir(output, { recursive: true }); await vite.listen()
  const origin = `http://127.0.0.1:${vite.httpServer.address().port}`
  browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge', headless: true })
  const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } })
  await context.routeWebSocket('**/*', socket => socket.close())
  await context.route('**/*', async route => {
    const url = new URL(route.request().url())
    if (url.origin === origin) return route.continue()
    if (url.hostname !== 'beneficiary-contacts.example.test') return route.abort()
    let data
    if (url.pathname.endsWith('/import/jobs') && route.request().method() === 'GET') data = { imports: [] }
    else if (url.pathname.endsWith('/beneficiaries/import/preview')) {
      const { rows } = route.request().postDataJSON(); previews.push(rows)
      data = await validateBeneficiaryImport(rows, actor, database)
      assert.equal(data.validCount, 10); assert.equal(data.invalidCount, 0)
      data.approvalId = '33333333-3333-4333-8333-333333333333'
    } else { writes++; return route.abort() }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data }) })
  })
  const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message))
  await page.goto(`${origin}/__contact-check`)
  const dialog = page.getByRole('dialog')
  await page.locator('#beneficiary-import-file').setInputFiles(original)
  await dialog.getByRole('button', { name: 'Continue to column matching' }).click()
  await expect(page.getByLabel('Mobile number', { exact: true })).toHaveValue('-1')
  await expect(page.getByLabel('PhilSys number', { exact: true })).toHaveValue('-1')
  await expect(page.locator('#beneficiary-help-philsysNumber')).toContainText('Optional.')
  await expect(dialog.getByText(/If a column is missing, add it to Excel/)).toBeVisible()
  checks.push('Original file still imports without optional contacts; the missing-column explanation is visible')
  await dialog.getByRole('button', { name: 'Back to file', exact: true }).click()
  await page.locator('#beneficiary-import-file').setInputFiles(updated)
  await page.getByLabel('Worksheet', { exact: true }).selectOption('1')
  await expect(dialog.getByRole('alert')).toContainText('Choose the Data worksheet')
  await page.getByLabel('Worksheet', { exact: true }).selectOption('0')
  await dialog.getByRole('button', { name: 'Continue to column matching' }).click()
  await expect(page.getByLabel('Mobile number', { exact: true })).toHaveValue('8')
  await expect(page.getByLabel('PhilSys number', { exact: true })).toHaveValue('9')
  await expect(dialog.getByText('Example: Ending in 0001', { exact: true })).toBeVisible()
  await expect(dialog.getByText('Example: 0000000000000001', { exact: true })).toHaveCount(0)
  await expect(page.getByLabel('PhilSys number', { exact: true })).toHaveAttribute('aria-describedby', 'beneficiary-help-philsysNumber')
  for (let index = 0; index < 10; index++) await expect(page.locator(`#beneficiary-map-barangay-${index}`)).toHaveValue(barangays[index].barangayId)
  for (const width of [1280, 375, 320]) {
    await page.setViewportSize({ width, height: 1000 })
    assert.ok(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth + 1))
    await page.screenshot({ path: `${output}/mapping-${width}.png`, fullPage: true })
    if (width <= 375) {
      await page.getByLabel('PhilSys number', { exact: true }).scrollIntoViewIfNeeded()
      await page.screenshot({ path: `${output}/contacts-${width}.png`, fullPage: true })
    }
  }
  checks.push('Updated Excel auto-matches both contact columns and ten barangays; identity example is masked; desktop and mobile layouts fit')
  await page.setViewportSize({ width: 1280, height: 1000 })
  await page.getByLabel('PhilSys number', { exact: true }).selectOption('-1')
  await dialog.getByRole('button', { name: 'Review beneficiaries', exact: true }).click()
  await expect(dialog.getByRole('button', { name: 'Import 10 beneficiaries', exact: true })).toBeDisabled()
  assert.ok(previews[0].every(row => row.philsysNumber === ''))
  await dialog.getByRole('button', { name: 'Back to column matching', exact: true }).click()
  await page.getByLabel('PhilSys number', { exact: true }).selectOption('9')
  await dialog.getByRole('button', { name: 'Review beneficiaries', exact: true }).click()
  await expect(dialog.getByRole('button', { name: 'Import 10 beneficiaries', exact: true })).toBeDisabled()
  assert.equal(previews[1][0].contactNumber, '0900 000 0001'); assert.equal(previews[1][0].philsysNumber, '0000-0000-0000-0001')
  assert.ok(previews[1].every(row => row.isVerified === undefined))
  checks.push('Skipped identity values stay empty; included values reach the real validator unchanged; explicit confirmation is still required')
  assert.equal(writes, 0); assert.deepEqual(errors, [])
  const result = { passed: true, checks, actualDatabaseWrites: 0, actualMessagesSent: false }
  await writeFile(`${output}/verification.json`, JSON.stringify(result, null, 2)); console.log(JSON.stringify(result, null, 2))
} finally {
  await browser?.close(); await vite.close()
  await (await import('../../garantiyaid-backend/src/lib/prisma.js')).default.$disconnect()
}
