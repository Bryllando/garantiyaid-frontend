import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium, devices, expect } from '@playwright/test'
import { createServer } from 'vite'

// All credentials and codes below are fixtures; no real account requests reach the backend.
const output = resolve('../output/recovery-ui')
const codes = Array.from({ length: 8 }, (_, i) => `ABCD-1234-5678-000${i}`)
const user = { userId: 'recovery-fixture', role: 'SYSTEM_ADMIN', fullName: 'Test Administrator', employeeId: 'TEST-001', email: 'staff@example.test', totpEnabled: true }
const setup = { secret: 'JBSWY3DPEHPK3PXP', otpauthUri: 'otpauth://totp/GarantiyAid:fixture?secret=JBSWY3DPEHPK3PXP&issuer=GarantiyAid', replacementToken: 'test-replacement' }
await mkdir(output, { recursive: true })
const vite = await createServer({
  cacheDir: resolve(output, '.vite'), logLevel: 'error',
  define: { 'import.meta.env.VITE_API_URL': JSON.stringify('/api/v1') },
  server: { host: '127.0.0.1', port: 0, hmr: false },
  plugins: [{ name: 'recovery-pdf-preview', configureServer(server) {
    server.middlewares.use(async (request, response, next) => {
      if (request.url !== '/__recovery.pdf') return next()
      const pdf = await readFile(resolve(output, 'desktop-setup.pdf'))
      response.setHeader('Content-Type', 'application/pdf')
      response.setHeader('Content-Length', pdf.length)
      response.setHeader('Cache-Control', 'no-store')
      response.end(pdf)
    })
  } }],
})
let browser
let lastPage
const errors = []
try {
  await vite.listen()
  const origin = `http://127.0.0.1:${vite.httpServer.address().port}`
  browser = await chromium.launch({ headless: true, channel: 'chrome', ignoreDefaultArgs: ['--disable-extensions'] })
  for (const [name, device] of (process.argv.includes('--pdf-only') ? [] : [['desktop', { viewport: { width: 1440, height: 1100 } }], ['android', devices['Pixel 7']], ['iphone', devices['iPhone 13']]])) {
    const context = await browser.newContext({ ...device, permissions: ['clipboard-read', 'clipboard-write'] })
    await context.addInitScript(({ user }) => {
      sessionStorage.setItem('garantiyaid.totpSetupToken', 'fixture-setup')
      sessionStorage.setItem('garantiyaid.accessToken', 'fixture-access')
      sessionStorage.setItem('garantiyaid.user', JSON.stringify(user))
      window.__prints = []
      window.print = () => {
        window.top.__prints.push({ isolated: window !== window.top, html: document.documentElement.outerHTML, text: document.body.textContent })
        window.dispatchEvent(new Event('afterprint'))
      }
      document.addEventListener('click', event => {
        const link = event.target.closest('a[href^="otpauth:"]')
        if (link) { event.preventDefault(); window.__authenticatorLink = link.href }
      }, true)
    }, { user })
    await context.routeWebSocket(/socket\.io/, socket => socket.close())
    await context.route('**/api/v1/**', async route => {
      const path = new URL(route.request().url()).pathname
      let data
      if (path.endsWith('/auth/totp/setup') || path.endsWith('/auth/account/totp-replacement')) data = setup
      else if (path.endsWith('/auth/totp/confirm') || path.endsWith('/auth/account/totp-replacement/confirm')) data = { accessToken: 'fixture-access', user, recoveryCodes: codes }
      else if (path.endsWith('/auth/account/recovery-codes')) data = { recoveryCodes: codes }
      else if (path.endsWith('/auth/account')) data = { user, security: { recoveryCodesRemaining: 8, activeSessionCount: 1, sessions: [] } }
      else if (path.includes('notifications')) data = { notifications: [], unreadCount: 0, pagination: { page: 1, pageSize: 20, total: 0, totalPages: 1 } }
      else if (path.includes('/staff-assistant/conversations')) data = { conversations: [], nextOffset: null }
      else return route.fulfill({ status: 404, json: { error: { message: 'No fixture for this request.' } } })
      return route.fulfill({ json: { success: true, data } })
    })
    const page = await context.newPage()
    lastPage = page
    page.setDefaultTimeout(15_000)
    if (name === 'iphone') await page.setViewportSize({ width: 320, height: 740 })
    page.on('pageerror', error => errors.push(`${name}: ${error.message}`))
    page.on('dialog', dialog => dialog.accept())
    const checkOptions = async () => {
      const link = page.getByRole('link', { name: 'Open authenticator app' })
      if (name === 'desktop') {
        await expect(link).toHaveCount(0)
        await page.setViewportSize({ width: 320, height: 740 })
        await expect(link).toHaveCount(0)
        await page.setViewportSize({ width: 1440, height: 1100 })
      } else {
        await expect(link).toHaveAttribute('href', setup.otpauthUri)
        await link.click()
        assert.equal(await page.evaluate(() => window.__authenticatorLink), setup.otpauthUri)
        await expect(page.getByText('After adding the account, return here and enter its six-digit code.')).toBeVisible()
      }
      await page.locator('summary').filter({ hasText: /Enter.*key manually|Enter setup key manually/ }).click()
      await expect(page.getByText(setup.secret, { exact: true })).toBeVisible()
      await page.getByRole('button', { name: 'Copy setup key' }).click()
      assert.equal(await page.evaluate(() => navigator.clipboard.readText()), setup.secret)
    }
    const checkExport = async (suffix) => {
      const count = await page.evaluate(() => window.__prints.length)
      const pending = page.waitForEvent('download')
      await page.getByRole('button', { name: 'Download PDF', exact: true }).click()
      const download = await pending
      assert.equal(download.suggestedFilename(), 'garantiyaid-recovery-codes.pdf')
      const path = resolve(output, `${name}-${suffix}.pdf`)
      await download.saveAs(path)
      const contents = await readFile(path, 'latin1')
      assert.ok(contents.startsWith('%PDF-'))
      for (const code of codes) assert.ok(contents.includes(code))
      assert.equal(await page.evaluate(() => window.__prints.length), count)
      await expect(page.getByRole('checkbox')).not.toBeChecked()
      await page.getByRole('button', { name: 'Print', exact: true }).click()
      await expect.poll(() => page.evaluate(() => window.__prints.length)).toBe(count + 1)
      const printed = await page.evaluate(() => window.__prints.at(-1))
      assert.equal(printed.isolated, true)
      for (const code of codes) assert.ok(printed.text.includes(code))
      assert.ok(!printed.text.includes('Download PDF'))
      await expect(page.locator('iframe[title="Recovery codes print document"]')).toHaveCount(0)
      await expect(page.getByRole('button', { name: 'Print', exact: true })).toBeFocused()
      if (name === 'desktop' && suffix === 'setup') await writeFile(resolve(output, 'print-preview.html'), printed.html)
      const textDownload = page.waitForEvent('download')
      await page.getByRole('button', { name: 'Download .txt', exact: true }).click()
      assert.equal((await textDownload).suggestedFilename(), 'garantiyaid-recovery-codes.txt')
      await page.getByRole('button', { name: 'Copy all', exact: true }).click()
      const clipboard = await page.evaluate(() => navigator.clipboard.readText())
      for (const code of codes) assert.ok(clipboard.includes(code))
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true)
      for (const button of await page.locator('[data-recovery-actions] button').all()) assert.ok((await button.boundingBox()).height >= 44)
      await page.locator('[data-recovery-print]').screenshot({ path: resolve(output, `${name}-${suffix}.png`) })
    }
    console.log(`${name}: initial setup`)
    await page.goto(`${origin}/totp-setup`)
    await page.getByRole('button', { name: 'Show my QR code' }).click()
    await checkOptions()
    await page.locator('[aria-labelledby="setup-scan-title"]').screenshot({ path: resolve(output, `${name}-authenticator.png`) })
    await page.locator('#setup-code').fill('123456')
    await page.getByRole('button', { name: 'Confirm and activate' }).click()
    await expect(page.getByRole('button', { name: 'Continue to dashboard' })).toBeDisabled()
    await checkExport('setup')
    await expect(page.getByRole('button', { name: 'Continue to dashboard' })).toBeDisabled()
    await page.getByRole('checkbox').check()
    await expect(page.getByRole('button', { name: 'Continue to dashboard' })).toBeEnabled()

    console.log(`${name}: account recovery`)
    await page.goto(`${origin}/account?section=recovery`)
    await page.getByRole('button', { name: 'Generate new recovery codes', exact: true }).click()
    await page.locator('#security-current-password').fill('fixture-password')
    await page.locator('#security-totp').fill('123456')
    await page.getByRole('dialog').getByRole('button', { name: /Generate new codes/ }).click()
    await checkExport('account')
    await expect(page.getByRole('button', { name: 'Done', exact: true })).toBeDisabled()
    await page.getByRole('checkbox').check()
    await page.getByRole('button', { name: 'Done', exact: true }).click()

    console.log(`${name}: authenticator replacement`)
    await page.goto(`${origin}/account?section=authenticator`)
    await page.getByRole('button', { name: 'Set up on a new phone', exact: true }).click()
    await page.locator('#security-current-password').fill('fixture-password')
    await page.locator('#security-totp').fill('123456')
    await page.getByRole('dialog').getByRole('button', { name: /Continue/ }).click()
    await checkOptions()
    await page.getByRole('dialog').screenshot({ path: resolve(output, `${name}-replacement.png`) })
    await page.locator('#replacement-code').fill('123456')
    await page.getByRole('button', { name: 'Verify and connect new phone' }).click()
    await expect(page.getByRole('button', { name: 'Download PDF' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Done', exact: true })).toBeDisabled()
    await context.close()
  }
  const preview = await browser.newPage({ viewport: { width: 900, height: 1100 } })
  await preview.setContent(await readFile(resolve(output, 'print-preview.html'), 'utf8'))
  await preview.emulateMedia({ media: 'print' })
  await preview.pdf({ path: resolve(output, 'printed-page.pdf'), preferCSSPageSize: true })
  const printedPdf = await readFile(resolve(output, 'printed-page.pdf'), 'latin1')
  assert.equal((printedPdf.match(/\/Type \/Page\b/g) || []).length, 1)
  await preview.screenshot({ path: resolve(output, 'print-preview.png') })
  await preview.emulateMedia({ media: 'screen' })
  await preview.goto(`${origin}/__recovery.pdf`)
  await expect.poll(() => preview.frames().some(frame => frame.url().startsWith('chrome-extension:'))).toBe(true)
  const viewerFrame = preview.frames().find(frame => frame.url().startsWith('chrome-extension:'))
  await expect(viewerFrame.locator('pdf-viewer')).toBeVisible()
  await expect(viewerFrame.getByRole('textbox', { name: 'Page number', exact: true })).toHaveValue('1')
  await viewerFrame.getByRole('button', { name: 'Toggle sidebar', exact: true }).click()
  await preview.screenshot({ path: resolve(output, 'downloaded-pdf-preview.png') })
  await preview.close()
  assert.deepEqual(errors, [])
  console.log(process.argv.includes('--pdf-only') ? 'PDF preview passed.' : 'Recovery UI passed: setup/account/replacement, direct PDF and text downloads, isolated print, mobile app link, manual copy, saved-code guard, and responsive layouts.')
} catch (error) {
  if (lastPage && !lastPage.isClosed()) {
    await lastPage.screenshot({ path: resolve(output, 'failure.png'), fullPage: true })
    console.error('Failed at:', lastPage.url(), 'Page errors:', errors)
  }
  throw error
} finally {
  await browser?.close()
  await vite.close()
}
