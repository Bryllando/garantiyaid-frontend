import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import { chromium, expect } from '@playwright/test'
import Papa from 'papaparse'
import readXlsxFile from 'read-excel-file/node'
import { IMPORT_TEMPLATE_TITLES } from '../src/utils/staffImport.js'

// All API requests use fixtures; these checks never create live records or send emails.
const root = fileURLToPath(new URL('../', import.meta.url))
const artifacts = fileURLToPath(new URL('../artifacts/import-ui/', import.meta.url))
const user = { userId: '11111111-1111-4111-8111-111111111111', fullName: 'Maria Santos', employeeId: 'SYS-0001', role: 'SYSTEM_ADMIN', email: 'maria@example.test', isActive: true, totpEnabled: true }
const barangays = [{ barangayId: '22222222-2222-4222-8222-222222222222', barangayName: 'San Nicolas', barangayCode: '00001', city: 'Cebu City', province: 'Cebu', isActive: true }]
const fixture = `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div><script type="module">
import React from 'react'; import {createRoot} from 'react-dom/client';
import Administration from '/src/pages/StaffBarangayAdministrationPage.jsx';
import StaffImport from '/src/components/admin/StaffImportDialog.jsx';
import BeneficiaryImport from '/src/components/beneficiaries/BeneficiaryImportDialog.jsx';
import ProgramImport from '/src/components/programs/ProgramImportDialog.jsx';
import '/src/index.css';
const params=new URLSearchParams(location.search), user={...${JSON.stringify(user)},role:params.get('role')||'SYSTEM_ADMIN'};
const root=createRoot(document.getElementById('root')), noop=()=>{};
const props={accessToken:'fixture-token',user,barangays:${JSON.stringify(barangays)},programs:[],onClose:()=>root.unmount(),onImported:noop,onSessionExpired:()=>{throw new Error('Unexpected session expiry')},onNavigate:noop};
root.render(React.createElement(params.get('mode')==='staff'?StaffImport:params.get('mode')==='beneficiaries'?BeneficiaryImport:params.get('mode')==='programs'?ProgramImport:Administration,{...props,session:{user,accessToken:'fixture-token'},onLogout:noop}));
</script></body></html>`
const vite = await createServer({ root, cacheDir: `${root}/node_modules/.vite-import-ui`, logLevel: 'error', define: { 'import.meta.env.VITE_API_URL': JSON.stringify('https://import-api.example.test/api/v1') }, server: { host: '127.0.0.1', port: 0, hmr: false }, plugins: [{ name: 'import-ui-fixture', configureServer(server) { server.middlewares.use(async (req, res, next) => { if (!req.url.startsWith('/__import-check')) return next(); res.setHeader('Content-Type', 'text/html'); res.end(await server.transformIndexHtml(req.url, fixture)) }) } }] })
let browser, savedResult
const confirmationBodies = []
const errors = []
let mutations = 0
async function downloadedFile(page, trigger) {
  const pending = page.waitForEvent('download'); await trigger(); const download = await pending
  const stream = await download.createReadStream(); const chunks = []
  for await (const chunk of stream) chunks.push(chunk)
  return { name: download.suggestedFilename(), buffer: Buffer.concat(chunks) }
}
async function downloadedRows(page, trigger) {
  const { buffer } = await downloadedFile(page, trigger)
  return Papa.parse(buffer.toString('utf8').replace(/^\uFEFF/, '')).data
}
async function checkExcelDownload(page, fileInput) {
  const file = await downloadedFile(page, () => page.getByRole('link', { name: 'Download Excel template' }).click())
  const sheets = await readXlsxFile(file.buffer, { parseNumber: value => value })
  assert.deepEqual(sheets.map(item => item.sheet), ['Data', 'Guide'])
  await page.locator(fileInput).setInputFiles({ ...file, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  await expect(page.getByRole('alert')).toContainText('details below the column headings')
  await page.getByLabel('Worksheet', { exact: true }).selectOption('1')
  await expect(page.getByRole('alert')).toContainText('Choose the Data worksheet')
}
async function fits(page) {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), { message: 'Page overflows horizontally' }).toBe(true)
  await expect.poll(() => page.getByRole('dialog').evaluate(el => el.scrollWidth <= el.clientWidth + 1), { message: 'Import dialog overflows horizontally' }).toBe(true)
}
try {
  await mkdir(artifacts, { recursive: true }); await vite.listen()
  const origin = `http://127.0.0.1:${vite.httpServer.address().port}`
  browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge', headless: true })
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  await context.routeWebSocket('**/*', socket => socket.close())
  await context.route('**/*', async route => {
    const url = new URL(route.request().url())
    if (url.origin === origin) return route.continue()
    if (url.hostname !== 'import-api.example.test') return route.abort()
    const endpoint = url.pathname.replace('/api/v1', '')
    let data
    if (endpoint === '/users') data = { users: [user], pagination: { page: 1, totalPages: 1, total: 1 } }
    else if (endpoint === '/barangays') data = { barangays }
    else if (endpoint === '/staff-notifications') data = { notifications: [], unreadCount: 0 }
    else if (endpoint === '/health') data = { timestamp: new Date().toISOString() }
    else if (endpoint.endsWith('/import/jobs')) data = { imports: [] }
    else if (endpoint === '/barangays/import/preview') {
      const { rows } = route.request().postDataJSON()
      const checked = rows.map(({ sourceRow, ...record }) => ({ sourceRow, record, issues: barangays.some(item => item.barangayName === record.barangayName) ? ['This barangay already exists in the same city/municipality and province. Check the existing record instead.'] : [] }))
      const invalidCount = checked.filter(row => row.issues.length).length
      data = { rows: checked, invalidCount, validCount: checked.length - invalidCount, ...(invalidCount ? {} : { approvalId: '33333333-3333-4333-8333-333333333333' }) }
    } else if (endpoint === '/barangays/import/confirm') {
      const body = route.request().postDataJSON(); confirmationBodies.push({ body, key: route.request().headers()['idempotency-key'] })
      if (!savedResult) {
        const created = body.rows.map(({ sourceRow, ...record }, index) => ({ sourceRow, barangay: { ...record, barangayId: `new-${index}`, isActive: true } }))
        savedResult = { importId: body.approvalId, createdCount: created.length, barangays: created }
        barangays.push(...created.map(row => row.barangay)); mutations++
        return route.abort('connectionreset')
      }
      data = { ...savedResult, replayed: true }
    } else return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ success: false, error: { message: 'Unexpected fixture route' } }) })
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data }) })
  })
  const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message))
  await page.goto(`${origin}/__import-check?section=barangays`)
  await expect(page.getByRole('button', { name: 'Import barangays', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Add barangay', exact: true })).toBeVisible()
  await page.screenshot({ path: `${artifacts}/barangay-entry-1280.png`, fullPage: true })
  await page.getByRole('button', { name: 'Import barangays', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  const blank = await downloadedRows(page, () => dialog.getByRole('button', { name: 'Download CSV template' }).click())
  assert.equal(blank[0][0], IMPORT_TEMPLATE_TITLES.barangays); assert.equal(blank.length, 5)
  await checkExcelDownload(page, '#barangay-import-file')
  await dialog.getByText('Column guide and examples', { exact: true }).click()
  for (const width of [1280, 375, 320]) { await page.setViewportSize({ width, height: 900 }); await fits(page); await page.screenshot({ path: `${artifacts}/barangay-template-${width}.png`, fullPage: true }) }
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.locator('#barangay-import-file').setInputFiles({ name: 'barangays.csv', mimeType: 'text/csv', buffer: Buffer.from(Papa.unparse([...blank, ['San Nicolas', '00001', 'Cebu City', 'Cebu'], ['Poblacion', '00009', 'Test City', 'Cebu']])) })
  await dialog.getByRole('button', { name: 'Continue to column matching' }).click()
  await expect(page.locator('#barangay-column-city')).toHaveValue('2')
  await dialog.getByRole('button', { name: 'Review barangays', exact: true }).click()
  await expect(dialog.getByText('1 ready', { exact: true })).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Import 1 barangay' })).toBeDisabled()
  const corrections = await downloadedRows(page, () => dialog.getByRole('button', { name: 'Download corrections' }).click())
  assert.equal(corrections[1][0], '6'); assert.match(corrections[1].at(-1), /already exists/)
  await page.setViewportSize({ width: 320, height: 900 }); await fits(page); await page.screenshot({ path: `${artifacts}/barangay-review-320.png`, fullPage: true })
  await dialog.getByRole('button', { name: 'Exclude rows needing correction' }).click()
  await expect(dialog.getByText('1 ready', { exact: true })).toBeVisible()
  await dialog.getByRole('checkbox', { name: /I checked the names/ }).check()
  await dialog.getByRole('button', { name: 'Import 1 barangay' }).click()
  await expect(dialog.getByRole('button', { name: 'Retry same import' })).toBeVisible()
  await dialog.getByRole('button', { name: 'Retry same import' }).click()
  await expect(dialog.getByRole('heading', { name: '1 barangay added' })).toBeVisible()
  assert.equal(mutations, 1); assert.deepEqual(confirmationBodies[0], confirmationBodies[1])
  const resultRows = await downloadedRows(page, () => dialog.getByRole('button', { name: 'Download import results' }).click())
  assert.equal(resultRows[1][0], '7'); assert.equal(resultRows[1][2], '00009')
  await fits(page); await page.screenshot({ path: `${artifacts}/barangay-results-320.png`, fullPage: true })
  await dialog.getByRole('button', { name: 'Done', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Poblacion', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Import barangays', exact: true })).toBeFocused()

  for (const [kind, record, field, selected] of [
    ['staff', ['Maria Santos', 'maria@example.test', 'Barangay Facilitator', 'maria.santos', '09171234567', 'San Nicolas'], '#import-column-fullName', '0'],
    ['beneficiaries', ['Maria', '', 'Santos', '1990-05-23', 'FEMALE', '12 Mabini Street', 'Purok 2', 'San Nicolas', '09171234567', '', ''], '#beneficiary-column-firstName', '0'],
    ['programs', ['Emergency Food Assistance', 'FOOD-2026', 'FOOD', '', '1500.00', '150000.00', '2026-11-01', '2026-11-30', 'VALID_ID; BARANGAY_CERTIFICATE'], '#program-column-programName', '0'],
  ]) {
    await page.goto(`${origin}/__import-check?mode=${kind}`)
    const template = await downloadedRows(page, () => page.getByRole('button', { name: 'Download CSV template' }).click())
    assert.equal(template.length, 5); assert.equal(template[0][0], IMPORT_TEMPLATE_TITLES[kind])
    const file = kind === 'staff' ? '#staff-import-file' : kind === 'programs' ? '#program-import-file' : '#beneficiary-import-file'
    await checkExcelDownload(page, file)
    await page.getByText('Column guide and examples', { exact: true }).click(); await fits(page)
    await page.screenshot({ path: `${artifacts}/${kind}-template-320.png`, fullPage: true })
    await page.locator(file).setInputFiles({ name: `${kind}.csv`, mimeType: 'text/csv', buffer: Buffer.from(Papa.unparse([...template, record])) })
    await page.getByRole('button', { name: 'Continue to column matching' }).click()
    await expect(page.locator(field)).toHaveValue(selected)
  }
  await page.goto(`${origin}/__import-check?section=barangays&role=DSWD_STAFF`)
  await expect(page.getByRole('button', { name: 'Import barangays', exact: true })).toHaveCount(0)
  assert.deepEqual(errors, [])
  console.log('Import UI checks passed: all four CSV and Excel downloads, real file worker parsing, guide exclusion, column matching, duplicate review, correction export, safe retry, refreshed registry, mobile layouts, and role access.')
} finally { await browser?.close(); await vite.close() }
