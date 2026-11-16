export const locationName = value => (value ?? '').trim().toLocaleLowerCase('en-PH')

export function locationCities(barangays) {
  return [...new Map(barangays.filter(item => item.city).map(item => [locationName(item.city), item.city.trim()])).values()].sort((a, b) => a.localeCompare(b))
}

export function registeredServiceArea(barangay, value) {
  return barangay?.serviceAreas?.find(area => locationName(area) === locationName(value))
}

export function needsLocationReview(beneficiary) {
  return Boolean(beneficiary.sitioPurok && !registeredServiceArea(beneficiary.barangay, beneficiary.sitioPurok))
}

export function sessionServiceAreas(barangay, summary) {
  const recorded = summary?.serviceAreas ?? []
  const areas = (barangay?.serviceAreas ?? []).map(name => ({ name,
    count: recorded.filter(area => locationName(area.name) === locationName(name)).reduce((total, area) => total + area.count, 0),
  }))
  const unconfirmed = recorded.filter(area => !registeredServiceArea(barangay, area.name))
  return { areas, unconfirmed }
}
