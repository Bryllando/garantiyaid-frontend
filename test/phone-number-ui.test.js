import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const phoneFieldSource = readFileSync(new URL('../src/components/ui/philippine-mobile-field.jsx', import.meta.url), 'utf8')
const staffSource = readFileSync(new URL('../src/pages/StaffBarangayAdministrationPage.jsx', import.meta.url), 'utf8')
const accountSource = readFileSync(new URL('../src/pages/AccountSettingsPage.jsx', import.meta.url), 'utf8')
const beneficiarySource = readFileSync(new URL('../src/pages/BeneficiaryManagementPage.jsx', import.meta.url), 'utf8')

test('contact inputs expose the Philippine mobile format and accessible inline feedback', () => {
  assert.match(phoneFieldSource, /type="tel"/)
  assert.match(phoneFieldSource, /inputMode="numeric"/)
  assert.match(phoneFieldSource, /maxLength="13"/)
  assert.match(phoneFieldSource, /pattern="09\[0-9\]\{2\} \[0-9\]\{3\} \[0-9\]\{4\}"/)
  assert.match(phoneFieldSource, /onBlur=/)
  assert.match(phoneFieldSource, /aria-invalid=/)
  assert.match(phoneFieldSource, /\{digitCount\}\/11/)
})

test('staff, own-account, and beneficiary forms use the shared contact field', () => {
  assert.match(staffSource, /<PhilippineMobileField id="staff-contact"/)
  assert.match(accountSource, /<PhilippineMobileField id="account-contact"/)
  assert.match(beneficiarySource, /<PhilippineMobileField id="beneficiary-contact"/)
})
