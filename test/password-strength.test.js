import test from 'node:test'
import assert from 'node:assert/strict'
import { getPasswordReadiness } from '../src/auth/passwordStrength.js'

test('password readiness follows the actual 12-character policy', () => {
  assert.deepEqual(getPasswordReadiness(''), {
    label: 'Start typing',
    message: 'Use 12–72 characters. A long, unique passphrase is recommended.',
    progress: 0,
    tone: 'neutral',
  })
  assert.equal(getPasswordReadiness('1234567').tone, 'danger')
  assert.equal(getPasswordReadiness('12345678').tone, 'warning')
  assert.match(getPasswordReadiness('12345678901').message, /^1 more character needed/)
  assert.equal(getPasswordReadiness('123456789012').tone, 'success')
  assert.equal(getPasswordReadiness('a much longer unique passphrase').progress, 100)
})
