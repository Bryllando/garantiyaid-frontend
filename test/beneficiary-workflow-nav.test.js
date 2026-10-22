import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'

test('administrator beneficiary navigation has three accessible pages without false step order', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
  try {
    const { default: BeneficiaryWorkflowNav } = await vite.ssrLoadModule('/src/components/beneficiaries/BeneficiaryWorkflowNav.jsx')
    for (const currentPath of ['/beneficiaries', '/enrollments', '/biometrics']) {
      const html = renderToStaticMarkup(createElement(BeneficiaryWorkflowNav, { currentPath, onNavigate() {} }))
      assert.match(html, /aria-label="Beneficiary services"/)
      assert.doesNotMatch(html, /Step [123]/)
      assert.equal((html.match(/aria-current="page"/g) ?? []).length, 1)
      assert.match(html, new RegExp(`href="${currentPath}" aria-current="page"`))
      for (const stage of ['/beneficiaries', '/enrollments', '/biometrics']) assert.match(html, new RegExp(`href="${stage}"`))
    }
  } finally {
    await vite.close()
  }
})
