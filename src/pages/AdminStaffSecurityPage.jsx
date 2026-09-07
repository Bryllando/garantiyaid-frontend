import { useEffect, useRef, useState } from 'react'
import DashboardShell from '../components/layout/DashboardShell.jsx'
import { Icon } from '../components/ui/icon.jsx'
import { Skeleton } from '../components/ui/skeleton.jsx'
import { LoadingLabel } from '../components/ui/spinner.jsx'
import { getAuthErrorMessage, isSessionExpiredError, requestStaffUsers, resetStaffTotp, STAFF_ROLE_LABELS } from '../auth/staffAuth.js'

const emptyVerification = {
  staffIdVerified: false,
  validIdVerified: false,
  supervisorConfirmed: false,
}

function staffInitials(name = 'Staff') {
  return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase()
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
  const resetHeadingRef = useRef(null)
  const resetTriggerRef = useRef(null)
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

  useEffect(() => {
    if (target) requestAnimationFrame(() => resetHeadingRef.current?.focus())
  }, [target])

  function selectTarget(user, trigger) {
    resetTriggerRef.current = trigger
    setTarget(user)
    setVerification(emptyVerification)
    setError('')
    setSuccess('')
  }

  function cancelReset() {
    setTarget(null)
    requestAnimationFrame(() => resetTriggerRef.current?.focus())
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
      <section className="mx-auto w-full max-w-5xl" aria-labelledby="security-title">
        <div className="ga-card overflow-hidden">
          <header className="border-b border-line bg-gradient-to-br from-white to-info-soft px-5 py-6 sm:px-8 sm:py-8">
            <div className="flex items-start gap-4">
              <span aria-hidden="true" className="grid size-12 shrink-0 place-items-center rounded-xl bg-brand-navy text-white shadow-sm">
                <Icon name="security" className="size-6" />
              </span>
              <div className="min-w-0">
                <p className="ga-eyebrow">Administrator security</p>
                <h1 id="security-title" className="ga-page-title">Staff authenticator recovery</h1>
                <p className="ga-page-copy">Reset an authenticator only after the official identity-verification process. The reset signs the staff member out on every device.</p>
              </div>
            </div>

            <ol className="mt-6 grid gap-3 sm:grid-cols-3" aria-label="Authenticator recovery process">
              {[
                ['1', 'Verify identity', 'Match the staff record and official ID.'],
                ['2', 'Confirm authority', 'Obtain the supervisor confirmation.'],
                ['3', 'Reset securely', 'Revoke sessions and require fresh setup.'],
              ].map(([step, title, description]) => (
                <li key={step} className="flex gap-3 rounded-xl border border-blue-100 bg-white p-4">
                  <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-full bg-info-soft text-sm font-extrabold text-brand-blue">{step}</span>
                  <span className="min-w-0">
                    <span className="block text-sm font-extrabold text-ink">{title}</span>
                    <span className="mt-1 block text-xs leading-5 text-muted-copy">{description}</span>
                  </span>
                </li>
              ))}
            </ol>
          </header>

          <div className="p-5 sm:p-8">
            {success && <p role="status" className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-success-soft px-4 py-3 text-sm leading-6 text-brand-green"><Icon name="check" className="mt-0.5 size-5 shrink-0" /><span>{success}</span></p>}
            {error && <p role="alert" className="flex items-start gap-3 rounded-xl border border-red-200 bg-danger-soft px-4 py-3 text-sm leading-6 text-brand-red"><Icon name="info" className="mt-0.5 size-5 shrink-0" /><span>{error}</span></p>}

            <section className={`${success || error ? 'mt-6' : ''} overflow-hidden rounded-xl border border-line`} aria-labelledby="staff-accounts-title" aria-busy={isLoading}>
              <div className="flex flex-col gap-3 bg-slate-50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                <div>
                  <h2 id="staff-accounts-title" className="font-extrabold text-ink">Staff accounts</h2>
                  <p className="mt-1 text-sm leading-6 text-muted-copy">Choose the verified staff member whose phone or authenticator is unavailable.</p>
                </div>
                {!isLoading && <span className="w-fit shrink-0 rounded-full border border-line bg-white px-3 py-1.5 text-xs font-bold text-copy">{users.length} {users.length === 1 ? 'account' : 'accounts'}</span>}
              </div>

              {isLoading ? (
                <div className="space-y-4 px-5 py-6 sm:px-6" role="status" aria-label="Loading staff accounts">
                  <span className="sr-only">Loading staff accounts...</span>
                  {Array.from({ length: 3 }, (_, index) => (
                    <div key={index} className="flex items-center justify-between gap-4">
                      <div className="flex min-w-0 flex-1 items-center gap-3">
                        <Skeleton className="size-11 shrink-0 rounded-full" />
                        <div className="min-w-0 flex-1 space-y-2">
                          <Skeleton className="h-4 w-48 max-w-full" />
                          <Skeleton className="h-3 w-64 max-w-full" />
                        </div>
                      </div>
                      <Skeleton className="hidden h-11 w-40 sm:block" />
                    </div>
                  ))}
                </div>
              ) : users.length === 0 ? (
                <div className="px-5 py-10 text-center">
                  <span aria-hidden="true" className="mx-auto grid size-12 place-items-center rounded-full bg-info-soft text-brand-blue"><Icon name="people" /></span>
                  <h3 className="mt-4 font-extrabold text-ink">No staff accounts found</h3>
                  <p className="mt-2 text-sm text-muted-copy">Staff accounts in your administrative scope will appear here.</p>
                </div>
              ) : (
                <ul className="divide-y divide-line">
                  {users.map((user) => {
                    const isSelf = user.userId === session.user.userId
                    const canReset = user.isActive && user.totpEnabled && !isSelf
                    const resetUnavailableReason = isSelf
                      ? 'Another System Administrator must reset your authenticator.'
                      : !user.isActive
                        ? 'Reactivate this account before resetting its authenticator.'
                        : !user.totpEnabled
                          ? 'No active authenticator is enrolled.'
                          : ''
                    const authenticatorStatus = user.mustChangePassword
                      ? 'First sign-in pending'
                      : user.totpEnabled
                        ? 'Authenticator active'
                        : 'Setup required'

                    return (
                      <li key={user.userId} className="grid gap-4 px-5 py-5 transition-colors hover:bg-slate-50 sm:grid-cols-[minmax(0,1fr)_13rem] sm:items-start sm:px-6">
                        <div className="flex min-w-0 items-start gap-3">
                          <span aria-hidden="true" className="grid size-11 shrink-0 place-items-center rounded-full bg-brand-navy text-sm font-bold text-white">{staffInitials(user.fullName)}</span>
                          <div className="min-w-0">
                            <h3 className="break-words font-extrabold text-ink">{user.fullName}</h3>
                            <p className="mt-1 text-sm text-muted-copy">{user.employeeId} · {STAFF_ROLE_LABELS[user.role] ?? user.role}</p>
                            <div className="mt-3 flex flex-wrap gap-2">
                              <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${user.totpEnabled && !user.mustChangePassword ? 'border-emerald-200 bg-success-soft text-brand-green' : 'border-amber-200 bg-warning-soft text-brand-amber'}`}>{authenticatorStatus}</span>
                              <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${user.isActive ? 'border-blue-200 bg-info-soft text-brand-blue' : 'border-line bg-slate-100 text-copy'}`}>{user.isActive ? 'Account active' : 'Account inactive'}</span>
                            </div>
                          </div>
                        </div>
                        <div className="min-w-0 sm:w-52 sm:justify-self-end">
                          <button
                            type="button"
                            disabled={!canReset}
                            aria-describedby={!canReset ? `reset-unavailable-${user.userId}` : undefined}
                            onClick={(event) => selectTarget(user, event.currentTarget)}
                            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-red-200 bg-white px-4 text-sm font-bold text-brand-red transition-colors hover:bg-danger-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-red disabled:cursor-not-allowed disabled:border-line disabled:bg-slate-50 disabled:text-slate-400"
                          >
                            <Icon name="reset" className="size-4" /> Reset authenticator
                          </button>
                          {!canReset && <p id={`reset-unavailable-${user.userId}`} className="mt-2 flex items-start gap-2 rounded-lg bg-slate-50 px-3 py-2 text-left text-xs leading-5 text-muted-copy"><Icon name="lock" className="mt-0.5 size-4 shrink-0" /><span>{resetUnavailableReason}</span></p>}
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>

            {target && (
              <form onSubmit={handleReset} className="mt-6 rounded-xl border border-amber-200 bg-warning-soft p-5 sm:p-6" aria-labelledby="reset-title">
                <div className="flex items-start gap-3">
                  <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-full bg-white text-brand-amber"><Icon name="reset" /></span>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.12em] text-brand-amber">Security confirmation</p>
                    <h2 ref={resetHeadingRef} tabIndex={-1} id="reset-title" className="mt-2 text-xl font-bold text-ink outline-none">Reset {target.fullName}'s authenticator?</h2>
                    <p className="mt-2 text-sm leading-6 text-copy">This invalidates the old authenticator and recovery codes, revokes active sessions, and forces setup after the next password sign-in.</p>
                  </div>
                </div>

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
                        className="mt-0.5 size-5 shrink-0 accent-brand-blue"
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                </fieldset>

                <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                  <button type="button" onClick={cancelReset} className="ga-btn-secondary">Cancel</button>
                  <button type="submit" disabled={!isVerified || isSubmitting} className="ga-btn-danger">
                    {isSubmitting ? <LoadingLabel>Resetting...</LoadingLabel> : <><Icon name="reset" className="size-5" />Confirm authenticator reset</>}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </section>
    </DashboardShell>
  )
}

export default AdminStaffSecurityPage
