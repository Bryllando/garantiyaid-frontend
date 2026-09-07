import { useState } from 'react'

const LOCAL_MOBILE_PATTERN = /^09\d{9}$/

function localDigits(value) {
  const digits = String(value ?? '').replace(/\D/g, '')
  return digits.startsWith('639') ? `0${digits.slice(2)}` : digits
}

function formatPhilippineMobileInput(value) {
  const digits = localDigits(value).slice(0, 11)
  return [digits.slice(0, 4), digits.slice(4, 7), digits.slice(7, 11)].filter(Boolean).join(' ')
}

function getPhilippineMobileError(value, required = false) {
  const digits = localDigits(value)
  if (!digits) return required ? 'Enter a contact number.' : ''
  if (digits.length !== 11) return `Enter all 11 digits (${digits.length}/11 entered).`
  if (!LOCAL_MOBILE_PATTERN.test(digits)) return 'Use a Philippine mobile number starting with 09.'
  return ''
}

export function PhilippineMobileField({ describedBy, id, label = 'Contact number', onChange, required = false, value }) {
  const [touched, setTouched] = useState(false)
  const formattedValue = formatPhilippineMobileInput(value)
  const digitCount = localDigits(formattedValue).length
  const error = touched ? getPhilippineMobileError(formattedValue, required) : ''
  const hintId = `${id}-mobile-hint`

  return (
    <div>
      <label htmlFor={id} className="ga-label">
        {label}{!required && <span className="font-normal text-muted-copy"> (optional)</span>}
      </label>
      <input
        id={id}
        type="tel"
        inputMode="numeric"
        autoComplete="tel-national"
        required={required}
        maxLength="13"
        pattern="09[0-9]{2} [0-9]{3} [0-9]{4}"
        placeholder="0917 123 4567"
        value={formattedValue}
        onChange={(event) => {
          event.currentTarget.setCustomValidity('')
          onChange(formatPhilippineMobileInput(event.target.value))
        }}
        onBlur={() => setTouched(true)}
        onInvalid={(event) => {
          const message = getPhilippineMobileError(event.currentTarget.value, required)
          event.currentTarget.setCustomValidity(message)
          setTouched(true)
        }}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={[hintId, describedBy].filter(Boolean).join(' ')}
        className="ga-input mt-2 font-mono tracking-wide aria-invalid:border-brand-red aria-invalid:ring-2 aria-invalid:ring-red-100"
      />
      <div className="mt-2 flex min-h-5 items-start justify-between gap-3 text-xs leading-5">
        <p id={hintId} role={error ? 'alert' : undefined} className={error ? 'font-semibold text-brand-red' : 'text-muted-copy'}>
          {error || 'Use an 11-digit Philippine mobile number.'}
        </p>
        <span aria-hidden="true" className={`shrink-0 tabular-nums ${digitCount === 11 ? 'font-bold text-brand-green' : 'text-muted-copy'}`}>{digitCount}/11</span>
      </div>
    </div>
  )
}
