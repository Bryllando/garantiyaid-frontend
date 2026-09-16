import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import { readFileSync } from 'node:fs'

test('task summary renders labelled fields, editable values, progress, and an honest completion state', async () => {
  const vite = await createServer({ server: { middlewareMode: true, ws: false }, optimizeDeps: { noDiscovery: true, include: [] }, appType: 'custom' })
  try {
    const { default: Summary } = await vite.ssrLoadModule('/src/components/assistant/AssistantTaskDetails.jsx')
    const render = (task, extra = {}) => renderToStaticMarkup(createElement(Summary, { task, language: 'en', ...extra }))
    const partial = render({ kind: 'distributionDraft', values: { program: 'Example <Program>', date: '2026-09-09', startTime: '09:00' } })
    assert.match(partial, /Example &lt;Program&gt;/)
    assert.match(partial, /Wednesday, September 9, 2026/)
    assert.match(partial, /<progress[^>]*max="9" value="3"/)
    assert.match(partial, /aria-label="Edit Program"/)
    assert.match(partial, /<label for="ai-task-detail"[^>]*>Barangay/)
    assert.match(partial, /aria-describedby="ai-task-detail-help"/)
    assert.match(partial, /Cancel pending task/)
    assert.match(partial, /Not submitted/)
    const editing = render({ kind: 'distributionDraft', values: { program: 'Existing choice' } }, { editing: 'program', error: 'Choose plain text.' })
    assert.match(editing, /value="Existing choice"/)
    assert.match(editing, /aria-invalid="true"/)
    assert.match(editing, /role="alert"/)
    const complete = render({ kind: 'reminder', values: { distribution: 'Example Event', serviceArea: 'Purok 2', messageTemplate: 'Bring your QR credential.', deliveryMode: 'now' } })
    assert.match(complete, /Details collected/)
    assert.match(complete, /Nothing has been created or queued/)
    assert.doesNotMatch(complete, /<form|Confirm and|type="submit"/)
  } finally { await vite.close() }
})

test('collection stays local, preserves manual workflows, and clears on staff identity changes', () => {
  const source = readFileSync(new URL('../src/components/assistant/StaffAiAssistant.jsx', import.meta.url), 'utf8')
  const shell = readFileSync(new URL('../src/components/layout/DashboardShell.jsx', import.meta.url), 'utf8')
  assert.match(source, /history: messages\.filter\(\(message\) => !message\.local\)\.slice\(-6\)/)
  assert.match(source, /if \(isTaskCancellation\(content\)\) return cancelTask\(\)/)
  assert.match(source, /if \(!guidanceDuringTask\) return keepTaskDetails/)
  assert.match(source, /Use an existing form/)
  assert.match(shell, /<StaffAiAssistant key=\{`\$\{user\?\.userId\}:\$\{user\?\.role\}:\$\{user\?\.barangayId\}`\}/)
  const collection = source.slice(source.indexOf('function keepTaskDetails'), source.indexOf('async function sendChat'))
  assert.doesNotMatch(collection, /localStorage|sessionStorage|previewAssistantDistribution|enqueueAssistantDistribution|createDistribution/)
})
