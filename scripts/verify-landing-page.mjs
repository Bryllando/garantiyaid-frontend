import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { chromium, expect } from '@playwright/test'
import { createServer } from 'vite'

const before = process.argv.includes('--before')
const output = fileURLToPath(new URL('../../output/landing-government-guide/', import.meta.url))
await mkdir(output, { recursive: true })
const vite = await createServer({ cacheDir: '../tmp/landing-review-vite', server: { host: '127.0.0.1', port: 0 } })
let browser
const results = []
try {
  await vite.listen()
  const origin = `http://127.0.0.1:${vite.httpServer.address().port}`
  browser = await chromium.launch({ headless: true, channel: 'chrome' })
  for (const width of before ? [1440, 768, 390, 320] : [1440, 1024, 768, 390, 320]) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: !before && width === 390 ? 'no-preference' : 'reduce' })
    const errors = []
    const apiRequests = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.route('**/api/v1/**', (route) => {
      apiRequests.push(new URL(route.request().url()).pathname)
      return route.abort()
    })
    await page.goto(origin)
    await expect(page.locator('h1')).toBeVisible()
    await page.evaluate(() => document.fonts.ready)
    await expect.poll(() => page.locator('img').evaluateAll((images) => images.every((image) => image.complete && image.naturalWidth > 0))).toBe(true)
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `Overflow at ${width}px`)
    await page.screenshot({ path: `${output}/${before ? 'before' : 'after'}-hero-${width}.png` })
    await page.screenshot({ path: `${output}/${before ? 'before' : 'after'}-${width}.png`, fullPage: true })
    if (!before) {
      const navigation = page.getByRole('navigation', { name: 'Primary navigation' })
      const menu = navigation.locator('button[aria-controls="public-navigation"]')
      const mobile = width < 1024
      async function openNavigation() {
        if (mobile && await menu.getAttribute('aria-expanded') === 'false') await menu.click()
      }
      async function navigateTo(href) {
        await openNavigation()
        const link = navigation.locator(`a[href="${href}"]`)
        await link.click()
        await expect(page).toHaveURL(`${origin}/${href}`)
        await expect(page.locator(href)).toBeInViewport()
        await expect.poll(async () => {
          const target = await page.locator(href).boundingBox()
          const header = await navigation.boundingBox()
          return target.y - (header.y + header.height)
        }).toBeGreaterThanOrEqual(0)
        await expect(link).toHaveAttribute('aria-current', 'location')
        if (mobile) await expect(menu).toHaveAttribute('aria-expanded', 'false')
      }
      const hero = page.locator('#top img')
      await expect(hero).toHaveAttribute('src', '/LandingPage(2).png')
      assert.equal(await hero.evaluate(image => Math.abs(image.clientWidth / image.clientHeight - image.naturalWidth / image.naturalHeight) < 0.02), true, 'The complete collage keeps its original proportions')
      await page.keyboard.press('Tab')
      await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused()
      await page.keyboard.press('Enter')
      await expect(page.locator('#main-content')).toBeFocused()
      if (mobile) {
        await expect(navigation.locator('a[href="#services"]')).not.toBeVisible()
        await menu.focus()
        await page.keyboard.press('Enter')
        await expect(menu).toHaveAttribute('aria-expanded', 'true')
        await page.keyboard.press('Tab')
        await expect(navigation.locator('a[href="#services"]')).toBeFocused()
        await page.screenshot({ path: `${output}/navigation-${width}.png` })
        await page.keyboard.press('Escape')
        await expect(menu).toBeFocused()
        await expect(menu).toHaveAttribute('aria-expanded', 'false')
        await openNavigation()
        await page.mouse.click(4, 850)
        await expect(menu).toHaveAttribute('aria-expanded', 'false')
        await openNavigation()
        await navigation.locator('a[href="/login"]').focus()
        await page.keyboard.press('Tab')
        await expect(menu).toHaveAttribute('aria-expanded', 'false')
      } else {
        await expect(menu).not.toBeVisible()
      }
      await navigateTo('#services')
      await page.locator('#services').screenshot({ path: `${output}/staff-workspace-${width}.png` })
      const tools = page.getByRole('list', { name: 'Staff workspace tools' })
      await expect(tools.getByRole('link')).toHaveCount(3)
      for (const [name, target] of [['Beneficiary records', '#review-step'], ['Distribution & queues', '#schedule-step'], ['Documented releases', '#handover-step']]) {
        const link = tools.getByRole('link', { name, exact: true })
        await link.focus()
        await page.keyboard.press('Enter')
        await expect(page).toHaveURL(`${origin}/${target}`)
        await expect(page.locator(target)).toBeFocused()
        await expect(page.locator(target)).toBeInViewport()
        await expect(page.locator(target)).toHaveCSS('outline-style', 'solid')
        await expect(page.locator(target)).toHaveCSS('outline-width', '2px')
        await expect.poll(async () => (await page.locator(target).boundingBox()).y - ((await navigation.boundingBox()).y + (await navigation.boundingBox()).height)).toBeGreaterThanOrEqual(0)
        await expect(navigation.locator('a[href="#workflow"]')).toHaveAttribute('aria-current', 'location')
        await navigateTo('#services')
      }
      for (const href of ['#workflow', '#burial-referrals', '#roles', '#beneficiary-guidance']) {
        await navigateTo(href)
        await page.locator(href).screenshot({ path: `${output}/${href.slice(1)}-${width}.png` })
      }
      const procedure = page.getByRole('list', { name: 'Physical assistance procedure' })
      await expect(procedure.locator(':scope > li')).toHaveCount(4)
      await expect(procedure.getByText('Handled by', { exact: true })).toHaveCount(4)
      await expect(procedure.getByText('Recorded result', { exact: true })).toHaveCount(4)
      await expect(page.getByRole('list', { name: 'Burial referral procedure' }).locator(':scope > li')).toHaveCount(4)
      await expect(page.getByText('Printing does not record issuance.', { exact: true })).toBeVisible()
      await expect(page.locator('#roles').getByText('Burial referrals are read-only for Admin oversight.', { exact: true })).toBeVisible()
      await expect(page.getByRole('list', { name: 'Resident assistance steps' }).locator(':scope > li')).toHaveCount(2)
      await expect.poll(() => navigation.evaluate(node => Math.round(node.getBoundingClientRect().top))).toBe(0)
      // Scroll without clicking a link: the current-section indicator follows the page.
      await page.locator('#workflow').evaluate(node => window.scrollTo({ top: node.offsetTop - 96, behavior: 'instant' }))
      await expect(navigation.locator('a[href="#workflow"]')).toHaveAttribute('aria-current', 'location')
      await page.getByRole('link', { name: 'View referral steps', exact: true }).click()
      await expect(page).toHaveURL(`${origin}/#burial-referrals`)
      await expect(page.locator('#burial-referrals')).toBeInViewport()
      await expect(page.getByText('A referral is not an approval, Guarantee Letter, or payment.', { exact: false })).toBeVisible()
      await navigateTo('#beneficiary-guidance')
      assert.equal(apiRequests.length, 0, 'The public page must not request operational records')
      await page.getByRole('button', { name: 'Open general guidance', exact: true }).click()
      await expect(page.getByRole('dialog', { name: 'GarantiyAid Help' })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Open general guidance', exact: true })).toHaveCount(0)
      await expect(page.getByRole('button', { name: 'Close general guidance', exact: true })).toHaveCount(1)
      await expect(page.getByRole('button', { name: 'Close beneficiary help', exact: true })).toHaveCount(1)
      await expect(page.getByRole('dialog', { name: 'GarantiyAid Help' }).getByRole('button', { name: 'Close beneficiary help', exact: true })).toBeFocused()
      await page.getByLabel('Language', { exact: true }).selectOption('en')
      await expect(page.getByText('General guidance only', { exact: true })).toBeVisible()
      assert.equal(apiRequests.length, 0, 'Opening help should not create a session')
      await page.screenshot({ path: `${output}/help-${width}.png` })
      await page.keyboard.press('Escape')
      await expect(page.getByRole('dialog', { name: 'GarantiyAid Help' })).toHaveCount(0)
      await expect(page.getByRole('button', { name: 'Open general guidance', exact: true })).toBeFocused()
      await page.getByRole('button', { name: 'Open general guidance', exact: true }).click()
      await page.getByRole('button', { name: 'Close beneficiary help', exact: true }).click()
      await expect(page.getByRole('button', { name: 'Open general guidance', exact: true })).toBeFocused()
      for (const [name, href] of [['For residents', '#beneficiary-guidance'], ['Staff responsibilities', '#roles']]) {
        await page.getByRole('navigation', { name: 'Footer information' }).getByRole('link', { name, exact: true }).click()
        await expect(page).toHaveURL(`${origin}/${href}`)
        await expect(page.locator(href)).toBeInViewport()
      }
      await page.getByRole('link', { name: 'Privacy notice', exact: true }).click()
      await expect(page).toHaveURL(`${origin}/privacy`)
      await expect(page.locator('h1')).toBeVisible()
      await page.goto(origin)
      for (const location of ['header', '#top', 'footer']) {
        if (location === 'header') await openNavigation()
        await page.locator(location).locator('a[href="/login"]').click()
        await expect(page).toHaveURL(`${origin}/login`)
        await expect(page.locator('input[type="password"]')).toBeVisible()
        await page.goto(origin)
      }
      await page.goto(`${origin}/#burial-referrals`)
      await expect(page.locator('#burial-referrals')).toBeInViewport()
      await expect(navigation.locator('a[href="#burial-referrals"]')).toHaveAttribute('aria-current', 'location')
      if (width === 768) {
        await openNavigation()
        await page.setViewportSize({ width: 1440, height: 900 })
        await expect(menu).toHaveAttribute('aria-expanded', 'false')
        await page.setViewportSize({ width, height: 900 })
        await expect(navigation.locator('a[href="#services"]')).not.toBeVisible()
        await page.goto(origin)
        await page.setViewportSize({ width: 844, height: 390 })
        await openNavigation()
        assert.ok((await page.locator('#public-navigation').boundingBox()).y + (await page.locator('#public-navigation').boundingBox()).height <= 390, 'Landscape menu fits below the header and prototype notice')
        await navigation.locator('a[href="/login"]').scrollIntoViewIfNeeded()
        await expect(navigation.locator('a[href="/login"]')).toBeInViewport({ ratio: 1 })
        await page.screenshot({ path: `${output}/navigation-landscape.png` })
        await page.keyboard.press('Escape')
        await expect(menu).toBeFocused()
      }
    }
    assert.deepEqual(errors, [], `Browser errors at ${width}px`)
    results.push({ width, passed: true, scope: before ? 'baseline screenshot and overflow' : 'workspace task links and focused/highlighted steps, referral CTA, layout, complete collage, sticky/current-section navigation, keyboard, mobile menu/recovery, deep links, privacy, all sign-in links, help open/close, no operational API requests' })
    await page.close()
  }
  await writeFile(`${output}/${before ? 'before' : 'after'}-results.json`, JSON.stringify({ checkedAt: new Date().toISOString(), results }, null, 2))
  console.log(JSON.stringify(results, null, 2))
} finally {
  await browser?.close()
  await vite.close()
}
