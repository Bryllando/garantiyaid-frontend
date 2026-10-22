import { Skeleton } from './skeleton.jsx'

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

function ContentLoader({ label = 'Loading page content...' }) {
  return (
    <section className="space-y-5" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">{label}</span>
      <div aria-hidden="true" className="space-y-5">
        <div className="border-b border-line pb-6">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="mt-3 h-8 w-72 max-w-full" />
          <Skeleton className="mt-3 h-4 w-full max-w-xl" />
        </div>
        <div className="ga-card flex flex-wrap items-center gap-3 p-4 sm:p-5">
          <Skeleton className="h-11 min-w-40 flex-1" />
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
    </section>
  )
}

export { ContentLoader, LoadingLabel, PageLoader, Spinner }
