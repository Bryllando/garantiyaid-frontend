import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { chromium, expect } from '@playwright/test'
import { createServer } from 'vite'

// Read-only UI fixtures; no actual referrals, documents or staff records are changed.
const root = fileURLToPath(new URL('../', import.meta.url))
const output = fileURLToPath(new URL('../../output/burial-search-refinement/', import.meta.url))
const user = { userId: 'test-admin', employeeId: 'ADMIN-TEST', fullName: 'Test Administrator', role: 'SYSTEM_ADMIN', isActive: true, totpEnabled: true }
const records = Array.from({ length: 21 }, (_, index) => ({
  referralId: `referral-${index + 1}`, status: index === 0 ? 'IN_REVIEW' : index === 1 ? 'READY' : 'DRAFT',
  beneficiary: { firstName: index === 0 ? 'Maria' : 'Applicant', lastName: `Demo ${index + 1}` },
  deceasedName: index === 0 ? 'Juan Demo' : `Deceased Demo ${index + 1}`, receivingOffice: 'Sample receiving office',
}))
let empty = true, fail = false, hold = false, release
const requests = [], errors = [], unexpected = []
const vite = await createServer({ root, cacheDir: `${output}/.vite`, logLevel: 'error', define: { 'import.meta.env.VITE_API_URL': JSON.stringify('https://burial-ui.example.test/api/v1') }, server: { host: '127.0.0.1', port: 0, hmr: false } })
let browser
try {
  await mkdir(output, { recursive: true })
  await vite.listen()
  const origin = `http://127.0.0.1:${vite.httpServer.address().port}`
  browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome' })
  const context = await browser.newContext({ viewport: { width: 1440, height: 950 }, reducedMotion: 'reduce' })
  await context.addInitScript(staff => {
    sessionStorage.setItem('garantiyaid.accessToken', 'synthetic-burial-ui-token')
    sessionStorage.setItem('garantiyaid.user', JSON.stringify({ ...staff, role: sessionStorage.getItem('burial-ui-role') || staff.role }))
  }, user)
  await context.routeWebSocket('**/*', socket => socket.close())
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url())
    if (url.origin === origin) return route.continue()
    if (url.hostname !== 'burial-ui.example.test' || url.pathname.startsWith('/socket.io/')) return route.abort()
    const path = url.pathname.replace('/api/v1', '')
    requests.push({ method: request.method(), path, search: url.searchParams.get('search') || '', status: url.searchParams.get('status') || '', page: Number(url.searchParams.get('page') || 1) })
    let data
    if (path === '/burial-referrals') {
      if (hold) { hold = false; await new Promise(resolve => { release = resolve }) }
      if (fail) return route.fulfill({ status: 503, json: { error: { message: 'Referral service is unavailable for this test.' } } })
      const term = (url.searchParams.get('search') || '').toLowerCase()
      const matching = empty ? [] : records.filter(item => (!term || `${item.beneficiary.firstName} ${item.beneficiary.lastName} ${item.deceasedName}`.toLowerCase().includes(term)) && (!url.searchParams.get('status') || item.status === url.searchParams.get('status')))
      const page = Number(url.searchParams.get('page') || 1)
      data = { referrals: matching.slice((page - 1) * 20, page * 20), pagination: { total: matching.length, totalPages: Math.max(1, Math.ceil(matching.length / 20)), page } }
    } else if (path === '/health') data = { timestamp: new Date().toISOString() }
    else if (path === '/staff-notifications') data = { notifications: [], unreadCount: 0 }
    else if (path === '/beneficiaries') data = { beneficiaries: [], pagination: { total: 0, totalPages: 1, page: 1 } }
    else if (path === '/barangays') data = { barangays: [] }
    else if (path === '/programs') data = { programs: [], pagination: { total: 0, totalPages: 1, page: 1 } }
    else { unexpected.push(path); return route.fulfill({ status: 404, json: { error: { message: 'No synthetic fixture for this route.' } } }) }
    return route.fulfill({ json: { success: true, data } })
  })
  const page = await context.newPage()
  page.setDefaultTimeout(10000)
  page.on('pageerror', error => errors.push(error.message))
  const search = page.getByRole('searchbox', { name: 'Applicant or deceased name', exact: true })
  const form = page.getByRole('form', { name: 'Find burial referrals' })
  const list = page.getByRole('region', { name: 'Burial referral list' })
  const count = value => expect(list.getByRole('status')).toHaveText(`${value} ${value === 1 ? 'referral' : 'referrals'}`)
  const screenshot = async name => {
    await page.evaluate(() => { window.scrollTo(0, 0); return document.fonts.ready })
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
    await page.screenshot({ path: `${output}/${name}.png`, fullPage: true })
  }
  const as = async role => {
    await page.evaluate(role => sessionStorage.setItem('burial-ui-role', role), role)
    await page.goto(`${origin}/burial-referrals`)
    await count(0)
  }
  await page.goto(`${origin}/burial-referrals`)
  await count(0)
  await expect(list.getByRole('heading', { name: 'No burial referrals yet' })).toBeVisible()
  await expect(list).toContainText('read-only oversight')
  await expect(page.getByRole('button', { name: 'Choose applicant' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Previous', exact: true })).toHaveCount(0)
  await expect(search).toHaveAttribute('placeholder', 'Enter a name to search')
  assert.equal(await search.locator('..').locator('svg[aria-hidden="true"]').count(), 1, 'Search has a decorative shared SVG')
  for (const width of [1440, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 950 })
    await screenshot(`empty-${width}`)
    const bounds = await search.boundingBox()
    assert.ok(bounds.height >= 44)
    await expect(form.getByRole('button', { name: 'Search', exact: true })).toBeVisible()
  }
  await as('DSWD_STAFF')
  await expect(list).toContainText('Submitted requests will appear here for your review')
  await as('BARANGAY_FACILITATOR')
  await expect(list).toContainText('Prepare burial referral')
  await page.getByRole('button', { name: 'Choose applicant', exact: true }).click()
  await expect(page).toHaveURL(`${origin}/beneficiaries`)
  empty = false
  await page.goto(`${origin}/burial-referrals`)
  await count(21)
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await expect(list).toContainText('Page 2 of 2')
  await expect(list.getByRole('button', { name: 'Open referral', exact: true })).toHaveCount(1)
  await page.getByLabel('Status', { exact: true }).selectOption('READY')
  await count(1)
  await expect(list).toContainText('Page 1 of 1')
  assert.equal(requests.filter(request => request.path === '/burial-referrals').at(-1).page, 1)
  await page.getByRole('button', { name: 'Clear filters', exact: true }).click()
  await expect(search).toBeFocused()
  await count(21)
  hold = true
  await search.fill('  Juan  ')
  await search.press('Enter')
  await expect.poll(() => Boolean(release)).toBe(true)
  await expect(form).toBeVisible()
  await expect(search).toBeFocused()
  await expect(list).toHaveAttribute('aria-busy', 'true')
  release()
  await count(1)
  assert.equal(requests.filter(request => request.path === '/burial-referrals').at(-1).search, 'Juan')
  await expect(list).toContainText('Maria Demo 1')
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 950 })
    await screenshot(`results-${width}`)
  }
  await search.fill('Maria')
  await form.getByRole('button', { name: 'Search', exact: true }).click()
  await count(1)
  await search.fill('no-such-person')
  await search.press('Enter')
  await count(0)
  await expect(list.getByRole('heading', { name: 'No matching referrals' })).toBeVisible()
  await screenshot('no-matches-320')
  fail = true
  await page.getByRole('button', { name: 'Refresh', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Referral service is unavailable')
  await expect(search).toHaveValue('no-such-person')
  await expect(list).toContainText('Results unavailable')
  await expect(list.getByRole('heading', { name: 'No matching referrals' })).toHaveCount(0)
  fail = false
  await page.getByRole('button', { name: 'Refresh', exact: true }).click()
  await count(0)
  await page.getByRole('button', { name: 'Clear filters', exact: true }).click()
  await expect(search).toBeFocused()
  await count(21)
  assert.ok(requests.every(request => request.method === 'GET'))
  assert.deepEqual(unexpected, [])
  assert.deepEqual(errors, [])
  const result = { passed: true, syntheticDataOnly: true, widths: [1440, 1024, 768, 390, 320], checks: ['search SVG and label', 'applicant/deceased search', 'trimmed query', 'status and pagination reset', 'clear and focus', 'visible filters during load', 'role-specific empty guidance', 'error and refresh recovery', 'responsive layout', 'GET requests only'] }
  await writeFile(`${output}/result.json`, JSON.stringify(result, null, 2))
  console.log(JSON.stringify(result))
} finally {
  release?.()
  await browser?.close()
  await vite.close()
}
