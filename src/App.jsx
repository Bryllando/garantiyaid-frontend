import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import AppLayout from './components/layout/AppLayout.jsx'
import { StaffShellContext } from './components/layout/staff-shell-context.js'
import HomePage from './pages/HomePage.jsx'
import LoginPage from './pages/LoginPage.jsx'
import { NotFoundPage, PrivacyPage, SessionExpiredPage } from './pages/SystemPages.jsx'
import { clearStaffSession, getDashboardNavigation, getStoredStaffSession, renewStaffSession, requestStaffLogout } from './auth/staffAuth.js'
import { watchStaffSession } from './auth/staff-session.js'
import { toast } from 'sonner'
import { accountReturnPath } from './auth/account-return-path.js'
import { Toaster } from './components/ui/sonner.jsx'
import { ContentLoader, PageLoader } from './components/ui/spinner.jsx'

const DashboardShell = lazy(() => import('./components/layout/DashboardShell.jsx'))
const ReportsAuditPage = lazy(() => import('./pages/ReportsAuditPage.jsx'))
const AdminStaffSecurityPage = lazy(() => import('./pages/AdminStaffSecurityPage.jsx'))
const DashboardPage = lazy(() => import('./pages/DashboardPage.jsx'))
const FacilitatorOperationsPage = lazy(() => import('./pages/FacilitatorOperationsPage.jsx'))
const BeneficiaryManagementPage = lazy(() => import('./pages/BeneficiaryManagementPage.jsx'))
const EnrollmentReviewPage = lazy(() => import('./pages/EnrollmentReviewPage.jsx'))
const ProgramManagementPage = lazy(() => import('./pages/ProgramManagementPage.jsx'))
const InitialPasswordPage = lazy(() => import('./pages/InitialPasswordPage.jsx'))
const PasswordResetPage = lazy(() => import('./pages/PasswordResetPage.jsx'))
const TotpSetupPage = lazy(() => import('./pages/TotpSetupPage.jsx'))
const TotpVerificationPage = lazy(() => import('./pages/TotpVerificationPage.jsx'))
const DistributionManagementPage = lazy(() => import('./pages/DistributionManagementPage.jsx'))
const StaffBarangayAdministrationPage = lazy(() => import('./pages/StaffBarangayAdministrationPage.jsx'))
const NotificationManagementPage = lazy(() => import('./pages/NotificationManagementPage.jsx'))
const ChatbotOperationsPage = lazy(() => import('./pages/ChatbotOperationsPage.jsx'))
const ServiceReviewPage = lazy(() => import('./pages/ServiceReviewPage.jsx'))
const BiometricIdentityPage = lazy(() => import('./pages/BiometricIdentityPage.jsx'))
const ManualVerificationPage = lazy(() => import('./pages/ManualVerificationPage.jsx'))
const DswdOperationsPage = lazy(() => import('./pages/DswdOperationsPage.jsx'))
const DswdMonitoringPage = lazy(() => import('./pages/DswdMonitoringPage.jsx'))
const ClaimAccountabilityPage = lazy(() => import('./pages/ClaimAccountabilityPage.jsx'))
const AccountSettingsPage = lazy(() => import('./pages/AccountSettingsPage.jsx'))
const BurialReferralPage = lazy(() => import('./pages/BurialReferralPage.jsx'))
const staffPaths = new Set(['/dashboard', '/account', '/assistant', '/manual-verification', '/burial-referrals', '/admin/staff-security', '/admin/administration', '/admin/schedules', '/admin/verify-claims', '/dswd/verify-claims', '/notifications', '/help-cases', '/service-review', '/biometrics', '/facilitator/queue', '/facilitator/qr-verification', '/dswd/live-dashboard', '/dswd/ledger', '/claim-accountability', '/reports', '/audit-logs', '/beneficiaries', '/enrollments', '/programs', '/distributions/manage'])
const staffPathsWithoutAssistant = new Set(['/service-review', '/notifications', '/dswd/live-dashboard', '/dswd/ledger', '/claim-accountability', '/admin/verify-claims', '/dswd/verify-claims', '/facilitator/queue', '/facilitator/qr-verification'])

const publicTitles = {
  '/': 'Assistance information', '/privacy': 'Privacy notice', '/login': 'Staff sign in',
  '/account': 'Staff sign in', '/forgot-password': 'Forgot password', '/reset-password': 'Reset password',
  '/password-setup': 'Set your password', '/totp-verification': 'Verify sign-in',
  '/totp-setup': 'Set up your authenticator', '/session-expired': 'Session expired',
}

