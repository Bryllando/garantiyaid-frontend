import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const dialogSource = readFileSync(new URL('../src/components/ui/confirmation-dialog.jsx', import.meta.url), 'utf8')
const pageSource = readFileSync(new URL('../src/pages/StaffBarangayAdministrationPage.jsx', import.meta.url), 'utf8')

test('inactive staff accounts show move to archive or delete with an exact typed phrase', () => {
  assert.match(pageSource, /!user\.isActive && <button/)
  assert.match(pageSource, /user\.removalMode === 'ARCHIVE'/)
  assert.match(pageSource, /'ARCHIVE' : 'DELETE'/)
  assert.match(pageSource, /audit-only accounts can be permanently deleted/)
  assert.match(dialogSource, /confirmation !== confirmationText/)
  assert.match(dialogSource, /case-sensitive/)
})

test('archived staff accounts are visible and restorable without automatic sign-in access', () => {
  assert.match(pageSource, /Archived accounts/)
  assert.match(pageSource, /Back to current accounts/)
  assert.match(pageSource, /name=\{showingArchived \? 'arrowLeft' : 'archive'\}/)
  assert.match(pageSource, /Move to archive/)
  assert.doesNotMatch(pageSource, /<option value="archived">/)
  assert.match(pageSource, /Restore account/)
  assert.match(pageSource, /return to the inactive staff list/)
})

test('archive view transition is motion-safe and announces the changed registry', () => {
  assert.match(pageSource, /useMotionEntry\(showingArchived \? 'archived' : 'current'\)/)
  assert.match(pageSource, /staffRegistryHeadingRef\.current\?\.focus/)
  assert.match(pageSource, /tabIndex=\{-1\} id="staff-registry-heading"/)
})
