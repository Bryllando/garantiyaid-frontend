import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

test('privacy and recovery pages expose clear, safe next steps', () => {
  const source = readFileSync(new URL('../src/pages/SystemPages.jsx', import.meta.url), 'utf8')

  assert.match(source, /Privacy Notice/)
  assert.match(source, /capstone prototype/i)
  assert.match(source, /does not establish final legal retention periods/i)
  assert.match(source, /code="404"/)
  assert.match(source, /Return to Public Home/)
  assert.match(source, /Sign in again to continue/)
  assert.match(source, /Return to Staff Login/)
  assert.match(source, /Reload application/)
})
