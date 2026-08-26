import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('../src/components/ui/motion-root.jsx', import.meta.url), 'utf8')
const styles = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8')

test('motion layer keeps reduced-motion support and effect cleanup', () => {
  assert.match(source, /prefers-reduced-motion: reduce/)
  assert.match(source, /return \(\) => scope\.revert\(\)/)
})

test('native dialogs animate open and closed without overriding reduced motion', () => {
  assert.match(styles, /dialog\[open\]/)
  assert.match(styles, /allow-discrete/)
  assert.match(styles, /dialog::backdrop/)
  assert.match(styles, /prefers-reduced-motion: reduce[\s\S]*dialog::backdrop/)
})
