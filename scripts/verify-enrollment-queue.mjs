import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium, expect } from '@playwright/test'
import { createServer } from 'vite'

// All requests use synthetic fixtures; no staff or beneficiary records are changed.
const output = resolve('../output/enrollment-queue')
await mkdir(output, { recursive: true })
const vite = await createServer({ cacheDir: '../tmp/enrollment-queue-vite', server: { host: '127.0.0.1', port: 0 } })
await vite.listen()
const origin = `http://127.0.0.1:${vite.httpServer.address().port}`

async function checkTransition(page, workspace, trigger, reduced) {
  await workspace.evaluate(view => {
    const sample = () => {
      const style = getComputedStyle(view)
      return { opacity: Number(style.opacity), y: style.transform === 'none' ? 0 : new DOMMatrixReadOnly(style.transform).m42 }
    }
    window.enrollmentMotionSamples = [sample()]
    window.enrollmentMotionObserver = new MutationObserver(() => window.enrollmentMotionSamples.push(sample()))
    window.enrollmentMotionObserver.observe(view, { attributes: true, attributeFilter: ['style'] })
  })
  await trigger.evaluate(button => button.addEventListener('click', () => { window.enrollmentMotionSamples = [] }, { once: true }))
  await trigger.click()
  await workspace.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  await expect.poll(() => workspace.evaluate(view => {
    const style = getComputedStyle(view)
    return style.opacity === '1' && (style.transform === 'none' || Math.abs(new DOMMatrixReadOnly(style.transform).m42) < 0.01)
  })).toBe(true)
  const samples = await page.evaluate(() => {
    window.enrollmentMotionObserver.disconnect()
    return window.enrollmentMotionSamples
  })
  if (reduced) assert.ok(samples.every(sample => sample.opacity === 1 && Math.abs(sample.y) < 0.01), 'Reduced motion skips both fade and slide')
  else {
    assert.ok(samples.some(sample => sample.opacity < 1), `Navigation starts with a fade at ${page.viewportSize().width}px: ${JSON.stringify(samples.slice(0, 8))}`)
    assert.ok(samples.some(sample => sample.y > 0.01), `Navigation uses a small slide at ${page.viewportSize().width}px: ${JSON.stringify(samples.slice(0, 8))}`)
  }
}

