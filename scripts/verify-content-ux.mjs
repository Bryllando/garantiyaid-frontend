import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'
import { createServer } from 'vite'

const vite = await createServer({ server: { host: '127.0.0.1', port: 0 } })
await vite.listen()
const origin = `http://127.0.0.1:${vite.httpServer.address().port}`
const browser = await chromium.launch({ headless: true, channel: 'chrome' })

try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.addInitScript(() => {
    sessionStorage.setItem('garantiyaid.accessToken', 'preview-token')
    sessionStorage.setItem('garantiyaid.user', JSON.stringify({ userId: 'admin-1', role: 'SYSTEM_ADMIN', fullName: 'System Administrator' }))
  })
  const barangay = { barangayId: 'barangay-1', barangayName: 'Poblacion', city: 'Sample City' }
  const program = { programId: 'program-1', programCode: 'AID-1', programName: 'Community Assistance', programType: 'CASH_ASSISTANCE', status: 'ACTIVE', grantAmount: '1500', budgetAmount: '150000', applicationStartDate: '2026-09-01', applicationEndDate: '2026-12-31', criteria: [], requiredDocumentTypes: ['VALID_ID'] }
  const beneficiary = { beneficiaryId: 'beneficiary-1', firstName: 'Maria', lastName: 'Santos', birthDate: '1990-01-01', sex: 'FEMALE', address: '123 Sample Street', barangayId: barangay.barangayId, barangay, status: 'ACTIVE' }
  const enrollment = { enrollmentId: 'enrollment-1', beneficiaryId: beneficiary.beneficiaryId, beneficiary: { ...beneficiary, documents: [] }, program, status: 'PENDING', submittedById: 'facilitator-1', submittedBy: { fullName: 'Field Facilitator' }, createdAt: new Date().toISOString(), eligibilityEvaluation: { overallStatus: 'REVIEW_REQUIRED', summary: { met: 0, notMet: 0, reviewRequired: 0, total: 0 }, results: [] } }
  const pagination = (total) => ({ page: 1, totalPages: 1, total })
  await page.route('**/socket.io/**', (route) => route.abort())
  const mockApi = async (route) => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1', '')
    let data = {}
    if (path === '/health') data = { timestamp: new Date().toISOString() }
    else if (path === '/barangays') data = { barangays: [barangay] }
    else if (path === '/programs') data = { programs: [program], pagination: pagination(1) }
    else if (path === '/programs/program-1') data = { program }
    else if (path === '/beneficiaries') data = { beneficiaries: [beneficiary], pagination: pagination(1) }
    else if (path === '/beneficiaries/beneficiary-1') data = { beneficiary }
    else if (path === '/beneficiaries/beneficiary-1/documents') data = { documents: [] }
    else if (path === '/enrollments') data = { enrollments: [enrollment], pagination: pagination(1) }
    else if (path === '/enrollments/enrollment-1') data = { enrollment }
    else if (path === '/distributions') data = { distributions: [], pagination: pagination(0) }
    await route.fulfill({ json: { data } })
  }
  await page.route('http://localhost:4000/api/v1/**', mockApi)

  await page.goto(`${origin}/beneficiaries`)
  await page.getByRole('button', { name: /Maria Santos/ }).click()
  await page.getByRole('heading', { name: 'Choose an assistance program' }).waitFor()
  await page.getByRole('link', { name: 'Check program requirements' }).waitFor()
  assert.equal(await page.locator('#beneficiary-list-heading').isVisible(), false)
  assert.equal(await page.getByRole('form', { name: 'Beneficiary filters' }).isVisible(), false)
  await page.screenshot({ path: fileURLToPath(new URL('../../output/admin-redesign/content-ux-beneficiary-record-mobile.png', import.meta.url)) })
  await page.getByRole('button', { name: 'Back to records' }).click()
  assert.equal(await page.locator('#beneficiary-list-heading').isVisible(), true)
  await page.getByRole('button', { name: 'Register beneficiary' }).click()
  await page.locator('#beneficiary-first-name').fill('Ana')
  await page.locator('#beneficiary-last-name').fill('Reyes')
  await page.locator('#beneficiary-birth-date').fill('1994-03-12')
  await page.locator('#beneficiary-sex').selectOption('FEMALE')
  await page.locator('#beneficiary-barangay').selectOption(barangay.barangayId)
  await page.locator('#beneficiary-address').fill('Barangay Hall Road')
  await page.getByRole('button', { name: 'Review beneficiary details' }).click()
  await page.getByRole('heading', { name: 'Check beneficiary details' }).waitFor()
  assert.equal(await page.locator('#beneficiary-first-name').count(), 0)
  await page.screenshot({ path: fileURLToPath(new URL('../../output/admin-redesign/content-ux-beneficiary-mobile.png', import.meta.url)) })
  await page.getByRole('button', { name: 'Change details' }).click()
  assert.equal(await page.locator('#beneficiary-first-name').inputValue(), 'Ana')
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)

  await page.goto(`${origin}/distributions/manage`)
  await page.getByRole('button', { name: 'Create distribution' }).click()
  await page.locator('#distribution-title').fill('Poblacion assistance day')
  await page.locator('#distribution-program').selectOption(program.programId)
  await page.locator('#distribution-barangay').selectOption(barangay.barangayId)
  await page.locator('#distribution-location').fill('Barangay Hall')
  await page.getByRole('button', { name: 'Review event details' }).click()
  await page.getByRole('heading', { name: 'Check event details' }).waitFor()
  assert.equal(await page.getByText('Poblacion assistance day').count(), 1)
  await page.screenshot({ path: fileURLToPath(new URL('../../output/admin-redesign/content-ux-distribution-mobile.png', import.meta.url)) })
  await page.getByRole('button', { name: 'Change details' }).click()
  assert.equal(await page.locator('#distribution-title').inputValue(), 'Poblacion assistance day')
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)

  await page.goto(`${origin}/enrollments`)
  await page.getByRole('button', { name: /Maria Santos/ }).click()
  await page.getByRole('button', { name: 'Back to review queue' }).waitFor()
  assert.equal(await page.getByRole('heading', { name: 'Review queue', exact: true }).isVisible(), false)
  assert.equal(await page.getByRole('form', { name: 'Enrollment filters' }).isVisible(), false)
  await page.getByRole('button', { name: 'Back to review queue' }).click()
  assert.equal(await page.getByRole('heading', { name: 'Review queue', exact: true }).isVisible(), true)
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)

  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(`${origin}/beneficiaries`)
  await page.locator('h1').filter({ hasText: 'Beneficiary records' }).waitFor()
  await page.evaluate(() => { window.__sidebarBeforeNavigation = document.getElementById('staff-navigation') })
  await page.route('**/src/pages/ProgramManagementPage.jsx*', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 900))
    await route.continue()
  })
  await page.locator('#staff-navigation a[href="/programs"]').click()
  const routeLoader = page.locator('#dashboard-content [role="status"]').filter({ hasText: 'Loading page content...' })
  await routeLoader.waitFor()
  assert.ok(await routeLoader.locator('[data-slot="skeleton"]').count() >= 8)
  assert.equal(await routeLoader.locator('[data-slot="spinner"]').count(), 0)
  await page.screenshot({ path: fileURLToPath(new URL('../../output/admin-redesign/content-ux-route-loading-desktop.png', import.meta.url)) })
  assert.equal(await page.evaluate(() => document.getElementById('staff-navigation') === window.__sidebarBeforeNavigation), true)
  await page.getByRole('heading', { name: 'Assistance programs' }).waitFor()
  assert.equal(await page.evaluate(() => document.getElementById('staff-navigation') === window.__sidebarBeforeNavigation), true)
  assert.equal(await page.locator('#staff-navigation').count(), 1)

  for (const [role, group, width] of [
    ['DSWD_STAFF', 'Programs & enrollment', 1440],
    ['BARANGAY_FACILITATOR', 'Beneficiary services', 390],
  ]) {
    const rolePage = await browser.newPage({ viewport: { width, height: 844 } })
    rolePage.on('pageerror', (error) => errors.push(`${role}: ${error.message}`))
    await rolePage.addInitScript((staffRole) => {
      sessionStorage.setItem('garantiyaid.accessToken', 'preview-token')
      sessionStorage.setItem('garantiyaid.user', JSON.stringify({ userId: `staff-${staffRole}`, role: staffRole, fullName: 'Staff Member' }))
    }, role)
    await rolePage.route('**/socket.io/**', (route) => route.abort())
    await rolePage.route('http://localhost:4000/api/v1/**', mockApi)
    await rolePage.route('**/src/pages/ProgramManagementPage.jsx*', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 900))
      await route.continue()
    })
    await rolePage.goto(`${origin}/beneficiaries`)
    await rolePage.getByRole('heading', { name: 'Beneficiary management' }).waitFor()
    await rolePage.evaluate(() => { window.__sidebarBeforeNavigation = document.getElementById('staff-navigation') })
    if (width < 1024) await rolePage.getByRole('button', { name: 'Open navigation' }).click()
    const navigationGroup = rolePage.locator('#staff-navigation').getByRole('button', { name: group })
    if (await navigationGroup.getAttribute('aria-expanded') !== 'true') await navigationGroup.click()
    await rolePage.locator('#staff-navigation a[href="/programs"]').click()
    const loadingContent = rolePage.locator('#dashboard-content [role="status"]').filter({ hasText: 'Loading page content...' })
    await loadingContent.waitFor()
    assert.ok(await loadingContent.locator('[data-slot="skeleton"]').count() >= 8, `${role} should show content skeletons`)
    assert.equal(await loadingContent.locator('[data-slot="spinner"]').count(), 0)
    assert.equal(await rolePage.evaluate(() => document.getElementById('staff-navigation') === window.__sidebarBeforeNavigation), true, `${role} sidebar should stay mounted`)
    assert.equal(await rolePage.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
    await rolePage.getByRole('heading', { name: role === 'BARANGAY_FACILITATOR' ? 'Assistance program browser' : 'Assistance program management' }).waitFor()
    assert.equal(await rolePage.evaluate(() => document.getElementById('staff-navigation') === window.__sidebarBeforeNavigation), true)
    await rolePage.close()
  }
  assert.deepEqual(errors, [])
  console.log('Content UX check passed')
} finally {
  await browser.close()
  await vite.close()
}
