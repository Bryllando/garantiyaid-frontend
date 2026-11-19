function Skeleton({ className = '', ...props }) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden="true"
      className={`ga-skeleton rounded-md ${className}`}
      {...props}
    />
  )
}

function SkeletonRows({ label, rows = 3, className = '' }) {
  return (
    <div role="status" aria-label={label} className={className}>
      <div className="divide-y divide-line" aria-hidden="true">
        {Array.from({ length: rows }, (_, index) => (
          <div key={index} className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-4 py-4 sm:px-5">
            <div className="min-w-0 space-y-2"><Skeleton className="h-4 w-44 max-w-full" /><Skeleton className="h-3 w-28 max-w-full" /></div>
            <Skeleton className="h-8 w-16 sm:w-24" />
          </div>
        ))}
      </div>
    </div>
  )
}

export { Skeleton, SkeletonRows }