function currentPath() {
  return window.location.pathname.replace(/\/$/, '') || '/'
}

function App() {
  const [route, setRoute] = useState(() => ({ path: currentPath(), search: window.location.search }))
  const path = route.path
  const pendingNavigation = useRef(null)
  const [pageDetails, setPageDetails] = useState(null)
  const [pendingLogin, setPendingLogin] = useState(null)
  const [returnTo, setReturnTo] = useState(() => accountReturnPath(window.location.pathname + window.location.search)
    ?? accountReturnPath(sessionStorage.getItem('garantiyaid.accountReturnTo')))

  useEffect(() => {
    if (returnTo) sessionStorage.setItem('garantiyaid.accountReturnTo', returnTo)
    else sessionStorage.removeItem('garantiyaid.accountReturnTo')
  }, [returnTo])

  useEffect(() => {
    const handlePopState = () => {
      const nextPath = currentPath()
      setRoute({ path: nextPath, search: window.location.search })
      if (!['/password-setup', '/totp-verification'].includes(nextPath)) setPendingLogin(null)
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  const navigate = useCallback((nextPath) => {
    pendingNavigation.current = new URL(nextPath, window.location.origin).hash
    window.history.pushState({}, '', nextPath)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }, [])

  useLayoutEffect(() => {
    const hash = pendingNavigation.current
    if (hash === null) return
    pendingNavigation.current = null
    const target = hash && document.getElementById(hash.slice(1))
    if (target) {
      target.scrollIntoView({ block: 'start', behavior: 'instant' })
      target.focus({ preventScroll: true })
      return
    }
    window.scrollTo({ top: 0, behavior: 'instant' })
    document.querySelector('[data-route-focus]')?.focus({ preventScroll: true })
  }, [route])

  function backToLogin() {
    setPendingLogin(null)
    clearStaffSession()
    navigate('/login')
  }

  function finishAuthentication(user) {
    setPendingLogin(null)
    const destination = user?.employeeId === 'DEV-ADMIN' ? '/dashboard' : accountReturnPath(returnTo) ?? '/dashboard'
    setReturnTo(null)
    sessionStorage.removeItem('garantiyaid.accountReturnTo')
    navigate(destination)
  }

  const expireSession = useCallback(() => {
    setReturnTo(accountReturnPath(window.location.pathname + window.location.search))
    clearStaffSession()
    navigate('/session-expired')
  }, [navigate])

  const logout = useCallback(async () => {
    const { accessToken } = getStoredStaffSession()
    try {
      if (accessToken) await requestStaffLogout(accessToken)
    } catch {
      // Clear the device session even when the server cannot be reached.
    } finally {
      setReturnTo(null)
      sessionStorage.removeItem('garantiyaid.accountReturnTo')
      clearStaffSession()
      navigate('/login')
    }
  }, [navigate])

  let page = path === '/' ? <HomePage /> : <NotFoundPage />
  const session = getStoredStaffSession()

  if (path === '/privacy') {
    page = <PrivacyPage />
  } else if (path === '/forgot-password' || path === '/reset-password') {
    page = <Suspense fallback={<PageLoader label="Loading secure recovery..." />}><PasswordResetPage mode={path === '/reset-password' ? 'complete' : 'request'} /></Suspense>
  } else if (path === '/login' || (path === '/account' && !(session.accessToken && session.user))) {
    page = (
      <LoginPage
        securityReview={Boolean(returnTo)}
        onAuthenticated={finishAuthentication}
        onPasswordChangeRequired={(credentials) => {
          setPendingLogin(credentials)
          navigate('/password-setup')
        }}
        onTotpRequired={(credentials) => {
          setPendingLogin(credentials)
          navigate('/totp-verification')
        }}
        onTotpEnrollmentRequired={(token) => {
          sessionStorage.setItem('garantiyaid.totpSetupToken', token)
          navigate('/totp-setup')
        }}
      />
    )
  } else if (path === '/password-setup') {
    page = (
      <Suspense fallback={<PageLoader />}>
        <InitialPasswordPage
          credentials={pendingLogin}
          onAuthenticated={finishAuthentication}
          onBackToLogin={backToLogin}
          onTotpRequired={(credentials) => {
            setPendingLogin(credentials)
            navigate('/totp-verification')
          }}
          onTotpEnrollmentRequired={(token) => {
            sessionStorage.setItem('garantiyaid.totpSetupToken', token)
            navigate('/totp-setup')
          }}
        />
      </Suspense>
    )
  } else if (path === '/totp-verification') {
    page = <Suspense fallback={<PageLoader />}><TotpVerificationPage credentials={pendingLogin} onBackToLogin={backToLogin} onVerified={finishAuthentication} /></Suspense>
  } else if (path === '/totp-setup') {
    page = <Suspense fallback={<PageLoader />}><TotpSetupPage onAuthenticated={finishAuthentication} onBackToLogin={backToLogin} /></Suspense>
  } else if (path === '/dashboard') {
    page = session.accessToken && session.user ? (
      <DashboardPage session={session} onLogout={logout} onNavigate={navigate} onSessionExpired={expireSession} />
    ) : (
      <SessionExpiredPage onLogin={backToLogin} />
    )
  } else if (path === '/assistant') {
    page = session.accessToken && session.user ? null : <SessionExpiredPage onLogin={backToLogin} />
  } else if (path === '/account') {
    page = session.accessToken && session.user ? (
      <AccountSettingsPage session={session} onLogout={logout} onNavigate={navigate} onSessionExpired={expireSession} />
    ) : (
      <SessionExpiredPage onLogin={backToLogin} />
    )
  } else if (path === '/admin/staff-security') {
    page = session.accessToken && session.user ? (
      <AdminStaffSecurityPage session={session} onLogout={logout} onNavigate={navigate} onSessionExpired={expireSession} />
    ) : (
      <SessionExpiredPage onLogin={backToLogin} />
    )
  } else if (path === '/admin/administration') {
    page = session.accessToken && session.user ? (
      <StaffBarangayAdministrationPage session={session} onLogout={logout} onNavigate={navigate} onSessionExpired={expireSession} />
    ) : (
      <SessionExpiredPage onLogin={backToLogin} />
    )
  } else if (path === '/notifications') {
    page = session.accessToken && session.user ? (
      <NotificationManagementPage session={session} onLogout={logout} onNavigate={navigate} onSessionExpired={expireSession} />
    ) : (
      <SessionExpiredPage onLogin={backToLogin} />
    )
  } else if (path === '/help-cases') {
    page = session.accessToken && session.user ? (
      <ChatbotOperationsPage session={session} onLogout={logout} onNavigate={navigate} onSessionExpired={expireSession} />
    ) : (
      <SessionExpiredPage onLogin={backToLogin} />
    )
  } else if (path === '/service-review') {
    page = session.accessToken && session.user ? (
      <ServiceReviewPage session={session} onLogout={logout} onNavigate={navigate} />
    ) : (
      <SessionExpiredPage onLogin={backToLogin} />
    )
  } else if (path === '/manual-verification') {
    page = session.accessToken && session.user ? <ManualVerificationPage key={`${session.user.userId}:${session.user.role}:${session.user.barangayId || ''}`} session={session} onLogout={logout} onNavigate={navigate} onSessionExpired={expireSession} /> : <SessionExpiredPage onLogin={backToLogin} />
  } else if (path === '/biometrics') {
    page = session.accessToken && session.user ? (
      <BiometricIdentityPage session={session} onLogout={logout} onNavigate={navigate} onSessionExpired={expireSession} />
    ) : (
      <SessionExpiredPage onLogin={backToLogin} />
    )
  } else if (['/admin/schedules', '/admin/verify-claims', '/dswd/verify-claims', '/facilitator/queue', '/facilitator/qr-verification'].includes(path)) {
    page = session.accessToken && session.user ? (
      <FacilitatorOperationsPage
        key={path}
        view={['/admin/schedules', '/facilitator/queue'].includes(path) ? 'queue' : 'qr'}
        session={session}
        onLogout={logout}
        onNavigate={navigate}
        onSessionExpired={expireSession}
      />
    ) : (
      <SessionExpiredPage onLogin={backToLogin} />
    )
  } else if (path === '/dswd/live-dashboard' || path === '/dswd/ledger') {
    page = session.accessToken && session.user ? (
      path === '/dswd/live-dashboard' ? <DswdMonitoringPage session={session} onLogout={logout} onNavigate={navigate} onSessionExpired={expireSession} /> : <DswdOperationsPage
          key={path}
          view="ledger"
          session={session}
          onLogout={logout}
          onNavigate={navigate}
          onSessionExpired={expireSession}
        />
    ) : (
      <SessionExpiredPage onLogin={backToLogin} />
    )
  } else if (path === '/claim-accountability') {
    page = session.accessToken && session.user ? (
      <ClaimAccountabilityPage session={session} onLogout={logout} onNavigate={navigate} onSessionExpired={expireSession} />
    ) : (
      <SessionExpiredPage onLogin={backToLogin} />
    )
  } else if (path === '/reports' || path === '/audit-logs') {
    page = session.accessToken && session.user ? (
      <ReportsAuditPage
        key={path}
        view={path === '/reports' ? 'reports' : 'audit'}
        session={session}
        onLogout={logout}
        onNavigate={navigate}
        onSessionExpired={expireSession}
      />
    ) : (
      <SessionExpiredPage onLogin={backToLogin} />
    )
  } else if (path === '/beneficiaries' || path === '/enrollments') {
    page = session.accessToken && session.user ? (
      path === '/beneficiaries' ? (
        <BeneficiaryManagementPage session={session} onLogout={logout} onNavigate={navigate} onSessionExpired={expireSession} />
      ) : (
        <EnrollmentReviewPage session={session} onLogout={logout} onNavigate={navigate} onSessionExpired={expireSession} />
      )
    ) : (
      <SessionExpiredPage onLogin={backToLogin} />
    )
  } else if (path === '/programs' || path === '/distributions/manage') {
    page = session.accessToken && session.user ? (
      path === '/programs' ? (
          <ProgramManagementPage session={session} onLogout={logout} onNavigate={navigate} onSessionExpired={expireSession} />
        ) : (
          <DistributionManagementPage session={session} onLogout={logout} onNavigate={navigate} onSessionExpired={expireSession} />
        )
    ) : (
      <SessionExpiredPage onLogin={backToLogin} />
    )
  } else if (path === '/burial-referrals') {
    page = session.accessToken && session.user ? (
      <BurialReferralPage session={session} onLogout={logout} onNavigate={navigate} onSessionExpired={expireSession} />
    ) : <SessionExpiredPage onLogin={backToLogin} />
  } else if (path === '/session-expired') {
    page = <SessionExpiredPage onLogin={backToLogin} />
  }

  const isStaffPage = Boolean(session.accessToken && session.user && staffPaths.has(path))
  useEffect(() => {
    if (!isStaffPage) return
    const notice = 'staff-session-ending'
    return watchStaffSession(session.accessToken, {
      renew: renewStaffSession,
      expire: expireSession,
      warn: (final, stay) => toast.warning('Your staff session is about to end', {
        id: notice, duration: Infinity,
        description: final ? 'Save your work. Sign in again when this session ends.' : 'Select Stay signed in to continue working.',
        ...(final ? {} : { action: { label: 'Stay signed in', onClick: (event) => {
          event.preventDefault()
          stay()
        } } }),
      }),
      dismiss: () => toast.dismiss(notice),
    })
  }, [isStaffPage, session.accessToken, expireSession])
  const navigation = isStaffPage ? getDashboardNavigation(session.user.role) : []
  const navigationItem = navigation.flatMap((item) => item.children ?? [item]).find((item) => item.href === path)
  const shellDetails = pageDetails?.currentPath === path ? pageDetails : null
  const pageTitle = shellDetails?.pageTitle ?? navigationItem?.label ?? 'Staff workspace'
  const loadingTitle = path === '/dswd/live-dashboard' ? 'Real-time transparency dashboard' : path === '/claim-accountability' ? 'Claims and receipts' : pageTitle

  const title = isStaffPage ? pageTitle : publicTitles[path] ?? (staffPaths.has(path) ? 'Staff sign-in required' : 'Page not found')
  useEffect(() => { document.title = `${title} | GarantiyAid` }, [title])

  return (
    <AppLayout>
      {isStaffPage ? (
        <Suspense fallback={<PageLoader label="Loading staff workspace..." />}>
          <DashboardShell breadcrumbs={shellDetails?.breadcrumbs ?? ['Operations', pageTitle]} currentPath={path} onLogout={logout} onNavigate={navigate} pageTitle={pageTitle} showAssistant={shellDetails?.showAssistant ?? !staffPathsWithoutAssistant.has(path)} user={session.user}>
            <StaffShellContext.Provider key={route.path + route.search} value={setPageDetails}>
              <Suspense fallback={<ContentLoader title={loadingTitle} />}>{page}</Suspense>
            </StaffShellContext.Provider>
          </DashboardShell>
        </Suspense>
      ) : page}
      <Toaster />
    </AppLayout>
  )
}

export default App
