function AuthShell({ children, navigationLabel = 'Authentication navigation' }) {
  return (
    <div className="flex min-h-[100dvh] flex-col bg-page">
      <a href="#main-content" className="fixed left-4 top-4 z-50 -translate-y-20 rounded-lg bg-brand-navy px-4 py-2 font-semibold text-white transition-transform focus:translate-y-0">
        Skip to content
      </a>

      <header className="border-b border-line bg-white">
        <nav aria-label={navigationLabel} className="mx-auto flex min-h-[4.75rem] w-full max-w-7xl items-center justify-between gap-4 px-5 sm:px-6 lg:px-8">
          <a href="/" aria-label="Return to GarantiyAid home" className="flex min-h-11 items-center gap-3 rounded-md font-bold tracking-tight text-brand-navy focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-blue">
            <img src="/GarantiyAid-logo.svg" alt="" width="512" height="512" className="size-12 shrink-0 object-contain sm:size-14" />
            <span className="text-lg">GarantiyAid</span>
          </a>
          <a href="/" className="ga-btn-secondary min-h-11 px-4 text-sm">Back to public home</a>
        </nav>
      </header>

      <main id="main-content" data-route-focus data-motion-page tabIndex={-1} className="relative flex flex-1 items-center px-4 py-8 outline-none sm:px-6 sm:py-12 lg:px-8">
        <div aria-hidden="true" className="absolute inset-x-0 top-0 h-64 bg-gradient-to-b from-info-soft to-transparent" />
        <div className="relative mx-auto grid w-full max-w-7xl overflow-hidden rounded-2xl border border-line bg-white shadow-lg lg:grid-cols-[minmax(19rem,0.72fr)_minmax(0,1.28fr)]">
          <aside className="hidden bg-brand-navy px-8 py-10 text-white lg:flex lg:flex-col lg:justify-between xl:px-10 xl:py-12" aria-label="Secure portal information">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-blue-200">Authorized access</p>
              <h2 className="mt-4 text-3xl font-bold leading-tight">Secure access for public-service operations.</h2>
              <p className="mt-4 text-base leading-7 text-slate-300">Staff credentials and authenticator verification protect beneficiary and distribution records.</p>
              <ul className="mt-8 space-y-5 text-sm leading-6 text-slate-200">
                {[
                  ['Verified sign-in', 'Password and authenticator checks protect each session.'],
                  ['Role-based workspace', 'Staff only see tools assigned to their official responsibility.'],
                  ['Accountable activity', 'Important security and operational actions are recorded.'],
                ].map(([title, description]) => (
                  <li key={title} className="flex gap-3">
                    <span aria-hidden="true" className="mt-1 grid size-5 shrink-0 place-items-center rounded-full bg-emerald-400/15 text-xs font-bold text-emerald-300">✓</span>
                    <span><strong className="block text-white">{title}</strong><span className="mt-1 block text-slate-300">{description}</span></span>
                  </li>
                ))}
              </ul>
            </div>
            <p className="mt-10 border-t border-white/10 pt-5 text-sm font-semibold text-blue-100">Restricted to authorized personnel</p>
          </aside>

          <div className="flex min-w-0 items-center justify-center bg-white px-3 py-8 sm:px-8 sm:py-10 lg:px-10 xl:px-14">
            {children}
          </div>
        </div>
      </main>

      <footer className="mx-auto flex w-full max-w-7xl flex-col gap-3 px-5 py-6 text-xs text-muted-copy sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
        <p className="font-semibold text-copy">GarantiyAid secure staff portal</p>
        <p>&copy; {new Date().getFullYear()} GarantiyAid · <a href="/privacy" className="font-semibold text-brand-blue hover:text-brand-blue-hover">Privacy Notice</a></p>
      </footer>
    </div>
  )
}

export default AuthShell
