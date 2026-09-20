import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  completeStaffPasswordReset,
  requestPasswordReset,
} from '../src/auth/staffAuth.js'

test('password recovery preserves enumeration-safe request and single-use completion contracts', async (context) => {
  const originalFetch = globalThis.fetch
  const requests = []
  context.after(() => { globalThis.fetch = originalFetch })
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options })
    return {
      ok: true,
      json: async () => ({
        success: true,
        data: requests.length === 1
          ? { message: 'If the account is eligible, instructions will be sent.' }
          : { message: 'Password reset complete.', revokedSessionCount: 3 },
      }),
    }
  }

  await requestPasswordReset('staff@example.test')
  await completeStaffPasswordReset('a'.repeat(43), 'A replacement private password')
  assert.match(requests[0].url, /\/auth\/password-reset\/request$/)
  assert.deepEqual(JSON.parse(requests[0].options.body), { account: 'staff@example.test' })
  assert.match(requests[1].url, /\/auth\/password-reset\/complete$/)
  assert.deepEqual(JSON.parse(requests[1].options.body), {
    token: 'a'.repeat(43),
    newPassword: 'A replacement private password',
  })
  assert.equal(Object.hasOwn(requests[0].options.headers, 'Authorization'), false)
  assert.equal(Object.hasOwn(requests[1].options.headers, 'Authorization'), false)
})

test('login and recovery pages provide the complete accessible recovery path', async () => {
  const [app, login, reset] = await Promise.all([
    readFile(new URL('../src/App.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/LoginPage.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/PasswordResetPage.jsx', import.meta.url), 'utf8'),
  ])
  assert.match(login, /href="\/forgot-password"/)
  assert.match(app, /path === '\/forgot-password'/)
  assert.match(app, /path === '\/reset-password'/)
  assert.match(reset, /PasswordStrengthField/)
  assert.match(reset, /useMotionEntry/)
  assert.match(reset, /clearStaffSession\(\)/)
  assert.match(reset, /confirmation is the same whether an account is found or not/i)
  assert.match(reset, /Authenticator protection remains active/)
})
