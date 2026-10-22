import assert from 'node:assert/strict'
import test from 'node:test'
import { enrollmentLocation, readEnrollmentLocation } from '../src/utils/enrollmentLocation.js'

test('enrollment return links preserve the selected case, applied filters, and page', () => {
  const original = { filters: { search: 'Maria & Ana', status: 'FOR_VALIDATION', programId: 'program-1' }, page: 3, selectedId: 'case-2' }
  const location = enrollmentLocation(original)
  assert.deepEqual(readEnrollmentLocation(location.split('?')[1]), original)
  assert.equal(enrollmentLocation({ filters: {} }), '/enrollments')
})

test('invalid page parameters return to the first page without accepting a redirect target', () => {
  for (const page of ['-1', '0', 'NaN', '2.5', 'Infinity']) assert.equal(readEnrollmentLocation(`page=${page}`).page, 1)
  assert.equal(enrollmentLocation(readEnrollmentLocation('redirect=https://example.com')), '/enrollments')
})
