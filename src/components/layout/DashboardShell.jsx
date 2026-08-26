import { useState } from 'react'
import { getDashboardNavigation, STAFF_ROLE_LABELS } from '../../auth/staffAuth.js'

const navIcons = {
  overview: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
  security: <><path d="M12 22s8-3.5 8-10V5l-8-3-8 3v7c0 6.5 8 10 8 10Z" /><path d="m9 12 2 2 4-4" /></>,
  reports: <><path d="M4 19.5V4.5A2.5 2.5 0 0 1 6.5 2H20v18H6.5A2.5 2.5 0 0 0 4 22.5" /><path d="M8 7h8M8 11h8M8 15h5" /></>,
  audit: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" /><path d="M14 2v6h6M8 13h8M8 17h5" /></>,
  monitoring: <><path d="M3 12h4l2-5 4 10 2-5h6" /><path d="M3 3v18h18" /></>,
  ledger: <><path d="M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" /><path d="M7 7h10M7 12h4M7 17h4M15 12h2M15 17h2" /></>,
  queue: <><path d="M8 6h13M8 12h13M8 18h13" /><circle cx="3.5" cy="6" r="1" /><circle cx="3.5" cy="12" r="1" /><circle cx="3.5" cy="18" r="1" /></>,
  qr: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><path d="M14 14h3v3h-3zM18 18h3v3h-3zM18 14h3M14 18v3" /></>,
  beneficiaries: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>,
  enrollments: <><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></>,
  programs: <><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v17H6.5A2.5 2.5 0 0 0 4 22.5Z" /><path d="M4 5.5v17M8 8h8M8 12h8M8 16h5" /></>,
  distributions: <><path d="M3 8h18M5 4h14a2 2 0 0 1 2 2v14H3V6a2 2 0 0 1 2-2Z" /><path d="M7 12h3v4H7zM14 12h3v4h-3z" /></>,
  administration: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M17 8h4M19 6v4M16 15h5v6h-5z" /></>,
}

function Icon({ name, className = 'size-5' }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      {navIcons[name] ?? navIcons.overview}
    </svg>
  )
}

function staffInitials(name = 'Staff') {
  return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase()
}