let browser
try {
  browser = await chromium.launch({ headless: true, channel: 'chrome' })
  for (const role of ['DSWD_STAFF', 'BARANGAY_FACILITATOR']) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    page.setDefaultTimeout(10_000)
    const errors = []
    let detailReads = 0
    page.on('pageerror', error => errors.push(error.message))
    const barangay = { barangayId: 'barangay-1', barangayName: 'San Nicolas', cityMunicipality: 'Cebu City' }
    const user = { userId: 'queue-staff', role, fullName: role === 'DSWD_STAFF' ? 'DSWD Reviewer' : 'Barangay Facilitator', barangay, barangayId: barangay.barangayId }
    const programs = [
      { programId: 'program-1', programCode: 'CASH-2026-01', programName: 'Community Cash Assistance', status: 'ACTIVE', requiredDocumentTypes: [] },
      { programId: 'program-2', programCode: 'MEDICAL-2026-02', programName: 'Medical Support for Low-Income Households', status: 'ACTIVE', requiredDocumentTypes: [] },
    ]
    const records = Array.from({ length: 22 }, (_, index) => {
      const beneficiary = { beneficiaryId: `beneficiary-${index}`, firstName: ['Maria', 'Juan', 'Lourdes'][index] ?? `Applicant ${index + 1}`, middleName: 'M.', lastName: index === 1 ? 'Dela Cruz' : index === 2 ? 'Buenaventura de los Santos' : 'Santos', barangay, barangayId: barangay.barangayId, documents: [] }
      const status = ['FOR_VALIDATION', 'PENDING', 'NEEDS_CORRECTION'][index % 3]
      const program = programs[index % 2]
      return { enrollmentId: `enrollment-${index}`, beneficiaryId: beneficiary.beneficiaryId, beneficiary, status, program, programId: program.programId, submittedById: 'other-staff', submittedBy: { fullName: 'Barangay Staff' }, createdAt: '2026-11-08T06:58:00Z', reviewNotes: status === 'NEEDS_CORRECTION' ? 'Please replace the unreadable valid ID.' : '', eligibilityEvaluation: { overallStatus: 'ELIGIBLE', referenceDate: '2026-11-08', results: [] } }
    })
    await page.addInitScript(staff => {
      sessionStorage.setItem('garantiyaid.accessToken', 'synthetic-queue-token')
      sessionStorage.setItem('garantiyaid.user', JSON.stringify(staff))
    }, user)
    await page.route('**/socket.io/**', route => route.abort())
    await page.routeWebSocket(/socket\.io/, () => {})
    await page.route('**/api/v1/**', async route => {
      const request = route.request()
      assert.equal(request.method(), 'GET', 'Queue design checks must never submit changes')
      const url = new URL(request.url())
      const path = url.pathname.replace('/api/v1', '')
      let data
      if (path === '/health') data = { timestamp: new Date().toISOString() }
      else if (path === '/staff-notifications') data = { notifications: [], unreadCount: 0 }
      else if (path === '/programs') data = { programs, pagination: { page: 1, totalPages: 1, total: programs.length } }
      else if (path === '/enrollments') {
        const search = (url.searchParams.get('search') || '').toLowerCase()
        const status = url.searchParams.get('status')
        const programId = url.searchParams.get('programId')
        const matches = records.filter(record => `${record.beneficiary.firstName} ${record.beneficiary.lastName}`.toLowerCase().includes(search) && (!status || record.status === status) && (!programId || record.programId === programId))
        const currentPage = Number(url.searchParams.get('page') || 1)
        data = { enrollments: matches.slice((currentPage - 1) * 20, currentPage * 20), pagination: { page: currentPage, totalPages: Math.ceil(matches.length / 20), total: matches.length } }
      } else if (path.startsWith('/enrollments/')) {
        detailReads += 1
        data = { enrollment: records.find(record => path.endsWith(`/${record.enrollmentId}`)) }
      }
      else throw new Error(`Unhandled queue fixture: ${path}`)
      await route.fulfill({ json: { success: true, data } })
    })

    const queue = page.getByRole('region', { name: role === 'DSWD_STAFF' ? 'Review queue' : 'Barangay enrollments', exact: true })
    const action = role === 'DSWD_STAFF' ? 'Review case' : 'View enrollment'
    const back = role === 'DSWD_STAFF' ? 'Back to review queue' : 'Back to enrollments'
    const search = page.getByRole('searchbox', { name: 'Beneficiary', exact: true })
    const statusFilter = page.getByLabel('Status', { exact: true })
    const programFilter = page.getByLabel('Assistance program', { exact: true })
    await page.goto(origin + '/enrollments')
    await expect(queue).toBeVisible()
    await expect(page.getByRole('complementary', { name: 'Selected enrollment' })).toHaveCount(0)
    assert.ok((await queue.boundingBox()).width >= (await page.getByRole('form', { name: 'Enrollment filters' }).boundingBox()).width - 1, 'Queue uses the full content width')
    await expect(queue.locator('tbody tr')).toHaveCount(20)
    await queue.getByRole('button', { name: 'Next', exact: true }).click()
    await expect(queue.locator('tbody tr')).toHaveCount(2)
    await expect(page).toHaveURL(origin + '/enrollments?page=2')
    await queue.getByRole('button', { name: 'Previous', exact: true }).click()
    await expect(queue.locator('tbody tr')).toHaveCount(20)

    for (const width of [1920, 1440, 1280, 1024, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 })
      await page.evaluate(() => window.scrollTo(0, 0))
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), { message: `${role} queue fits ${width}px` }).toBe(true)
      await expect(search).toBeVisible()
      assert.ok((await search.boundingBox()).width >= 160, 'Search stays usable at every breakpoint')
      if (width >= 1280) assert.ok(await queue.locator('tbody td:last-child').evaluateAll(cells => cells.every(cell => {
        const button = cell.querySelector('button').getBoundingClientRect()
        const bounds = cell.getBoundingClientRect()
        return button.left >= bounds.left && button.right <= bounds.right + 1
      })), 'Actions fit their own column without clipping or overlapping statuses')
      if ([1440, 390].includes(width)) await page.screenshot({ path: `${output}/${role.toLowerCase()}-${width}.png` })
    }

    await page.setViewportSize({ width: 1440, height: 1000 })
    await search.fill('Maria')
    await statusFilter.selectOption('FOR_VALIDATION')
    await programFilter.selectOption('program-1')
    await page.getByRole('button', { name: 'Apply filters', exact: true }).click()
    await expect(queue.locator('tbody tr')).toHaveCount(1)
    const filteredUrl = '/enrollments?search=Maria&status=FOR_VALIDATION&programId=program-1'
    await expect(page).toHaveURL(origin + filteredUrl)
    await page.screenshot({ path: `${output}/${role.toLowerCase()}-one-enrollment.png` })
    await queue.getByRole('button', { name: action, exact: true }).press('Enter')
    const detail = page.getByRole('complementary', { name: 'Selected enrollment' })
    await expect(detail.getByRole('button', { name: back, exact: true })).toBeFocused()
    await expect(detail.getByRole('heading', { name: 'Maria M. Santos', exact: true })).toBeVisible()
    await expect(detail.locator('[aria-busy]')).toHaveAttribute('aria-busy', 'false')
    const loadedReads = detailReads
    const selectedCase = queue.getByRole('button', { name: /Maria M\. Santos/ })
    await selectedCase.click()
    await selectedCase.press('Enter')
    await expect(detail.locator('[aria-busy]')).toHaveAttribute('aria-busy', 'false')
    assert.equal(detailReads, loadedReads, 'Reselecting the open case keeps loaded details and decisions available')
    if (role === 'BARANGAY_FACILITATOR') {
      await expect(page.getByRole('button', { name: 'Approve enrollment', exact: true })).toHaveCount(0)
      await expect(page.getByRole('button', { name: 'Start validation', exact: true })).toHaveCount(0)
    }
    await detail.getByRole('button', { name: back, exact: true }).click()
    await expect(page.locator('#enrollment-list-heading')).toBeFocused()
    await expect(page).toHaveURL(origin + filteredUrl)
    await expect(search).toHaveValue('Maria')
    await expect(statusFilter).toHaveValue('FOR_VALIDATION')
    await expect(programFilter).toHaveValue('program-1')

    await search.fill('No matching beneficiary')
    await page.getByRole('button', { name: 'Apply filters', exact: true }).click()
    await expect(queue.getByRole('heading', { name: 'No enrollments match your filters' })).toBeVisible()
    await queue.getByRole('button', { name: 'Clear filters', exact: true }).click()
    await expect(queue.locator('tbody tr')).toHaveCount(20)
    await expect(search).toHaveValue('')
    await expect(statusFilter).toHaveValue('')
    await expect(programFilter).toHaveValue('')
    await expect(page).toHaveURL(origin + '/enrollments')

    const workspace = page.locator('[aria-labelledby="enrollment-list-heading"]').locator('..')
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 })
      for (const reducedMotion of ['no-preference', 'reduce']) {
        await page.emulateMedia({ reducedMotion })
        const open = width >= 1280 ? queue.getByRole('button', { name: action, exact: true }).first() : queue.getByRole('button', { name: /Maria M\. Santos/ })
        await checkTransition(page, workspace, open, reducedMotion === 'reduce')
        await expect(detail.getByRole('heading', { name: 'Maria M. Santos', exact: true })).toBeVisible()
        await checkTransition(page, workspace, detail.getByRole('button', { name: back, exact: true }), reducedMotion === 'reduce')
        await expect(page.locator('#enrollment-list-heading')).toBeFocused()
        await expect(page).toHaveURL(origin + '/enrollments')
      }
    }
    await page.setViewportSize({ width: 1440, height: 1000 })
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    // Returning during entry must cancel motion without delaying navigation or leaving hidden content.
    await queue.getByRole('button', { name: action, exact: true }).first().evaluate(button => button.click())
    await detail.getByRole('button', { name: back, exact: true }).evaluate(button => button.click())
    await expect(page.locator('#enrollment-list-heading')).toBeFocused()
    await expect.poll(() => workspace.evaluate(view => getComputedStyle(view).opacity)).toBe('1')
    await expect(page.getByRole('complementary', { name: 'Selected enrollment' })).toHaveCount(0)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    console.log(`PASS ${role}: open/back motion on desktop/mobile, reduced-motion support and interrupted navigation`)

    if (role === 'BARANGAY_FACILITATOR') {
      const correction = queue.getByRole('row').filter({ hasText: 'Lourdes' })
      await expect(correction.getByText('Your action needed', { exact: true })).toBeVisible()
      await correction.getByRole('button', { name: action, exact: true }).click()
      await expect(detail.getByText('Please replace the unreadable valid ID.', { exact: true })).toBeVisible()
      await expect(detail.getByRole('button', { name: 'Correct beneficiary documents', exact: true })).toBeVisible()
      await expect(detail.getByRole('button', { name: 'Request correction', exact: true })).toHaveCount(0)
      assert.ok((await queue.getByRole('list').boundingBox()).height <= 601, 'The compact queue scrolls without stretching the selected case page')
      await page.screenshot({ path: `${output}/barangay-correction.png` })
      await page.setViewportSize({ width: 390, height: 1000 })
      await page.evaluate(() => window.scrollTo(0, 0))
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
      await expect(detail.getByRole('button', { name: back, exact: true })).toBeVisible()
      await page.screenshot({ path: `${output}/barangay-correction-390.png`, fullPage: true })
      await detail.getByRole('button', { name: back, exact: true }).click()
      await expect(page.locator('#enrollment-list-heading')).toBeFocused()
    }
    assert.deepEqual(errors, [])
    console.log(`PASS ${role}: full-width queue, responsive filters, pagination, keyboard selection, preserved return context, empty/reset state and role permissions`)
    await page.close()
  }
  console.log(`Screenshots: ${output}`)
} finally {
  await browser?.close()
  await vite.close()
}
