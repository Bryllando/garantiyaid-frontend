import { useContext } from 'react'
import { OTPInput, OTPInputContext, REGEXP_ONLY_DIGITS } from 'input-otp'

function InputOTP({ className = '', containerClassName = '', ...props }) {
  return (
    <OTPInput
      data-slot="input-otp"
      containerClassName={`flex items-center justify-center has-disabled:opacity-50 ${containerClassName}`}
      className={`disabled:cursor-not-allowed ${className}`}
      {...props}
    />
  )
}

function InputOTPGroup({ className = '', ...props }) {
  return <div data-slot="input-otp-group" className={`flex items-center gap-1 sm:gap-3 ${className}`} {...props} />
}

function InputOTPSlot({ index, invalid = false }) {
  const { slots } = useContext(OTPInputContext)
  const { char, hasFakeCaret, isActive } = slots[index]

  return (
    <div
      data-slot="input-otp-slot"
      aria-hidden="true"
      className={`relative grid size-10 place-items-center rounded-lg border text-xl font-bold tabular-nums transition-[border-color,box-shadow,background-color] sm:size-12 ${
        invalid
          ? 'border-red-300 bg-danger-soft text-red-700'
          : isActive
            ? 'border-brand-blue bg-surface text-ink ring-3 ring-blue-100'
            : char
              ? 'border-blue-300 bg-info-soft text-ink'
              : 'border-slate-300 bg-surface text-ink'
      }`}
    >
      {char}
      {hasFakeCaret && <span className="pointer-events-none absolute h-5 w-px animate-pulse bg-ink" />}
    </div>
  )
}

export { InputOTP, InputOTPGroup, InputOTPSlot, REGEXP_ONLY_DIGITS }
