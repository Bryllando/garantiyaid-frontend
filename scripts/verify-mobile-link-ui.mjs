import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import { chromium, expect } from '@playwright/test'

// Synthetic accounts and mocked APIs only. No live account is linked.
const root = fileURLToPath(new URL('../', import.meta.url))
const artifacts = `${root}/artifacts/mobile-link-ui`
const barangay = { barangayId: '11111111-1111-4111-8111-111111111111', barangayName: 'San Nicolas', city: 'Cebu City' }
const person = { beneficiaryId: '22222222-2222-4222-8222-222222222222', firstName: 'Maria', lastName: 'Santos', birthDate: '1990-01-12', barangayId: barangay.barangayId, barangay, address: '12 Test Street', status: 'ACTIVE' }
const account = { accountId: '33333333-3333-4333-8333-333333333333', firstName: 'Maria', lastName: 'Santos', birthDate: '1990-01-12', barangayId: barangay.barangayId, status: 'PENDING', revision: 1 }
const user = { userId: '44444444-4444-4444-8444-444444444444', fullName: 'Fixture Reviewer', employeeId: 'SYS-TEST', role: 'SYSTEM_ADMIN', barangayId: barangay.barangayId, isActive: true, totpEnabled: true }
const fixture = `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div><script type="module">
import React from 'react';import {createRoot} from 'react-dom/client';import Page from '/src/pages/BeneficiaryManagementPage.jsx';import '/src/index.css';
const root=createRoot(document.getElementById('root')),noop=()=>{},user={...${JSON.stringify(user)},role:new URLSearchParams(location.search).get('role')||'SYSTEM_ADMIN'};
root.render(React.createElement(Page,{session:{user,accessToken:'fixture'},onLogout:noop,onNavigate:noop,onSessionExpired:()=>{throw Error('Unexpected session expiry')}}));
</script></body></html>`
const vite = await createServer({ root, cacheDir: `${root}/node_modules/.vite-mobile-link`, logLevel: 'error', define: { 'import.meta.env.VITE_API_URL': JSON.stringify('https://mobile-link.example.test/api/v1') }, server: { host: '127.0.0.1', port: 0, hmr: false }, plugins: [{ name: 'mobile-link-fixture', configureServer(server) { server.middlewares.use(async (req, res, next) => { if (!req.url.startsWith('/__mobile-link')) return next(); res.setHeader('Content-Type', 'text/html'); res.end(await server.transformIndexHtml(req.url, fixture)) }) } }] })
let browser, listFailures = 1, conflict = true, configured = true, mutations = 0
let accounts = [{ ...account }]
const errors = []
const pagination = items => ({ page: 1, pageSize: 20, total: items.length, totalPages: items.length ? 1 : 0 })
try {
  await mkdir(artifacts, { recursive: true }); await vite.listen()
  const origin = `http://127.0.0.1:${vite.httpServer.address().port}`
  browser = await chromium.launch({ channel: 'chrome', headless: true })
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  await context.route('https://mobile-link.example.test/api/v1/**', async route => {
    const url = new URL(route.request().url()), path = url.pathname.replace('/api/v1', '')
    const respond = (data, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(status === 200 ? { success: true, data } : { success: false, error: { code: 'FIXTURE_ERROR', message: data } }) })
    if (path === '/mobile-account-requests') {
      if (listFailures-- > 0) return respond('Temporary fixture outage. Please retry.', 503)
      const items = accounts.filter(item => item.status === url.searchParams.get('status'))
      return respond({ accounts: items, mobileAuthenticationConfigured: configured, pagination: pagination(items) })
    }
    if (path.endsWith('/decision')) {
      const body = route.request().postDataJSON()
      if (conflict) { conflict = false; return respond('This request changed. Refresh before continuing.', 409) }
      mutations++
      assert.equal(body.revision, 1); assert.ok(body.note.length >= 5)
      if (body.decision === 'LINK') { assert.equal(body.confirmedIdentity, true); assert.equal(body.beneficiaryId, person.beneficiaryId) }
      const saved = accounts.find(item => path.includes(item.accountId))
      Object.assign(saved, { status: body.decision === 'LINK' ? 'LINKED' : 'REJECTED', revision: 2, reviewNote: body.note, ...(body.decision === 'LINK' ? { beneficiaryId: person.beneficiaryId, beneficiary: person } : {}) })
      await new Promise(resolve => setTimeout(resolve, 200))
      return respond({ account: saved })
    }
    if (path === '/beneficiaries') return respond({ beneficiaries: [person, { ...person, beneficiaryId: '55555555-5555-4555-8555-555555555555', firstName: 'Marta', mobileAccount: { status: 'LINKED' } }], pagination: pagination([person]) })
    if (path === '/barangays') return respond({ barangays: [barangay] })
    if (path === '/programs') return respond({ programs: [], pagination: pagination([]) })
    if (path.startsWith('/staff-notifications')) return respond({ notifications: [], unreadCount: 0, pagination: pagination([]) })
    return respond({})
  })
  const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message))
  await page.goto(`${origin}/__mobile-link`)
  await page.getByRole('button', { name: 'Mobile account requests', exact: true }).click()
  const outer = page.getByRole('dialog', { name: 'Mobile account requests', exact: true })
  await expect(outer.getByRole('alert')).toContainText('Temporary fixture outage')
  await outer.getByRole('button', { name: 'Try again', exact: true }).click()
  await outer.getByRole('button', { name: /Maria Santos.*Review request/ }).click()
  await expect(outer.getByRole('radio').last()).toBeDisabled()
  const review = outer.getByRole('button', { name: 'Review account link', exact: true })
  await expect(review).toBeDisabled()
  await outer.getByRole('radio').first().check()
  await page.screenshot({ path: `${artifacts}/comparison-1440.png`, fullPage: true })
  await review.click()
  let confirm = page.getByRole('dialog', { name: 'Link this mobile account?', exact: true })
  await expect(confirm.getByRole('button', { name: 'Confirm account link' })).toBeDisabled()
  await confirm.getByRole('checkbox').check()
  await confirm.getByLabel('Evidence checked and account ownership confirmed').fill('Official ID and account ownership checked in person.')
  await confirm.getByRole('button', { name: 'Confirm account link' }).click()
  await expect(confirm.getByRole('alert')).toContainText('Refresh')
  await confirm.getByRole('button', { name: 'Cancel', exact: true }).click()
  await outer.getByRole('button', { name: 'Refresh', exact: true }).click()
  await outer.getByRole('button', { name: /Maria Santos.*Review request/ }).click()
  await outer.getByRole('radio').first().check(); await review.click()
  confirm = page.getByRole('dialog', { name: 'Link this mobile account?', exact: true })
  await confirm.getByRole('checkbox').check(); await confirm.getByLabel('Evidence checked and account ownership confirmed').fill('Verified official ID and mobile account ownership.')
  await confirm.getByRole('button', { name: 'Confirm account link' }).evaluate(button => { button.click(); button.click() })
  await expect(outer.getByRole('status').filter({ hasText: 'Mobile account linked' })).toBeVisible()
  assert.equal(mutations, 1)
  await outer.getByLabel('Request status').selectOption('LINKED')
  await outer.getByRole('button', { name: /Maria Santos.*Review request/ }).click()
  await expect(outer.getByRole('button', { name: 'Open beneficiary record' })).toBeVisible()
  await expect(outer.getByRole('button', { name: 'Review account link' })).toHaveCount(0)
  accounts.push({ ...account, accountId: '66666666-6666-4666-8666-666666666666', firstName: 'Mariel' })
  await outer.getByLabel('Request status').selectOption('PENDING')
  await outer.getByRole('button', { name: /Mariel Santos.*Review request/ }).click()
  await outer.getByRole('button', { name: 'Request correction', exact: true }).click()
  const correction = page.getByRole('dialog', { name: 'Request an identity correction', exact: true })
  await correction.getByLabel('Correction needed').fill('Bring the correct birth certificate to the barangay office.')
  await correction.getByRole('button', { name: 'Send correction request' }).click()
  await expect(outer.getByRole('status').filter({ hasText: 'Request returned' })).toBeVisible()
  assert.equal(mutations, 2)
  configured = false
  await outer.getByRole('button', { name: 'Refresh', exact: true }).click()
  await expect(outer.getByText('Mobile integration is not connected yet.', { exact: false })).toBeVisible()
  await page.setViewportSize({ width: 390, height: 844 })
  await outer.getByLabel('Request status').selectOption('REJECTED')
  await outer.getByRole('button', { name: /Mariel Santos.*Review request/ }).click()
  await expect(outer.getByRole('button', { name: 'All requests' })).toBeVisible()
  await page.screenshot({ path: `${artifacts}/correction-390.png`, fullPage: true })
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 })
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
    assert.equal(await outer.evaluate(dialog => dialog.scrollWidth > dialog.clientWidth + 1), false)
  }
  await page.keyboard.press('Escape'); await expect(outer).not.toBeVisible()
  for (const role of ['BARANGAY_FACILITATOR', 'DSWD_STAFF']) {
    await page.goto(`${origin}/__mobile-link?role=${role}`)
    await expect(page.getByRole('button', { name: 'Mobile account requests', exact: true })).toHaveCount(role === 'DSWD_STAFF' ? 0 : 1)
  }
  assert.deepEqual(errors, [])
  console.log('Passed: scoped entry points, error recovery, comparison, confirmation, stale request, double-click guard, linked history, correction, disconnected state, keyboard close, and 320/390 px layouts. APIs mocked; no live account changed.')
} finally { await browser?.close(); await vite.close() }
