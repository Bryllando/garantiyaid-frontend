import { useState } from 'react'
import { locationCities, locationName, registeredServiceArea } from '../../utils/locations.js'

export default function LocationFields({ idPrefix, barangays, barangayId, sitioPurok = '', lockedBarangay, showSitio = true, barangayLabel = 'Barangay', onChange }) {
  const selectedBarangay = lockedBarangay || barangays.find(item => item.barangayId === barangayId)
  const cities = locationCities(lockedBarangay ? [lockedBarangay] : barangays)
  const [city, setCity] = useState(() => selectedBarangay?.city || (cities.length === 1 ? cities[0] : ''))
  const [reviewRequired, setReviewRequired] = useState(false)
  const [customArea, setCustomArea] = useState(() => Boolean(sitioPurok && !registeredServiceArea(selectedBarangay, sitioPurok)))
  const currentCity = selectedBarangay?.city || city
  const choices = barangays.filter(item => locationName(item.city) === locationName(currentCity))
  const knownArea = registeredServiceArea(selectedBarangay, sitioPurok)
  const areaChoice = reviewRequired ? '' : customArea ? '__review__' : knownArea || '__none__'

  function changeParent(id, nextCity) {
    setCity(nextCity)
    setReviewRequired(Boolean(sitioPurok))
    onChange({ barangayId: id })
  }
  function changeArea(value) {
    setReviewRequired(false)
    setCustomArea(value === '__review__')
    onChange({ sitioPurok: value === '__none__' ? '' : value === '__review__' ? sitioPurok : value })
  }
  return <div className={`grid min-w-0 gap-5 sm:col-span-2 ${showSitio ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
    <div className="min-w-0"><label htmlFor={`${idPrefix}-city`} className="ga-label" data-required="true">City</label><select id={`${idPrefix}-city`} required disabled={Boolean(lockedBarangay)} value={currentCity} onChange={event => changeParent('', event.target.value)} className="ga-input mt-2"><option value="">Select city</option>{cities.map(value => <option key={value} value={value}>{value}</option>)}</select></div>
    <div className="min-w-0"><label htmlFor={`${idPrefix}-barangay`} className="ga-label" data-required="true">{barangayLabel}</label><select id={`${idPrefix}-barangay`} required disabled={Boolean(lockedBarangay) || !currentCity} value={selectedBarangay?.barangayId || ''} onChange={event => changeParent(event.target.value, currentCity)} className="ga-input mt-2"><option value="">Select barangay</option>{(lockedBarangay ? [lockedBarangay] : choices).map(item => <option key={item.barangayId} value={item.barangayId}>{item.barangayName}</option>)}</select>{lockedBarangay && <p className="mt-2 text-xs leading-5 text-muted-copy">Assigned to your staff account</p>}</div>
    {showSitio && <div className="min-w-0"><label htmlFor={`${idPrefix}-sitio-purok`} className="ga-label">Sitio / Purok</label><select id={`${idPrefix}-sitio-purok`} value={areaChoice} required={reviewRequired} disabled={!selectedBarangay} aria-describedby={`${idPrefix}-area-help`} onChange={event => changeArea(event.target.value)} className="ga-input mt-2">{reviewRequired && <option value="" disabled>Review previous Sitio / Purok</option>}<option value="__none__">Not recorded</option>{(selectedBarangay?.serviceAreas || []).map(area => <option key={area} value={area}>{area}</option>)}<option value="__review__">Other / needs location review</option></select><p id={`${idPrefix}-area-help`} className={`mt-2 text-xs leading-5 ${reviewRequired ? 'text-brand-amber' : 'text-muted-copy'}`}>{reviewRequired ? `Review the previous location “${sitioPurok}” for the selected Barangay. Choose a listed area, keep it as unconfirmed text, or select Not recorded.` : 'Listed areas belong to the selected Barangay.'}</p>
      {customArea && !reviewRequired && <div className="mt-3"><label htmlFor={`${idPrefix}-area-text`} className="ga-label">Unconfirmed Sitio / Purok</label><input id={`${idPrefix}-area-text`} required maxLength="120" value={sitioPurok} onChange={event => onChange({ sitioPurok: event.target.value })} className="ga-input mt-2" /><p className="mt-2 text-xs leading-5 text-brand-amber">This text is retained for location review. Admin can confirm the area in the Barangay record.</p></div>}
    </div>}
  </div>
}
