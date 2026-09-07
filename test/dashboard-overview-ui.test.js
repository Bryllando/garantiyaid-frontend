import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('../src/pages/DashboardPage.jsx', import.meta.url), 'utf8')

test('overview provides distinct role command centers from the shared scoped data contract', () => {
  assert.match(source, /Protect access and oversee aid operations/)
  assert.match(source, /Move verified assistance from review to delivery/)
  assert.match(source, /Keep today\\'s beneficiary service moving/)
  assert.match(source, /featuredModuleHrefs/)
  assert.match(source, /getDashboardNavigation\(role\)/)
  assert.match(source, /requestDashboardOverview\(session\.accessToken\)/)
})

test('overview keeps responsive hierarchy, readable states, and accessible progress', () => {
  assert.match(source, /mx-auto w-full max-w-7xl/)
  assert.match(source, /sm:grid-cols-2 xl:grid-cols-4/)
  assert.match(source, /md:grid-cols-\[minmax\(0,1\.35fr\)_minmax\(18rem,0\.72fr\)\]/)
  assert.ok(source.indexOf('Account and data scope') < source.indexOf('Operational readiness'))
  assert.match(source, /ga-metric-card ga-card min-h-36/)
  assert.match(source, /Priority workspaces/)
  assert.match(source, /aria-label="Account status"/)
  assert.match(source, /ga-card p-5 sm:p-6 md:col-span-2/)
  assert.match(source, /mt-5 space-y-5/)
  assert.match(source, /role="progressbar"/)
  assert.match(source, /aria-valuenow=\{percentage\}/)
  assert.match(source, /Live totals are limited to your authorized data scope/)
  assert.match(source, /No operational records yet/)
})
