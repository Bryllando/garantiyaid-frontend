import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import { chromium, expect } from '@playwright/test'

// Invoked by the backend's local-only fixture runner. Credentials stay in memory.
export async function verifyAssistantUi({ baseUrl, env, admin, facilitator, program, area, distribution, date, prisma }) {
  const root = fileURLToPath(new URL('../', import.meta.url))
  const artifacts = new URL('../artifacts/assistant-phase6/', import.meta.url)
  await mkdir(artifacts, { recursive: true })
  const vite = await createServer({ root, cacheDir: fileURLToPath(new URL('.vite/', artifacts)), configFile: fileURLToPath(new URL('../vite.config.js', import.meta.url)), define: { 'import.meta.env.VITE_API_URL': JSON.stringify(baseUrl) }, server: { host: '127.0.0.1', port: 0, hmr: false }, logLevel: 'error' })
  let browser, page
  const errors = []
  try {
    await vite.listen()
    const origin = `http://127.0.0.1:${vite.httpServer.address().port}`
    env.corsOrigins.push(origin)
    browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge', headless: true })
    const openAccount = async (account, options = {}) => {
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, ...options })
      const { userId, fullName, role, employeeId, barangayId } = account.user
      await context.addInitScript(({ token, user }) => {
        sessionStorage.setItem('garantiyaid.accessToken', token)
        sessionStorage.setItem('garantiyaid.user', JSON.stringify(user))
      }, { token: account.token, user: { userId, fullName, role, employeeId, barangayId } })
      const current = await context.newPage()
      current.on('pageerror', (error) => errors.push(error.message))
      await current.goto(`${origin}/dashboard`)
      await current.getByRole('button', { name: 'Open GarantiyAid AI', exact: true }).click()
      await current.getByLabel('Assistant language', { exact: true }).selectOption('en')
      return current
    }
    const screenshot = async (name) => page.screenshot({ path: fileURLToPath(new URL(`${name}.png`, artifacts)), fullPage: false })
    const panel = () => page.getByRole('dialog', { name: 'GarantiyAid AI', exact: true })
    const checkWidth = async () => {
      assert.equal(await panel().evaluate((element) => element.scrollWidth <= element.clientWidth + 1), true, 'Assistant must not scroll horizontally')
      const bounds = await panel().boundingBox()
      assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= page.viewportSize().width, 'Assistant fits viewport')
      assert.equal(await page.locator('#garantiyaid-ai-title').evaluate((element) => element.scrollWidth <= element.clientWidth + 1), true, 'Assistant title stays readable')
    }
    page = await openAccount(admin)
    await page.getByRole('button', { name: 'Collapse navigation', exact: true }).click()
    await expect(page.locator('#staff-navigation')).toHaveAttribute('data-collapsed', 'true')
    await page.getByRole('button', { name: 'Expand navigation', exact: true }).click()
    await screenshot('desktop-overview')
    const before = await prisma.distribution.count({ where: { programId: program.programId } })
    await panel().getByRole('button', { name: 'Draft a distribution event', exact: true }).click()
    await panel().getByRole('button', { name: 'Cancel pending task', exact: true }).click()
    assert.equal(await prisma.distribution.count({ where: { programId: program.programId } }), before)
    await expect(page.getByLabel('Ask GarantiyAid AI', { exact: true })).toBeFocused()
    await page.getByLabel('Ask GarantiyAid AI', { exact: true }).fill('Hello, create a distribution')
    await page.getByRole('button', { name: 'Send message', exact: true }).click()
    const details = [
      ['Program', program.programCode], ['Barangay', area.barangayName], ['Date (PHT)', date],
      ['Start time (PHT)', '15:00'], ['End time (PHT)', '16:00'], ['Venue', 'Browser verification hall'],
      ['Slot duration', '30'], ['Verification', 'QR'], ['Event title', 'Browser reviewed draft'],
    ]
    for (const [label, value] of details) {
      const input = panel().getByLabel(label, { exact: true })
      if (label === 'Verification') await input.selectOption(value)
      else await input.fill(value)
      await panel().getByRole('button', { name: 'Keep this detail', exact: true }).click()
    }
    await screenshot('details-collected')
    await panel().getByRole('button', { name: 'Match records and preview', exact: true }).click()
    await expect(panel().getByLabel('Active assistance program', { exact: true })).toHaveValue(program.programId)
    await expect(panel().getByLabel('Service Barangay', { exact: true })).toHaveValue(area.barangayId)
    await panel().getByRole('button', { name: 'Check conflicts and preview', exact: true }).click()
    await expect(panel().getByRole('button', { name: 'Confirm and create draft', exact: true })).toBeDisabled()
    await expect(panel().getByRole('heading', { name: 'Confirm distribution draft' })).toBeFocused()
    await panel().getByRole('button', { name: 'Edit draft', exact: true }).click()
    await panel().getByLabel('Event title', { exact: true }).fill('Browser corrected draft')
    await panel().getByRole('button', { name: 'Check conflicts and preview', exact: true }).click()
    await expect(panel().getByText('Browser corrected draft', { exact: true })).toBeVisible()
    await screenshot('desktop-review')
    for (const width of [768, 390, 320]) {
      await page.setViewportSize({ width, height: 900 })
      await checkWidth()
      await screenshot(`review-${width}`)
    }
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await panel().getByRole('button', { name: 'Close GarantiyAid AI', exact: true }).click()
    await page.getByRole('button', { name: 'Open GarantiyAid AI', exact: true }).click()
    await expect(panel().getByText('Browser corrected draft', { exact: true })).toBeVisible()
    // Drop a real successful response; the application must recover its original approval.
    let drop = true, submissions = 0
    await page.route('**/distributions/assistant-confirm', async (route) => {
      submissions++
      if (!drop) return route.continue()
      drop = false
      const response = await route.fetch()
      assert.equal(response.status(), 201)
      await route.abort('failed')
    })
    const review = panel().getByRole('checkbox')
    await review.focus()
    await page.keyboard.press('Space')
    await expect(review).toBeChecked()
    await panel().getByRole('button', { name: 'Confirm and create draft', exact: true }).dblclick()
    await expect(panel().getByRole('button', { name: 'Retry same confirmation', exact: true })).toBeVisible()
    assert.equal(submissions, 1)
    await expect(panel().getByRole('button', { name: 'Edit draft', exact: true })).toBeDisabled()
    await screenshot('connection-recovery')
    await page.reload()
    await page.getByRole('button', { name: 'Open GarantiyAid AI', exact: true }).click()
    await expect(panel().getByRole('heading', { name: 'Recover your confirmation' })).toBeVisible()
    await screenshot('refresh-recovery')
    await panel().getByRole('button', { name: 'Recover previous confirmation', exact: true }).click()
    await expect(panel().getByRole('heading', { name: 'Browser corrected draft' })).toBeVisible()
    await expect(panel().getByRole('heading', { name: 'Browser corrected draft' })).toBeFocused()
    assert.equal(submissions, 2)
    assert.equal(await prisma.distribution.count({ where: { programId: program.programId, title: 'Browser corrected draft' } }), 1)
    await screenshot('draft-success')
    await page.keyboard.press('Escape')
    await expect(page.getByRole('button', { name: 'Open GarantiyAid AI', exact: true })).toBeFocused()
    await page.context().close()

    page = await openAccount(facilitator, { viewport: { width: 390, height: 900 }, reducedMotion: 'reduce', timezoneId: 'America/New_York' })
    await expect(panel().getByRole('button', { name: 'Draft a distribution event', exact: true })).toHaveCount(0)
    await panel().getByRole('button', { name: 'Prepare an area reminder', exact: true }).click()
    const queueTime = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 16)
    for (const [label, value] of [
      ['Distribution event', distribution.distributionId], ['Recipient area', 'Purok QA'],
      ['Reminder message', 'Browser reminder: bring your QR credential to {location}.'],
      ['Queue timing', 'scheduled'], ['Date (PHT)', queueTime.slice(0, 10)], ['Queue time (PHT)', queueTime.slice(11)],
    ]) {
      const input = panel().getByLabel(label, { exact: true })
      if (label === 'Queue timing') await input.selectOption(value)
      else await input.fill(value)
      await panel().getByRole('button', { name: 'Keep this detail', exact: true }).click()
    }
    await panel().getByRole('button', { name: 'Match records and preview', exact: true }).click()
    await expect(panel().getByLabel('Distribution event', { exact: true })).toHaveValue(distribution.distributionId)
    await expect(panel().getByLabel('Sitio / Purok', { exact: true })).toHaveValue('Purok QA')
    await expect(panel().getByLabel('Queue date and time (PHT)', { exact: true })).toHaveValue(queueTime)
    await panel().getByRole('button', { name: 'Preview recipients and message', exact: true }).click()
    const confirm = panel().getByRole('button', { name: 'Confirm and queue 1 reminder', exact: true })
    await expect(confirm).toBeDisabled()
    await checkWidth()
    await screenshot('reminder-review')
    await panel().getByRole('checkbox').check()
    await confirm.click()
    await expect(panel().getByRole('heading', { name: '1 reminder queued', exact: true })).toBeVisible()
    const notification = await prisma.notification.findFirstOrThrow({ where: { distributionId: distribution.distributionId, message: { startsWith: 'Browser reminder:' } } })
    assert.equal(notification.scheduledFor.toISOString(), new Date(`${queueTime}:00+08:00`).toISOString())
    await screenshot('reminder-success')
    assert.deepEqual(errors, [], 'No browser runtime errors')
    console.log('PASS browser desktop/tablet/320px, reduced motion, keyboard, role scope, correction, cancellation, response-loss recovery and PHT timing')
  } catch (error) {
    if (page && !page.isClosed()) await page.screenshot({ path: fileURLToPath(new URL('failure.png', artifacts)) }).catch(() => {})
    throw error
  } finally { await browser?.close(); await vite.close() }
}
