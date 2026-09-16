import { useEffect, useRef, useState } from 'react'
import { getDashboardNavigation, getStoredStaffSession, STAFF_ROLE_LABELS } from '../../auth/staffAuth.js'
import { Icon } from '../ui/icon.jsx'
import { LoadingLabel } from '../ui/spinner.jsx'
import { useMotionEntry } from '../ui/use-motion-entry.js'
import { PhilippineClock, StaffNotificationCenter } from './StaffHeaderActions.jsx'
import { getPhilippineDayPeriod } from './philippine-day-period.js'
import StaffAiAssistant from '../assistant/StaffAiAssistant.jsx'

function staffInitials(name = 'Staff') {
  return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase()
}

function DashboardShell({ breadcrumbs, children, currentPath, onLogout, onNavigate, pageTitle, user }) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [dayPeriod, setDayPeriod] = useState(getPhilippineDayPeriod)
  const navigationRef = useRef(null)
  const menuButtonRef = useRef(null)
  const closeButtonRef = useRef(null)
  const profileMenuRef = useRef(null)
  const headerRef = useMotionEntry('staff-header')
  const navigation = getDashboardNavigation(user?.role)
  const roleLabel = STAFF_ROLE_LABELS[user?.role] ?? 'Staff'
  const breadcrumbItems = breadcrumbs ?? ['Operations', pageTitle]
  const accessToken = getStoredStaffSession().accessToken

  useEffect(() => {
    function dismissProfile(event) {
      const menu = profileMenuRef.current
      if (!menu?.open) return
      if (event.key === 'Escape') {
        event.preventDefault()
        menu.open = false
        if (menu.contains(document.activeElement)) menu.querySelector('summary').focus()
      } else if (event.type !== 'keydown' && !menu.contains(event.target)) {
        menu.open = false
      }
    }
    document.addEventListener('keydown', dismissProfile)
    document.addEventListener('pointerdown', dismissProfile)
    document.addEventListener('focusin', dismissProfile)
    return () => {
      document.removeEventListener('keydown', dismissProfile)
      document.removeEventListener('pointerdown', dismissProfile)
      document.removeEventListener('focusin', dismissProfile)
    }
  }, [])

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
      if (event.defaultPrevented) return
      if (event.key === 'Escape') {
        event.preventDefault()
        closeMobileNavigation()
        return
      }
      if (event.key !== 'Tab') return

      const focusable = [...navigationRef.current.querySelectorAll('a[href], button:not(:disabled), summary')]
        .filter((element) => element.getClientRects().length > 0)
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
    if (profileMenuRef.current) profileMenuRef.current.open = false
    setMobileOpen(false)
    if (restoreFocus) requestAnimationFrame(() => menuButtonRef.current?.focus())
  }

  function navigate(event, href) {
    if (!onNavigate) return
    event.preventDefault()
    if (profileMenuRef.current) profileMenuRef.current.open = false
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
    <div className="ga-staff-shell min-h-[100dvh] bg-page text-ink">
      <a href="#dashboard-content" className="sr-only fixed left-4 top-4 z-[70] rounded-lg bg-white px-4 py-3 font-bold text-brand-blue shadow-lg focus:not-sr-only">
        Skip to main content
      </a>

      <button type="button" tabIndex={-1} aria-hidden={!mobileOpen} data-open={mobileOpen} aria-label="Close navigation" onClick={() => closeMobileNavigation()} className="ga-sidebar-backdrop fixed inset-0 z-40 cursor-pointer bg-brand-navy/55 backdrop-blur-[2px] lg:hidden" />

      <aside ref={navigationRef} id="staff-navigation" data-collapsed={collapsed} role={mobileOpen ? 'dialog' : undefined} aria-modal={mobileOpen ? 'true' : undefined} className={`ga-staff-sidebar fixed inset-y-0 left-0 z-50 flex w-72 max-w-[calc(100vw-2rem)] flex-col text-white ${mobileOpen ? 'translate-x-0' : '-translate-x-full'} ${collapsed ? 'lg:w-[5.25rem]' : 'lg:w-[17rem]'} lg:translate-x-0`} aria-label={mobileOpen ? 'Staff navigation menu' : 'Authorized staff navigation'}>
        <div className="flex h-[5.5rem] shrink-0 items-center border-b border-white/15 px-5">
          <a href="/dashboard" onClick={(event) => navigate(event, '/dashboard')} className="flex min-h-11 min-w-0 items-center gap-3 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-white shadow-sm"><img src="/GarantiyAid-logo.svg" alt="" width="512" height="512" className="size-10 object-contain" /></span>
            <span className={`ga-sidebar-label min-w-0 ${collapsed ? 'lg:sr-only' : ''}`}>
              <span className="block truncate text-xl font-bold tracking-tight">GarantiyAid</span>
              <span className="mt-0.5 block truncate text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-blue-100">Staff operations portal</span>
            </span>
          </a>
          <button ref={closeButtonRef} type="button" onClick={() => closeMobileNavigation()} aria-label="Close navigation" className="ml-auto grid size-11 place-items-center rounded-lg text-blue-100 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-white lg:hidden">
            <Icon name="close" />
          </button>
        </div>

        <button type="button" onClick={() => { if (profileMenuRef.current) profileMenuRef.current.open = false; setCollapsed((value) => !value) }} aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'} aria-controls="staff-navigation" aria-expanded={!collapsed} title={collapsed ? 'Expand navigation' : 'Collapse navigation'} className="ga-sidebar-toggle absolute -right-[1.375rem] top-[6.25rem] hidden size-11 items-center justify-center rounded-full border-4 border-white bg-shell-blue text-white shadow-sm transition-colors hover:bg-brand-blue-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue lg:flex">
          <Icon name="chevronLeft" className={`size-4 ${collapsed ? 'rotate-180' : ''}`} strokeWidth={2.5} />
        </button>

        <nav className="ga-sidebar-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-6" aria-label={`${roleLabel} navigation`}>
          <p className={`overflow-hidden whitespace-nowrap px-3 text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-blue-100 ${collapsed ? 'lg:invisible' : ''}`}>Your workspace</p>
          <ul className="mt-4 space-y-1">
            {navigation.map((item) => {
              const active = currentPath === item.href || currentPath?.startsWith(`${item.href}/`)
              return (
                <li key={item.href}>
                  <a href={item.href} onClick={(event) => navigate(event, item.href)} aria-current={active ? 'page' : undefined} title={collapsed ? item.label : undefined} className={`ga-sidebar-link relative flex min-h-11 items-center gap-3 rounded-lg border px-3 py-2.5 text-[0.8125rem] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${active ? 'border-white/25 bg-white/15 font-semibold text-white' : 'border-transparent font-medium text-blue-50 hover:border-white/10 hover:bg-white/10 hover:text-white'} ${collapsed ? 'lg:px-5' : ''}`}>
                    <Icon name={item.icon} className="size-[1.125rem] shrink-0" strokeWidth={active ? 2 : 1.8} />
                    <span className={`ga-sidebar-label min-w-0 flex-1 overflow-hidden text-ellipsis ${collapsed ? 'lg:sr-only' : ''}`}>{item.label}</span>
                    {active && <Icon name="chevronRight" className={`size-3.5 shrink-0 text-blue-100 ${collapsed ? 'lg:hidden' : ''}`} />}
                  </a>
                </li>
              )
            })}
          </ul>
        </nav>

        <div className="shrink-0 border-t border-white/15 p-3">
          <details ref={profileMenuRef} className="ga-profile-menu group relative">
            <summary aria-label={`Open account menu for ${user?.fullName ?? 'staff'}`} title={collapsed ? `${user?.fullName ?? 'Staff'} · Account & security` : undefined} className={`ga-sidebar-account block cursor-pointer list-none rounded-xl border border-white/20 bg-white/10 p-3 hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white [&::-webkit-details-marker]:hidden ${collapsed ? 'lg:border-transparent lg:bg-transparent lg:p-1' : ''}`}>
              <span className="flex items-center gap-3">
                <span aria-hidden="true" className="grid size-11 shrink-0 place-items-center rounded-full border border-white/40 bg-white text-sm font-bold text-shell-blue ring-4 ring-white/10">{staffInitials(user?.fullName)}</span>
                <span className={`ga-sidebar-label min-w-0 ${collapsed ? 'lg:sr-only' : ''}`}>
                  <span className="block break-words text-sm font-semibold leading-5 text-white">{user?.fullName ?? 'Staff account'}</span>
                  <span className="mt-1 block text-xs leading-4 text-blue-100">{roleLabel}</span>
                </span>
              </span>
              <span className={`mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.6875rem] text-blue-100 ${collapsed ? 'lg:hidden' : ''}`}>
                <Icon name="security" className="size-3.5" /> Signed in {user?.employeeId && <span className="ml-auto break-all font-mono">{user.employeeId}</span>}
              </span>
              <span className={`mt-3 flex items-center justify-between border-t border-white/15 pt-3 text-xs font-semibold text-white ${collapsed ? 'lg:hidden' : ''}`}>
                My account <Icon name="chevronDown" className="size-4 rotate-180 transition-transform group-open:rotate-0" />
              </span>
            </summary>
            <div className={`ga-profile-panel absolute bottom-full left-0 z-10 mb-3 max-h-[calc(100dvh-14rem)] w-[min(20rem,calc(100vw-2.5rem))] overflow-y-auto overscroll-contain rounded-2xl border border-line bg-white text-ink shadow-lg ${collapsed ? 'lg:bottom-0 lg:left-[calc(100%+1rem)] lg:mb-0 lg:max-h-[calc(100dvh-2rem)]' : ''}`}>
              <div className="border-b border-line bg-info-soft px-4 py-3">
                <p className="text-sm font-semibold text-ink">My account</p>
                <p className="mt-0.5 text-xs text-muted-copy">Manage your profile and sign-in security.</p>
              </div>
              <div className="p-2">
                <a href="/account?section=profile" onClick={(event) => navigate(event, '/account?section=profile')} className="flex min-h-14 w-full items-center gap-3 rounded-lg px-3 text-sm font-semibold text-ink transition-colors hover:bg-info-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue">
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-info-soft text-brand-blue"><Icon name="profile" className="size-[1.125rem]" /></span>
                  <span>Personal information<span className="mt-0.5 block text-xs font-normal text-muted-copy">Your profile and contact details</span></span>
                  <Icon name="chevronRight" className="ml-auto size-4 shrink-0 text-muted-copy" />
                </a>
                <a href="/account?section=password" onClick={(event) => navigate(event, '/account?section=password')} className="flex min-h-14 w-full items-center gap-3 rounded-lg px-3 text-sm font-semibold text-ink transition-colors hover:bg-info-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue">
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-info-soft text-brand-blue"><Icon name="security" className="size-[1.125rem]" /></span>
                  <span>Password & security<span className="mt-0.5 block text-xs font-normal text-muted-copy">Password and account protection</span></span>
                  <Icon name="chevronRight" className="ml-auto size-4 shrink-0 text-muted-copy" />
                </a>
                <div className="mx-3 my-2 border-t border-line" />
                <button type="button" onClick={logout} disabled={isLoggingOut} className="flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-lg px-3 text-sm font-semibold text-brand-red transition-colors hover:bg-danger-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue disabled:cursor-not-allowed disabled:opacity-50">
                  <Icon name="logout" className="size-[1.125rem] shrink-0" /> {isLoggingOut ? <LoadingLabel>Signing out...</LoadingLabel> : 'Sign out securely'}
                </button>
              </div>
            </div>
          </details>
        </div>
      </aside>

      <div className={`ga-shell-content ${collapsed ? 'lg:pl-[5.25rem]' : 'lg:pl-[17rem]'}`}>
        <header className="ga-staff-header sticky top-0 z-30 border-b border-line bg-shell-header">
          <div ref={headerRef} className="flex min-h-[5.5rem] flex-wrap items-center gap-x-4 gap-y-3 px-4 py-4 sm:px-6 lg:px-8">
            <button ref={menuButtonRef} type="button" aria-label="Open navigation" aria-controls="staff-navigation" aria-expanded={mobileOpen} onClick={() => setMobileOpen(true)} className="grid size-11 shrink-0 cursor-pointer place-items-center rounded-lg border border-line bg-white text-brand-navy hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue lg:hidden">
              <Icon name="menu" strokeWidth={2} />
            </button>

            <div className="min-w-0 flex-[1_1_13rem]">
              <p className="break-words text-base font-normal leading-snug tracking-tight text-ink sm:text-lg">Good day, <span className="font-semibold">{user?.fullName?.trim() || 'Staff'}.</span><span role="img" aria-label={`${dayPeriod.label} in Philippine time`} title={`${dayPeriod.label} · Philippine time`} className="ml-2 inline-block align-text-bottom"><Icon name={dayPeriod.icon} className={`size-6 ${dayPeriod.color}`} /></span></p>
              <nav aria-label="Breadcrumb">
                <ol className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-medium text-muted-copy">
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
            </div>

            <div className="ml-auto flex w-full min-w-0 items-center gap-3 md:w-auto md:max-w-full">
              <PhilippineClock onDayPeriodChange={setDayPeriod} />
              <StaffNotificationCenter accessToken={accessToken} onNavigate={onNavigate} />
            </div>
          </div>
        </header>

        <main id="dashboard-content" data-route-focus data-motion-page tabIndex={-1} className="mx-auto w-full max-w-[1520px] px-4 py-6 outline-none sm:px-6 lg:px-8 lg:py-8">
          {children}
        </main>
      </div>
      <StaffAiAssistant key={`${user?.userId}:${user?.role}:${user?.barangayId}`} accessToken={accessToken} onNavigate={onNavigate} onSessionExpired={onLogout} user={user} />
    </div>
  )
}

export default DashboardShell
