import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('../src/pages/DashboardPage.jsx', import.meta.url), 'utf8')

test('overview provides role-specific tasks from the shared scoped data contract', () => {
  assert.match(source, /<AdminOverview session=/)
  assert.match(source, /requestDistributionList\(session\.accessToken, \{ page: 1, pageSize: 5, status: 'DRAFT' \}\)/)
  assert.match(source, /heading: 'DSWD overview'/)
  assert.match(source, /heading: 'Barangay overview'/)
  assert.match(source, /featuredModuleHrefs/)
  assert.match(source, /getDashboardNavigation\(role\)/)
  assert.match(source, /requestDashboardOverview\(session\.accessToken\)/)
})

test('overview keeps responsive hierarchy, readable states, and accessible progress', () => {
  assert.match(source, /mx-auto w-full max-w-7xl/)
  assert.match(source, /ga-admin-summary grid grid-cols-2 lg:grid-cols-4/)
  assert.match(source, /aria-label="Operations summary"/)
  assert.match(source, /xl:grid-cols-2/)
  assert.match(source, /ga-admin-register/)
  assert.match(source, /<summary className="cursor-pointer">Account and data scope<\/summary>/)
  assert.match(source, /role="progressbar"/)
  assert.match(source, /aria-valuenow=\{percentage\}/)
  assert.match(source, /Latest figures could not be loaded\. Showing the last available update\./)
  assert.match(source, /No operational records yet/)
})
