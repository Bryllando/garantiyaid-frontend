import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'

const source = readFileSync(new URL('../src/pages/DashboardPage.jsx', import.meta.url), 'utf8')
  + readFileSync(new URL('../src/components/ui/DashboardLoadNotice.jsx', import.meta.url), 'utf8')

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

test('admin snapshot formats Philippine time and keeps unavailable figures distinct from zero', async () => {
  const vite = await createServer({ cacheDir: 'node_modules/.vite-verify/admin-overview', server: { middlewareMode: true, hmr: false }, appType: 'custom' })
  try {
    const { default: AdminOverview } = await vite.ssrLoadModule('/src/components/admin/AdminOverview.jsx')
    const overview = { generatedAt: '2026-11-17T12:46:43Z', programs: { activeProgramCount: 4 }, beneficiaries: { approvedBeneficiaryCount: 13, unclaimedAllocationCount: 23 }, distributions: { openDistributionCount: 8, statusCounts: { DRAFT: 0 } }, anomalies: { duplicateAttemptCount: 2 }, fundUtilization: { remainingAmount: '0.00' } }
    const render = snapshot => renderToStaticMarkup(createElement(AdminOverview, { session: { accessToken: 'fixture', user: { userId: 'admin' } }, overview: snapshot, draftEvents: [], liveStatus: 'reconnecting' }))
    const html = render(overview)
    assert.match(html, /17 Nov 2026, 8:46 pm PHT/)
    assert.match(html, /Automatic updates are unavailable\. Refresh to get the latest records\./)
    assert.match(html, /₱0\.00/)
    assert.match(html, /Simulation only\. No real funds are transferred\./)
    assert.match(html, /href="\/reports\?report=ANOMALIES"/)
    assert.doesNotMatch(html, /Daily administration work|Administration overview/)
    const unavailable = render({ ...overview, generatedAt: 'invalid', programs: {}, distributions: {}, fundUtilization: null })
    assert.match(unavailable, /Last update time unavailable\./)
    assert.match(unavailable, /Unavailable/)
    assert.match(unavailable, /class="ga-overview-total">—<\/span>/)
    assert.doesNotMatch(unavailable, /₱0\.00|Invalid Date|NaN/)
  } finally {
    await vite.close()
  }
})
