import { useContext, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { getDashboardNavigation, getStoredStaffSession, STAFF_ROLE_LABELS } from '../../auth/staffAuth.js'
import { Icon } from '../ui/icon.jsx'
import { LoadingLabel } from '../ui/spinner.jsx'
import { useMotionEntry } from '../ui/use-motion-entry.js'
import { PhilippineClock, StaffNotificationCenter } from './StaffHeaderActions.jsx'
import { getPhilippineDayPeriod } from './philippine-day-period.js'
import StaffAiAssistant from '../assistant/StaffAiAssistant.jsx'
import { StaffShellContext } from './staff-shell-context.js'
import { ConfirmationDialog } from '../ui/confirmation-dialog.jsx'

function staffInitials(name = 'Staff') {
  return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase()
}

function PageShellDetails({ breadcrumbs, children, currentPath, pageTitle, setPageDetails, showAssistant }) {
  const detailsKey = JSON.stringify({ breadcrumbs, currentPath, pageTitle, showAssistant })
  useLayoutEffect(() => {
    setPageDetails((previous) => previous?.key === detailsKey ? previous : {
      key: detailsKey, breadcrumbs, currentPath, pageTitle, showAssistant,
    })
  }, [breadcrumbs, currentPath, detailsKey, pageTitle, setPageDetails, showAssistant])
  return children
}

function DashboardShell({ breadcrumbs, children, currentPath, onLogout, onNavigate, pageTitle, showAssistant = true, user }) {
  const setPageDetails = useContext(StaffShellContext)
  if (setPageDetails) return <PageShellDetails breadcrumbs={breadcrumbs} currentPath={currentPath} pageTitle={pageTitle} setPageDetails={setPageDetails} showAssistant={showAssistant}>{children}</PageShellDetails>
  return <DashboardShellFrame breadcrumbs={breadcrumbs} currentPath={currentPath} onLogout={onLogout} onNavigate={onNavigate} pageTitle={pageTitle} showAssistant={showAssistant} user={user}>{children}</DashboardShellFrame>
}

function DashboardShellFrame({ breadcrumbs, children, currentPath, onLogout, onNavigate, pageTitle, showAssistant = true, user }) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [unsavedLogout, setUnsavedLogout] = useState(false)
  const [assistantOpen, setAssistantOpen] = useState(false)
  const [expandedPath, setExpandedPath] = useState(null)
  const assistantLauncherRef = useRef(null)
  const assistantHistoryRef = useRef(null)
  const assistantRestoreFocus = useRef(false)
  const assistantReturnPath = useRef('/dashboard')
  const shellContentRef = useRef(null)
  const [dayPeriod, setDayPeriod] = useState(() => getPhilippineDayPeriod())
  const navigationRef = useRef(null)
  const menuButtonRef = useRef(null)
  const closeButtonRef = useRef(null)
  const profileMenuRef = useRef(null)
  const headerRef = useMotionEntry('staff-header')
  const navigation = getDashboardNavigation(user?.role)
  const sectionPath = currentPath?.split(/[?#]/)[0]
  const assistantRoute = sectionPath === '/assistant'
  const assistantPage = assistantRoute || expandedPath === currentPath
  // A real navigation closes the expanded window; resizing never navigates.
  if (expandedPath !== null && expandedPath !== currentPath) setExpandedPath(null)
  const activeGroup = navigation.find((item) => item.children?.some((child) => sectionPath === child.href || sectionPath?.startsWith(`${child.href}/`)))?.label ?? null
  const [groupChoice, setGroupChoice] = useState(null)
  const expandedGroup = groupChoice?.path === currentPath ? groupChoice.label : activeGroup
  const roleLabel = STAFF_ROLE_LABELS[user?.role] ?? 'Staff'
  const barangayLabel = user?.barangay?.barangayName
  const breadcrumbItems = breadcrumbs ?? ['Operations', pageTitle]
  const accessToken = getStoredStaffSession().accessToken

  useEffect(() => {
    if (!assistantRoute) assistantReturnPath.current = window.location.pathname + window.location.search + window.location.hash
  }, [assistantRoute, currentPath])

  useLayoutEffect(() => {
    if (!assistantPage && !assistantOpen && assistantRestoreFocus.current && assistantLauncherRef.current) {
      // Restore after route navigation's focus handling when leaving /assistant.
      const frame = requestAnimationFrame(() => {
        assistantRestoreFocus.current = false
        assistantLauncherRef.current?.focus({ preventScroll: true })
      })
      return () => cancelAnimationFrame(frame)
    }
  }, [assistantPage, assistantOpen, showAssistant])

  useLayoutEffect(() => {
    const header = headerRef.current.parentElement
    function placeAssistant() {
      const bounds = header.getBoundingClientRect()
      shellContentRef.current.style.setProperty('--assistant-left', `${bounds.left}px`)
      shellContentRef.current.style.setProperty('--assistant-top', `${bounds.height}px`)
    }
    placeAssistant()
    const observer = new ResizeObserver(placeAssistant)
    observer.observe(header)
    return () => observer.disconnect()
  }, [headerRef])

  function expandAssistant() {
    setAssistantOpen(true)
    setExpandedPath(currentPath)
  }

  function compactAssistant() {
    setAssistantOpen(true)
    setExpandedPath(null)
    if (assistantRoute) onNavigate?.(assistantReturnPath.current)
  }

  function minimizeAssistant() {
    assistantRestoreFocus.current = true
    setAssistantOpen(false)
    setExpandedPath(null)
    if (assistantRoute) onNavigate?.(assistantReturnPath.current)
  }

  function navigateFromAssistant(path) {
    setAssistantOpen(false)
    setExpandedPath(null)
    onNavigate?.(path)
  }

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
    const syncNavigationState = () => {
      navigationPanel.inert = !desktopQuery.matches && !mobileOpen
      if (desktopQuery.matches && mobileOpen) {
        setMobileOpen(false)
        if (collapsed) setGroupChoice({ path: currentPath, label: null })
      }
    }
    syncNavigationState()
    desktopQuery.addEventListener('change', syncNavigationState)
    return () => desktopQuery.removeEventListener('change', syncNavigationState)
  }, [collapsed, currentPath, mobileOpen])

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
        .filter((element) => element.getClientRects().length > 0
          && !element.closest('[inert]')
          && (element.tagName === 'SUMMARY' || !element.closest('details:not([open])')))
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
    if (!onNavigate || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return
    event.preventDefault()
    if (profileMenuRef.current) profileMenuRef.current.open = false
    closeMobileNavigation(false)
    setExpandedPath(null)
    onNavigate(href)
  }

  function toggleNavigationGroup(label) {
    if (profileMenuRef.current) profileMenuRef.current.open = false
    if (collapsed && window.matchMedia('(min-width: 1024px)').matches) {
      setCollapsed(false)
      setGroupChoice({ path: currentPath, label })
    } else {
      setGroupChoice({ path: currentPath, label: expandedGroup === label ? null : label })
    }
  }

  async function logout() {
    setIsLoggingOut(true)
    try {
      if (assistantHistoryRef.current?.hasUnsaved() && !await assistantHistoryRef.current.flush()) {
        if (profileMenuRef.current) profileMenuRef.current.open = false
        setMobileOpen(false)
        setAssistantOpen(true)
        setUnsavedLogout(true)
        return
      }
      await onLogout()
    } finally {
      setIsLoggingOut(false)
    }
  }

  return (
    <div className="ga-staff-shell min-h-[100dvh] bg-page text-ink">
      <a href={assistantPage ? '#garantiyaid-ai-panel' : '#dashboard-content'} className="sr-only fixed left-4 top-4 z-[70] rounded-lg bg-white px-4 py-3 font-bold text-brand-blue shadow-lg focus:not-sr-only">
        Skip to main content
      </a>

      <button type="button" tabIndex={-1} aria-hidden={!mobileOpen} data-open={mobileOpen} aria-label="Close navigation" onClick={() => closeMobileNavigation()} className="ga-sidebar-backdrop fixed inset-0 z-40 cursor-pointer bg-brand-navy/55 backdrop-blur-[2px] lg:hidden" />

      <aside ref={navigationRef} id="staff-navigation" data-collapsed={collapsed} role={mobileOpen ? 'dialog' : undefined} aria-modal={mobileOpen ? 'true' : undefined} className={`ga-staff-sidebar fixed inset-y-0 left-0 z-50 flex w-72 max-w-[calc(100vw-2rem)] flex-col text-white ${mobileOpen ? 'translate-x-0' : '-translate-x-full'} ${collapsed ? 'lg:w-[5.25rem]' : 'lg:w-72'} lg:translate-x-0`} aria-label={mobileOpen ? 'Staff navigation menu' : 'Authorized staff navigation'}>
        <div className="flex h-24 shrink-0 items-center px-5">
          <a href="/dashboard" onClick={(event) => navigate(event, '/dashboard')} aria-label="GarantiyAid overview" className="flex min-h-11 min-w-0 items-center gap-3 overflow-hidden rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-white shadow-sm"><img src="/GarantiyAid-logo.svg" alt="" width="512" height="512" className="size-10 object-contain" /></span>
            <span className="ga-sidebar-label shrink-0 whitespace-nowrap">
              <span className="block text-[1.375rem] font-semibold tracking-tight">GarantiyAid</span>
              <span className="mt-0.5 block text-xs text-blue-100">Staff workspace</span>
            </span>
          </a>
          <button ref={closeButtonRef} type="button" onClick={() => closeMobileNavigation()} aria-label="Close navigation" className="ml-auto grid size-11 shrink-0 place-items-center rounded-full text-blue-100 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-white lg:hidden">
            <Icon name="close" />
          </button>
        </div>

        <nav className="ga-sidebar-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-6" aria-label={`${roleLabel} navigation`}>
          <div className="relative flex min-h-11 items-center overflow-hidden">
            <p className="ga-sidebar-section-label">General</p>
            <button type="button" onClick={() => { if (profileMenuRef.current) profileMenuRef.current.open = false; setCollapsed(!collapsed); setGroupChoice({ path: currentPath, label: collapsed ? activeGroup : null }) }} aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'} aria-controls="staff-navigation" aria-expanded={!collapsed} title={collapsed ? 'Expand navigation' : 'Collapse navigation'} className="ga-sidebar-toggle absolute right-0 hidden size-11 shrink-0 items-center justify-center rounded-full text-blue-100 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-white lg:flex">
              <Icon name="chevronLeft" className={`size-4 ${collapsed ? 'rotate-180' : ''}`} strokeWidth={2.5} />
            </button>
          </div>
          <ul className="space-y-1">
            {navigation.map((item) => {
              const active = item.href && (sectionPath === item.href || sectionPath?.startsWith(`${item.href}/`))
              if (item.children) {
                const open = expandedGroup === item.label
                const groupActive = activeGroup === item.label
                const submenuId = `staff-nav-${item.label.toLowerCase().replaceAll(/[^a-z]+/g, '-')}`
                return <li key={item.label}>
                  {item.section && <p className="ga-sidebar-section-label ga-sidebar-section-heading">{item.section}</p>}
                  <button type="button" onClick={() => toggleNavigationGroup(item.label)} aria-label={item.label} aria-expanded={open} aria-controls={submenuId} data-active={groupActive} title={collapsed ? item.label : undefined} className="ga-sidebar-link ga-sidebar-parent">
                    <Icon name={item.icon} className="size-5 shrink-0" />
                    <span className="ga-sidebar-label min-w-0 flex-1">{item.label}</span>
                    <Icon name="chevronDown" className={`ga-sidebar-label size-4 shrink-0 ${open ? 'rotate-180' : ''}`} />
                  </button>
                  <div id={submenuId} data-open={open} aria-hidden={!open} inert={!open} className="ga-sidebar-subnav">
                    <ul className="ga-sidebar-subnav-list min-h-0 overflow-hidden">
                      {item.children.map((child) => {
                        const childActive = sectionPath === child.href || sectionPath?.startsWith(`${child.href}/`)
                        return <li key={child.href}><a href={child.href} onClick={(event) => navigate(event, child.href)} aria-current={childActive ? 'page' : undefined} className="ga-sidebar-link ga-sidebar-child"><span>{child.label}</span></a></li>
                      })}
                    </ul>
                  </div>
                </li>
              }
              return (
                <li key={item.href}>
                  <a href={item.href} onClick={(event) => navigate(event, item.href)} aria-current={active ? 'page' : undefined} aria-label={item.label} title={collapsed ? item.label : undefined} className="ga-sidebar-link ga-sidebar-parent">
                    <Icon name={item.icon} className="size-5 shrink-0" />
                    <span className="ga-sidebar-label min-w-0 flex-1">{item.label}</span>
                  </a>
                </li>
              )
            })}
          </ul>
        </nav>

        <div className="ga-sidebar-footer relative shrink-0 border-t border-white/15 p-3">
          <details ref={profileMenuRef} className="ga-profile-menu group relative">
            <summary aria-label={`Open account menu for ${user?.fullName ?? 'staff'}`} title={collapsed ? `${user?.fullName ?? 'Staff'} · Account & security` : undefined} className={`ga-sidebar-account block cursor-pointer list-none overflow-hidden rounded-lg border border-white/25 bg-white/15 p-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white [&::-webkit-details-marker]:hidden ${collapsed ? 'lg:border-transparent lg:bg-transparent' : ''}`}>
              <span className="ga-sidebar-account-row flex items-start gap-2.5">
                <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-full border-2 border-white/60 bg-white text-xs font-bold text-brand-navy">{staffInitials(user?.fullName)}</span>
                <span className="ga-sidebar-account-copy min-w-0 flex-1"><span className="min-h-0 overflow-hidden">
                  <span className="block break-words pr-6 text-sm font-semibold uppercase leading-5 text-white">{user?.fullName ?? 'Staff account'}</span>
                  {user?.employeeId && <span className="mt-1 block break-all text-xs font-semibold leading-4 text-white">Staff ID: {user.employeeId}</span>}
                  <span className="mt-2 block text-xs leading-4 text-blue-100">{roleLabel}</span>
                  {barangayLabel && <span className="mt-1 block break-words text-xs leading-4 text-blue-100">{barangayLabel}{user.barangay.city ? ` · ${user.barangay.city}` : ''}</span>}
                </span></span>
              </span>
              <span className="ga-sidebar-account-action"><span className="min-h-0 overflow-hidden"><span className="mt-3 flex items-center justify-between border-t border-white/20 pt-2.5 text-xs font-medium text-white">
                My account & security <Icon name="chevronDown" className="size-4 rotate-180 transition-transform group-open:rotate-0" />
              </span></span></span>
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
                <button type="button" onClick={logout} disabled={isLoggingOut} className={`hidden min-h-11 w-full cursor-pointer items-center gap-3 rounded-lg px-3 text-sm font-semibold text-brand-red transition-colors hover:bg-danger-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue disabled:cursor-not-allowed disabled:opacity-50 ${collapsed ? 'lg:flex' : ''}`}>
                  <Icon name="logout" className="size-[1.125rem] shrink-0" /> {isLoggingOut ? <LoadingLabel>Signing out...</LoadingLabel> : 'Sign out securely'}
                </button>
              </div>
            </div>
          </details>
          <button type="button" onClick={logout} disabled={isLoggingOut} aria-label={isLoggingOut ? 'Signing out' : 'Sign out securely'} title="Sign out securely" className="ga-account-logout absolute right-3 top-3 grid size-11 place-items-center rounded-lg text-blue-100 hover:bg-white/15 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-white disabled:cursor-wait disabled:opacity-50">
            {isLoggingOut ? <LoadingLabel><span className="sr-only">Signing out</span></LoadingLabel> : <Icon name="logout" className="size-[1.125rem]" />}
          </button>
        </div>
      </aside>

      <div ref={shellContentRef} className={`ga-shell-content ${assistantPage ? 'ga-assistant-shell' : ''} ${collapsed ? 'lg:pl-[5.25rem]' : 'lg:pl-72'}`}>
        <header className="ga-staff-header sticky top-0 z-30 shrink-0 border-b border-line bg-shell-header">
          <div ref={headerRef} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:gap-x-4 sm:px-6 lg:px-8">
            <button ref={menuButtonRef} type="button" aria-label="Open navigation" aria-controls="staff-navigation" aria-expanded={mobileOpen} onClick={() => setMobileOpen(true)} className="grid size-11 shrink-0 cursor-pointer place-items-center rounded-lg border border-line bg-white text-brand-navy hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue lg:hidden">
              <Icon name="menu" strokeWidth={2} />
            </button>

            <div className="min-w-0 flex-1">
              <p className="ga-staff-greeting text-sm leading-6 text-copy sm:text-base">
                <span className="block sm:inline">Mabuting araw! </span>
                <strong className="break-words font-semibold uppercase text-ink">{user?.fullName ?? 'Staff'}</strong>
                <span role="img" aria-label={`${dayPeriod.label} in Philippine time`} title={`${dayPeriod.label} · Philippine time`} className="ml-2 inline-block align-text-bottom">
                  <Icon name={dayPeriod.icon} className={`size-5 ${dayPeriod.color}`} />
                </span>
              </p>
            </div>

            <div className="order-last w-full min-w-0 xl:order-none xl:w-auto"><PhilippineClock onDayPeriodChange={setDayPeriod} /></div>
            <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-3">
              <StaffNotificationCenter accessToken={accessToken} onNavigate={onNavigate} />
            </div>
          </div>
        </header>

        <main id="dashboard-content" aria-hidden={assistantPage || undefined} inert={assistantPage} data-route-focus={assistantPage ? undefined : true} data-motion-page tabIndex={-1} className="mx-auto w-full max-w-[1520px] px-4 py-6 outline-none sm:px-6 lg:px-8 lg:py-8">
          <nav aria-label="Breadcrumb" className="mb-5">
            <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-medium text-muted-copy">
              {breadcrumbItems.map((item, index, items) => {
                const label = typeof item === 'string' ? item : item.label
                const href = typeof item === 'string' ? (index === 0 ? '/dashboard' : undefined) : item.href
                const current = index === items.length - 1
                return <li key={`${label}-${index}`} className="flex min-w-0 items-center gap-2">
                  {index > 0 && <span aria-hidden="true" className="text-slate-300">/</span>}
                  {href && !current ? <a href={href} onClick={(event) => navigate(event, href)} className="rounded-sm hover:text-brand-blue focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue">{label}</a> : <span className={current ? 'text-copy' : undefined} aria-current={current ? 'page' : undefined}>{label}</span>}
                </li>
              })}
            </ol>
          </nav>
          {children}
        </main>
        <StaffAiAssistant key={`${user?.userId}:${user?.role}:${user?.barangayId}`} historyHandle={assistantHistoryRef} active={assistantPage || (showAssistant && assistantOpen)} compact={!assistantPage} onExpand={expandAssistant} onCompact={compactAssistant} onMinimize={minimizeAssistant} accessToken={accessToken} onNavigate={navigateFromAssistant} onSessionExpired={onLogout} user={user} />
      </div>
      {showAssistant && !assistantPage && !assistantOpen && <button ref={assistantLauncherRef} type="button" onClick={() => setAssistantOpen(true)} aria-label="Open assistant conversation" aria-controls="garantiyaid-ai-panel" aria-expanded="false" className="ga-assistant-launcher"><img src="/GarantiyAid-AI-logo.svg" alt="" width="44" height="44" /><span className="ga-assistant-launcher-label">Ask GarantiyAid</span></button>}
      <ConfirmationDialog open={unsavedLogout} title="Some chat changes are not saved" description="Saved conversations will stay in your account. The latest unsaved messages or draft will be lost if you sign out now. Cancel to return to the assistant and retry saving." actionLabel="Sign out anyway" destructive onCancel={() => setUnsavedLogout(false)} onConfirm={async () => { await onLogout(); setUnsavedLogout(false) }} />
    </div>
  )
}

export default DashboardShell
