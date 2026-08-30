import { useEffect, useRef, useState } from 'react'
import { getDashboardNavigation, STAFF_ROLE_LABELS } from '../../auth/staffAuth.js'
import { Icon } from '../ui/icon.jsx'
import { LoadingLabel } from '../ui/spinner.jsx'

function staffInitials(name = 'Staff') {
  return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase()
}

function DashboardShell({ breadcrumbs, children, currentPath, onLogout, onNavigate, pageTitle, user }) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const navigationRef = useRef(null)
  const menuButtonRef = useRef(null)
  const closeButtonRef = useRef(null)
  const navigation = getDashboardNavigation(user?.role)
  const roleLabel = STAFF_ROLE_LABELS[user?.role] ?? 'Staff'
  const breadcrumbItems = breadcrumbs ?? ['Operations', pageTitle]

  useEffect(() => {
    const navigationPanel = navigationRef.current
    const desktopQuery = window.matchMedia('(min-width: 1024px)')
    const syncNavigationState = () => { navigationPanel.inert = !desktopQuery.matches && !mobileOpen }
    syncNavigationState()
    desktopQuery.addEventListener('change', syncNavigationState)
    return () => desktopQuery.removeEventListener('change', syncNavigationState)
  }, [mobileOpen])

  useEffect(() => {
    if (!mobileOpen) return undefined

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    requestAnimationFrame(() => closeButtonRef.current?.focus())

    function keepFocusInside(event) {
      if (event.key === 'Escape') {
        event.preventDefault()
        closeMobileNavigation()
        return
      }
      if (event.key !== 'Tab') return

      const focusable = [...navigationRef.current.querySelectorAll('a[href], button:not(:disabled), summary')]
      const first = focusable[0]
      const last = focusable.at(-1)
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last?.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first?.focus()
      }
    }

    document.addEventListener('keydown', keepFocusInside)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', keepFocusInside)
    }
  }, [mobileOpen])

  function closeMobileNavigation(restoreFocus = true) {
    setMobileOpen(false)
    if (restoreFocus) requestAnimationFrame(() => menuButtonRef.current?.focus())
  }

  function navigate(event, href) {
    if (!onNavigate) return
    event.preventDefault()
    closeMobileNavigation(false)
    onNavigate(href)
  }

  async function logout() {
    setIsLoggingOut(true)
    try {
      await onLogout()
    } finally {
      setIsLoggingOut(false)
    }
  }

  return (
    <div className="min-h-[100dvh] bg-page text-ink">
      <a href="#dashboard-content" className="sr-only fixed left-4 top-4 z-[70] rounded-lg bg-white px-4 py-3 font-bold text-brand-blue shadow-lg focus:not-sr-only">
        Skip to main content
      </a>

      {mobileOpen && (
        <button type="button" aria-label="Close navigation" onClick={() => closeMobileNavigation()} className="fixed inset-0 z-40 cursor-pointer bg-slate-950/55 backdrop-blur-[2px] lg:hidden" />
      )}

      <aside ref={navigationRef} id="staff-navigation" role={mobileOpen ? 'dialog' : undefined} aria-modal={mobileOpen ? 'true' : undefined} className={`fixed inset-y-0 left-0 z-50 flex w-72 flex-col bg-brand-navy text-white shadow-2xl transition-[transform,width] duration-200 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'} ${collapsed ? 'lg:w-[4.75rem]' : 'lg:w-64'} lg:translate-x-0 lg:shadow-none`} aria-label={mobileOpen ? 'Staff navigation menu' : 'Authorized staff navigation'}>
        <div className={`flex h-[4.75rem] items-center border-b border-white/10 ${collapsed ? 'lg:justify-center lg:px-2' : 'px-4'}`}>
          <a href="/dashboard" onClick={(event) => navigate(event, '/dashboard')} className="flex min-h-11 min-w-0 items-center gap-3 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
            <img src="/GarantiyAid-logo.svg" alt="" width="512" height="512" className="size-12 shrink-0 object-contain sm:size-14" />
            <span className={`min-w-0 ${collapsed ? 'lg:sr-only' : ''}`}>
              <span className="block truncate text-base font-bold tracking-tight">GarantiyAid</span>
              <span className="mt-0.5 block truncate text-xs font-semibold text-blue-200">Staff operations portal</span>
            </span>
          </a>
          <button ref={closeButtonRef} type="button" onClick={() => closeMobileNavigation()} aria-label="Close navigation" className="ml-auto grid size-11 place-items-center rounded-lg text-blue-100 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-white lg:hidden">
            <Icon name="close" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-5" aria-label={`${roleLabel} navigation`}>
          <p className={`px-3 text-xs font-bold uppercase tracking-[0.12em] text-slate-400 ${collapsed ? 'lg:sr-only' : ''}`}>Workspace</p>
          <ul className="mt-3 space-y-1.5">
            {navigation.map((item) => {
              const active = currentPath === item.href
              return (
                <li key={item.href}>
                  <a href={item.href} onClick={(event) => navigate(event, item.href)} aria-current={active ? 'page' : undefined} title={collapsed ? item.label : undefined} className={`flex min-h-12 items-center gap-3 rounded-lg px-3 text-sm font-semibold transition-[background-color,color,transform] duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${active ? 'bg-brand-blue text-white shadow-sm' : 'text-slate-200 hover:translate-x-0.5 hover:bg-white/10 hover:text-white'} ${collapsed ? 'lg:justify-center lg:px-2' : ''}`}>
                    <Icon name={item.icon} className="size-5 shrink-0" />
                    <span className={collapsed ? 'lg:sr-only' : ''}>{item.label}</span>
                  </a>
                </li>
              )
            })}
          </ul>
        </nav>

        <div className="border-t border-white/10 p-3">
          <div className={`flex items-center gap-3 rounded-lg bg-white/[0.07] p-3 ${collapsed ? 'lg:hidden' : ''}`}>
            <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-full bg-white/10 text-sm font-bold text-white">{staffInitials(user?.fullName)}</span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-bold text-white">{user?.fullName}</span>
              <span className="mt-0.5 block truncate text-xs text-blue-200">{roleLabel}</span>
            </span>
          </div>
          <button type="button" onClick={() => setCollapsed((value) => !value)} aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'} aria-expanded={!collapsed} className="mt-2 hidden min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-lg text-sm font-semibold text-slate-300 hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white lg:flex">
            <Icon name="chevronLeft" className={`size-4 transition-transform ${collapsed ? 'rotate-180' : ''}`} strokeWidth={2} />
            <span className={collapsed ? 'sr-only' : ''}>Collapse</span>
          </button>
        </div>
      </aside>

      <div className={`transition-[padding] duration-200 ${collapsed ? 'lg:pl-[4.75rem]' : 'lg:pl-64'}`}>
        <header className="sticky top-0 z-30 border-b border-line bg-white/95 backdrop-blur-sm">
          <div className="flex min-h-[4.75rem] items-center gap-3 px-4 sm:px-6 lg:px-8">
            <button ref={menuButtonRef} type="button" aria-label="Open navigation" aria-controls="staff-navigation" aria-expanded={mobileOpen} onClick={() => setMobileOpen(true)} className="grid size-11 shrink-0 cursor-pointer place-items-center rounded-lg border border-line bg-white text-brand-navy hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue lg:hidden">
              <Icon name="menu" strokeWidth={2} />
            </button>

            <div className="min-w-0 flex-1">
              <nav aria-label="Breadcrumb" className="hidden sm:block">
                <ol className="flex items-center gap-2 text-xs font-semibold text-muted-copy">
                  {breadcrumbItems.map((item, index, items) => {
                    const label = typeof item === 'string' ? item : item.label
                    const href = typeof item === 'string' ? (index === 0 ? '/dashboard' : undefined) : item.href
                    const current = index === items.length - 1
                    return <li key={`${label}-${index}`} className="flex min-w-0 items-center gap-2">
                      {index > 0 && <span aria-hidden="true" className="text-slate-300">/</span>}
                      {href && !current ? <a href={href} onClick={(event) => navigate(event, href)} className="truncate rounded-sm hover:text-brand-blue focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue">{label}</a> : <span className={current ? 'truncate text-copy' : 'truncate'} aria-current={current ? 'page' : undefined}>{label}</span>}
                    </li>
                  })}
                </ol>
              </nav>
              <p className="truncate text-base font-bold text-ink sm:mt-1">{pageTitle}</p>
            </div>

            <span className="hidden items-center gap-2 rounded-full border border-emerald-200 bg-success-soft px-3 py-2 text-xs font-bold text-brand-green md:inline-flex">
              <span aria-hidden="true" className="ga-live-dot size-2 rounded-full bg-emerald-500" /> Secure session
            </span>

            <details className="group relative">
              <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 rounded-lg border border-line bg-white px-1.5 pr-2 text-copy hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue [&::-webkit-details-marker]:hidden">
                <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-navy text-xs font-bold text-white">{staffInitials(user?.fullName)}</span>
                <span className="hidden min-w-0 xl:block">
                  <span className="block max-w-40 truncate text-sm font-bold text-ink">{user?.fullName}</span>
                  <span className="block max-w-40 truncate text-xs text-muted-copy">{roleLabel}</span>
                </span>
                <Icon name="chevronDown" className="hidden size-4 transition-transform group-open:rotate-180 sm:block" strokeWidth={2} />
              </summary>
              <div className="absolute right-0 mt-2 w-[min(20rem,calc(100vw-2rem))] rounded-xl border border-line bg-white p-4 shadow-lg">
                <p className="truncate font-bold text-ink">{user?.fullName}</p>
                <p className="mt-1 text-sm text-muted-copy">{user?.employeeId} · {roleLabel}</p>
                <div className="my-4 border-t border-line" />
                <p className="flex items-center gap-2 text-sm font-semibold text-brand-green"><span aria-hidden="true" className="ga-live-dot size-2 rounded-full bg-emerald-500" /> Authenticated staff session</p>
                <button type="button" onClick={logout} disabled={isLoggingOut} className="mt-4 min-h-11 w-full cursor-pointer rounded-lg border border-line bg-white px-4 text-sm font-bold text-copy hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue disabled:cursor-not-allowed disabled:opacity-50">
                  {isLoggingOut ? <LoadingLabel>Signing out...</LoadingLabel> : 'Sign out securely'}
                </button>
              </div>
            </details>
          </div>
        </header>

        <main id="dashboard-content" data-route-focus data-motion-page tabIndex={-1} className="mx-auto w-full max-w-[1520px] px-4 py-6 outline-none sm:px-6 lg:px-8 lg:py-8">
          {children}
        </main>
      </div>
    </div>
  )
}

export default DashboardShell
