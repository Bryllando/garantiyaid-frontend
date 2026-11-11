import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import { chromium, expect } from '@playwright/test'

// All sign-ins use mocked APIs and synthetic credentials; no real staff sessions are created.
const root = fileURLToPath(new URL('../', import.meta.url))
const artifacts = `${root}/artifacts/login-ui`
const user = { userId: '11111111-1111-4111-8111-111111111111', fullName: 'Fixture Reviewer', employeeId: 'DSWD-0001', role: 'DSWD_STAFF' }
const html = `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div><script type="module">
import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
import Login from '/src/pages/LoginPage.jsx';import Totp from '/src/pages/TotpVerificationPage.jsx';import Initial from '/src/pages/InitialPasswordPage.jsx';import Setup from '/src/pages/TotpSetupPage.jsx';import Reset from '/src/pages/PasswordResetPage.jsx';import '/src/index.css';
function Fixture(){const mode=new URLSearchParams(location.search).get('mode'),[step,setStep]=useState(mode||'login'),[credentials,setCredentials]=useState({identifier:'DSWD-0001',password:'Fixture-only-123!'});
const onAuthenticated=()=>{window.authOutcome='authenticated'},onTotpRequired=value=>{setCredentials(value);setStep('totp')},onTotpEnrollmentRequired=token=>{sessionStorage.setItem('garantiyaid.totpSetupToken',token);setStep('setup')},onPasswordChangeRequired=value=>{setCredentials(value);setStep('initial')},onBackToLogin=()=>setStep('login');
if(step==='totp')return React.createElement(Totp,{credentials,onBackToLogin,onVerified:onAuthenticated});
if(step==='initial')return React.createElement(Initial,{credentials,onBackToLogin,onAuthenticated,onTotpRequired,onTotpEnrollmentRequired});
if(step==='setup')return React.createElement(Setup,{onAuthenticated,onBackToLogin});
if(step==='reset')return React.createElement(Reset,{mode:'request'});
return React.createElement(Login,{onAuthenticated,onTotpRequired,onTotpEnrollmentRequired,onPasswordChangeRequired,securityReview:mode==='security'});}
createRoot(document.getElementById('root')).render(React.createElement(Fixture));
</script></body></html>`
const vite = await createServer({ root, cacheDir: `${root}/node_modules/.vite-login-ui`, logLevel: 'error', define: { 'import.meta.env.VITE_API_URL': JSON.stringify('https://login-ui.example.test/api/v1') }, server: { host: '127.0.0.1', port: 0, hmr: false }, plugins: [{ name: 'login-ui-fixture', configureServer(server) { server.middlewares.use(async (req, res, next) => { if (!req.url.startsWith('/__auth-check')) return next(); res.setHeader('Content-Type', 'text/html'); res.end(await server.transformIndexHtml(req.url, html)) }) } }] })
let browser, loginMode = 'error', healthReady = true, submissions = 0
const errors = []
try {
  await mkdir(artifacts, { recursive: true }); await vite.listen()
  const origin = `http://127.0.0.1:${vite.httpServer.address().port}`
  browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome', headless: true })
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' })
  await context.route('https://login-ui.example.test/api/v1/**', async route => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1', '')
    const respond = (data, status = 200) => route.fulfill({ status, json: status === 200 ? { success: true, data } : { success: false, error: data } })
    if (path === '/health') return healthReady ? respond({ timestamp: new Date().toISOString() }) : respond({ code: 'API_UNAVAILABLE', message: 'Fixture unavailable' }, 503)
    if (path === '/auth/login') {
      submissions++
      const body = route.request().postDataJSON()
      assert.equal(body.identifier, 'DSWD-0001'); assert.equal(body.password, 'Fixture-only-123!')
      await new Promise(resolve => setTimeout(resolve, 200))
      if (loginMode === 'error') return respond({ code: 'INVALID_CREDENTIALS', message: 'The Staff ID, username, or password is incorrect.' }, 401)
      if (loginMode === 'offline') { healthReady = false; return respond({ code: 'API_UNAVAILABLE', message: 'Service temporarily unavailable.' }, 503) }
      if (loginMode === 'password') return respond({ requiresPasswordChange: true })
      if (loginMode === 'enroll') return respond({ requiresTotpEnrollment: true, totpSetupToken: 'fixture-setup' })
      if (loginMode === 'totp' && !body.totpCode) return respond({ requiresTotp: true })
      return respond({ accessToken: 'fixture-session', user })
    }
    if (path === '/auth/totp/setup') return respond({ secret: 'JBSWY3DPEHPK3PXP', otpauthUri: 'otpauth://totp/GarantiyAid:fixture?secret=JBSWY3DPEHPK3PXP&issuer=GarantiyAid' })
    if (path === '/auth/totp/confirm') return respond({ accessToken: 'fixture-session', user, recoveryCodes: Array.from({ length: 8 }, (_, index) => `AAAA-BBBB-CCCC-${index.toString(16).padStart(4, '0')}`) })
    return respond({ code: 'UNEXPECTED_FIXTURE', message: 'Unexpected fixture route' }, 404)
  })
  const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message))
  const signIn = () => page.getByRole('button', { name: 'Sign in securely', exact: true })
  async function open(mode = '') { await page.goto(`${origin}/__auth-check${mode ? `?mode=${mode}` : ''}`); if (!mode || mode === 'security') await expect(signIn()).toBeEnabled() }
  async function fill() { await page.getByLabel('Username', { exact: true }).fill('DSWD-0001'); await page.getByLabel('Password', { exact: true }).fill('Fixture-only-123!') }
  async function fits(label) {
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${label}: no horizontal overflow`)
    // The OTP library clips an enlarged transparent input to make room for password managers.
    const outside = await page.locator('main input:not([data-input-otp]), main button, main a, [data-slot="input-otp-slot"]').evaluateAll(elements => elements.filter(element => {
      const box = element.getBoundingClientRect(); return getComputedStyle(element).opacity !== '0' && box.width && (box.x < -1 || box.right > innerWidth + 1)
    }).map(element => element.id || element.textContent))
    assert.deepEqual(outside, [], `${label}: controls remain within the viewport`)
  }
  await open()
  const form = page.getByRole('form', { name: 'Staff sign in' })
  await expect(form.locator('input')).toHaveCount(2)
  await expect(page.getByLabel('Username', { exact: true })).toHaveAttribute('placeholder', 'Enter your username')
  await expect(page.getByLabel('Username', { exact: true })).toHaveAttribute('name', 'identifier')
  await expect(page.getByLabel('Username', { exact: true })).toHaveAttribute('autocomplete', 'username')
  await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute('placeholder', 'Enter your password')
  await expect(form).not.toContainText('Staff ID')
  const styles = await form.locator('input').evaluateAll(inputs => inputs.map(input => {
    const style = getComputedStyle(input), box = input.getBoundingClientRect(), icon = input.parentElement.querySelector('svg').getBoundingClientRect()
    const paint = document.createElement('canvas').getContext('2d')
    paint.fillStyle = getComputedStyle(input, '::placeholder').color; paint.fillRect(0, 0, 1, 1)
    return { height: box.height, background: style.backgroundColor, border: style.borderWidth, radius: style.borderRadius, paddingLeft: style.paddingLeft, placeholder: Array.from(paint.getImageData(0, 0, 1, 1).data).slice(0, 3), iconSize: icon.width, iconOffset: Math.abs(icon.y + icon.height / 2 - box.y - box.height / 2) }
  }))
  assert.deepEqual(styles[0], styles[1], 'Both inputs share dimensions, padding, icon alignment and placeholder styling')
  assert.equal(styles[0].height, 48); assert.equal(styles[0].iconSize, 20); assert.ok(styles[0].iconOffset < 1)
  assert.equal(styles[0].background, 'rgb(255, 255, 255)'); assert.equal(styles[0].border, '1px')
  const channels = styles[0].placeholder.map(value => {
    const channel = Number(value) / 255; return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  })
  assert.ok(1.05 / (0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2] + 0.05) >= 4.5, 'Placeholders meet 4.5:1 contrast against white')
  for (const [width, height] of [[1920, 960], [1440, 900], [1366, 768], [1024, 768], [768, 1024], [390, 844], [320, 740]]) {
    await page.setViewportSize({ width, height }); await fits(`login ${width}`)
    const bounds = await signIn().boundingBox()
    assert.ok(bounds.y + bounds.height <= height, `login ${width}: sign-in action is visible without scrolling`)
    assert.equal(await page.locator('aside').isVisible(), width >= 1024)
    assert.ok(await page.getByLabel('Username', { exact: true }).evaluate(input => getComputedStyle(input).fontSize === '16px'))
    if ([1440, 390].includes(width)) await page.screenshot({ path: `${artifacts}/login-${width}.png`, fullPage: true })
  }
  await page.setViewportSize({ width: 1440, height: 900 })
  assert.equal(await page.locator('img[src="/staff-workspace.svg"]').evaluate(img => img.complete && img.naturalWidth > 0), true)
  const card = await page.locator('main > div').boundingBox(); assert.ok(Math.abs(card.x - (1440 - card.width) / 2) < 1)
  await signIn().click()
  assert.equal(submissions, 0, 'Missing fields never submit credentials')
  await expect(page.getByLabel('Username', { exact: true })).toBeFocused()
  await page.getByLabel('Username', { exact: true }).fill('invalid username')
  await page.getByLabel('Password', { exact: true }).fill('Fixture-only-123!')
  await signIn().click()
  assert.equal(submissions, 0, 'An invalid username never reaches the authentication API')
  assert.equal(await page.getByLabel('Username', { exact: true }).evaluate(input => input.validity.patternMismatch), true)
  await fill()
  await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute('type', 'password')
  await page.getByRole('button', { name: 'Show password' }).focus(); await page.keyboard.press('Space')
  await expect(page.getByRole('button', { name: 'Hide password' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute('type', 'text')
  await page.keyboard.press('Space')
  const initialButton = await signIn().boundingBox()
  await page.getByLabel('Password', { exact: true }).press('Enter')
  await expect(page.getByRole('alert')).toContainText('incorrect')
  assert.deepEqual(await signIn().boundingBox(), initialButton, 'Validation feedback does not move the submit action')
  await expect(page.getByLabel('Username', { exact: true })).toHaveAttribute('aria-invalid', 'true')
  await expect(page.getByLabel('Password', { exact: true })).toHaveValue('Fixture-only-123!')
  await page.screenshot({ path: `${artifacts}/login-error.png`, fullPage: true })
  await page.setViewportSize({ width: 320, height: 740 })
  await page.getByLabel('Username', { exact: true }).clear()
  await page.getByLabel('Username', { exact: true }).fill('DSWD-0001')
  await expect(page.locator('#login-error')).toBeEmpty()
  const mobileButton = await signIn().boundingBox()
  await signIn().click(); await expect(page.getByRole('alert')).toContainText('incorrect')
  assert.deepEqual(await signIn().boundingBox(), mobileButton, 'Validation feedback does not shift the mobile form')
  await fits('mobile validation error')
  await page.setViewportSize({ width: 1440, height: 900 })
  const before = submissions
  await page.getByRole('form', { name: 'Staff sign in' }).evaluate(form => { form.requestSubmit(); form.requestSubmit() })
  await expect(page.getByRole('button', { name: 'Signing in...' })).toBeDisabled()
  await expect(page.getByLabel('Password', { exact: true })).toBeDisabled()
  await expect(page.getByRole('alert')).toBeVisible()
  assert.equal(submissions - before, 1, 'Repeated submit cannot send duplicate authentication requests')
  loginMode = 'offline'
  await signIn().click()
  await expect(page.getByRole('status')).toContainText('not available')
  const offlineCount = submissions
  await page.screenshot({ path: `${artifacts}/login-unavailable.png`, fullPage: true })
  healthReady = true
  await expect(signIn()).toBeEnabled({ timeout: 10000 })
  assert.equal(submissions, offlineCount, 'Health recovery never automatically resubmits a password')
  await expect(page.getByLabel('Password', { exact: true })).toHaveValue('Fixture-only-123!')
  loginMode = 'totp'
  await signIn().click()
  await expect(page.getByRole('heading', { name: 'Enter your authenticator code' })).toBeVisible()
  for (const width of [1440, 1024, 768, 390, 320]) { await page.setViewportSize({ width, height: 900 }); await fits(`TOTP ${width}`) }
  await page.getByLabel('Six-digit code', { exact: true }).fill('123456')
  await page.getByRole('button', { name: 'Verify and continue', exact: true }).click()
  await expect.poll(() => page.evaluate(() => window.authOutcome)).toBe('authenticated')
  for (const [mode, heading] of [['password', 'Create your private password'], ['enroll', 'Protect your staff account']]) {
    loginMode = mode; await open(); await fill(); await signIn().click()
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible()
    for (const width of [1024, 390, 320]) { await page.setViewportSize({ width, height: 900 }); await fits(`${mode} ${width}`) }
  }
  await page.getByRole('button', { name: 'Show my QR code', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Scan this QR code' })).toBeVisible()
  for (const width of [1440, 1024, 390, 320]) { await page.setViewportSize({ width, height: 900 }); await fits(`setup QR ${width}`) }
  await page.getByLabel('Authentication code', { exact: true }).fill('123456')
  await page.getByRole('button', { name: 'Confirm and activate', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Save your recovery codes', exact: true })).toBeVisible()
  for (const width of [1440, 1024, 390, 320]) {
    await page.setViewportSize({ width, height: 900 }); await fits(`recovery codes ${width}`)
    assert.equal(await page.locator('[aria-label="Recovery codes"] code').evaluateAll(elements => elements.some(element => element.scrollWidth > element.clientWidth + 1)), false, `Recovery codes remain readable at ${width}`)
  }
  await page.getByRole('checkbox', { name: /I saved these recovery codes securely/ }).check()
  await page.getByRole('button', { name: 'Continue to dashboard', exact: true }).click()
  loginMode = 'success'; await open('security')
  await expect(page.getByRole('heading', { name: 'Review your account security' })).toBeVisible()
  await fill(); await signIn().click(); await expect(page.getByRole('heading', { name: 'Sign-in successful' })).toBeVisible()
  assert.equal(await page.evaluate(() => sessionStorage.getItem('garantiyaid.accessToken')), 'fixture-session')
  await open('reset'); await fits('compact password recovery 320')
  await expect(page.getByRole('heading', { name: 'Reset your password', exact: true })).toBeVisible()
  await open(); await expect(page.getByRole('link', { name: 'Forgot password?' })).toHaveAttribute('href', '/forgot-password')
  await page.keyboard.press('Tab'); await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused()
  assert.deepEqual(errors, [])
  console.log('Passed: exact two-field form, input/icon consistency, placeholder contrast, native validation, stable feedback layout, responsive layouts, keyboard/password visibility, reconnect, duplicate-submit guard, TOTP, setup/recovery and success. All APIs mocked.')
} finally { await browser?.close(); await vite.close() }
