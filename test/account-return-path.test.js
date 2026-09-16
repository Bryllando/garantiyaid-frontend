import assert from 'node:assert/strict'
import test from 'node:test'
import { accountReturnPath } from '../src/auth/account-return-path.js'

test('security email destinations survive sign-in without allowing external redirects', () => {
  for (const path of ['/account', '/account?section=password', '/account?section=authenticator']) assert.equal(accountReturnPath(path), path)
  for (const path of [null, '', '//evil.test', '/\\evil.test', 'https://evil.test', '/login', '/account?section=password&next=https://evil.test', '/account?section=unknown', '/account#https://evil.test', '/account\n']) assert.equal(accountReturnPath(path), null, String(path))
})
