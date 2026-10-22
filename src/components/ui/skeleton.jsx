function Skeleton({ className = '', ...props }) {
  return (
    <div
      data-slot="skeleton"
      className={`animate-pulse rounded-md bg-slate-200 motion-reduce:animate-none ${className}`}
      {...props}
    />
  )
}

export { Skeleton }
