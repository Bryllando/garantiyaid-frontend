import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import { readFileSync } from 'node:fs'

test('task summary renders labelled fields, editable values, progress, and an honest completion state', async () => {
  const vite = await createServer({ cacheDir: 'node_modules/.vite-verify/assistant-task-details', server: { middlewareMode: true, ws: false }, optimizeDeps: { noDiscovery: true, include: [] }, appType: 'custom' })
  try {
    const { default: Summary } = await vite.ssrLoadModule('/src/components/assistant/AssistantTaskDetails.jsx')
    const render = (task, extra = {}) => renderToStaticMarkup(createElement(Summary, { task, language: 'en', ...extra }))
    for (const [kind, title, label] of [['distributionDraft', 'Prepare a distribution draft', 'Program'], ['reminder', 'Prepare a reminder', 'Distribution event']]) {
      const initial = render({ kind, values: {} }, { onCancel: () => {} })
      assert.ok(initial.includes(title))
      assert.match(initial, /aria-label="Task stages"/)
      assert.match(initial, /aria-current="step"/)
      assert.match(initial, new RegExp(`<label for="ai-task-detail"[^>]*>${label}`))
      assert.match(initial, /0 of (10|4) details/)
      assert.doesNotMatch(initial, /Match records and preview/)
    }
    const partial = render({ kind: 'distributionDraft', values: { program: 'Example <Program>', date: '2026-09-09', startTime: '09:00' } })
    assert.match(partial, /Example &lt;Program&gt;/)
    assert.match(partial, /Wednesday, September 9, 2026/)
    assert.match(partial, /<progress[^>]*max="10" value="3"/)
    assert.match(partial, /aria-label="Edit Program"/)
    assert.match(partial, /<label for="ai-task-detail"[^>]*>Barangay/)
    assert.match(partial, /aria-describedby="ai-task-detail-help"/)
    assert.match(partial, /Cancel pending task/)
    assert.match(partial, /Not submitted/)
    const editing = render({ kind: 'distributionDraft', values: { program: 'Existing choice' } }, { editing: 'program', error: 'Choose plain text.' })
    assert.match(editing, /value="Existing choice"/)
    assert.match(editing, /aria-invalid="true"/)
    assert.match(editing, /role="alert"/)
    const events = [
      { distributionId: 'event-one', title: 'Community distribution', distributionDate: '2099-12-10', status: 'OPEN', startTime: '10:00', endTime: '12:00', location: 'Apas hall', barangay: { barangayName: 'Apas', city: 'Cebu City' }, program: { programCode: 'FOOD', programName: 'Food assistance' } },
      { distributionId: 'event-two', title: 'Community distribution', distributionDate: '2099-12-11', status: 'DRAFT', location: 'Lahug hall', barangay: { barangayName: 'Lahug' }, program: { programCode: 'SCHOOL', programName: 'School assistance' } },
    ]
    const choose = render({ kind: 'reminder', values: {} }, { distributions: events, onRefreshEvents() {} })
    assert.match(choose, /<select[^>]*id="ai-task-detail"/)
    assert.match(choose, /value="event-one"/)
    assert.match(choose, /value="event-two"/)
    assert.match(choose, /Apas · FOOD/)
    assert.match(choose, /Lahug · SCHOOL/)
    assert.match(choose, /disabled=""[^>]*>Use selected event/)
    assert.doesNotMatch(choose, /Enter the existing event title/)
    const selected = render({ kind: 'reminder', values: { distribution: events[1].title, distributionId: events[1].distributionId } }, { editing: 'distribution', distributions: events })
    assert.match(selected, /value="event-two" selected=""/)
    assert.match(selected, /School assistance/)
    assert.match(selected, /Lahug hall/)
    assert.match(selected, /Draft event: only beneficiaries with assigned schedules/)
    const waiting = render({ kind: 'reminder', values: {} }, { busy: true, eventLoading: true, onRefreshEvents() {} })
    assert.match(waiting, /Loading saved events/)
    assert.doesNotMatch(waiting, /<fieldset disabled=/)
    const empty = render({ kind: 'reminder', values: {} }, { onRefreshEvents() {} })
    assert.match(empty, /No saved events available/)
    assert.match(empty, /Ask the administrator/)
    const complete = render({ kind: 'reminder', values: { distribution: 'Example Event', serviceArea: 'Purok 2', messageTemplate: 'Bring your QR credential.', deliveryMode: 'now' } }, { onChatToggle: () => {}, chatOpen: false })
    assert.match(complete, /Details collected/)
    assert.match(complete, /Nothing has been created or queued/)
    assert.match(complete, /Use chat instead/)
    assert.doesNotMatch(complete, /<form|Confirm and|type="submit"/)
  } finally { await vite.close() }
})

test('collection stays local, keeps task review forms, and clears on staff identity changes', () => {
  const source = readFileSync(new URL('../src/components/assistant/StaffAiAssistant.jsx', import.meta.url), 'utf8')
  const shell = readFileSync(new URL('../src/components/layout/DashboardShell.jsx', import.meta.url), 'utf8')
  assert.match(source, /history: messages\.filter\(\(message\) => !message\.local\)\.slice\(-6\)/)
  assert.match(source, /if \(isTaskCancellation\(content\)\) return cancelTask\(\)/)
  assert.match(source, /if \(!guidanceDuringTask\) return keepTaskDetails/)
  assert.match(source, /<AssistantDistributionScheduler/)
  assert.match(shell, /<StaffAiAssistant key=\{`\$\{user\?\.userId\}:\$\{user\?\.role\}:\$\{user\?\.barangayId\}`\}/)
  const collection = source.slice(source.indexOf('function keepTaskDetails'), source.indexOf('async function sendChat'))
  assert.doesNotMatch(collection, /localStorage|sessionStorage|previewAssistantDistribution|enqueueAssistantDistribution|createDistribution/)
})
