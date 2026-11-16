import test from 'node:test'
import assert from 'node:assert/strict'
import { locationCities, registeredServiceArea, needsLocationReview, sessionServiceAreas } from '../src/utils/locations.js'
import { beneficiaryTableFromSheet, suggestBeneficiaryColumns, mapBeneficiaryImportRows } from '../src/utils/beneficiaryImport.js'
import { barangayTableFromSheet, suggestBarangayColumns, mapBarangayImportRows, barangayCorrectionsCsv } from '../src/utils/barangayImport.js'

const locations = [
  { barangayId: 'north', barangayName: 'Poblacion', city: 'First City', serviceAreas: ['Sitio Riverside', 'Purok North'] },
  { barangayId: 'south', barangayName: 'Poblacion', city: 'Second City', serviceAreas: ['Sitio Riverside', 'Purok South'] },
]
test('location choices and area review use the parent Barangay, preserving missing and unconfirmed text', () => {
  assert.deepEqual(locationCities([...locations, { city: ' first city ' }]), ['first city', 'Second City'])
  assert.equal(registeredServiceArea(locations[0], ' sitio riverside '), 'Sitio Riverside')
  assert.equal(registeredServiceArea(locations[1], 'Purok North'), undefined)
  assert.equal(needsLocationReview({ barangay: locations[1], sitioPurok: 'Purok North' }), true)
  assert.equal(needsLocationReview({ barangay: locations[0], sitioPurok: null }), false)
  const coverage = sessionServiceAreas(locations[0], { serviceAreas: [{ name: 'SITIO RIVERSIDE', count: 2 }, { name: 'Purok South', count: 1 }] })
  assert.deepEqual(coverage, { areas: [{ name: 'Sitio Riverside', count: 2 }, { name: 'Purok North', count: 0 }], unconfirmed: [{ name: 'Purok South', count: 1 }] })
})
test('City plus Barangay disambiguates an imported parent and cannot expand facilitator scope', () => {
  const table = beneficiaryTableFromSheet([
    ['First name', 'Last name', 'Birth date', 'Sex', 'Address', 'City', 'Barangay', 'Sitio / Purok'],
    ['One', 'Synthetic', '1990-01-01', 'FEMALE', 'One Street', 'First City', 'Poblacion', 'Sitio Riverside'],
    ['Two', 'Synthetic', '1990-01-01', 'FEMALE', 'Two Street', 'Second City', 'Poblacion', 'Sitio Riverside'],
  ])
  const columns = suggestBeneficiaryColumns(table.headers)
  const rows = mapBeneficiaryImportRows(table, columns, { locations })
  assert.deepEqual(rows.map(row => row.barangayId), ['north', 'south'])
  assert.deepEqual(rows.map(row => row.city), ['First City', 'Second City'])
  assert.throws(() => mapBeneficiaryImportRows(table, columns, { locations, assignedBarangay: 'north' }), /assigned barangay/)
})
test('Barangay imports accept a reviewed pipe-separated area list and corrections remain re-importable', () => {
  const table = barangayTableFromSheet([['Barangay', 'City', 'Province', 'Sitios / Puroks'], ['North', 'First City', 'Province', 'Sitio Riverside | Purok North']])
  const [row] = mapBarangayImportRows(table, suggestBarangayColumns(table.headers))
  assert.deepEqual(row.serviceAreas, ['Sitio Riverside', 'Purok North'])
  const correction = barangayCorrectionsCsv([{ sourceRow: 2, record: row, issues: ['Review'] }])
  assert.ok(correction[1].includes('Sitio Riverside | Purok North'))
  const names = Array.from({ length: 4 }, (_, index) => `Sitio ${index} ${'a'.repeat(90)}`)
  const longList = barangayTableFromSheet([table.headers, ['North', 'First City', 'Province', names.join(' | ')]])
  assert.deepEqual(mapBarangayImportRows(longList, suggestBarangayColumns(longList.headers))[0].serviceAreas, names)
})
