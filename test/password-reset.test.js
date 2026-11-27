import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  checkStaffPasswordReset,
  completeStaffPasswordReset,
  requestPasswordReset,
} from '../src/auth/staffAuth.js'

test('password recovery checks the link without sending a password or staff credentials', async (context) => {
  const originalFetch = globalThis.fetch
  const requests = []
  const responses = [
    { message: 'If the account is eligible, instructions will be sent.' },
    { remainingMs: 29_000 },
    { message: 'Password reset complete.', revokedSessionCount: 3 },
  ]
  context.after(() => { globalThis.fetch = originalFetch })
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options })
    return {
      ok: true,
      json: async () => ({
        success: true,
        data: responses[requests.length - 1],
      }),
    }
  }

  await requestPasswordReset('staff@example.test')
  const token = 'a'.repeat(43)
  assert.equal(await checkStaffPasswordReset(token), 29_000)
  await completeStaffPasswordReset(token, 'A replacement private password')
  assert.match(requests[0].url, /\/auth\/password-reset\/request$/)
  assert.deepEqual(JSON.parse(requests[0].options.body), { account: 'staff@example.test' })
  assert.match(requests[1].url, /\/auth\/password-reset\/check$/)
  assert.deepEqual(JSON.parse(requests[1].options.body), { token })
  assert.match(requests[2].url, /\/auth\/password-reset\/complete$/)
  assert.deepEqual(JSON.parse(requests[2].options.body), {
    token,
    newPassword: 'A replacement private password',
  })
  for (const { options } of requests) assert.equal(Object.hasOwn(options.headers, 'Authorization'), false)
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
  assert.match(reset, /clearStaffSession\(\)/)
  assert.match(reset, /If the account is eligible/)
  assert.match(reset, /Your authenticator stays active/)
  assert.doesNotMatch(reset, /Verified recovery link/)
})
