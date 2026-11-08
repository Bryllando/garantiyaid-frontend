import test from 'node:test'
import assert from 'node:assert/strict'
import { getAuthErrorMessage } from '../src/auth/staffAuth.js'
test('validation errors identify the field and the correction instead of hiding details', () => {
  const message = getAuthErrorMessage({ code: 'VALIDATION_ERROR', message: 'Request validation failed.', details: { fields: [{ field: 'programType', message: 'Use underscores instead of spaces.' }] } })
  assert.match(message, /Program type: Use underscores instead of spaces/)
})
