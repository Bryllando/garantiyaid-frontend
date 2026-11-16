import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { chromium, expect } from '@playwright/test'
import { createServer } from 'vite'
import { createBarangaySchema, updateBarangaySchema } from '../../garantiyaid-backend/src/modules/barangays/barangay.schemas.js'

// Only synthetic, intercepted APIs; never create real service areas or send notifications.
const output = fileURLToPath(new URL('../../output/barangay-form/', import.meta.url))
const apiHost = 'barangay-form.example.test'
const user = { userId: 'synthetic-admin', role: 'SYSTEM_ADMIN', fullName: 'Synthetic Administrator', employeeId: 'ADMIN-EXAMPLE', isActive: true, totpEnabled: true }
const barangays = [{ barangayId: 'existing-area', barangayCode: 'B-LAHUG', barangayName: 'Lahug', city: 'Cebu City', province: 'Cebu', serviceAreas: ['Sitio Avocado'], isActive: true }]
const writes = [], errors = [], unhandled = []
let holdSave = false, releaseSave, browser
const vite = await createServer({ cacheDir: '../tmp/barangay-form-vite', logLevel: 'error', define: { 'import.meta.env.VITE_API_URL': JSON.stringify(`https://${apiHost}/api/v1`) }, server: { host: '127.0.0.1', port: 0, strictPort: false, hmr: false } })
try {
  await mkdir(output, { recursive: true })
  await vite.listen()
  const origin = `http://127.0.0.1:${vite.httpServer.address().port}`
  browser = await chromium.launch({ headless: true, channel: 'chrome' })
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' })
  await context.addInitScript(staff => {
    sessionStorage.setItem('garantiyaid.accessToken', 'synthetic-form-token')
    sessionStorage.setItem('garantiyaid.user', JSON.stringify(staff))
  }, user)
  await context.routeWebSocket('**/*', socket => socket.close())
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url())
    if (url.origin === origin) return route.continue()
    if (url.hostname !== apiHost || url.pathname.startsWith('/socket.io/')) return route.abort()
    const path = url.pathname.replace('/api/v1', '')
    let data = {}
    if (path === '/barangays' && request.method() === 'GET') data = { barangays }
    else if ((path === '/barangays' && request.method() === 'POST') || (path.startsWith('/barangays/') && request.method() === 'PATCH')) {
      const body = request.postDataJSON(), method = request.method()
      writes.push({ body, method })
      const checked = (method === 'POST' ? createBarangaySchema : updateBarangaySchema).safeParse(body)
      if (!checked.success) return route.fulfill({ status: 400, json: { error: { message: checked.error.issues[0].message } } })
      if (holdSave) await new Promise(resolve => { releaseSave = resolve })
      const existing = barangays.find(item => path.endsWith(`/${item.barangayId}`))
      const barangay = { ...body, barangayId: existing?.barangayId || 'new-area', isActive: true }
      if (existing) Object.assign(existing, barangay)
      else barangays.push(barangay)
      data = { barangay }
    } else if (path === '/users') data = { users: [], pagination: { page: 1, totalPages: 1, total: 0 } }
    else if (path === '/health') data = { timestamp: new Date().toISOString() }
    else if (path === '/staff-notifications') data = { notifications: [], unreadCount: 0 }
    else if (path === '/auth/account') data = { user }
    else unhandled.push(`${request.method()} ${path}`)
    return route.fulfill({ json: { success: true, data } })
  })
  const page = await context.newPage()
  page.setDefaultTimeout(10000)
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(`${origin}/admin/administration?section=barangays`)
  await page.getByRole('button', { name: 'Add barangay', exact: true }).click()
  const form = page.getByRole('dialog')
  await expect(form.locator('#barangay-city')).toBeFocused()
  await expect(form.locator('#barangay-cities option')).toHaveAttribute('value', 'Cebu City')
  await form.getByRole('button', { name: 'Register barangay', exact: true }).click()
  assert.equal(writes.length, 0, 'Missing required fields must not be submitted.')
  for (const [id, value] of [['city', 'Cebu City'], ['province', 'Cebu'], ['name', 'Apas'], ['code', 'B-APAS'], ['service-areas', '\n Sitio Grotto \n Purok 1 \n']]) await form.locator(`#barangay-${id}`).fill(value)
  const viewports = [[1440, 900], [768, 900], [640, 900], [390, 844], [320, 700], [844, 390]]
  for (const [width, height] of viewports) {
    await page.setViewportSize({ width, height })
    const header = await form.locator('header').boundingBox(), footer = await form.locator('footer').boundingBox()
    assert.ok(header.y >= 0 && footer.y + footer.height <= height, `Header and actions fit ${width}x${height}.`)
    assert.ok(await form.evaluate(element => element.scrollWidth <= element.clientWidth + 1), `No modal overflow at ${width}px.`)
    for (const id of ['city', 'province', 'name', 'code', 'service-areas']) {
      await form.locator(`#barangay-${id}`).focus()
      const bounds = await form.locator(`#barangay-${id}`).boundingBox()
      assert.ok(bounds.y >= header.y + header.height - 1 && bounds.y + bounds.height <= footer.y + 1, `Focused ${id} remains uncovered at ${width}x${height}.`)
    }
    await form.locator('form > div').evaluate(element => { element.scrollTop = 0 })
    await page.screenshot({ path: `${output}/form-${width}x${height}.png` })
    await form.locator('form > div').evaluate(element => { element.scrollTop = element.scrollHeight })
    await page.screenshot({ path: `${output}/areas-${width}x${height}.png` })
  }
  await page.setViewportSize({ width: 1440, height: 1000 })
  await form.locator('#barangay-service-areas').fill('Sitio Grotto\nsitio grotto')
  await form.getByRole('button', { name: 'Register barangay', exact: true }).click()
  await expect(form.getByRole('alert')).toContainText('only once')
  await expect(form.getByRole('alert')).toBeFocused()
  await expect(form.locator('#barangay-name')).toHaveValue('Apas')
  await page.screenshot({ path: `${output}/error.png` })
  await form.locator('#barangay-service-areas').fill('\n Sitio Grotto \n Purok 1 \n')
  await expect(form.getByRole('alert')).toHaveCount(0)
  holdSave = true
  await form.getByRole('button', { name: 'Register barangay', exact: true }).click()
  await expect.poll(() => typeof releaseSave).toBe('function')
  await expect(form.locator('form')).toHaveAttribute('aria-busy', 'true')
  await expect(form.locator('#barangay-city')).toBeDisabled()
  await expect(form.getByRole('button', { name: 'Cancel', exact: true })).toBeDisabled()
  await expect(form.getByRole('button', { name: 'Close barangay form' })).toBeDisabled()
  await page.keyboard.press('Escape')
  await expect(form).toBeVisible()
  await form.locator('form').evaluate(element => element.requestSubmit())
  assert.equal(writes.length, 2, 'Busy form does not issue another save.')
  releaseSave(); holdSave = false
  await expect(form).toHaveCount(0)
  assert.deepEqual(writes.at(-1).body.serviceAreas, ['Sitio Grotto', 'Purok 1'])
  assert.equal(barangays.length, 2)

  const edit = () => page.locator('tr:visible').filter({ hasText: 'Apas' }).getByRole('button', { name: 'Edit', exact: true }).click()
  await edit()
  await expect(form.locator('#barangay-service-areas')).toHaveValue('Sitio Grotto\nPurok 1')
  await expect(form.locator('#barangay-city')).toHaveValue('Cebu City')
  await form.locator('#barangay-service-areas').fill('')
  await form.getByRole('button', { name: 'Save changes', exact: true }).click()
  await expect(form).toHaveCount(0)
  assert.equal(writes.at(-1).method, 'PATCH')
  assert.deepEqual(writes.at(-1).body.serviceAreas, [], 'A barangay can have no confirmed areas.')
  await page.getByRole('button', { name: 'Add barangay', exact: true }).click()
  await page.keyboard.press('Escape')
  await expect(form).toHaveCount(0)
  assert.equal(writes.length, 3, 'Cancel never creates a record.')
  assert.deepEqual(unhandled, [])
  assert.deepEqual(errors, [])
  const result = { passed: ['required fields', 'create payload', 'city suggestions', 'duplicate-area error and focus', 'failed-save retention', 'saving guards', 'edit payload', 'optional empty areas', 'cancel', 'responsive header, actions and keyboard focus'], viewports, writes: writes.length, errors }
  await writeFile(`${output}/verification.json`, JSON.stringify(result, null, 2))
  console.log(JSON.stringify(result))
} finally {
  await browser?.close()
  await vite.close()
}
