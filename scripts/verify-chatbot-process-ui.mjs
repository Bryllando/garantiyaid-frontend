import assert from 'node:assert/strict'
import { readFile, mkdir } from 'node:fs/promises'
import { chromium, expect } from '@playwright/test'
import { createServer } from 'vite'
import { historyApiFixture } from './fixtures/assistant-history.js'
import { processExplanation } from '../../garantiyaid-backend/src/modules/chatbot/chatbot.process-explanations.js'
import { classifyChatbotIntent } from '../../garantiyaid-backend/src/modules/chatbot/chatbot.intent.js'
import { processDiagramForAnswer } from '../src/components/assistant/process-templates.js'

// Workspace contract check and browser harness. Every network endpoint is mocked; no notification worker is used.
const { examples } = JSON.parse(await readFile(new URL('../docs/staff-assistant-conversation-examples.json', import.meta.url)))
for (const row of examples) {
  const publicChat = row.audience === 'BENEFICIARY_PUBLIC'
  if (publicChat) assert.equal(classifyChatbotIntent(row.message).intent, row.expectedIntent)
  const answer = processExplanation({ intent: row.expectedIntent, language: row.language, messageText: row.message, history: row.history, publicChat })
  assert.equal(answer?.templateId ?? null, row.visualizationTemplate, `Example ${row.id}`)
  if (answer) assert.equal(processDiagramForAnswer(answer.messageText)?.templateId, answer.templateId, 'Backend reply and frontend template agree')
}

