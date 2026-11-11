import { Icon } from '../ui/icon.jsx'

function AuthShell({ children, navigationLabel = 'Authentication navigation', compact = false }) {
  return (
    <div className="flex min-h-[100dvh] flex-col bg-page">
      <a href="#main-content" className="fixed left-4 top-4 z-50 -translate-y-20 rounded-lg bg-brand-navy px-4 py-2 font-semibold text-white transition-transform focus:translate-y-0">
        Skip to content
      </a>

      <header className="border-b border-line bg-white">
        <nav aria-label={navigationLabel} className="mx-auto flex min-h-[4.75rem] w-full max-w-6xl items-center justify-between gap-2 px-4 sm:gap-4 sm:px-6 lg:px-8">
          <a href="/" aria-label="Return to GarantiyAid home" className="flex min-h-11 items-center gap-2 rounded-md font-bold tracking-tight text-brand-navy focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-blue sm:gap-3">
            <img src="/GarantiyAid-logo.svg" alt="" width="512" height="512" className="size-10 shrink-0 object-contain sm:size-11" />
            <span><span className="block text-lg">GarantiyAid</span><span className="mt-0.5 hidden text-xs font-normal tracking-normal text-muted-copy sm:block">Staff portal</span></span>
          </a>
          <a href="/" className="inline-flex min-h-11 items-center gap-2 rounded-md px-2 text-sm font-semibold text-copy transition-colors hover:text-brand-blue focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue"><Icon name="arrowLeft" className="size-4" />{compact ? 'Home' : 'Public home'}</a>
        </nav>
      </header>

      <main id="main-content" data-route-focus data-motion-page tabIndex={-1} className={`flex flex-1 px-4 py-6 outline-none sm:px-6 sm:py-8 lg:px-8 ${compact ? 'items-start' : 'items-center'}`}>
        <div className={`mx-auto grid w-full overflow-hidden border border-line bg-white ${compact ? 'max-w-xl rounded-sm border-t-4 border-t-brand-navy' : 'max-w-[68rem] rounded-xl shadow-sm lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]'}`}>
          {!compact && <aside className="hidden flex-col justify-between gap-8 bg-brand-navy p-8 text-white lg:flex xl:p-10" aria-label="About the staff workspace">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-blue-200">Staff workspace</p>
              <h2 className="mt-3 max-w-sm text-[1.75rem] font-semibold leading-tight">A workspace for community assistance.</h2>
              <p className="mt-3 max-w-sm text-sm leading-6 text-blue-100">Manage beneficiary records and coordinate each distribution.</p>
            </div>
            <img src="/staff-workspace.svg" alt="" width="400" height="244" className="mx-auto w-full max-w-[22rem]" />
            <div className="flex items-start gap-3 border-t border-white/15 pt-5"><Icon name="security" className="mt-0.5 size-5 shrink-0 text-blue-200" /><p className="text-sm leading-6"><strong className="block font-semibold text-white">For authorized staff</strong><span className="text-blue-100">Use the access assigned to your official role.</span></p></div>
          </aside>}

          <div className={`flex min-w-0 items-center justify-center bg-white py-8 sm:py-10 ${compact ? 'px-5 sm:px-8' : 'px-3 sm:px-10 lg:px-10 xl:px-12'}`}>
            {children}
          </div>
        </div>
      </main>

      <footer className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-5 py-5 text-xs text-muted-copy sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
        <p>&copy; {new Date().getFullYear()} GarantiyAid</p>
        <a href="/privacy" className="inline-flex min-h-6 items-center self-start rounded font-medium text-copy hover:text-brand-blue focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue">Privacy Notice</a>
      </footer>
    </div>
  )
}

export default AuthShell
