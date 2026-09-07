import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('../src/pages/StaffBarangayAdministrationPage.jsx', import.meta.url), 'utf8')

test('barangay form presents an accessible, grouped, responsive registry flow', () => {
  assert.match(source, /aria-labelledby="barangay-form-title"/)
  assert.match(source, /aria-describedby="barangay-form-description"/)
  assert.match(source, /<fieldset className=/)
  assert.match(source, /Barangay identity/)
  assert.match(source, /Local-government jurisdiction/)
  assert.match(source, /autoFocus/)
  assert.match(source, /max-h-\[calc\(100dvh-1rem\)\]/)
  assert.match(source, /if \(isSaving\) event\.preventDefault\(\)/)
})
