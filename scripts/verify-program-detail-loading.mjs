import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium, expect } from '@playwright/test'
import { createServer } from 'vite'

const output = resolve('../output/program-detail-loading')
await mkdir(output, { recursive: true })
const vite = await createServer({ cacheDir: 'node_modules/.vite-verify/program-detail-loading', server: { host: '127.0.0.1', port: 0 } })
await vite.listen()
const browser = await chromium.launch({ headless: true, channel: 'chrome' })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
page.setDefaultTimeout(10000)
page.setDefaultNavigationTimeout(30000)
const errors = []
page.on('pageerror', error => errors.push(error.message))
await page.addInitScript(() => {
  sessionStorage.setItem('garantiyaid.accessToken', 'test-token')
  const role = sessionStorage.getItem('test-role') || 'DSWD_STAFF'
  sessionStorage.setItem('garantiyaid.user', JSON.stringify({ userId: 'test-staff', role, fullName: 'Test Staff' }))
})
const programs = ['First', 'Second'].map((label, index) => ({
  programId: `program-${index + 1}`, programName: `${label} test draft`, programCode: `TEST-${index + 1}`,
  programType: 'FOOD_ASSISTANCE', status: 'DRAFT', description: `${label} draft description`,
  grantAmount: '100', budgetAmount: '1000', criteria: [], requiredDocumentTypes: ['VALID_ID', 'OTHER'],
  otherRequiredDocumentNames: ['Request letter', 'Certificate of indigency'],
}))
let failSecond = false, holdSecond = false, releaseSecond
const reads = [0, 0]
await page.route('**/api/v1/**', async route => {
  const request = route.request(), url = new URL(request.url()), path = url.pathname.replace('/api/v1', '')
  assert.equal(request.method(), 'GET', 'This rehearsal must not write any program data.')
  let data = {}
  if (path === '/health') data = { status: 'ok' }
  else if (path === '/staff-notifications') data = { notifications: [], unreadCount: 0, pagination: { total: 0 } }
  else if (path === '/barangays') data = { barangays: [] }
  else if (path === '/programs') {
    const items = url.searchParams.get('search') === 'no-matches' ? [] : programs
    data = { programs: items, pagination: { page: 1, totalPages: 1, total: items.length } }
  } else if (path.startsWith('/programs/')) {
    const index = programs.findIndex(program => program.programId === path.split('/')[2])
    assert.ok(index >= 0)
    reads[index]++
    if (index === 1 && holdSecond) await new Promise(resolve => { releaseSecond = resolve })
    if (index === 1 && failSecond) return route.fulfill({ status: 503, json: { error: { message: 'Test: details temporarily unavailable.' } } })
    data = { program: programs[index] }
  }
  await route.fulfill({ json: { success: true, data } })
})
await page.route('**/socket.io/**', route => route.abort())
await page.routeWebSocket(/socket\.io/, () => {})

try {
  await page.goto(`http://127.0.0.1:${vite.httpServer.address().port}/programs`)
  const detail = page.getByRole('region', { name: 'Selected program' })
  const first = page.getByRole('button', { name: /First test draft/ })
  const second = page.getByRole('button', { name: /Second test draft/ })
  const firstHeading = detail.getByRole('heading', { name: 'First test draft', exact: true })
  await expect(firstHeading).toBeVisible()
  const initialReads = reads[0]
  await first.click()
  await expect(firstHeading).toBeVisible()
  await first.click()
  await first.press('Enter')
  await expect(detail.getByRole('button', { name: 'Add criterion', exact: true })).toBeVisible()
  assert.equal(reads[0], initialReads, 'Reselecting the loaded program does not start another request.')
  await detail.getByRole('button', { name: 'Add criterion', exact: true }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.getByRole('button', { name: 'Close criterion form' }).click()
  console.log('PASS: repeated mouse/keyboard selection keeps draft details and actions available.')

  holdSecond = true
  await second.click()
  await expect.poll(() => typeof releaseSecond).toBe('function')
  await second.click()
  await expect(detail).toHaveAttribute('aria-busy', 'true')
  await first.click()
  await expect(firstHeading).toBeVisible()
  const delayedResponse = page.waitForResponse(response => response.url().endsWith('/programs/program-2'))
  releaseSecond(); holdSecond = false
  await delayedResponse
  await expect(firstHeading).toBeVisible()
  console.log('PASS: changing selection during a slow request keeps the current program.')

  failSecond = true
  await second.click()
  await expect(detail.getByRole('alert')).toContainText('Test: details temporarily unavailable.')
  await expect(detail.getByRole('button', { name: 'Add criterion', exact: true })).toHaveCount(0)
  await page.screenshot({ path: `${output}/detail-error-1440.png` })
  failSecond = false
  await detail.getByRole('button', { name: 'Try again', exact: true }).click()
  await expect(detail.getByRole('heading', { name: 'Second test draft', exact: true })).toBeVisible()
  await expect(detail).toHaveAttribute('aria-busy', 'false')
  await second.click()
  await expect(detail.getByRole('button', { name: 'Edit details', exact: true })).toBeVisible()
  console.log('PASS: a failed detail request displays an error; retry restores the same draft.')

  await page.getByLabel('Search programs', { exact: true }).fill('no-matches')
  await page.getByRole('button', { name: 'Apply filters', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'No programs found', exact: true })).toBeVisible()
  await expect(detail.getByRole('heading', { name: 'Select a program', exact: true })).toBeVisible()
  await expect(detail.getByRole('button', { name: 'Edit details', exact: true })).toHaveCount(0)
  await page.getByLabel('Search programs', { exact: true }).fill('')
  await page.getByRole('button', { name: 'Apply filters', exact: true }).click()
  await expect(firstHeading).toBeVisible()
  console.log('PASS: an empty filter clears stale details; clearing the filter restores selection.')

  for (const role of ['SYSTEM_ADMIN', 'DSWD_STAFF', 'BARANGAY_FACILITATOR']) {
    await page.evaluate(role => sessionStorage.setItem('test-role', role), role)
    await page.reload()
    await expect(firstHeading).toBeVisible()
    await first.click()
    await expect(firstHeading).toBeVisible()
    await expect(detail.getByRole('button', { name: 'Edit details', exact: true })).toHaveCount(role === 'BARANGAY_FACILITATOR' ? 0 : 1)
  }
  await page.evaluate(() => sessionStorage.setItem('test-role', 'DSWD_STAFF'))
  await page.reload()
  for (const width of [1920, 1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 })
    await first.click()
    await expect(firstHeading).toBeVisible()
    await expect(detail.getByRole('button', { name: 'Add criterion', exact: true })).toBeVisible()
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `No horizontal overflow at ${width}px.`)
    if (width < 1280) assert.equal(await detail.evaluate(element => element === document.activeElement), true)
    await page.screenshot({ path: `${output}/draft-details-${width}.png` })
  }
  assert.deepEqual(errors, [])
  console.log('PASS: Admin/DSWD/Barangay permissions and draft selection at 1920, 1440, 390 and 320px; no page errors.')
} catch (error) {
  await page.screenshot({ path: `${output}/failure.png` })
  throw error
} finally {
  releaseSecond?.()
  await browser.close()
  await vite.close()
}
