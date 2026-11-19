import { Skeleton } from './skeleton.jsx'
import { LiquidWaveSpinner } from './liquid-wave-spinner.jsx'

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
    <div className="grid min-h-[100dvh] place-items-center bg-page p-4 sm:p-6" role="status">
      <div className="ga-card-flat grid w-full max-w-xs justify-items-center gap-4 px-6 py-8 text-center text-brand-navy shadow-sm">
        <LiquidWaveSpinner />
        <p className="font-semibold">{label}</p>
      </div>
    </div>
  )
}

function ContentLoader({ title }) {
  return (
    <section className="space-y-5">
      <header className="ga-page-header border-b border-line pb-6">
        <h1 className="ga-page-title">{title}</h1>
        <Skeleton aria-hidden="true" className="mt-3 h-5 w-full max-w-lg" />
      </header>
      <div role="status" className="space-y-5">
        <span className="sr-only">Loading page content...</span>
        <div aria-hidden="true" className="space-y-5">
          <div className="ga-card flex flex-wrap items-center gap-3 p-4 sm:p-5">
            <Skeleton className="h-11 min-w-0 flex-1 basis-40" />
            <Skeleton className="h-11 w-36 max-w-full" />
            <Skeleton className="h-11 w-28 max-w-full" />
          </div>
          <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(22rem,0.9fr)]">
            <div className="ga-card p-5">
              <Skeleton className="h-6 w-44 max-w-full" />
              <div className="mt-5 space-y-4">{Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-16 w-full" />)}</div>
            </div>
            <div className="ga-card p-5">
              <Skeleton className="h-6 w-40 max-w-full" />
              <Skeleton className="mt-5 h-28 w-full" />
              <Skeleton className="mt-4 h-20 w-full" />
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

export { ContentLoader, LoadingLabel, PageLoader, Spinner }
