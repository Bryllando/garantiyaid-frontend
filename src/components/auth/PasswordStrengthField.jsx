import {
  getPasswordReadiness,
  STAFF_PASSWORD_MAX_LENGTH,
  STAFF_PASSWORD_MIN_LENGTH,
} from '../../auth/passwordStrength.js'

const toneClasses = {
  neutral: {
    bar: 'bg-slate-400',
    badge: 'border-slate-200 bg-white text-muted-copy',
    dot: 'bg-slate-400',
    input: '',
    panel: 'border-line bg-slate-50',
  },
  danger: {
    bar: 'bg-brand-red',
    badge: 'border-red-200 bg-white text-brand-red',
    dot: 'bg-brand-red',
    input: 'border-red-400 focus:border-brand-red focus:ring-red-100',
    panel: 'border-red-200 bg-danger-soft',
  },
  warning: {
    bar: 'bg-amber-500',
    badge: 'border-amber-200 bg-white text-brand-amber',
    dot: 'bg-amber-500',
    input: 'border-amber-400 focus:border-brand-amber focus:ring-amber-100',
    panel: 'border-amber-200 bg-warning-soft',
  },
  success: {
    bar: 'bg-brand-green',
    badge: 'border-emerald-200 bg-white text-brand-green',
    dot: 'bg-brand-green',
    input: 'border-emerald-400 focus:border-brand-green focus:ring-emerald-100',
    panel: 'border-emerald-200 bg-success-soft',
  },
}

function PasswordStrengthField({ describedBy, id, label, name, onChange, onRevealChange, revealed, value }) {
  const readiness = getPasswordReadiness(value)
  const tone = toneClasses[readiness.tone]
  const readinessId = `${id}-readiness`

  return (
    <div>
      <label htmlFor={id} className="ga-label">{label}</label>
      <div className="relative mt-2">
        <input
          id={id}
          name={name}
          type={revealed ? 'text' : 'password'}
          required
          minLength={STAFF_PASSWORD_MIN_LENGTH}
          maxLength={STAFF_PASSWORD_MAX_LENGTH}
          autoComplete="new-password"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-describedby={[readinessId, describedBy].filter(Boolean).join(' ')}
          className={`ga-input pr-20 ${tone.input}`}
        />
        <button
          type="button"
          onClick={() => onRevealChange(!revealed)}
          aria-label={`${revealed ? 'Hide' : 'Show'} ${label.toLowerCase()}`}
          aria-pressed={revealed}
          className="absolute inset-y-0 right-1 min-w-16 rounded-lg px-3 text-sm font-bold text-brand-blue transition-colors hover:bg-info-soft focus-visible:outline-2 focus-visible:outline-brand-blue"
        >
          {revealed ? 'Hide' : 'Show'}
        </button>
      </div>

      <div id={readinessId} className={`mt-3 rounded-xl border p-3.5 transition-colors duration-200 ${tone.panel}`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-bold ${tone.badge}`}>
            <span aria-hidden="true" className={`size-2 rounded-full ${tone.dot}`} />
            <span aria-live="polite" aria-atomic="true">{readiness.label}</span>
          </span>
          <span className="text-xs font-semibold tabular-nums text-muted-copy">{value.length} / {STAFF_PASSWORD_MAX_LENGTH} characters</span>
        </div>
        <div
          role="progressbar"
          aria-label="Password length progress"
          aria-valuemin="0"
          aria-valuemax={STAFF_PASSWORD_MIN_LENGTH}
          aria-valuenow={Math.min(value.length, STAFF_PASSWORD_MIN_LENGTH)}
          aria-valuetext={`${value.length} characters entered; ${readiness.label}`}
          className="mt-3 h-2 overflow-hidden rounded-full bg-white/90 ring-1 ring-slate-950/5"
        >
          <span
            aria-hidden="true"
            className={`block h-full w-full origin-left rounded-full transition-[transform,background-color] duration-300 ease-out motion-reduce:transition-none ${tone.bar}`}
            style={{ transform: `scaleX(${readiness.progress / 100})` }}
          />
        </div>
        <p className="mt-2 text-xs leading-5 text-copy">{readiness.message}</p>
      </div>
    </div>
  )
}

export default PasswordStrengthField
