import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import AssistantMessage from '../src/components/assistant/AssistantMessage.js'

const render = (content) => renderToStaticMarkup(createElement(AssistantMessage, { content }))

test('assistant replies render numbered steps and bold labels as semantic elements', () => {
  const html = render('### How I can help\n\n1. **Schedules** — Review upcoming events.\n2. **Delivery records** — Review delivery status.\n\nChoose an area to continue.')
  assert.match(html, /<h3>How I can help<\/h3>/)
  assert.match(html, /<ol>/)
  assert.equal((html.match(/<li>/g) ?? []).length, 2)
  assert.match(html, /<strong>Schedules<\/strong>/)
  assert.doesNotMatch(html, /\*\*|###/)
  assert.match(html, /<p>Choose an area to continue.<\/p>/)
})

test('assistant supports nested lists, comparison tables, and simple process flows', () => {
  const html = render('- Review records\n  - Check the schedule\n\n| Area | Purpose |\n| --- | --- |\n| Schedules | Review events |\n\n> Review → Confirm → Submit')
  assert.equal((html.match(/<ul>/g) ?? []).length, 2)
  assert.match(html, /role="region" aria-label="Answer table" tabindex="0"/)
  assert.match(html, /<table><thead><tr><th>Area<\/th>/)
  assert.match(html, /<blockquote>/)
  assert.match(html, /Review → Confirm → Submit/)
})

test('generated HTML, remote images, unsafe links and interactive elements are not rendered', () => {
  const html = render('<script>alert(1)</script>\n\n<img src="https://example.com/tracker">\n\n![tracking](https://example.com/pixel)\n\n[unsafe](javascript:alert)\n\n<iframe src="https://example.com"></iframe>\n\n**Readable**')
  assert.doesNotMatch(html, /<script|<img|<iframe|javascript:|<a[ >]/)
  assert.match(html, /<strong>Readable<\/strong>/)
})

test('streaming fragments render safely and converge to the same structured final message', () => {
  const text = '### Steps\n\n1. **Review** the schedule.\n2. **Confirm** the details.\n\n| Step | Action |\n| --- | --- |\n| 1 | Review |'
  for (let index = 1; index < text.length; index += 3) assert.doesNotThrow(() => render(text.slice(0, index)))
  assert.match(render(text), /<ol>/)
  assert.match(render(text), /<table>/)
})
