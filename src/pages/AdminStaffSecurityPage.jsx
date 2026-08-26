import { useEffect, useState } from 'react'
import DashboardShell from '../components/layout/DashboardShell.jsx'
import { Skeleton } from '../components/ui/skeleton.jsx'
import { getAuthErrorMessage, isSessionExpiredError, requestStaffUsers, resetStaffTotp, STAFF_ROLE_LABELS } from '../auth/staffAuth.js'

const emptyVerification = {
  staffIdVerified: false,
  validIdVerified: false,
  supervisorConfirmed: false,
}

function AdminStaffSecurityPage({ session, onLogout, onNavigate, onSessionExpired }) {
  const isAdministrator = session.accessToken && session.user?.role === 'SYSTEM_ADMIN'
  const [users, setUsers] = useState([])
  const [target, setTarget] = useState(null)
  const [verification, setVerification] = useState(emptyVerification)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [isLoading, setIsLoading] = useState(Boolean(isAdministrator))
  const [isSubmitting, setIsSubmitting] = useState(false)
  const isVerified = Object.values(verification).every(Boolean)

  useEffect(() => {
    let active = true
    if (!isAdministrator) {
      return () => { active = false }
    }

    requestStaffUsers(session.accessToken)
      .then((staffUsers) => {
        if (active) setUsers(staffUsers)
      })
      .catch((requestError) => {
        if (!active) return
        if (isSessionExpiredError(requestError)) {
          onSessionExpired()
          return
        }
        setError(getAuthErrorMessage(requestError))
      })
      .finally(() => {
        if (active) setIsLoading(false)
      })

    return () => { active = false }
  }, [isAdministrator, onSessionExpired, session.accessToken])

  function selectTarget(user) {
    setTarget(user)
    setVerification(emptyVerification)
    setError('')
    setSuccess('')
  }

  async function handleReset(event) {
    event.preventDefault()
    setError('')
    setSuccess('')
    setIsSubmitting(true)

    try {
      const data = await resetStaffTotp(session.accessToken, target.userId, verification)
      setUsers((currentUsers) => currentUsers.map((user) => (
        user.userId === data.user.userId ? data.user : user
      )))
      setTarget(null)
      setVerification(emptyVerification)
      setSuccess(`${data.user.fullName}'s authenticator was reset. ${data.revokedSessionCount} active session(s) were revoked.`)
    } catch (requestError) {
      setError(getAuthErrorMessage(requestError))
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!isAdministrator) {
    return (
      <DashboardShell breadcrumbs={['Operations', 'Staff security']} currentPath="/admin/staff-security" onLogout={onLogout} onNavigate={onNavigate} pageTitle="Staff security" user={session.user}>
        <section className="ga-card mx-auto w-full max-w-md px-6 py-8 text-center" aria-labelledby="security-title">
          <span aria-hidden="true" className="mx-auto grid size-12 place-items-center rounded-full bg-warning-soft font-extrabold text-brand-amber">!</span>
          <h1 id="security-title" className="mt-5 text-2xl font-extrabold text-ink">Administrator access required</h1>
          <p className="mt-3 text-sm leading-6 text-muted-copy">Sign in with an active System Administrator account to manage authenticator recovery.</p>
          <button type="button" onClick={() => onNavigate('/dashboard')} className="ga-btn-primary mt-6">Return to your dashboard</button>
        </section>
      </DashboardShell>
    )
  }

  return (
    <DashboardShell breadcrumbs={['Operations', 'Administration', 'Staff security']} currentPath="/admin/staff-security" onLogout={onLogout} onNavigate={onNavigate} pageTitle="Staff security" user={session.user}>
      <section className="w-full max-w-5xl" aria-labelledby="security-title">
        <div className="ga-card p-6 sm:p-8">
          <div className="border-b border-line pb-6">
            <div>
              <p className="ga-eyebrow">Administrator security</p>
              <h1 id="security-title" className="ga-page-title">Staff authenticator recovery</h1>
              <p className="ga-page-copy">Reset an authenticator only after the official identity-verification process. The reset signs the staff member out on every device.</p>
            </div>
          </div>

          {success && <p role="status" className="mt-6 rounded-lg border border-emerald-200 bg-success-soft px-4 py-3 text-sm leading-6 text-brand-green">{success}</p>}
          {error && <p role="alert" className="mt-6 rounded-lg border border-red-200 bg-danger-soft px-4 py-3 text-sm leading-6 text-brand-red">{error}</p>}

          <div className="mt-6 overflow-hidden rounded-xl border border-line">
            <div className="bg-slate-50 px-5 py-4">
              <h2 className="font-bold text-ink">Staff accounts</h2>
              <p className="mt-1 text-sm text-muted-copy">Choose the verified staff member whose phone or authenticator is unavailable.</p>
            </div>
            {isLoading ? (
              <div className="space-y-4 px-5 py-6" role="status" aria-label="Loading staff accounts" aria-busy="true">
                <span className="sr-only">Loading staff accounts…</span>
                {Array.from({ length: 3 }, (_, index) => (
                  <div key={index} className="flex items-center justify-between gap-4">
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-48" />
                      <Skeleton className="h-3 w-64 max-w-full" />
                    </div>
                    <Skeleton className="h-10 w-40" />
                  </div>
                ))}
              </div>
            ) : users.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-muted-copy">No staff accounts found.</p>
            ) : (
              <ul className="divide-y divide-line">
                {users.map((user) => {
                  const isSelf = user.userId === session.user.userId
                  const canReset = user.isActive && user.totpEnabled && !isSelf
                  return (
                    <li key={user.userId} className="flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="font-bold text-ink">{user.fullName}</p>
                        <p className="mt-1 text-sm text-muted-copy">{user.employeeId} · {STAFF_ROLE_LABELS[user.role] ?? user.role}</p>
                        <p className={`mt-2 text-sm font-bold ${user.totpEnabled ? 'text-brand-green' : 'text-brand-amber'}`}>
                          {user.totpEnabled ? 'Authenticator active' : 'Authenticator setup required'}
                          {!user.isActive && ' | Account inactive'}
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={!canReset}
                        onClick={() => selectTarget(user)}
                        title={isSelf ? 'Another System Administrator must reset your authenticator.' : undefined}
                        className="min-h-11 rounded-lg border border-red-200 bg-white px-4 text-sm font-bold text-brand-red hover:bg-danger-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-red disabled:cursor-not-allowed disabled:border-line disabled:text-slate-400 disabled:hover:bg-white"
                      >
                        Reset authenticator
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          {target && (
            <form onSubmit={handleReset} className="mt-6 rounded-xl border border-amber-200 bg-warning-soft p-5" aria-labelledby="reset-title">
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-brand-amber">Security confirmation</p>
              <h2 id="reset-title" className="mt-2 text-xl font-bold text-ink">Reset {target.fullName}'s authenticator?</h2>
              <p className="mt-2 text-sm leading-6 text-copy">This invalidates the old authenticator and recovery codes, revokes active sessions, and forces setup after the next password sign-in.</p>

              <fieldset className="mt-5 space-y-3">
                <legend className="text-sm font-bold text-ink">Confirm identity checks completed</legend>
                {[
                  ['staffIdVerified', `Staff ID ${target.employeeId} matches the staff record.`],
                  ['validIdVerified', 'A valid government or agency ID was inspected.'],
                  ['supervisorConfirmed', 'The staff member\'s supervisor confirmed the request.'],
                ].map(([name, label]) => (
                  <label key={name} className="flex min-h-12 cursor-pointer items-start gap-3 rounded-lg border border-amber-200 bg-white p-3 text-sm leading-6 text-copy">
                    <input
                      type="checkbox"
                      checked={verification[name]}
                      onChange={(event) => setVerification((current) => ({ ...current, [name]: event.target.checked }))}
                      className="mt-1 size-4 accent-brand-blue"
                    />
                    <span>{label}</span>
                  </label>
                ))}
              </fieldset>

              <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button type="button" onClick={() => setTarget(null)} className="ga-btn-secondary">Cancel</button>
                <button
                  type="submit"
                  disabled={!isVerified || isSubmitting}
                  className="ga-btn-danger"
                >
                  {isSubmitting ? 'Resetting...' : 'Confirm authenticator reset'}
                </button>
              </div>
            </form>
          )}
        </div>
      </section>
    </DashboardShell>
  )
}

export default AdminStaffSecurityPage
