import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { once } from 'node:events'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createServer } from 'vite'
import { chromium, expect } from '@playwright/test'

// Explicit local integration check: only developer login/logout writes are allowed.
// No SMS, email, claims, imports or face captures are submitted.
const backendRequire = createRequire(resolve('../garantiyaid-backend/package.json'))
backendRequire('dotenv').config({ path: resolve('../garantiyaid-backend/.env'), quiet: true })
const { env } = await import('../../garantiyaid-backend/src/config/env.js')
const { devAdminConfigurationError } = await import('../../garantiyaid-backend/src/modules/auth/devAdmin.policy.js')
assert.ok(env.devQuickLoginEnabled && !devAdminConfigurationError(env), 'Configure and provision the explicit local Developer Admin first.')
const { default: app } = await import('../../garantiyaid-backend/src/app.js')
const { default: prisma } = await import('../../garantiyaid-backend/src/lib/prisma.js')
const { verifyAccessToken } = await import('../../garantiyaid-backend/src/modules/auth/auth.service.js')
const output = resolve('../output/dev-admin')
const api = app.listen(0, '127.0.0.1')
await once(api, 'listening')
const vite = await createServer({ logLevel: 'error', cacheDir: 'node_modules/.vite-dev-admin-qa', define: { 'import.meta.env.VITE_API_URL': JSON.stringify('/api/v1') }, server: { host: '127.0.0.1', port: 0, hmr: false, proxy: { '/api/v1': { target: `http://127.0.0.1:${api.address().port}`, changeOrigin: true } } } })
let browser, page
const sessionIds = [], errors = [], rejectedWrites = []
const wasEnabled = env.devQuickLoginEnabled
try {
  await mkdir(output, { recursive: true })
  await vite.listen()
  const base = `http://127.0.0.1:${vite.httpServer.address().port}`
  env.corsOrigins.push(base)
  browser = await chromium.launch({ channel: 'chrome', headless: true })
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' })
  await context.routeWebSocket(/socket\.io/, () => {})
  await context.route(/socket\.io/, route => route.abort())
  await context.route('**/api/v1/**', route => {
    const request = route.request(), path = new URL(request.url()).pathname
    if (request.method() === 'GET' || ['/api/v1/auth/login', '/api/v1/auth/logout'].includes(path)) return route.continue()
    rejectedWrites.push(path); return route.abort()
  })
  page = await context.newPage()
  page.on('pageerror', error => errors.push(error.message))
  const authenticationRequests = []
  page.on('request', request => { if (new URL(request.url()).pathname.startsWith('/api/v1/auth/')) authenticationRequests.push(new URL(request.url()).pathname) })
  const rememberSession = async () => {
    const token = await page.evaluate(() => sessionStorage.getItem('garantiyaid.accessToken'))
    sessionIds.push(verifyAccessToken(token).jti)
    return token
  }
  const inspectSession = token => page.evaluate(async accessToken => {
    const response = await fetch('/api/v1/auth/me', { headers: { Authorization: `Bearer ${accessToken}` } })
    const data = await response.json()
    return { status: response.status, role: data.data?.user?.role, employeeId: data.data?.user?.employeeId }
  }, token)
  await page.goto(`${base}/login`)
  await expect(page.getByRole('button', { name: 'Sign in securely', exact: true })).toBeEnabled()
  await expect(page.locator('input')).toHaveCount(2)
  await expect(page.getByRole('button', { name: 'Developer quick sign-in', exact: true })).toHaveCount(0)
  await expect(page.getByRole('region', { name: 'Local developer sign-in' })).toHaveCount(0)
  await expect(page.getByText('Local development only', { exact: true })).toHaveCount(0)
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 1000 })
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
  await page.screenshot({ path: resolve(output, 'login.png'), fullPage: true })
  await page.getByLabel('Username', { exact: true }).fill('DEV-ADMIN')
  await page.getByLabel('Password', { exact: true }).fill(env.devAdminPassword)
  await page.getByLabel('Password', { exact: true }).press('Enter')
  await expect(page).toHaveURL(`${base}/dashboard`)
  await expect(page.getByText('Admin workspace · Local dev', { exact: true })).toBeVisible()
  const credentialToken = await rememberSession()
  assert.deepEqual(await inspectSession(credentialToken), { status: 200, role: 'SYSTEM_ADMIN', employeeId: 'DEV-ADMIN' })
  await page.goto(`${base}/admin/administration?section=staff`)
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 })
    const record = width >= 1024 ? page.getByRole('row').filter({ hasText: 'DEV-ADMIN' }) : page.locator('article').filter({ hasText: 'DEV-ADMIN' })
    await expect(record.getByText('Developer mode', { exact: true })).toBeVisible()
    await expect(record.getByText('Local development only', { exact: true })).toBeVisible()
    await expect(record.getByText('All barangays in this system', { exact: true })).toBeVisible()
    await expect(record.getByText('Setup required', { exact: true })).toHaveCount(0)
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await record.screenshot({ path: resolve(output, `staff-security-${width}.png`) })
  }
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto(`${base}/admin/staff-security`)
  const developerRecovery = page.getByRole('listitem').filter({ hasText: 'DEV-ADMIN' })
  await expect(developerRecovery.getByText('Developer mode', { exact: true })).toBeVisible()
  await expect(developerRecovery.getByRole('button', { name: 'Reset authenticator' })).toBeDisabled()
  await expect(developerRecovery.getByText('This local developer account signs in with a password; TOTP is not required.', { exact: true })).toBeVisible()
  await page.goto(`${base}/dashboard`)
  await page.getByRole('button', { name: 'Sign out securely', exact: true }).last().click()
  await expect(page).toHaveURL(`${base}/login`)
  assert.equal((await inspectSession(credentialToken)).status, 401)
  await page.getByLabel('Username', { exact: true }).fill('DEV-ADMIN')
  await page.getByLabel('Password', { exact: true }).fill(env.devAdminPassword)
  await page.getByRole('button', { name: 'Sign in securely', exact: true }).click()
  await expect(page).toHaveURL(`${base}/dashboard`)
  await expect(page.getByText('Admin workspace · Local dev', { exact: true })).toBeVisible()
  const repeatToken = await rememberSession()
  assert.equal((await inspectSession(repeatToken)).status, 200)
  await page.screenshot({ path: resolve(output, 'dashboard.png'), fullPage: true })
  env.devQuickLoginEnabled = false
  assert.equal((await inspectSession(repeatToken)).status, 403)
  await page.goto(`${base}/login`)
  await expect(page.getByRole('button', { name: 'Sign in securely', exact: true })).toBeEnabled()
  await expect(page.getByRole('button', { name: 'Developer quick sign-in', exact: true })).toHaveCount(0)
  await page.getByLabel('Username', { exact: true }).fill('DEV-ADMIN')
  await page.getByLabel('Password', { exact: true }).fill(env.devAdminPassword)
  await page.getByRole('button', { name: 'Sign in securely', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Developer sign-in is disabled')
  await expect(page).toHaveURL(`${base}/login`)
  assert.ok(authenticationRequests.every(path => ['/api/v1/auth/login', '/api/v1/auth/logout', '/api/v1/auth/me'].includes(path)), 'The login form must not contact separate developer or TOTP endpoints.')
  assert.deepEqual(errors, [])
  assert.deepEqual(rejectedWrites, [])
  console.log('Passed: common login form, DEV-ADMIN password sign-in, Developer mode security labels on desktop/mobile and recovery, accurate system scope wording, logout revocation, disabled-mode rejection and 320/390/1440 layouts. No messages or workflow records created.')
} catch (error) {
  if (page) await page.screenshot({ path: resolve(output, 'failure.png'), fullPage: true })
  throw error
} finally {
  env.devQuickLoginEnabled = wasEnabled
  await browser?.close()
  if (sessionIds.length) await prisma.staffSession.updateMany({ where: { sessionId: { in: sessionIds } }, data: { revokedAt: new Date() } })
  await vite.close()
  await new Promise(resolveClose => api.close(resolveClose))
  await prisma.$disconnect()
}
