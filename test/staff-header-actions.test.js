import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = await readFile(new URL('../src/components/layout/StaffHeaderActions.jsx', import.meta.url), 'utf8')

test('staff header actions keep the clock and notification popover accessible and responsive', () => {
  assert.match(source, /timeZone: 'Asia\/Manila'/)
  assert.match(source, /aria-label=\{notificationLabel\}/)
  assert.match(source, /aria-expanded=\{open\}/)
  assert.match(source, /event\.key === 'Escape'/)
  assert.match(source, /role="status" aria-live="polite"/)
  assert.match(source, /min-h-11/)
  assert.match(source, /max-h-\[min\(28rem,calc\(100dvh-9rem\)\)\]/)
})
