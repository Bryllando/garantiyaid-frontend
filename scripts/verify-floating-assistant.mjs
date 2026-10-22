import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium, expect } from '@playwright/test'
import { createServer } from 'vite'
import { historyApiFixture } from './fixtures/assistant-history.js'

// Local fixtures exercise the real shell and a held-open answer stream without staff data.
const output = resolve('../output/floating-assistant')
await mkdir(output, { recursive: true })
let answerStream, requests = 0, beneficiaryLoads = 0, feedbackRequests = 0
const vite = await createServer({
  cacheDir: resolve(output, '.vite'),
  define: { 'import.meta.env.VITE_API_URL': JSON.stringify('/api/v1') },
  server: { host: '127.0.0.1', port: 0, strictPort: false },
  plugins: [{
    name: 'assistant-stream-fixture',
    configureServer(server) {
      server.middlewares.use('/api/v1/chatbot/staff-assistant/messages', (request, response) => {
        requests++
        request.resume()
        response.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' })
        response.write(`data: ${JSON.stringify({ type: 'text', text: 'Here is the beginning of your answer.' })}\n\n`)
        answerStream = response
      })
    },
  }],
})
let browser, page
const errors = []
const historyFixture = historyApiFixture()
try {
  await vite.listen()
  const origin = `http://127.0.0.1:${vite.httpServer.address().port}`
  browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome' })
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  await context.addInitScript(() => {
    window.fixtureRuntimeErrors = []
    window.addEventListener('error', (event) => window.fixtureRuntimeErrors.push(event.message))
    sessionStorage.setItem('garantiyaid.accessToken', 'local-assistant-fixture')
    sessionStorage.setItem('garantiyaid.user', JSON.stringify({ userId: 'assistant-fixture', role: 'SYSTEM_ADMIN', fullName: 'Alexandra Santos', employeeId: 'STAFF-024' }))
  })
  page = await context.newPage()
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('**/socket.io/**', (route) => route.abort())
  await page.routeWebSocket(/socket\.io/, () => {})
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1', '')
    if (path.startsWith('/chatbot/staff-assistant/conversations')) return historyFixture.route(route)
    if (path === '/chatbot/staff-assistant/messages') return route.continue()
    if (path === '/chatbot/staff-feedback') {
      feedbackRequests++
      return route.fulfill(feedbackRequests === 1 ? { status: 503, json: { error: { message: 'Feedback could not be recorded.' } } } : { json: { data: { recorded: true } } })
    }
    const pagination = { page: 1, pageSize: 20, total: 0, totalPages: 1 }
    let data
    if (path === '/health') data = { timestamp: new Date().toISOString() }
    else if (path.includes('notifications')) data = { notifications: [], unreadCount: 0, pagination }
    else if (path === '/beneficiaries') { beneficiaryLoads++; data = { beneficiaries: [], pagination } }
    else if (path === '/barangays') data = { barangays: [] }
    else if (path === '/programs') data = { programs: [], pagination }
    else if (path === '/distributions') data = { distributions: [], pagination }
    else if (path === '/enrollments') data = { enrollments: [], pagination }
    else return route.fulfill({ status: 404, json: { error: { message: 'No local fixture for this operation.' } } })
    await route.fulfill({ json: { data } })
  })
  const panel = page.locator('#garantiyaid-ai-panel')
  const launcher = page.getByRole('button', { name: 'Open assistant conversation', exact: true })
  const input = page.getByRole('textbox', { name: 'Message Staff Assistant', exact: true })
  const screenshot = (name) => page.screenshot({ path: `${output}/${name}.png`, animations: 'disabled' })
  const traceResize = async (label) => panel.evaluate(async (element, label) => {
    const start = element.getBoundingClientRect().width
    element.querySelector(`button[aria-label="${label}"]`).click()
    const widths = []
    const textScales = []
    let animated = false
    const started = performance.now()
    do {
      await new Promise(requestAnimationFrame)
      widths.push(element.getBoundingClientRect().width)
      const title = element.querySelector('h1')
      textScales.push(title.getBoundingClientRect().height / title.offsetHeight)
      animated ||= element.getAnimations({ subtree: true }).some((animation) => animation.playState === 'running')
    } while (performance.now() - started < 550)
    return { start, end: element.getBoundingClientRect().width, widths, textScales, animated, settled: element.getAnimations({ subtree: true }).length === 0 }
  }, label)
  const checkBounds = async () => {
    const box = await panel.boundingBox(), viewport = page.viewportSize()
    assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.width <= viewport.width + 1 && box.y + box.height <= viewport.height + 1, 'Panel fits the viewport')
    assert.equal(await panel.evaluate((element) => element.scrollWidth <= element.clientWidth + 1), true, 'No horizontal overflow')
    const composer = await input.boundingBox()
    if (composer) assert.ok(composer.y >= box.y && composer.y + composer.height <= box.y + box.height, 'Composer stays inside the window')
  }
  await page.goto(`${origin}/beneficiaries`)
  await expect(page.locator('.ga-staff-header img[src="/GarantiyAid-AI-logo.svg"]')).toHaveCount(0)
  await expect(launcher).toBeVisible()
  const beneficiarySearch = page.getByPlaceholder('Name, email, or PhilSys number')
  await beneficiarySearch.fill('Unapplied search draft')
  // Give the empty fixture the same scrolling canvas as a populated records page.
  await page.locator('#dashboard-content').evaluate((element) => { element.style.minHeight = '1600px' })
  await page.evaluate(() => window.scrollTo({ top: 180, behavior: 'instant' }))
  const backgroundScroll = await page.evaluate(() => window.scrollY)
  const backgroundWidth = await page.locator('.ga-staff-header').evaluate((element) => element.getBoundingClientRect().width)
  assert.ok(backgroundScroll > 0, 'Exercise restoration from a scrolled background')
  const backgroundLoads = beneficiaryLoads
  await screenshot('desktop-minimized')
  await launcher.click()
  await expect(panel).toHaveAttribute('role', 'dialog')
  await expect(panel).toBeFocused()
  await page.getByLabel('Assistant language', { exact: true }).selectOption('en')
  await input.fill('My unsent question')
  await checkBounds()
  await screenshot('desktop-compact')
  const expansion = await traceResize('Expand conversation')
  assert.ok(expansion.animated && expansion.settled, 'Expansion animates and settles')
  assert.ok(expansion.textScales.every((scale) => Math.abs(scale - 1) < .02), 'Expanding must not squash text')
  assert.ok(expansion.widths.some((width) => width > expansion.start + 1 && width < expansion.end - 1), 'Expansion passes through intermediate window sizes')
  await expect(page).toHaveURL(/\/beneficiaries$/)
  await expect(panel).toHaveAttribute('role', 'main')
  await expect(page.getByRole('main')).toHaveCount(1)
  await expect(input).toHaveValue('My unsent question')

  assert.equal(await page.locator('.ga-staff-header').evaluate((element) => element.getBoundingClientRect().width), backgroundWidth, 'Scroll locking must not shift the background horizontally')
  await expect(page.getByRole('link', { name: 'Beneficiary records', exact: true })).toHaveAttribute('aria-current', 'page')
  await screenshot('desktop-expanded-welcome')
  for (const label of ['Collapse navigation', 'Expand navigation']) {
    await page.getByRole('button', { name: label, exact: true }).click()
    await expect.poll(() => panel.evaluate((element) => Math.abs(element.getBoundingClientRect().left - document.querySelector('#staff-navigation').getBoundingClientRect().right))).toBeLessThan(1)
    await checkBounds()
  }
  const contraction = await traceResize('Use compact window')
  assert.ok(contraction.textScales.every((scale) => Math.abs(scale - 1) < .02), `Restoring the compact window must not stretch text (observed scale ${Math.max(...contraction.textScales).toFixed(2)})`)
  assert.ok(contraction.animated && contraction.settled, 'Compact transition animates and settles')
  assert.ok(contraction.widths.some((width) => width < contraction.start - 1 && width > contraction.end + 1), 'Compact transition passes through intermediate window sizes')
  await expect(page).toHaveURL(/\/beneficiaries$/)
  await expect(input).toHaveValue('My unsent question')
  await expect(beneficiarySearch).toHaveValue('Unapplied search draft')
  assert.equal(beneficiaryLoads, backgroundLoads, 'Resizing must not reload the background page')
  assert.equal(await page.evaluate(() => window.scrollY), backgroundScroll, 'Restoring compact preserves background scroll')
  // Repeated clicks must not restart the exit or let users act on a fading chat.
  const closeTrace = await panel.evaluate((element) => {
    const button = element.querySelector('button[aria-label="Minimize conversation"]')
    button.click()
    const exit = element.getAnimations().find((animation) => animation.effect.getKeyframes().some((frame) => frame.opacity === '0'))
    exit.pause()
    exit.currentTime = 60
    const before = Number(getComputedStyle(element).opacity)
    button.click()
    const after = Number(getComputedStyle(element).opacity)
    const inert = element.inert
    element.getAnimations().forEach((animation) => animation.finish())
    return { before, after, inert }
  })
  assert.ok(closeTrace.after <= closeTrace.before, 'Repeated minimize must not flash the panel back to full opacity')
  assert.ok(closeTrace.inert, 'Closing chat stops accepting input immediately')
  await expect(launcher).toBeFocused()
  await expect(beneficiarySearch).toHaveValue('Unapplied search draft')
  assert.equal(await page.evaluate(() => window.scrollY), backgroundScroll, 'Minimizing preserves background scroll')
  await launcher.click()
  await expect(input).toHaveValue('My unsent question')
  await page.locator('#dashboard-content').evaluate((element) => { element.style.minHeight = '' })
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }))
  await panel.evaluate(async (element) => {
    for (const label of ['Expand conversation', 'Use compact window', 'Expand conversation', 'Use compact window']) {
      element.querySelector(`button[aria-label="${label}"]`).click()
      await new Promise((resolve) => setTimeout(resolve, 70))
    }
    await Promise.all(element.getAnimations({ subtree: true }).map((animation) => animation.finished.catch(() => {})))
  })
  await expect(panel).toHaveAttribute('data-compact', 'true')
  await expect(input).toHaveValue('My unsent question')
  assert.equal(await panel.evaluate((element) => element.getAnimations({ subtree: true }).length), 0, 'Rapid mode changes leave no stale animation')
  await checkBounds()

  // Inspect the real shrinking panel, including readable, unscaled content.
  const multilineDraft = 'A longer draft that should grow naturally as the chat becomes narrower. '.repeat(3)
  await input.fill(multilineDraft)
  const compactInputHeight = (await input.boundingBox()).height
  await page.getByRole('button', { name: 'Expand conversation', exact: true }).click()
  await panel.evaluate(async (element) => { await Promise.all(element.getAnimations().map((animation) => animation.finished.catch(() => {}))) })
  await expect.poll(async () => (await input.boundingBox()).height).toBeLessThan(compactInputHeight)
  await page.getByRole('button', { name: 'Use compact window', exact: true }).click()
  await expect.poll(async () => (await input.boundingBox()).height).toBe(compactInputHeight)
  await expect(input).toHaveValue(multilineDraft)
  await input.fill('My unsent question')

  await page.getByRole('button', { name: 'Expand conversation', exact: true }).click()
  await panel.evaluate(async (element) => { await Promise.all(element.getAnimations({ subtree: true }).map((animation) => animation.finished.catch(() => {}))) })
  await panel.evaluate(async (element) => {
    element.querySelector('button[aria-label="Use compact window"]').click()
    await new Promise(requestAnimationFrame)
    for (const animation of element.getAnimations({ subtree: true })) {
      animation.pause()
      animation.currentTime = 130
    }
  })
  await page.screenshot({ path: `${output}/compact-transition-midpoint.png` })
  await panel.evaluate(async (element) => {
    const animations = element.getAnimations({ subtree: true })
    animations.forEach((animation) => animation.play())
    await Promise.all(animations.map((animation) => animation.finished.catch(() => {})))
  })
  await expect(input).toHaveValue('My unsent question')

  await input.fill('Explain how the portal works')
  await page.getByRole('button', { name: 'Send message', exact: true }).click()
  await expect(panel.getByText('Here is the beginning of your answer.', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'New chat', exact: true })).toBeDisabled()
  await input.fill('A follow-up draft')
  await page.getByRole('button', { name: 'Expand conversation', exact: true }).click()
  await expect(panel.getByText('Here is the beginning of your answer.', { exact: true })).toBeVisible()
  await screenshot('desktop-expanded')
  await page.getByRole('button', { name: 'Minimize conversation', exact: true }).click()
  await expect(launcher).toBeFocused()
  answerStream.end(`data: ${JSON.stringify({ type: 'done', data: { messageText: 'Your answer continued while the window was minimized.', externalAiUsed: false } })}\n\n`)
  await launcher.click()
  await expect(panel.getByRole('article', { name: 'Assistant reply', exact: true })).toContainText('Your answer continued while the window was minimized.')
  await expect(input).toHaveValue('A follow-up draft')
  assert.equal(requests, 1, 'Changing display modes must not restart the request')

  await page.getByRole('button', { name: 'New chat', exact: true }).click()
  await expect(input).toHaveValue('')
  await page.getByRole('button', { name: 'History', exact: true }).click()
  await expect(page.getByRole('searchbox', { name: 'Search conversations', exact: true })).toBeFocused()
  await page.getByRole('searchbox').fill('portal')
  await screenshot('desktop-history')
  await page.getByRole('button', { name: 'Explain how the portal works', exact: true }).click()
  await expect(input).toHaveValue('A follow-up draft')
  await page.getByRole('link', { name: 'Staff Assistant', exact: true }).click()
  await page.goBack()
  await expect(panel).toHaveAttribute('data-compact', 'true')
  await expect(input).toHaveValue('A follow-up draft')
  await page.getByRole('button', { name: 'Expand conversation', exact: true }).click()
  await page.getByRole('link', { name: 'Assistance programs', exact: true }).click()
  await expect(panel).toHaveAttribute('data-compact', 'true')
  await page.goBack()
  await expect(panel).toHaveAttribute('data-compact', 'true')
  await expect(input).toHaveValue('A follow-up draft')

  await panel.getByRole('button', { name: 'New chat', exact: true }).click()
  await panel.getByRole('button', { name: /^Prepare a distribution draft/ }).click()
  await expect(panel.getByRole('button', { name: 'New chat', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: 'Expand conversation', exact: true }).click()
  await expect(panel.getByRole('button', { name: 'Cancel pending task', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Use compact window', exact: true }).click()
  await panel.getByRole('button', { name: 'Cancel pending task', exact: true }).click()

  for (const [width, height] of [[768, 900], [390, 844], [320, 640], [844, 390]]) {
    await page.setViewportSize({ width, height })
    await checkBounds()
    if (width < 640) {
      await expect(panel).toHaveAttribute('aria-modal', 'true')
      assert.equal(await page.locator('#dashboard-content').evaluate((element) => element.inert), true)
      await panel.focus()
      await page.keyboard.press('Shift+Tab')
      assert.equal(await panel.evaluate((element) => element.contains(document.activeElement)), true, 'Mobile keyboard focus stays in the panel')
    }
    await screenshot(`compact-${width}x${height}`)
    await page.getByRole('button', { name: 'History', exact: true }).click()
    await expect(page.getByRole('searchbox')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('button', { name: 'History', exact: true })).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(launcher).toBeFocused()
    assert.equal(await page.locator('#dashboard-content').evaluate((element) => element.inert), false)
    assert.notEqual(await page.evaluate(() => document.body.style.overflow), 'hidden')
    await launcher.click()
  }

  // Viewport and accessibility changes during closing must settle instead of stranding the window.
  await panel.evaluate((element) => {
    element.querySelector('button[aria-label="Minimize conversation"]').click()
    element.getAnimations().forEach((animation) => animation.pause())
  })
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(launcher).toBeFocused()
  await expect(panel).toBeHidden()
  await launcher.click()
  const mobileExit = await panel.evaluate((element) => {
    element.querySelector('button[aria-label="Minimize conversation"]').click()
    const backdrop = document.querySelector('.ga-assistant-backdrop')
    for (const target of [element, backdrop]) {
      target.getAnimations({ subtree: true }).forEach((animation) => { animation.pause(); animation.currentTime = 80 })
    }
    return { panel: Number(getComputedStyle(element).opacity), backdrop: Number(getComputedStyle(backdrop).opacity), content: [...element.children].map((child) => Number(getComputedStyle(child).opacity)) }
  })
  assert.ok(mobileExit.panel > 0 && mobileExit.panel < 1, 'Mobile close has an intermediate frame')
  assert.equal(mobileExit.backdrop, mobileExit.panel, 'Mobile backdrop and chat fade together')
  assert.ok(mobileExit.content.every((opacity) => opacity === 0), 'Chat text disappears before the background page shows through')
  await page.screenshot({ path: `${output}/mobile-minimize-midpoint.png` })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect(launcher).toBeFocused()
  await expect(panel).toBeHidden()
  assert.notEqual(await page.evaluate(() => document.body.style.overflow), 'hidden')
  await launcher.click()
  await expect(panel).toBeFocused()

  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.getByRole('button', { name: 'Expand conversation', exact: true }).click()
  await expect(panel).toHaveAttribute('role', 'main')
  await checkBounds()
  assert.equal(await panel.evaluate((element) => element.getAnimations({ subtree: true }).some((animation) => animation.effect.getTiming().duration > 1)), false, 'Reduced motion skips resizing; global 0.01ms color transitions are allowed')
  assert.equal(await page.evaluate(() => document.body.style.overflow), 'hidden', 'Expanded window prevents scrolling the background')
  await page.getByRole('button', { name: 'Use compact window', exact: true }).click()
  await expect(panel).toHaveAttribute('aria-modal', 'true')
  await screenshot('mobile-reduced-motion')
  await panel.getByRole('button', { name: 'New chat', exact: true }).click()
  await screenshot('mobile-welcome')

  // Reading an earlier paragraph must survive streaming, history, and hiding the window.
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.getByLabel('Assistant language', { exact: true }).selectOption('en')
  await input.fill('Explain the help options in detail')
  await page.getByRole('button', { name: 'Send message', exact: true }).click()
  await expect(panel.getByText('Here is the beginning of your answer.', { exact: true })).toBeVisible()
  const longReply = Array.from({ length: 12 }, (_, index) => `\n\n### Step ${index + 1}\nReview the available options, check the details, and continue when you are ready.`).join('')
  answerStream.write(`data: ${JSON.stringify({ type: 'text', text: longReply })}\n\n`)
  const content = panel.locator('[data-assistant-content]')
  await expect(panel.getByRole('heading', { name: 'Step 12', exact: true })).toBeAttached()
  await content.evaluate((element) => { element.scrollTop = 80 })
  await expect.poll(() => content.evaluate((element) => element.scrollTop)).toBe(80)
  answerStream.write(`data: ${JSON.stringify({ type: 'text', text: `${longReply}\n\nA new detail arrived while you were reading.` })}\n\n`)
  await expect(panel.getByText('A new detail arrived while you were reading.', { exact: true })).toBeAttached()
  assert.ok(Math.abs(await content.evaluate((element) => element.scrollTop) - 80) < 2, 'Incoming text must not pull the reader away from earlier paragraphs')
  await page.getByRole('button', { name: 'Minimize conversation', exact: true }).click()
  await expect(launcher).toBeVisible()
  await launcher.click()
  assert.ok(Math.abs(await content.evaluate((element) => element.scrollTop) - 80) < 2, 'Reopening preserves the reading position')
  await page.getByRole('button', { name: 'History', exact: true }).click()
  answerStream.write(`data: ${JSON.stringify({ type: 'text', text: `${longReply}\n\nAnother detail arrived with history open.` })}\n\n`)
  await page.getByRole('button', { name: 'Close history', exact: true }).click()
  assert.ok(Math.abs(await content.evaluate((element) => element.scrollTop) - 80) < 2, 'History preserves the reading position while a reply streams')
  await screenshot('reading-earlier-reply')
  await page.getByRole('button', { name: 'Jump to latest', exact: true }).click()
  await expect.poll(() => content.evaluate((element) => element.scrollHeight - element.clientHeight - element.scrollTop)).toBeLessThan(2)
  await expect(input).toBeFocused()
  await page.getByRole('button', { name: 'Stop generating answer', exact: true }).click()
  await expect(panel.getByText('Response stopped. You can send another message.', { exact: true })).toBeVisible()
  await expect(panel.getByRole('article', { name: 'Assistant reply', exact: true })).toContainText('Step 12')
  await expect(panel.getByRole('article', { name: 'Assistant reply', exact: true })).toContainText('This reply was interrupted before completion.')
  answerStream.end()
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (value) => { window.fixtureClipboard = value } } })
  })
  await panel.getByRole('button', { name: 'Copy reply 2', exact: true }).click()
  await expect(panel.getByText('Reply copied.', { exact: true })).toBeVisible()
  assert.ok((await page.evaluate(() => window.fixtureClipboard)).includes('Step 12'), 'Copy uses the selected reply')
  await panel.getByRole('button', { name: 'Helpful', exact: true }).click()
  await expect(panel.getByText('Feedback could not be recorded.', { exact: true })).toBeVisible()
  await expect(panel.getByRole('button', { name: 'Helpful', exact: true })).toBeEnabled()
  await panel.getByRole('button', { name: 'Helpful', exact: true }).click()
  await expect(panel.getByText('Thanks for your feedback.', { exact: true })).toBeVisible()
  await screenshot('reply-actions')
  assert.deepEqual(await page.evaluate(() => window.fixtureRuntimeErrors), [], 'No layout-observer or window errors during interaction')

  // Direct full-page entry has a safe return target even without a previous page.
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto(`${origin}/assistant`)
  await expect(panel).toHaveAttribute('role', 'main')
  await page.getByRole('button', { name: 'Use compact window', exact: true }).click()
  await expect(page).toHaveURL(/\/dashboard$/)
  await expect(panel).toBeVisible()
  await page.goto(`${origin}/assistant`)
  await page.getByRole('button', { name: 'Minimize conversation', exact: true }).click()
  await expect(page).toHaveURL(/\/dashboard$/)
  await expect(launcher).toBeFocused()
  await launcher.click()
  await expect(panel).toBeFocused()
  assert.deepEqual(errors, [], 'No browser runtime errors')
  console.log('PASS repeated minimize, synchronized backdrop, interrupted close, direct-route focus, reading position during streaming/history/reopen, jump to latest, stopped reply retention, copy/feedback retry, multiline composer resizing, background retention, window modes, navigation, mobile focus and reduced motion')
} catch (error) {
  if (errors.length) console.error('Browser errors:', errors)
  if (page && !page.isClosed()) await page.screenshot({ path: `${output}/failure.png` }).catch(() => {})
  throw error
} finally {
  answerStream?.end()
  await browser?.close()
  await vite.close()
}
