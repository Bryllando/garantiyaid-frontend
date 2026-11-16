import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import { chromium, expect } from '@playwright/test'
import Papa from 'papaparse'

// All requests use fixtures. These checks never import live records or send notifications.
const root = fileURLToPath(new URL('../', import.meta.url))
const output = fileURLToPath(new URL('../artifacts/import-progress/', import.meta.url))
const importId = '33333333-3333-4333-8333-333333333333'
const headers = ['Program name', 'Program code', 'Program type']
const rows = Array.from({ length: 120 }, (_, index) => ({ sourceRow: index + 2, programName: `Program ${index + 1}`, programCode: `AID-${String(index + 1).padStart(3, '0')}`, programType: 'FOOD' }))
let job = { importId, status: 'QUEUED', totalCount: 120, processedCount: 0, createdCount: 0, failedCount: 0, updatedAt: '2026-11-16T02:15:30Z', expiresAt: '2026-11-17T02:15:30Z' }
const fixture = `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div><script type="module">
import React from 'react'; import {createRoot} from 'react-dom/client';
import ProgramImport from '/src/components/programs/ProgramImportDialog.jsx';
import ImportProgress from '/src/components/admin/StaffImportProgress.jsx';
import {requestProgramImport,requestProgramImportResults,resumeProgramImport} from '/src/auth/staffAuth.js';
import '/src/index.css';
const params=new URLSearchParams(location.search), root=createRoot(document.getElementById('root')), noop=()=>{};
const props={accessToken:'import-progress-fixture',onClose:()=>root.unmount(),onImported:noop,onSessionExpired:()=>{document.body.dataset.expired='true'},onOpenProgram:noop};
root.render(params.has('progress')?React.createElement(ImportProgress,{...props,label:params.get('label')||'programs',initialJob:${JSON.stringify(job)},api:{status:requestProgramImport,results:requestProgramImportResults,resume:resumeProgramImport},onResult:noop}):React.createElement(ProgramImport,props));
</script></body></html>`
const vite = await createServer({ root, cacheDir: `${root}/node_modules/.vite-import-progress`, logLevel: 'error', define: { 'import.meta.env.VITE_API_URL': JSON.stringify('https://import-progress.example.test/api/v1') }, server: { host: '127.0.0.1', port: 0, hmr: false }, plugins: [{ name: 'import-progress-fixture', configureServer(server) { server.middlewares.use(async (req, res, next) => { if (!req.url.startsWith('/__progress-check')) return next(); res.setHeader('Content-Type', 'text/html'); res.end(await server.transformIndexHtml(req.url, fixture)) }) } }] })
let browser, releaseStart, releaseResults, releaseResume
let statusReads = 0, starts = 0, resumes = 0, resultReads = 0, statusError = 0
let failStart = true, holdResults = true, holdResume = true
const startBodies = [], errors = [], checks = []
const startGate = new Promise(resolve => { releaseStart = resolve })
const resultGate = new Promise(resolve => { releaseResults = resolve })
const resumeGate = new Promise(resolve => { releaseResume = resolve })
const success = data => ({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data }) })
try {
  await mkdir(output, { recursive: true }); await vite.listen()
  const origin = `http://127.0.0.1:${vite.httpServer.address().port}`
  browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge', headless: true })
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  await context.routeWebSocket('**/*', socket => socket.close())
  await context.route('**/*', async route => {
    const url = new URL(route.request().url())
    if (url.origin === origin) return route.continue()
    if (url.hostname !== 'import-progress.example.test') return route.abort()
    const endpoint = url.pathname.replace('/api/v1', '')
    if (endpoint === '/programs/import/jobs' && route.request().method() === 'GET') return route.fulfill(success({ imports: [] }))
    if (endpoint === '/programs/import/preview') {
      const submitted = route.request().postDataJSON().rows
      return route.fulfill(success({ rows: submitted.map(({ sourceRow, ...record }) => ({ sourceRow, record, issues: [] })), validCount: submitted.length, invalidCount: 0, approvalId: importId }))
    }
    if (endpoint === '/programs/import/jobs') {
      starts++; startBodies.push({ body: route.request().postDataJSON(), key: route.request().headers()['idempotency-key'] })
      await startGate
      if (failStart) return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ success: false, error: { message: 'The confirmation response could not be retrieved.' } }) })
      return route.fulfill(success(job))
    }
    if (endpoint === `/programs/import/jobs/${importId}`) {
      statusReads++
      if (statusError) {
        const status = statusError; statusError = 0
        return route.fulfill({ status, headers: { 'Retry-After': '30' }, contentType: 'application/json', body: JSON.stringify({ success: false, error: { message: status === 404 ? 'This import is unavailable.' : 'Try again later.', retryAfterSeconds: 30, scope: 'garantiyaid-api' } }) })
      }
      return route.fulfill(success(job))
    }
    if (endpoint.endsWith('/resume')) {
      resumes++
      if (holdResume) await resumeGate
      job = { ...job, status: 'PROCESSING', lastError: null }
      return route.fulfill(success(job))
    }
    if (endpoint.endsWith('/results')) {
      resultReads++
      if (holdResults) await resultGate
      return route.fulfill(success({ ...job, programs: rows.slice(2).map(({ sourceRow, ...record }) => ({ sourceRow, program: { ...record, programId: `program-${sourceRow}`, status: 'DRAFT' } })), failures: rows.slice(0, 2).map(({ sourceRow, ...record }) => ({ sourceRow, record, issues: ['Program code already exists.'] })) }))
    }
    throw new Error(`Unexpected fixture endpoint: ${endpoint}`)
  })
  const page = await context.newPage()
  page.on('pageerror', error => errors.push(error.message))
  await page.clock.install()
  await page.goto(`${origin}/__progress-check`)
  const dialog = page.getByRole('dialog')
  await page.locator('#program-import-file').setInputFiles({ name: 'barangays.csv', mimeType: 'text/csv', buffer: Buffer.from('Barangay name,Barangay code,City / Municipality,Province\nApas,0730600003,Cebu City,Cebu') })
  await expect(dialog.getByRole('alert')).toContainText('This is a barangay list.')
  await expect(dialog.getByRole('button', { name: 'Continue to column matching' })).toBeDisabled()
  checks.push('Barangay file rejected before program column matching')
  await page.locator('#program-import-file').setInputFiles({ name: 'programs.csv', mimeType: 'text/csv', buffer: Buffer.from(Papa.unparse([headers, ...rows.map(row => [row.programName, row.programCode, row.programType])])) })
  await dialog.getByRole('button', { name: 'Continue to column matching' }).click()
  await dialog.getByRole('button', { name: 'Review programs', exact: true }).click()
  await dialog.getByRole('checkbox', { name: /I have checked these programs/ }).check()
  await dialog.getByRole('button', { name: 'Import 120 programs', exact: true }).click()
  await expect(dialog.getByRole('heading', { name: 'Submitting your import' })).toBeVisible()
  await expect(dialog.locator('[aria-current="step"]')).toHaveText('4. Processing')
  await expect(dialog.getByRole('button', { name: 'Close program import' })).toBeDisabled()
  await expect(dialog.locator('[data-slot="spinner"]')).toBeVisible()
  assert.equal(statusReads, 0)
  releaseStart()
  await expect(dialog.getByRole('button', { name: 'Retry confirmation' })).toBeVisible()
  failStart = false
  await dialog.getByRole('button', { name: 'Retry confirmation' }).click()
  await expect(dialog.getByRole('heading', { name: 'Import queued' })).toBeVisible()
  await expect.poll(() => statusReads).toBe(1)
  assert.equal(starts, 2); assert.deepEqual(startBodies[0], startBodies[1])
  assert.equal(startBodies[1].key, importId)
  const progress = dialog.getByRole('progressbar', { name: 'programs import progress' })
  await expect(progress).toHaveAttribute('value', '0')
  await page.screenshot({ path: `${output}/queued-1280.png`, fullPage: true })
  checks.push('Immediate submission spinner; lost response returns to safe confirmation with the same approval key')

  job = { ...job, status: 'PROCESSING', processedCount: 50, createdCount: 48, failedCount: 2, updatedAt: '2026-11-16T02:15:40Z' }
  await page.clock.runFor(10_000)
  await expect(progress).toHaveAttribute('value', '50')
  await expect(dialog.getByText('41%', { exact: true })).toBeVisible()
  await expect(progress).toHaveAttribute('aria-valuetext', '41% processed. 70 records remaining.')
  await expect(dialog.getByRole('status').filter({ hasText: '50 of 120 records processed' })).toContainText('48 created · 2 need correction')
  await page.clock.runFor(5_000)
  await expect(progress).toHaveAttribute('value', '50')
  await expect(dialog.getByText('41%', { exact: true })).toBeVisible()
  for (const width of [1280, 375, 320]) {
    await page.setViewportSize({ width, height: 900 })
    assert.ok(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth + 1))
    await page.screenshot({ path: `${output}/processing-${width}.png`, fullPage: true })
  }
  checks.push('Percentage, created/correction counts and remaining records use backend checkpoints; no timed fake progress; desktop and mobile fit')

  statusError = 429
  await page.clock.runFor(5_000)
  await expect(dialog.getByRole('alert')).toContainText('Progress updates are temporarily paused.')
  await expect(dialog.getByRole('heading', { name: 'Progress update unavailable' })).toBeVisible()
  const beforeCooldown = statusReads
  await page.clock.runFor(29_000)
  assert.equal(statusReads, beforeCooldown)
  await expect(progress).toHaveAttribute('value', '50')
  job = { ...job, status: 'FAILED', lastError: 'Processing stopped before the next batch was saved.' }
  await page.clock.runFor(1_000)
  await expect(dialog.getByRole('heading', { name: 'Import stopped' })).toBeVisible()
  await expect(dialog.locator('[data-slot="spinner"]')).toHaveCount(0)
  await dialog.getByRole('button', { name: 'Resume remaining programs' }).click()
  await expect(dialog.getByRole('button', { name: 'Resuming import…' })).toBeDisabled()
  releaseResume(); holdResume = false
  await expect(dialog.getByRole('heading', { name: 'Importing programs' })).toBeVisible()
  assert.equal(resumes, 1)
  checks.push('Rate-limit backoff preserves counts; stopped jobs stop spinning; resume continues the same import')

  job = { ...job, status: 'COMPLETED', processedCount: 120, createdCount: 118, failedCount: 2, updatedAt: '2026-11-16T02:16:30Z' }
  await page.clock.runFor(10_000)
  await expect(dialog.getByRole('heading', { name: 'Loading import results' })).toBeVisible()
  await expect(progress).toHaveAttribute('value', '120')
  await expect(dialog.getByText('100%', { exact: true })).toBeVisible()
  await expect(dialog.getByRole('heading', { name: 'Program import results' })).toHaveCount(0)
  releaseResults(); holdResults = false
  await expect(dialog.getByRole('heading', { name: 'Program import results' })).toBeVisible()
  await expect(dialog.getByRole('status').filter({ hasText: '118 draft programs created' })).toContainText('2 need correction')
  const downloadEvent = page.waitForEvent('download')
  await dialog.getByRole('button', { name: 'Download import results', exact: true }).click()
  const download = await downloadEvent
  assert.equal(download.suggestedFilename(), 'program-import-results.csv')
  const stream = await download.createReadStream(), chunks = []
  for await (const chunk of stream) chunks.push(chunk)
  const exported = Papa.parse(Buffer.concat(chunks).toString('utf8').replace(/^\uFEFF/, '')).data
  assert.equal(exported.length, 119)
  assert.equal(exported[1][2], 'AID-003')
  assert.equal(exported[1][4], 'DRAFT')
  await page.screenshot({ path: `${output}/results-320.png`, fullPage: true })
  checks.push('Results appear only after the results API succeeds; downloaded CSV matches actual created records and draft status')

  job = { ...job, status: 'PROCESSING', processedCount: 50, createdCount: 48, failedCount: 2 }
  for (const label of ['staff', 'beneficiaries']) {
    await page.goto(`${origin}/__progress-check?progress=1&label=${label}`)
    await expect(page.getByRole('heading', { name: `Importing ${label}` })).toBeVisible()
    await expect(page.getByRole('progressbar', { name: `${label} import progress` })).toHaveAttribute('value', '50')
  }
  statusError = 404
  await page.clock.runFor(10_000)
  await expect(page.getByRole('alert')).toContainText('This import is unavailable.')
  await expect(page.locator('[data-slot="spinner"]')).toHaveCount(0)
  const afterMissing = statusReads
  await page.clock.runFor(30_000)
  assert.equal(statusReads, afterMissing)
  checks.push('Shared staff and beneficiary progress retains its data; unavailable imports stop polling and spinning')
  assert.ok(resultReads > 0)
  assert.deepEqual(errors, [])
  await writeFile(`${output}/verification.json`, JSON.stringify({ passed: true, checks, actualDatabaseWrites: 0, actualMessagesSent: false }, null, 2))
  console.log(JSON.stringify({ passed: true, checks, actualDatabaseWrites: 0, actualMessagesSent: false }, null, 2))
} finally { releaseStart?.(); releaseResume?.(); releaseResults?.(); await browser?.close(); await vite.close() }