const vite = await createServer({ cacheDir: 'node_modules/.vite-verify/chatbot-processes', logLevel: 'error', define: { 'import.meta.env.VITE_API_URL': JSON.stringify('/api/v1') }, server: { host: '127.0.0.1', port: 0, hmr: false } })
let browser, notificationCalls = 0, publicSequence = 0, publicLanguage = 'en'
const errors = [], history = historyApiFixture()
try {
  await vite.listen()
  browser = await chromium.launch({ channel: 'chrome', headless: true })
  const base = `http://127.0.0.1:${vite.httpServer.address().port}`
  async function mockRoutes(context) {
    await context.route(/socket\.io/, route => route.abort())
    await context.routeWebSocket(/socket\.io/, () => {})
    await context.route('**/api/v1/**', async route => {
      const path = new URL(route.request().url()).pathname.replace('/api/v1', '')
      const respond = data => route.fulfill({ json: { success: true, data } })
      if (path.includes('/staff-assistant/conversations')) return history.route(route)
      if (path === '/health') return respond({ timestamp: new Date().toISOString() })
      if (path === '/staff-notifications') return respond({ notifications: [], unreadCount: 0, pagination: { totalPages: 1 } })
      if (path === '/chatbot/staff-assistant/messages') {
        const request = route.request().postDataJSON()
        const explanation = processExplanation(request)
        return respond({ messageText: explanation?.messageText || (request.intent === 'GREETING' ? 'Hello!' : 'Please identify the process or exact event.'), externalAiUsed: false })
      }
      if (path === '/chatbot/sessions') {
        publicLanguage = route.request().postDataJSON().language
        return respond({ session: { sessionId: 'public-fixture' }, sessionToken: 'public-fixture-token' })
      }
      if (path === '/chatbot/sessions/public-fixture/messages') {
        assert.equal(route.request().headers()['x-chatbot-session-token'], 'public-fixture-token')
        const { messageText } = route.request().postDataJSON()
        const { intent } = classifyChatbotIntent(messageText)
        const explanation = processExplanation({ intent, messageText, language: publicLanguage, publicChat: true })
        const id = ++publicSequence
        return respond({ session: { sessionId: 'public-fixture' }, userMessage: { messageId: `user-${id}`, senderType: 'USER', messageText }, botMessage: { messageId: `bot-${id}`, senderType: 'BOT', messageText: explanation?.messageText || 'Personal records are unavailable in public chat.' }, externalAiUsed: false, personalDataAccessed: false })
      }
      if (path.includes('/notifications/')) notificationCalls++
      errors.push(`Unexpected request: ${path}`)
      return route.fulfill({ status: 404, json: { error: { message: 'Unexpected fixture request' } } })
    })
  }
  const staff = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' })
  await staff.addInitScript(() => {
    sessionStorage.setItem('garantiyaid.accessToken', 'process-fixture')
    sessionStorage.setItem('garantiyaid.user', JSON.stringify({ userId: 'process-fixture', fullName: 'Demo Administrator', role: 'SYSTEM_ADMIN' }))
  })
  await mockRoutes(staff)
  const page = await staff.newPage()
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(`${base}/assistant`)
  const panel = page.locator('#garantiyaid-ai-panel')
  await panel.getByLabel('Assistant language', { exact: true }).selectOption('en')
  async function chat(text) {
    await panel.getByLabel('Message Staff Assistant', { exact: true }).fill(text)
    await panel.getByRole('button', { name: 'Send message', exact: true }).click()
    await expect(panel.getByRole('button', { name: 'Stop generating answer', exact: true })).toHaveCount(0)
  }
  await chat(examples.find(row => row.id === 49).message)
  await expect(panel.getByRole('figure')).toHaveCount(1)
  await chat('Show that flow.')
  await expect(panel.getByRole('figure')).toHaveCount(2)
  for (const id of [52, 55, 58, 61, 64]) await chat(examples.find(row => row.id === id).message)
  await expect(panel.getByRole('figure')).toHaveCount(7)
  await expect(panel.getByRole('figure').last()).toContainText('do not show your record')
  await chat('Hello')
  await chat('Which event?')
  await expect(panel.getByRole('figure')).toHaveCount(7)
  await panel.getByLabel('Assistant language', { exact: true }).selectOption('fil')
  await chat(examples.find(row => row.id === 56).message)
  await expect(panel.getByRole('figure').last()).toContainText('Pangkalahatang proseso:')
  await panel.getByLabel('Assistant language', { exact: true }).selectOption('ceb')
  await chat(examples.find(row => row.id === 54).message)
  await expect(panel.getByRole('figure').last()).toContainText('Kinatibuk-ang proseso:')
  await expect.poll(() => [...history.rows.values()][0]?.messages.length).toBe(22)
  await page.reload()
  await expect(panel.getByRole('figure')).toHaveCount(9)
  await mkdir('../output/chatbot-processes', { recursive: true })
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 })
    await expect.poll(() => panel.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true)
    const diagram = panel.getByRole('figure').last()
    await expect.poll(() => diagram.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true)
    const style = await diagram.locator('.ga-process-node').first().evaluate(el => {
      const css = getComputedStyle(el)
      return { border: css.borderColor, radius: css.borderRadius, shadow: css.boxShadow, color: css.color }
    })
    assert.deepEqual(style, { border: 'rgb(0, 0, 0)', radius: '0px', shadow: 'none', color: 'rgb(0, 0, 0)' })
    await diagram.screenshot({ path: `../output/chatbot-processes/staff-${width}.png`, animations: 'disabled' })
  }

  const publicContext = await browser.newContext({ viewport: { width: 320, height: 900 }, reducedMotion: 'reduce' })
  await mockRoutes(publicContext)
  const publicPage = await publicContext.newPage()
  publicPage.on('pageerror', error => errors.push(error.message))
  await publicPage.goto(base)
  await publicPage.getByRole('button', { name: 'Open general guidance', exact: true }).click()
  const help = publicPage.locator('#beneficiary-help-panel')
  for (const [id, language] of [[73, 'en'], [74, 'fil'], [75, 'ceb']]) {
    if (id !== 73) await help.getByRole('button', { name: 'New chat', exact: true }).click()
    await help.getByLabel('Language', { exact: true }).selectOption(language)
    await help.getByLabel('Ask GarantiyAid Help', { exact: true }).fill(examples.find(row => row.id === id).message)
    await help.getByRole('button', { name: 'Send question', exact: true }).click()
    await expect(help.getByRole('figure')).toHaveCount(1)
    assert.ok(await help.getByRole('figure').evaluate(el => el.scrollWidth <= el.clientWidth + 1))
  }
  await help.getByRole('figure').screenshot({ path: '../output/chatbot-processes/public-320.png', animations: 'disabled' })
  assert.equal(notificationCalls, 0)
  assert.deepEqual(errors, [])
  console.log('PASS: all 78 examples and template contracts, staff/public diagrams, three languages, general-only labels, no diagrams for simple/unclear questions, saved-history restoration, and 320/390/1440px layout. No real SMS sent.')
} finally {
  await browser?.close()
  await vite.close()
}
