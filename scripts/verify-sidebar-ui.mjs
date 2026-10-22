import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium, expect } from '@playwright/test'
import { createServer } from 'vite'

// Exercise the real app with local response fixtures; no staff account or live data is used.
const output = resolve('../output/sidebar-refinement')
await mkdir(output, { recursive: true })
const vite = await createServer({ server: { host: '127.0.0.1', port: 0 } })
await vite.listen()
const baseUrl = `http://127.0.0.1:${vite.httpServer.address().port}`
let browser
const roles = [
  ['SYSTEM_ADMIN', 'admin', 'Beneficiaries', 'User Accounts', 'Enrollment review'],
  ['DSWD_STAFF', 'dswd', 'Programs & enrollment', 'Identity & claims', 'Enrollment review'],
  ['BARANGAY_FACILITATOR', 'barangay', 'Beneficiary services', 'Distribution day', 'Enrollments'],
]

try {
  browser = await chromium.launch({ headless: true, channel: 'chrome' })
  for (const [role, name, activeGroup, otherGroup, enrollmentLabel] of roles) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
    await context.addInitScript(({ role }) => {
      sessionStorage.setItem('garantiyaid.accessToken', 'sidebar-preview-token')
      sessionStorage.setItem('garantiyaid.user', JSON.stringify({
        userId: 'sidebar-preview', role, fullName: 'Alexandra Maria De Los Santos', employeeId: 'STAFF-024',
        barangayId: role === 'BARANGAY_FACILITATOR' ? 'barangay-1' : null,
        barangay: role === 'BARANGAY_FACILITATOR' ? { barangayName: 'Poblacion', city: 'Cebu City' } : null,
        email: 'preview@example.test',
      }))
    }, { role })
    const page = await context.newPage()
    const errors = []
    let logoutRequests = 0
    page.on('pageerror', (error) => errors.push(error.message))
    await page.route('**/socket.io/**', (route) => route.abort())
    await page.routeWebSocket(/socket\.io/, () => {})
    await page.route('**/api/v1/**', async (route) => {
      const path = new URL(route.request().url()).pathname.replace('/api/v1', '')
      const pagination = { page: 1, pageSize: 20, total: 0, totalPages: 1 }
      let data = {}
      if (path === '/health') data = { timestamp: new Date().toISOString() }
      else if (path === '/auth/logout') { logoutRequests++; data = { message: 'Signed out.' } }
      else if (path === '/barangays') data = { barangays: [{ barangayId: 'barangay-1', barangayName: 'Poblacion', city: 'Cebu City' }] }
      else if (path === '/beneficiaries') data = { beneficiaries: [], pagination }
      else if (path === '/programs') data = { programs: [], pagination }
      else if (path === '/enrollments') data = { enrollments: [], pagination }
      else if (path.includes('notifications')) data = { notifications: [], unreadCount: 0, pagination }
      else return route.fulfill({ status: 404, json: { error: { message: 'No preview fixture for this operation.' } } })
      await route.fulfill({ json: { data } })
    })
    await page.goto(`${baseUrl}/beneficiaries`)
    const sidebar = page.locator('#staff-navigation')
    const nav = sidebar.getByRole('navigation')
    await expect(page.getByRole('heading', { name: 'Beneficiary management' })).toBeVisible()
    await expect(nav.getByRole('button', { name: activeGroup, exact: true })).toHaveAttribute('aria-expanded', 'true')
    await expect(nav.locator('[aria-current="page"]')).toHaveCount(1)
    assert.equal(await sidebar.locator('a[href="/admin/administration"]').count(), role === 'SYSTEM_ADMIN' ? 1 : 0)
    assert.equal(await sidebar.locator('a[href="/facilitator/queue"]').count(), role === 'BARANGAY_FACILITATOR' ? 1 : 0)
    assert.equal(await sidebar.evaluate((element) => getComputedStyle(element).backgroundColor), 'rgb(6, 38, 77)')
    await expect(page.locator('.ga-staff-greeting')).toContainText('Mabuting araw!')
    await expect(page.locator('.ga-staff-greeting strong')).toHaveText('Alexandra Maria De Los Santos')
    await expect(sidebar.locator('summary')).toContainText('Staff ID: STAFF-024')
    if (role === 'BARANGAY_FACILITATOR') await expect(sidebar.locator('summary')).toContainText('Poblacion · Cebu City')
    await page.screenshot({ path: `${output}/${name}-desktop.png`, fullPage: true, animations: 'disabled' })

    const active = nav.getByRole('button', { name: activeGroup, exact: true })
    const other = nav.getByRole('button', { name: otherGroup, exact: true })
    await other.focus()
    await page.keyboard.press('Enter')
    await expect(other).toHaveAttribute('aria-expanded', 'true')
    await expect(active).toHaveAttribute('aria-expanded', 'false')
    const hiddenId = await active.getAttribute('aria-controls')
    assert.equal(await page.locator(`#${hiddenId}`).evaluate((element) => element.inert), true)
    await other.press('Space')
    await expect(other).toHaveAttribute('aria-expanded', 'false')
    await active.click()
    await nav.getByRole('link', { name: enrollmentLabel, exact: true }).click()
    await expect(page).toHaveURL(/\/enrollments$/)
    await expect(nav.getByRole('link', { name: enrollmentLabel, exact: true })).toHaveAttribute('aria-current', 'page')
    await expect(page.locator('#dashboard-content')).toBeFocused()
    await page.goBack()
    await expect(nav.locator('[aria-current="page"]')).toHaveAttribute('href', '/beneficiaries')

    // Check live intermediate frames, not just screenshots of the settled states.
    const motion = await sidebar.evaluate(async (element) => {
      const toggle = element.querySelector('.ga-sidebar-toggle')
      const name = element.querySelector('.ga-sidebar-account-copy > span > span')
      const nameWidth = name.getBoundingClientRect().width
      const frames = []
      for (const action of ['collapse', 'expand', 'interrupt collapse', 'interrupt expand']) {
        toggle.click()
        const start = performance.now()
        do {
          await new Promise(requestAnimationFrame)
          frames.push({
            action,
            width: element.getBoundingClientRect().width,
            nameWidth: name.getBoundingClientRect().width,
            labelLines: [...element.querySelectorAll('.ga-sidebar-parent > span')].map((label) => {
              const range = document.createRange()
              range.selectNodeContents(label)
              return new Set([...range.getClientRects()].map((rect) => rect.y)).size
            }),
          })
        } while (performance.now() - start < (action.startsWith('interrupt') ? 60 : 320))
      }
      return { frames, nameWidth }
    })
    assert.ok(motion.frames.some((frame) => frame.width > 85 && frame.width < 287), 'exercise in-between sidebar widths')
    for (const frame of motion.frames) {
      assert.ok(frame.labelLines.every((lines) => lines === 1), `${name}: labels must never rewrap while ${frame.action} runs`)
      assert.ok(Math.abs(frame.nameWidth - motion.nameWidth) < 1, `${name}: account text must keep a stable width`)
    }

    await nav.getByRole('button', { name: 'Collapse navigation', exact: true }).click()
    await expect(sidebar).toHaveAttribute('data-collapsed', 'true')
    await expect.poll(async () => Math.round((await sidebar.boundingBox()).width)).toBe(84)
    await expect(nav.getByRole('link', { name: enrollmentLabel, exact: true })).toHaveCount(0)
    await page.screenshot({ path: `${output}/${name}-collapsed.png`, animations: 'disabled' })
    await other.click()
    // Freeze one intermediate frame for visual review without fast-forwarding motion.
    await sidebar.evaluate(async (element) => {
      await new Promise(requestAnimationFrame)
      for (const animation of element.getAnimations({ subtree: true })) {
        animation.pause()
        animation.currentTime = 120
      }
    })
    await sidebar.screenshot({ path: `${output}/${name}-expanding.png`, animations: 'allow' })
    await sidebar.evaluate((element) => element.getAnimations({ subtree: true }).forEach((animation) => animation.finish()))
    await expect(sidebar).toHaveAttribute('data-collapsed', 'false')
    await expect(other).toHaveAttribute('aria-expanded', 'true')
    await active.click()

    const account = sidebar.locator('summary')
    await account.click()
    await expect(sidebar.getByRole('link', { name: /Personal information/ })).toBeVisible()
    await expect(sidebar.getByText('Staff ID: STAFF-024')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(account).toBeFocused()
    await expect(sidebar.locator('details')).not.toHaveAttribute('open')

    await nav.getByRole('button', { name: 'Collapse navigation', exact: true }).click()
    await page.setViewportSize({ width: 390, height: 844 })
    await expect(page.locator('.ga-staff-header time')).toBeVisible()
    await expect(sidebar).toHaveJSProperty('inert', true)
    const open = page.getByRole('button', { name: 'Open navigation', exact: true })
    await open.click()
    await expect(sidebar).toHaveAttribute('aria-modal', 'true')
    const close = sidebar.getByRole('button', { name: 'Close navigation', exact: true })
    await expect(close).toBeFocused()
    await active.click()
    await expect(nav.getByRole('link', { name: enrollmentLabel, exact: true })).toBeVisible()
    await page.screenshot({ path: `${output}/${name}-mobile.png`, animations: 'disabled' })
    await sidebar.locator('.ga-account-logout').focus()
    await page.keyboard.press('Tab')
    await expect(sidebar.getByRole('link', { name: 'GarantiyAid overview' })).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(open).toBeFocused()
    await expect(sidebar).toHaveJSProperty('inert', true)

    await open.click()
    await nav.getByRole('link', { name: enrollmentLabel, exact: true }).click()
    await expect(sidebar).toHaveJSProperty('inert', true)
    await expect(page.locator('#dashboard-content')).toBeFocused()
    await open.click()
    await page.setViewportSize({ width: 1440, height: 1000 })
    await expect(sidebar).not.toHaveAttribute('aria-modal')
    await expect.poll(() => page.evaluate(() => document.body.style.overflow)).not.toBe('hidden')
    await expect(sidebar).toHaveJSProperty('inert', false)
    await expect(nav.locator('button[aria-controls^="staff-nav-"][aria-expanded="true"]')).toHaveCount(0)

    await page.emulateMedia({ reducedMotion: 'reduce' })
    await nav.getByRole('button', { name: 'Expand navigation', exact: true }).click()
    assert.ok(await sidebar.evaluate((element) => parseFloat(getComputedStyle(element).transitionDuration) < 0.001))
    for (const viewport of [{ width: 320, height: 700 }, { width: 844, height: 390 }]) {
      await page.setViewportSize(viewport)
      await open.click()
      assert.equal(await sidebar.evaluate((element) => element.scrollWidth <= element.clientWidth), true)
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
      await account.click()
      const panel = sidebar.locator('.ga-profile-panel')
      await expect(panel).toBeVisible()
      const bounds = await panel.boundingBox()
      assert.ok(bounds.y >= 0 && bounds.x + bounds.width <= viewport.width)
      await page.keyboard.press('Escape')
      await page.keyboard.press('Escape')
    }
    assert.deepEqual(errors, [], `${name} should have no runtime errors`)
    await page.setViewportSize({ width: 1440, height: 1000 })
    await sidebar.locator('.ga-account-logout').click()
    await expect(page).toHaveURL(/\/login$/)
    assert.equal(logoutRequests, 1, 'the account-card sign-out must use the secure logout endpoint once')
    console.log(`${name}: routes, collapsible groups, keyboard, icon rail, account menu, mobile and reduced motion passed`)
    await context.close()
  }
} finally {
  await browser?.close()
  await vite.close()
}