function DashboardShell({ breadcrumbs, children, currentPath, onLogout, onNavigate, pageTitle, user }) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const navigation = getDashboardNavigation(user?.role)
  const roleLabel = STAFF_ROLE_LABELS[user?.role] ?? 'Staff'

  function navigate(event, href) {
    if (!onNavigate) return
    event.preventDefault()
    setMobileOpen(false)
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
        <button type="button" aria-label="Close navigation" onClick={() => setMobileOpen(false)} className="fixed inset-0 z-40 cursor-pointer bg-slate-950/50 lg:hidden" />
      )}

      <aside className={`fixed inset-y-0 left-0 z-50 flex w-72 flex-col bg-brand-navy text-white shadow-2xl transition-[transform,width] duration-200 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'} ${collapsed ? 'lg:w-[4.75rem]' : 'lg:w-64'} lg:translate-x-0 lg:shadow-none`} aria-label="Authorized staff navigation">
        <div className={`flex h-[4.75rem] items-center border-b border-white/10 ${collapsed ? 'lg:justify-center lg:px-2' : 'px-4'}`}>
          <a href="/dashboard" onClick={(event) => navigate(event, '/dashboard')} className="flex min-h-11 min-w-0 items-center gap-3 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
            <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-lg bg-white font-bold tracking-tight text-brand-navy">GA</span>
            <span className={`min-w-0 ${collapsed ? 'lg:sr-only' : ''}`}>
              <span className="block truncate text-base font-bold tracking-tight">GarantiyAid</span>
              <span className="mt-0.5 block truncate text-xs font-semibold text-blue-200">Staff operations portal</span>
            </span>
          </a>
          <button type="button" onClick={() => setMobileOpen(false)} aria-label="Close navigation" className="ml-auto grid size-11 place-items-center rounded-lg text-blue-100 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-white lg:hidden">
            <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="m6 6 12 12M18 6 6 18" /></svg>
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-5" aria-label={`${roleLabel} navigation`}>
          <p className={`px-3 text-xs font-bold uppercase tracking-[0.12em] text-slate-400 ${collapsed ? 'lg:sr-only' : ''}`}>Workspace</p>
          <ul className="mt-3 space-y-1.5">
            {navigation.map((item) => {
              const active = currentPath === item.href
              return (
                <li key={item.href}>
                  <a href={item.href} onClick={(event) => navigate(event, item.href)} aria-current={active ? 'page' : undefined} title={collapsed ? item.label : undefined} className={`flex min-h-12 items-center gap-3 rounded-lg px-3 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${active ? 'bg-brand-blue text-white shadow-sm' : 'text-slate-200 hover:bg-white/10 hover:text-white'} ${collapsed ? 'lg:justify-center lg:px-2' : ''}`}>
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
            <svg aria-hidden="true" viewBox="0 0 24 24" className={`size-4 transition-transform ${collapsed ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
            <span className={collapsed ? 'sr-only' : ''}>Collapse</span>
          </button>
        </div>
      </aside>

      <div className={`transition-[padding] duration-200 ${collapsed ? 'lg:pl-[4.75rem]' : 'lg:pl-64'}`}>
        <header className="sticky top-0 z-30 border-b border-line bg-white/95 backdrop-blur-sm">
          <div className="flex min-h-[4.75rem] items-center gap-3 px-4 sm:px-6 lg:px-8">
            <button type="button" aria-label="Open navigation" aria-expanded={mobileOpen} onClick={() => setMobileOpen(true)} className="grid size-11 shrink-0 cursor-pointer place-items-center rounded-lg border border-line bg-white text-brand-navy hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue lg:hidden">
              <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
            </button>

            <div className="min-w-0 flex-1">
              <nav aria-label="Breadcrumb" className="hidden sm:block">
                <ol className="flex items-center gap-2 text-xs font-semibold text-muted-copy">
                  {(breadcrumbs ?? ['Operations', pageTitle]).map((item, index, items) => (
                    <li key={`${item}-${index}`} className="flex min-w-0 items-center gap-2">
                      {index > 0 && <span aria-hidden="true" className="text-slate-300">/</span>}
                      <span className={index === items.length - 1 ? 'truncate text-copy' : 'truncate'} aria-current={index === items.length - 1 ? 'page' : undefined}>{item}</span>
                    </li>
                  ))}
                </ol>
              </nav>
              <p className="truncate text-base font-bold text-ink sm:mt-1">{pageTitle}</p>
            </div>

            <span className="hidden items-center gap-2 rounded-full border border-emerald-200 bg-success-soft px-3 py-2 text-xs font-bold text-brand-green md:inline-flex">
              <span aria-hidden="true" className="size-2 rounded-full bg-emerald-500" /> Secure session
            </span>

            <details className="group relative">
              <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 rounded-lg border border-line bg-white px-1.5 pr-2 text-copy hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue [&::-webkit-details-marker]:hidden">
                <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-navy text-xs font-bold text-white">{staffInitials(user?.fullName)}</span>
                <span className="hidden min-w-0 xl:block">
                  <span className="block max-w-40 truncate text-sm font-bold text-ink">{user?.fullName}</span>
                  <span className="block max-w-40 truncate text-xs text-muted-copy">{roleLabel}</span>
                </span>
                <svg aria-hidden="true" viewBox="0 0 24 24" className="hidden size-4 transition-transform group-open:rotate-180 sm:block" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
              </summary>
              <div className="absolute right-0 mt-2 w-[min(20rem,calc(100vw-2rem))] rounded-xl border border-line bg-white p-4 shadow-lg">
                <p className="truncate font-bold text-ink">{user?.fullName}</p>
                <p className="mt-1 text-sm text-muted-copy">{user?.employeeId} · {roleLabel}</p>
                <div className="my-4 border-t border-line" />
                <p className="flex items-center gap-2 text-sm font-semibold text-brand-green"><span aria-hidden="true" className="size-2 rounded-full bg-emerald-500" /> Authenticated staff session</p>
                <button type="button" onClick={logout} disabled={isLoggingOut} className="mt-4 min-h-11 w-full cursor-pointer rounded-lg border border-line bg-white px-4 text-sm font-bold text-copy hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue disabled:cursor-not-allowed disabled:opacity-50">
                  {isLoggingOut ? 'Signing out…' : 'Sign out securely'}
                </button>
              </div>
            </details>
          </div>
        </header>

        <main id="dashboard-content" data-route-focus tabIndex={-1} className="mx-auto w-full max-w-[1520px] px-4 py-6 outline-none sm:px-6 lg:px-8 lg:py-8">
          {children}
        </main>
      </div>
    </div>
  )
}

export default DashboardShell
