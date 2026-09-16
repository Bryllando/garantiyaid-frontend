import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import { getPhilippineDayPeriod } from '../src/components/layout/philippine-day-period.js'

test('staff shell renders authorized navigation, nested page selection, and safe account details', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
  try {
    const { default: DashboardShell } = await vite.ssrLoadModule('/src/components/layout/DashboardShell.jsx')
    const periods = [
      ['00:00:00', '03:59:59', 'Midnight', 'moonStars'],
      ['04:00:00', '06:59:59', 'Early morning', 'sunrise'],
      ['07:00:00', '11:59:59', 'Morning', 'sun'],
      ['12:00:00', '12:59:59', 'Noon', 'sunHigh'],
      ['13:00:00', '17:59:59', 'Afternoon', 'sunset'],
      ['18:00:00', '23:59:59', 'Night', 'moon'],
    ]
    for (const [start, end, label, icon] of periods) {
      for (const time of [start, end]) {
        const period = getPhilippineDayPeriod(new Date(`2026-09-07T${time}+08:00`))
        assert.equal(period.label, label)
        assert.equal(period.icon, icon)
      }
    }
    assert.equal(getPhilippineDayPeriod(new Date('2026-09-07T16:00:00Z')).label, 'Midnight')
    const render = (role, currentPath) => renderToStaticMarkup(createElement(DashboardShell, {
      user: { role, fullName: 'Maria <Admin> Santos', employeeId: 'STAFF-123' },
      currentPath,
      pageTitle: 'Beneficiary details',
    }, createElement('h1', null, 'Existing page content')))

    for (const role of ['SYSTEM_ADMIN', 'DSWD_STAFF', 'BARANGAY_FACILITATOR']) {
      const html = render(role, '/beneficiaries/123')
      const navigation = html.match(/<nav[^>]*aria-label="[^"]* navigation"[^>]*>([\s\S]*?)<\/nav>/)[1]
      assert.match(navigation, /href="\/beneficiaries" aria-current="page"/)
      assert.equal((navigation.match(/aria-current="page"/g) ?? []).length, 1)
      assert.equal(navigation.includes('href="/admin/administration"'), role === 'SYSTEM_ADMIN')
      assert.match(html, /Maria &lt;Admin&gt; Santos/)
      assert.match(html, /STAFF-123/)
      const sidebar = html.match(/<aside[\s\S]*?<\/aside>/)[0]
      const header = html.match(/<header[\s\S]*?<\/header>/)[0]
      assert.match(sidebar, /<summary[^>]*aria-label="Open account menu/)
      assert.match(sidebar, /href="\/account\?section=profile"/)
      assert.match(sidebar, /Personal information/)
      assert.match(sidebar, /href="\/account\?section=password"/)
      assert.match(sidebar, /Sign out securely/)
      assert.doesNotMatch(header, /Open account menu|Sign out securely|<details/)
      assert.match(header, /Good day, <span[^>]*>Maria &lt;Admin&gt; Santos\./)
      assert.match(header, /role="img" aria-label="[A-Za-z ]+ in Philippine time"/)
      assert.match(header, /<time[^>]*>[\s\S]*?(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday), [A-Z][a-z]+ \d{1,2}, \d{4}/)
      assert.match(header, /at \d{1,2}:\d{2}:\d{2} [AP]M/)
      assert.match(html, /<main[^>]*><h1>Existing page content<\/h1><\/main>/)
    }

    const unrelated = render('SYSTEM_ADMIN', '/beneficiaries-archive')
    assert.doesNotMatch(unrelated, /href="\/beneficiaries" aria-current="page"/)
  } finally {
    await vite.close()
  }
})
