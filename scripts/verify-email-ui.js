import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import { chromium, expect } from '@playwright/test'

// Isolated browser checks: every API request uses fixtures; no accounts or emails are created.
const root = fileURLToPath(new URL('../', import.meta.url))
const artifacts = fileURLToPath(new URL('../artifacts/email-ui/', import.meta.url))
const user = { userId: '11111111-1111-4111-8111-111111111111', fullName: 'Maria Santos', employeeId: 'SYS-0001', role: 'SYSTEM_ADMIN', email: 'maria@example.test', isActive: true, totpEnabled: true, updatedAt: '2026-09-16T02:30:00Z' }
const delivery = { configured: true, status: 'PENDING', recipientMasked: 'm****@example.test', sentAt: null, failedAt: null }
const notification = { notificationId: '22222222-2222-4222-8222-222222222222', title: 'Your staff account is ready', message: 'Account created.', createdAt: user.updatedAt, readAt: null, targetPath: '/account?section=authenticator', emailDelivery: delivery }
const fixtureHtml = `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div><script type="module">
import React from 'react';
import { createRoot } from 'react-dom/client';
import { StaffAccountCreatedDialog } from '/src/pages/StaffBarangayAdministrationPage.jsx?email-ui-check';
import { SecurityEmailStatus } from '/src/components/ui/SecurityEmailStatus.jsx';
import '/src/index.css';
const root = createRoot(document.getElementById('root'));
const mode = new URLSearchParams(location.search).get('mode');
if (mode === 'states') root.render(React.createElement('main', {}, ...['PENDING','SENT','FAILED','DISABLED'].map(status => React.createElement('section', {key:status,'data-state':status}, React.createElement(SecurityEmailStatus, {delivery:{...${JSON.stringify(delivery)},status,configured:status!=='DISABLED'}})))));
else root.render(React.createElement(StaffAccountCreatedDialog, {account:{user:${JSON.stringify(user)},temporaryPassword:'SAMPLE-ONLY-123!',emailDelivery:${JSON.stringify(delivery)}},onClose:()=>{window.handoffClosed=true;root.unmount();}}));
</script></body></html>`
const vite = await createServer({
  root, cacheDir: `${artifacts}/.vite`, logLevel: 'error',
  define: { 'import.meta.env.VITE_API_URL': JSON.stringify('https://email-api.example.test/api/v1') },
  server: { host: '127.0.0.1', port: 0, hmr: false },
  plugins: [{ name: 'email-ui-fixture',
    transform(code, id) { if (id.includes('StaffBarangayAdministrationPage.jsx?email-ui-check')) return code + '\nexport { StaffAccountCreatedDialog };' },
    configureServer(server) { server.middlewares.use(async (req, res, next) => {
      if (!req.url.startsWith('/__email-check')) return next()
      res.setHeader('Content-Type', 'text/html')
      res.end(await server.transformIndexHtml(req.url, fixtureHtml))
    }) },
  }],
})
let browser
const errors = []
try {
  await mkdir(artifacts, { recursive: true })
  await vite.listen()
  const origin = `http://127.0.0.1:${vite.httpServer.address().port}`
  browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge', headless: true })
  const context = await browser.newContext({ viewport: { width: 375, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'] })
  await context.routeWebSocket('**/*', socket => socket.close())
  await context.route('**/*', async route => {
    const url = new URL(route.request().url())
    if (url.origin === origin) return route.continue()
    if (url.hostname !== 'email-api.example.test') return route.abort()
    let data
    const endpoint = url.pathname.replace('/api/v1', '')
    if (endpoint === '/auth/login') data = route.request().postDataJSON().totpCode ? { accessToken: 'fixture-token', user } : { requiresTotp: true }
    else if (endpoint === '/auth/account') data = { user, security: { recoveryCodesRemaining: 8, activeSessionCount: 1, currentSession: { createdAt: user.updatedAt, expiresAt: '2026-09-16T23:30:00Z' }, securityEmail: { configured: true } } }
    else if (endpoint === '/staff-notifications') data = { notifications: [{ ...notification, emailDelivery: { ...delivery } }], unreadCount: 1 }
    else if (endpoint === '/users') data = { users: [user], pagination: { page: 1, totalPages: 1, total: 1 } }
    else if (endpoint === '/barangays') data = { barangays: [] }
    else if (endpoint.endsWith('/email-deliveries')) data = { notifications: [{ ...notification, emailDelivery: { ...delivery } }] }
    else if (endpoint === '/health') data = { timestamp: new Date().toISOString() }
    else return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ success: false, error: { message: 'Unexpected fixture route' } }) })
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data }) })
  })
  const page = await context.newPage()
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(`${origin}/__email-check?mode=states`)
  for (const [state, label] of Object.entries({ PENDING: 'Email queued', SENT: 'Email sent', FAILED: 'Email failed', DISABLED: 'Email notifications are off' })) {
    await expect(page.locator(`[data-state="${state}"]`).getByText(label, { exact: true })).toBeVisible()
  }
  await expect(page.locator('[data-state="FAILED"]')).not.toContainText('temporarily')

  await page.goto(`${origin}/__email-check`)
  const dialog = page.getByRole('dialog', { name: 'Account created' })
  await expect(dialog).toBeVisible()
  assert.equal(await dialog.getByLabel('Temporary password', { exact: true }).getAttribute('type'), 'password')
  const copyBounds = await dialog.getByRole('button', { name: 'Copy credentials', exact: true }).boundingBox()
  assert.ok(copyBounds.y + copyBounds.height < 900, 'Copy action is visible without scrolling on a phone')
  await page.keyboard.press('Escape')
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('alert')).toContainText('before closing')
  await dialog.getByRole('button', { name: 'Close account handoff' }).click()
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Copy credentials', exact: true }).click()
  assert.match(await page.evaluate(() => navigator.clipboard.readText()), /SAMPLE-ONLY-123!/)
  await expect(dialog).toBeVisible()
  await page.screenshot({ path: `${artifacts}/handoff-mobile.png`, fullPage: true })
  await dialog.getByRole('checkbox').check()
  await dialog.getByRole('button', { name: 'Done', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  assert.equal(await page.evaluate(() => window.handoffClosed), true)

  await page.goto(`${origin}/account?section=authenticator`)
  await expect(page.getByRole('heading', { name: 'Review your account security' })).toBeVisible()
  await page.getByLabel('Username or Staff ID', { exact: true }).fill('SYS-0001')
  await page.getByLabel('Password', { exact: true }).fill('SAMPLE-ONLY-123!')
  await page.getByRole('button', { name: 'Sign in securely', exact: true }).click()
  await expect(page).toHaveURL(`${origin}/totp-verification`)
  await page.getByLabel('Six-digit code', { exact: true }).fill('123456')
  await page.getByRole('button', { name: 'Verify and continue', exact: true }).click()
  await expect(page).toHaveURL(`${origin}/account?section=authenticator`)
  await expect(page.locator('#account-authenticator-title')).toBeVisible()
  assert.equal(await page.evaluate(() => sessionStorage.getItem('garantiyaid.accountReturnTo')), null)

  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto(`${origin}/admin/administration`)
  await page.getByRole('button', { name: 'Email history', exact: true }).filter({ visible: true }).click()
  const history = page.getByRole('dialog', { name: 'Email history', exact: true })
  await expect(history.getByText('Email queued', { exact: true })).toBeVisible()
  delivery.status = 'SENT'; delivery.sentAt = '2026-09-16T02:31:00Z'
  await history.getByRole('button', { name: 'Refresh status', exact: true }).click()
  await expect(history.getByText('Email sent', { exact: true })).toBeVisible()
  await expect(history).toContainText('PHT')
  delivery.status = 'FAILED'; delivery.sentAt = null; delivery.failedAt = '2026-09-16T02:32:00Z'
  await history.getByRole('button', { name: 'Refresh status', exact: true }).click()
  await expect(history.getByText('Email failed', { exact: true })).toBeVisible()
  await expect(history).toContainText('Sending stopped')
  for (const width of [1280, 375, 320]) {
    await page.setViewportSize({ width, height: 900 })
    assert.ok(await history.evaluate(el => el.scrollWidth <= el.clientWidth + 1), `History fits ${width}px`)
    await page.screenshot({ path: `${artifacts}/history-${width}.png`, fullPage: true })
  }
  await history.getByRole('button', { name: 'Close email history' }).click()
  await page.getByRole('button', { name: /Open staff notifications/ }).click()
  await expect(page.getByRole('region', { name: 'Staff notifications' }).getByText('Email failed', { exact: true })).toBeVisible()
  assert.deepEqual(errors, [])
  console.log('PASS: delivery states, guarded handoff, clipboard, TOTP return destination, admin history refresh, own notification status, and responsive layouts. No real emails sent.')
} finally {
  await browser?.close()
  await vite.close()
}
