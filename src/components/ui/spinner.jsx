function Spinner({ className = '', label = 'Loading', ...props }) {
  const decorative = props['aria-hidden'] === true || props['aria-hidden'] === 'true'

  return (
    <svg
      data-slot="spinner"
      viewBox="0 0 24 24"
      fill="none"
      role={decorative ? undefined : 'status'}
      aria-label={decorative ? undefined : label}
      className={`size-4 shrink-0 animate-spin motion-reduce:animate-none ${className}`}
      {...props}
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" className="opacity-25" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

function LoadingLabel({ children }) {
  return <span className="inline-flex items-center justify-center gap-2"><Spinner aria-hidden="true" />{children}</span>
}

function PageLoader({ label = 'Loading secure workspace...' }) {
  return (
    <div className="grid min-h-[100dvh] place-items-center bg-page p-6 text-center" role="status" aria-live="polite" aria-busy="true">
      <div className="ga-card-flat flex min-w-64 items-center justify-center gap-3 px-6 py-5 text-brand-navy shadow-sm">
        <Spinner aria-hidden="true" className="size-5 text-brand-blue" />
        <span className="font-bold">{label}</span>
      </div>
    </div>
  )
}

export { LoadingLabel, PageLoader, Spinner }
