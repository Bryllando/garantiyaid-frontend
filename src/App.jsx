import { lazy, Suspense, useEffect, useState } from 'react'
import AppLayout from './components/layout/AppLayout.jsx'
import HomePage from './pages/HomePage.jsx'
import LoginPage from './pages/LoginPage.jsx'
import ReportsAuditPage from './pages/ReportsAuditPage.jsx'
import AdminStaffSecurityPage from './pages/AdminStaffSecurityPage.jsx'
import DashboardPage from './pages/DashboardPage.jsx'
import DswdOperationsPage from './pages/DswdOperationsPage.jsx'
import FacilitatorOperationsPage from './pages/FacilitatorOperationsPage.jsx'
import BeneficiaryManagementPage from './pages/BeneficiaryManagementPage.jsx'
import EnrollmentReviewPage from './pages/EnrollmentReviewPage.jsx'
import TotpSetupPage from './pages/TotpSetupPage.jsx'
import TotpVerificationPage from './pages/TotpVerificationPage.jsx'
import { NotFoundPage, PrivacyPage, SessionExpiredPage } from './pages/SystemPages.jsx'
import { clearStaffSession, getStoredStaffSession, requestStaffLogout } from './auth/staffAuth.js'
import { Toaster } from './components/ui/sonner.jsx'

const ProgramManagementPage = lazy(() => import('./pages/ProgramManagementPage.jsx'))
const DistributionManagementPage = lazy(() => import('./pages/DistributionManagementPage.jsx'))
const StaffBarangayAdministrationPage = lazy(() => import('./pages/StaffBarangayAdministrationPage.jsx'))

function currentPath() {
  return window.location.pathname.replace(/\/$/, '') || '/'
}

function App() {
  const [path, setPath] = useState(currentPath)
  const [pendingLogin, setPendingLogin] = useState(null)

  useEffect(() => {
    const handlePopState = () => {
      const nextPath = currentPath()
      setPath(nextPath)
      if (nextPath !== '/totp-verification') setPendingLogin(null)
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  function navigate(nextPath) {
    window.history.pushState({}, '', nextPath)
    setPath(currentPath())

    const hash = new URL(nextPath, window.location.origin).hash
    requestAnimationFrame(() => {
      if (hash) {
        document.querySelector(hash)?.scrollIntoView({ block: 'start' })
        return
      }

      window.scrollTo({ top: 0 })
      document.querySelector('[data-route-focus]')?.focus({ preventScroll: true })
    })
  }

  function backToLogin() {
    setPendingLogin(null)
    clearStaffSession()
    navigate('/login')
  }

  function finishAuthentication() {
    setPendingLogin(null)
    navigate('/dashboard')
  }

  function expireSession() {
    clearStaffSession()
    navigate('/session-expired')
  }

  async function logout() {
    const { accessToken } = getStoredStaffSession()
    try {
      if (accessToken) await requestStaffLogout(accessToken)
    } catch {
      // Clear the device session even when the server cannot be reached.
    } finally {
      clearStaffSession()
      navigate('/login')
    }
  }

  let page = path === '/' ? <HomePage /> : <NotFoundPage />
  const session = getStoredStaffSession()

  if (path === '/privacy') {
    page = <PrivacyPage />
  } else if (path === '/login') {
    page = (
      <LoginPage
        onAuthenticated={finishAuthentication}
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
  } else if (path === '/totp-verification') {
    page = <TotpVerificationPage credentials={pendingLogin} onBackToLogin={backToLogin} onVerified={finishAuthentication} />
  } else if (path === '/totp-setup') {
    page = <TotpSetupPage onAuthenticated={finishAuthentication} onBackToLogin={backToLogin} />
  } else if (path === '/dashboard') {
    page = session.accessToken && session.user ? (
      <DashboardPage session={session} onLogout={logout} onNavigate={navigate} onSessionExpired={expireSession} />
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
      <Suspense fallback={<div className="grid min-h-[100dvh] place-items-center bg-page p-6 text-center"><p className="font-bold text-brand-navy" role="status">Loading secure workspace…</p></div>}>
        <StaffBarangayAdministrationPage session={session} onLogout={logout} onNavigate={navigate} onSessionExpired={expireSession} />
      </Suspense>
    ) : (
      <SessionExpiredPage onLogin={backToLogin} />
    )
  } else if (path === '/facilitator/queue' || path === '/facilitator/qr-verification') {
    page = session.accessToken && session.user ? (
      <FacilitatorOperationsPage
        key={path}
        view={path === '/facilitator/queue' ? 'queue' : 'qr'}
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
      <DswdOperationsPage
        key={path}
        view={path === '/dswd/live-dashboard' ? 'live' : 'ledger'}
        session={session}
        onLogout={logout}
        onNavigate={navigate}
        onSessionExpired={expireSession}
      />
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
      <Suspense fallback={<div className="grid min-h-[100dvh] place-items-center bg-page p-6 text-center"><p className="font-bold text-brand-navy" role="status">Loading secure workspace…</p></div>}>
        {path === '/programs' ? (
          <ProgramManagementPage session={session} onLogout={logout} onNavigate={navigate} onSessionExpired={expireSession} />
        ) : (
          <DistributionManagementPage session={session} onLogout={logout} onNavigate={navigate} onSessionExpired={expireSession} />
        )}
      </Suspense>
    ) : (
      <SessionExpiredPage onLogin={backToLogin} />
    )
  } else if (path === '/session-expired') {
    page = <SessionExpiredPage onLogin={backToLogin} />
  }

  return (
    <AppLayout>
      {page}
      <Toaster />
    </AppLayout>
  )
}

export default App
