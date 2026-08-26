function Skeleton({ className = '', ...props }) {
  return (
    <div
      data-slot="skeleton"
      className={`animate-pulse rounded-md bg-slate-200 ${className}`}
      {...props}
    />
  )
}

export { Skeleton }
