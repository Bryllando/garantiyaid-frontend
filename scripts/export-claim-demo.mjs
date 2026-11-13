import assert from 'node:assert/strict'
import { mkdir, readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { chromium, expect } from '@playwright/test'
import { createServer } from 'vite'

const file = process.argv.find((arg) => arg.startsWith('--credentials='))?.slice(14)
assert.ok(file, 'Supply --credentials=<private credentials.json from prepare-claim-demo>.')
const source = resolve(file)
const credentials = JSON.parse(await readFile(source, 'utf8'))
assert.ok(credentials.cards?.length, 'No issued credentials are saved in this file.')
assert.ok(credentials.cards.every((item) => item.distribution.title.startsWith('TEST ONLY') && item.tokens.every((token) => token.token.startsWith('gya1_'))), 'Only issued synthetic demo credentials may be exported here.')
const output = dirname(source)
await mkdir(output, { recursive: true })
const vite = await createServer({ logLevel: 'error', cacheDir: 'node_modules/.vite-claim-export', server: { host: '127.0.0.1', port: 0, hmr: false }, plugins: [{ name: 'private-demo-card-preview', configureServer(server) {
  server.middlewares.use('/claim-demo-export', (_req, res) => { res.setHeader('Content-Type', 'text/html'); server.transformIndexHtml('/claim-demo-export', '<div id="root"></div><script type="module" src="/@id/virtual:claim-export"></script>').then((html) => res.end(html)).catch(() => { res.statusCode = 500; res.end('Preview unavailable') }) })
}, resolveId(id) { if (id === 'virtual:claim-export') return id }, load(id) { if (id === 'virtual:claim-export') return `import React from 'react'; import {createRoot} from 'react-dom/client'; import QrCredentialsDialog from '/src/components/distributions/QrCredentialsDialog.jsx'; import '/src/index.css'; window.renderCards=(data)=>createRoot(document.getElementById('root')).render(React.createElement(QrCredentialsDialog,{...data,onClose:()=>{}}));` } }] })
let browser
try {
  await vite.listen()
  browser = await chromium.launch({ channel: 'chrome', headless: true })
  for (const card of credentials.cards) {
    const page = await browser.newPage({ viewport: { width: 1200, height: 1000 }, acceptDownloads: true })
    await page.route('**/api/**', (route) => route.abort())
    await page.goto(`http://127.0.0.1:${vite.httpServer.address().port}/claim-demo-export`)
    await page.waitForFunction(() => typeof window.renderCards === 'function')
    await page.evaluate((data) => window.renderCards(data), card)
    await expect(page.getByRole('button', { name: 'Download PDF', exact: true })).toBeVisible()
    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Download PDF', exact: true }).click()
    const download = await downloadPromise
    const path = resolve(output, `${card.distribution.verificationRequirement.toLowerCase()}-cards.pdf`)
    await download.saveAs(path)
    console.log(`Saved ${path}`)
    await page.close()
  }
} finally { await browser?.close(); await vite.close() }
