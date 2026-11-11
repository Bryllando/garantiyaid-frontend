import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import AssistantMessage from '../src/components/assistant/AssistantMessage.js'
import AssistantProcessDiagram from '../src/components/assistant/AssistantProcessDiagram.js'
import { PROCESS_PREFIXES, PROCESS_TEMPLATES, processDiagramForAnswer } from '../src/components/assistant/process-templates.js'
import { newConversation, readConversations, saveConversations } from '../src/components/assistant/conversation-history.js'

test('each approved template renders readable ordered stages, branches and a general-process caption in all languages', () => {
  for (const [templateId, template] of Object.entries(PROCESS_TEMPLATES)) {
    for (const languageIndex of [0, 1, 2]) {
      const content = `${PROCESS_PREFIXES[languageIndex]}${template.titles[languageIndex]}\n\nApproved process explanation.`
      const data = processDiagramForAnswer(content)
      assert.equal(data.templateId, templateId)
      assert.equal(data.languageIndex, languageIndex)
      const html = renderToStaticMarkup(createElement(AssistantMessage, { content }))
      assert.match(html, /<figure[^>]+aria-label=/)
      assert.match(html, /<figcaption>/)
      assert.match(html, /<ol class="ga-process-steps">/)
      assert.match(html, /ga-process-note/)
      assert.match(html, /Approved process explanation/)
      assert.doesNotMatch(html, /<svg|<script|<img|<iframe|<button|[0-9]+%/i)
      if (['SMS_DELIVERY', 'IDENTITY_RELEASE', 'APPROVAL_SCHEDULING', 'FACE_PROFILE'].includes(templateId)) assert.match(html, /ga-process-branches/)
    }
  }
})

test('unknown definitions, HTML and personal status metadata cannot create custom diagrams', () => {
  for (const content of ['Hello!', 'Which event?', 'General process: unknown\n\nAnything.', '```mermaid\nA-->B\n```', '<svg onload="alert(1)"></svg>', '{"templateId":"SMS_DELIVERY","completed":100}']) {
    assert.equal(processDiagramForAnswer(content), null)
    const html = renderToStaticMarkup(createElement(AssistantMessage, { content }))
    assert.doesNotMatch(html, /<figure|<svg|<script|onload=/)
  }
  assert.equal(renderToStaticMarkup(createElement(AssistantProcessDiagram, { templateId: '__proto__' })), '')
  assert.equal(renderToStaticMarkup(createElement(AssistantProcessDiagram, { templateId: 'SMS_DELIVERY', languageIndex: 9 })), '')
})

test('fixed general diagrams restore from existing saved reply text without new history metadata', () => {
  let saved
  const storage = { setItem: (_key, value) => { saved = value }, getItem: () => saved }
  const row = { ...newConversation(), messages: [{ role: 'assistant', content: 'General process: SMS processing\n\nGateway acceptance does not confirm arrival.' }] }
  assert.equal(saveConversations('staff-owner', row.id, [row], storage), true)
  const restored = readConversations('staff-owner', storage).conversations[0].messages[0]
  assert.equal(processDiagramForAnswer(restored.content).templateId, 'SMS_DELIVERY')
  assert.equal(readConversations('other-account', storage), null)
})

test('diagram styling is black and white, static, and square without decorative effects', () => {
  const css = readFileSync(new URL('../src/components/assistant/process-diagram.css', import.meta.url), 'utf8')
  assert.doesNotMatch(css, /gradient|box-shadow|border-radius|animation|@keyframes|#[0-9a-f]{6}/i)
  assert.match(css, /border: 1px solid #000/)
  assert.match(css, /background: #fff/)
})
