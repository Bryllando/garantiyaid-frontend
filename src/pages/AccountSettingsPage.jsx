import { useEffect, useRef, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { toast } from 'sonner'
import PasswordStrengthField from '../components/auth/PasswordStrengthField.jsx'
import DashboardShell from '../components/layout/DashboardShell.jsx'
import { ConfirmationDialog } from '../components/ui/confirmation-dialog.jsx'
import { Icon } from '../components/ui/icon.jsx'
import { PhilippineMobileField } from '../components/ui/philippine-mobile-field.jsx'
import { InputOTP, InputOTPGroup, InputOTPSlot, REGEXP_ONLY_DIGITS } from '../components/ui/input-otp.jsx'
import { Skeleton } from '../components/ui/skeleton.jsx'
import { LoadingLabel } from '../components/ui/spinner.jsx'
import {
  changeOwnPassword,
  confirmOwnTotpReplacement,
  getAuthErrorMessage,
  isSessionExpiredError,
  regenerateOwnRecoveryCodes,
  requestOwnAccount,
  revokeOwnOtherSessions,
  STAFF_ROLE_LABELS,
  startOwnTotpReplacement,
  storeStaffSession,
  updateOwnProfile,
} from '../auth/staffAuth.js'

const emptyReauthentication = { currentPassword: '', totpCode: '' }
const emptyPasswordForm = {
  currentPassword: '',
  newPassword: '',
  confirmation: '',
  totpCode: '',
}

const accountSectionGroups = [
  {
    label: 'Account',
    items: [
      { id: 'profile', icon: 'profile', label: 'Personal details', description: 'Official profile and contact information' },
    ],
  },
  {
    label: 'Password and security',
    items: [
      { id: 'password', icon: 'lock', label: 'Password', description: 'Update your sign-in password' },
      { id: 'authenticator', icon: 'security', label: 'Authenticator app', description: 'Set up authentication on a new phone' },
      { id: 'recovery', icon: 'key', label: 'Recovery codes', description: 'Replace your one-time backup codes' },
      { id: 'sessions', icon: 'devices', label: "Where you're signed in", description: 'Review active staff sessions' },
    ],
  },
]

const validAccountSections = new Set(accountSectionGroups.flatMap(({ items }) => items.map(({ id }) => id)))

function accountSectionFromLocation() {
  const section = new URLSearchParams(window.location.search).get('section')
  return validAccountSections.has(section) ? section : null
}

function initials(name = 'Staff') {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase()
}

function recoveryCodeDocument(codes) {
  return [
    'GARANTIYAID STAFF RECOVERY CODES',
    'Keep these codes private and offline. Each code can be used once.',
    '',
    ...codes,
    '',
    `Generated ${new Date().toLocaleString('en-PH')}`,
  ].join('\n')
}

function formatDate(value) {
  if (!value) return 'Not available'
  return new Intl.DateTimeFormat('en-PH', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function SectionHeading({ id, icon, title, description }) {
  return (
    <div className="flex items-start gap-3">
      <span aria-hidden="true" className="grid size-11 shrink-0 place-items-center rounded-xl bg-info-soft text-brand-blue">
        <Icon name={icon} className="size-5" />
      </span>
      <div className="min-w-0">
        <h2 id={id} tabIndex={-1} className="text-xl font-extrabold tracking-tight text-ink outline-none sm:text-2xl">{title}</h2>
        <p className="mt-1 text-sm leading-6 text-muted-copy">{description}</p>
      </div>
    </div>
  )
}

function SettingsNavigation({ activeSection, onSelect, security, label }) {
  const statusFor = (section) => {
    if (section === 'authenticator') return 'Active'
    if (section === 'recovery') return `${security.recoveryCodesRemaining} left`
    if (section === 'sessions') return `${security.activeSessionCount} active`
    return ''
  }

  return (
    <nav aria-label={label}>
      {accountSectionGroups.map((group, groupIndex) => (
        <div key={group.label} className={groupIndex ? 'mt-5 border-t border-line pt-5' : ''}>
          <p className="px-2 text-xs font-bold uppercase tracking-[0.1em] text-muted-copy">{group.label}</p>
          <ul className="mt-2 space-y-1" role="list">
            {group.items.map((item) => {
              const selected = activeSection === item.id
              const status = statusFor(item.id)
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(item.id)}
                    aria-current={selected ? 'page' : undefined}
                    aria-controls={`account-${item.id}-panel`}
                    className={`group flex min-h-14 w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-[background-color,border-color,color,box-shadow] duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue ${selected ? 'border-blue-200 bg-info-soft text-brand-blue shadow-sm' : 'border-transparent text-copy hover:border-line hover:bg-slate-50 hover:text-ink'}`}
                  >
                    <span aria-hidden="true" className={`grid size-10 shrink-0 place-items-center rounded-lg transition-colors ${selected ? 'bg-white text-brand-blue shadow-sm' : 'bg-slate-100 text-muted-copy group-hover:bg-white group-hover:text-brand-blue'}`}>
                      <Icon name={item.icon} className="size-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-extrabold">{item.label}</span>
                      <span className="mt-0.5 block text-xs leading-5 text-muted-copy">{item.description}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      {status && <span className={`hidden rounded-full px-2 py-1 text-[0.6875rem] font-bold sm:inline ${item.id === 'authenticator' ? 'bg-success-soft text-brand-green' : 'bg-slate-100 text-copy'}`}>{status}</span>}
                      <Icon name="chevronRight" className="size-4 text-slate-400" />
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </nav>
  )
}

function RecoveryCodes({ codes, saved, onSavedChange }) {
  const [feedback, setFeedback] = useState('')

  async function copyCodes() {
    try {
      await navigator.clipboard.writeText(recoveryCodeDocument(codes))
      setFeedback('All recovery codes copied.')
    } catch {
      setFeedback('Copy is unavailable. Select and copy the codes manually.')
    }
  }

  function downloadCodes() {
    const blob = new Blob([recoveryCodeDocument(codes)], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'garantiyaid-recovery-codes.txt'
    link.click()
    URL.revokeObjectURL(url)
    setFeedback('Recovery codes downloaded.')
  }

  return (
    <div aria-live="polite">
      <div className="rounded-xl border border-emerald-200 bg-success-soft p-4">
        <p className="flex items-center gap-2 text-sm font-bold text-brand-green">
          <Icon name="check" className="size-5" /> New recovery codes are ready
        </p>
        <p className="mt-1 text-sm leading-6 text-copy">Previous recovery codes no longer work. These eight codes are shown only now.</p>
      </div>

      <div data-recovery-print className="mt-4 rounded-xl border border-amber-200 bg-warning-soft p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-bold text-brand-amber">Private, one-time codes</p>
            <p className="mt-1 text-sm text-copy">Store them offline and away from your work device.</p>
          </div>
          <span className="rounded-full border border-amber-200 bg-white px-3 py-1 text-xs font-bold text-brand-amber">8 codes</span>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2" aria-label="New recovery codes">
          {codes.map((code, index) => (
            <code key={code} className="flex min-h-11 items-center justify-center rounded-lg border border-amber-200 bg-white px-2 py-2 text-center text-xs font-extrabold tracking-[0.08em] text-ink sm:text-sm">
              <span className="sr-only">Recovery code {index + 1}: </span>{code}
            </code>
          ))}
        </div>
        <div data-recovery-actions className="mt-4 grid gap-2 sm:grid-cols-3">
          <button type="button" onClick={copyCodes} className="ga-btn-secondary min-h-11 px-3 text-sm"><Icon name="copy" /> Copy all</button>
          <button type="button" onClick={downloadCodes} className="ga-btn-secondary min-h-11 px-3 text-sm"><Icon name="download" /> Download</button>
          <button type="button" onClick={() => window.print()} className="ga-btn-secondary min-h-11 px-3 text-sm"><Icon name="printer" /> Print / PDF</button>
        </div>
        <p aria-live="polite" className="mt-2 min-h-5 text-center text-xs font-bold text-brand-green">{feedback}</p>
      </div>

      <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-line p-4 text-sm leading-6 text-copy hover:border-blue-200 hover:bg-info-soft">
        <input type="checkbox" checked={saved} onChange={(event) => onSavedChange(event.target.checked)} className="mt-1 size-5 shrink-0 accent-brand-blue" />
        <span><strong className="text-ink">I saved the new recovery codes securely.</strong><span className="mt-0.5 block text-muted-copy">They cannot be displayed again after this window closes.</span></span>
      </label>
    </div>
  )
}

function AccountSkeleton({ session, onLogout, onNavigate }) {
  return (
    <DashboardShell breadcrumbs={['Operations', 'My account']} currentPath="/account" onLogout={onLogout} onNavigate={onNavigate} pageTitle="Account settings" user={session.user}>
      <section className="mx-auto w-full max-w-7xl" aria-busy="true" aria-label="Loading account settings">
        <Skeleton className="h-24 w-full max-w-2xl rounded-xl" />
        <Skeleton className="mt-6 h-24 w-full rounded-xl" />
        <div className="mt-6 grid gap-6 lg:grid-cols-[19rem_minmax(0,1fr)]">
          <Skeleton className="h-[34rem] rounded-xl" />
          <Skeleton className="h-[38rem] rounded-xl" />
        </div>
      </section>
    </DashboardShell>
  )
}

function AccountSettingsPage({ session, onLogout, onNavigate, onSessionExpired }) {
  const dialogRef = useRef(null)
  const [account, setAccount] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [profile, setProfile] = useState({ email: '', contactNumber: '' })
  const [profileError, setProfileError] = useState('')
  const [profileBusy, setProfileBusy] = useState(false)
  const [password, setPassword] = useState(emptyPasswordForm)
  const [passwordError, setPasswordError] = useState('')
  const [passwordBusy, setPasswordBusy] = useState(false)
  const [showCurrentPassword, setShowCurrentPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [securityAction, setSecurityAction] = useState(null)
  const [reauthentication, setReauthentication] = useState(emptyReauthentication)
  const [replacement, setReplacement] = useState(null)
  const [replacementCode, setReplacementCode] = useState('')
  const [recoveryCodes, setRecoveryCodes] = useState(null)
  const [codesSaved, setCodesSaved] = useState(false)
  const [securityError, setSecurityError] = useState('')
  const [securityBusy, setSecurityBusy] = useState(false)
  const [confirmSessions, setConfirmSessions] = useState(false)
  const [activeSection, setActiveSection] = useState(accountSectionFromLocation)

  useEffect(() => {
    let active = true
    requestOwnAccount(session.accessToken)
      .then((data) => {
        if (!active) return
        setAccount(data)
        setProfile({
          email: data.user.email ?? '',
          contactNumber: data.user.contactNumber ?? '',
        })
      })
      .catch((error) => {
        if (!active) return
        if (isSessionExpiredError(error)) onSessionExpired()
        else setLoadError(getAuthErrorMessage(error))
      })
    return () => { active = false }
  }, [loadAttempt, onSessionExpired, session.accessToken])

  useEffect(() => {
    const dialog = dialogRef.current
    if (securityAction && dialog && !dialog.open) dialog.showModal()
    if (!securityAction && dialog?.open) dialog.close()
  }, [securityAction])

  useEffect(() => {
    if (!recoveryCodes || codesSaved) return undefined
    const protectCodes = (event) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', protectCodes)
    return () => window.removeEventListener('beforeunload', protectCodes)
  }, [codesSaved, recoveryCodes])

  useEffect(() => {
    const syncSection = () => {
      const section = accountSectionFromLocation()
      setActiveSection(section)
      requestAnimationFrame(() => {
        const destination = section ?? (window.matchMedia('(min-width: 1024px)').matches ? 'profile' : 'menu')
        document.getElementById(destination === 'menu' ? 'account-settings-menu-title' : `account-${destination}-title`)?.focus({ preventScroll: true })
      })
    }
    window.addEventListener('popstate', syncSection)
    return () => window.removeEventListener('popstate', syncSection)
  }, [])

  function reportRequestError(error, setter) {
    if (isSessionExpiredError(error)) return onSessionExpired()
    setter(getAuthErrorMessage(error))
  }

  function selectAccountSection(section) {
    window.history.pushState({}, '', section ? `/account?section=${section}` : '/account')
    setActiveSection(section)
    requestAnimationFrame(() => {
      const destination = section ?? (window.matchMedia('(min-width: 1024px)').matches ? 'profile' : 'menu')
      document.getElementById(destination === 'menu' ? 'account-settings-menu-title' : `account-${destination}-title`)?.focus({ preventScroll: false })
    })
  }

  function updateAccountUser(user) {
    setAccount((current) => ({ ...current, user }))
    storeStaffSession({ accessToken: session.accessToken, user })
  }

  async function saveProfile(event) {
    event.preventDefault()
    const currentContact = account.user.contactNumber ?? ''
    const payload = {
      ...(profile.email.trim().toLowerCase() !== account.user.email ? { email: profile.email } : {}),
      ...(profile.contactNumber.trim() !== currentContact ? { contactNumber: profile.contactNumber } : {}),
    }
    if (!Object.keys(payload).length) return toast.info('Your contact details are already up to date.')

    setProfileError('')
    setProfileBusy(true)
    try {
      const user = await updateOwnProfile(session.accessToken, payload)
      updateAccountUser(user)
      setProfile({ email: user.email ?? '', contactNumber: user.contactNumber ?? '' })
      toast.success('Contact details updated.', { description: 'The change was added to the audit trail.' })
    } catch (error) {
      reportRequestError(error, setProfileError)
    } finally {
      setProfileBusy(false)
    }
  }

  async function savePassword(event) {
    event.preventDefault()
    setPasswordError('')
    if (password.newPassword !== password.confirmation) return setPasswordError('The new passwords do not match.')
    if (password.newPassword === password.currentPassword) return setPasswordError('Choose a password different from your current password.')

    setPasswordBusy(true)
    try {
      const data = await changeOwnPassword(session.accessToken, {
        currentPassword: password.currentPassword,
        newPassword: password.newPassword,
        totpCode: password.totpCode,
      })
      setPassword(emptyPasswordForm)
      setAccount((current) => ({
        ...current,
        security: { ...current.security, activeSessionCount: 1 },
      }))
      toast.success('Password changed securely.', {
        description: data.revokedSessionCount ? `${data.revokedSessionCount} other session(s) were signed out.` : 'Your current secure session remains active.',
      })
    } catch (error) {
      reportRequestError(error, setPasswordError)
    } finally {
      setPasswordBusy(false)
    }
  }

  function openSecurityAction(action) {
    setSecurityAction(action)
    setReauthentication(emptyReauthentication)
    setReplacement(null)
    setReplacementCode('')
    setRecoveryCodes(null)
    setCodesSaved(false)
    setSecurityError('')
  }

  function closeSecurityAction() {
    if (securityBusy) {
      toast.info('Please wait for the secure request to finish.')
      return
    }
    if (recoveryCodes && !codesSaved) {
      toast.error('Save the recovery codes before closing this window.')
      return
    }
    setSecurityAction(null)
  }

  async function submitReauthentication(event) {
    event.preventDefault()
    setSecurityError('')
    setSecurityBusy(true)
    try {
      if (securityAction === 'recovery') {
        const codes = await regenerateOwnRecoveryCodes(session.accessToken, reauthentication)
        setRecoveryCodes(codes)
        setAccount((current) => ({
          ...current,
          security: { ...current.security, recoveryCodesRemaining: codes.length },
        }))
      } else {
        setReplacement(await startOwnTotpReplacement(session.accessToken, reauthentication))
      }
      setReauthentication(emptyReauthentication)
    } catch (error) {
      reportRequestError(error, setSecurityError)
    } finally {
      setSecurityBusy(false)
    }
  }

  async function confirmReplacement(event) {
    event.preventDefault()
    setSecurityError('')
    setSecurityBusy(true)
    try {
      const data = await confirmOwnTotpReplacement(
        session.accessToken,
        replacement.replacementToken,
        replacementCode,
      )
      updateAccountUser(data.user)
      setRecoveryCodes(data.recoveryCodes)
      setReplacementCode('')
      setAccount((current) => ({
        ...current,
        user: data.user,
        security: {
          ...current.security,
          recoveryCodesRemaining: data.recoveryCodes.length,
          activeSessionCount: 1,
        },
      }))
      toast.success('New authenticator connected.', { description: 'The previous authenticator and recovery codes no longer work.' })
    } catch (error) {
      reportRequestError(error, setSecurityError)
    } finally {
      setSecurityBusy(false)
    }
  }

  async function signOutOtherSessions() {
    try {
      const data = await revokeOwnOtherSessions(session.accessToken)
      setAccount((current) => ({
        ...current,
        security: { ...current.security, activeSessionCount: 1 },
      }))
      setConfirmSessions(false)
      toast.success('Other sessions signed out.', { description: data.revokedSessionCount ? `${data.revokedSessionCount} session(s) ended.` : 'No other active sessions were found.' })
    } catch (error) {
      if (isSessionExpiredError(error)) onSessionExpired()
      else {
        toast.error('Unable to sign out other sessions.', { description: getAuthErrorMessage(error) })
        throw error
      }
    }
  }

  if (!account && !loadError) return <AccountSkeleton session={session} onLogout={onLogout} onNavigate={onNavigate} />

  if (!account) {
    return (
      <DashboardShell breadcrumbs={['Operations', 'My account']} currentPath="/account" onLogout={onLogout} onNavigate={onNavigate} pageTitle="Account settings" user={session.user}>
        <section className="ga-card mx-auto max-w-lg p-7 text-center" role="alert">
          <span aria-hidden="true" className="mx-auto grid size-12 place-items-center rounded-full bg-danger-soft font-black text-brand-red">!</span>
          <h1 className="mt-4 text-2xl font-extrabold text-ink">Account settings unavailable</h1>
          <p className="mt-2 text-sm leading-6 text-muted-copy">{loadError}</p>
          <button type="button" onClick={() => { setLoadError(''); setLoadAttempt((value) => value + 1) }} className="ga-btn-primary mt-6">Try again</button>
        </section>
      </DashboardShell>
    )
  }

  const { user, security } = account
  const roleLabel = STAFF_ROLE_LABELS[user.role] ?? 'Staff'
  const barangayLabel = user.barangay ? `${user.barangay.barangayName}, ${user.barangay.city}` : 'City-wide assignment'
  const passwordReady = password.newPassword.length >= 12
    && password.newPassword === password.confirmation
    && password.newPassword !== password.currentPassword
    && password.currentPassword.length >= 8
    && password.totpCode.length === 6
  const displayedSection = activeSection ?? 'profile'
  const profileDirty = profile.email.trim().toLowerCase() !== (user.email ?? '').toLowerCase()
    || profile.contactNumber.trim() !== (user.contactNumber ?? '')

  return (
    <DashboardShell breadcrumbs={['Operations', 'My account', 'Account settings']} currentPath="/account" onLogout={onLogout} onNavigate={onNavigate} pageTitle="Account settings" user={user}>
      <section className="ga-dashboard-ready mx-auto w-full max-w-7xl" aria-labelledby="account-title">
        <header className="max-w-3xl">
          <p className="ga-eyebrow">My account</p>
          <h1 id="account-title" className="ga-page-title">Account settings</h1>
          <p className="ga-page-copy">Manage your official profile, sign-in security, recovery options, and active staff sessions.</p>
        </header>

        <div className="ga-card-flat mt-6 flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:p-5">
          <div className="flex min-w-0 flex-1 items-center gap-4">
            <span aria-hidden="true" className="grid size-14 shrink-0 place-items-center rounded-xl bg-brand-navy text-lg font-black text-white shadow-sm">{initials(user.fullName)}</span>
            <div className="min-w-0">
              <p className="truncate text-lg font-extrabold text-ink">{user.fullName}</p>
              <p className="mt-0.5 truncate text-sm text-muted-copy">{roleLabel} · {user.employeeId}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-success-soft px-4 py-3 sm:max-w-sm">
            <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-lg bg-white text-brand-green"><Icon name="security" className="size-5" /></span>
            <div className="min-w-0">
              <p className="text-sm font-extrabold text-brand-green">Account protected</p>
              <p className="mt-0.5 text-xs leading-5 text-copy">Authenticator active · {security.recoveryCodesRemaining} recovery code(s) available</p>
            </div>
          </div>
        </div>

        <div className="mt-6 lg:grid lg:grid-cols-[19rem_minmax(0,1fr)] lg:items-start lg:gap-7">
          {!activeSection && (
            <section className="ga-card p-4 sm:p-5 lg:hidden" aria-labelledby="account-settings-menu-title">
              <div className="px-2 pb-4">
                <h2 id="account-settings-menu-title" tabIndex={-1} className="text-xl font-extrabold tracking-tight text-ink outline-none">Choose a setting</h2>
                <p className="mt-1 text-sm leading-6 text-muted-copy">Open one area at a time to review or update your account.</p>
              </div>
              <SettingsNavigation activeSection={null} onSelect={selectAccountSection} security={security} label="Account settings" />
            </section>
          )}

          <aside className="hidden space-y-4 lg:sticky lg:top-28 lg:block">
            <div className="ga-card-flat p-3">
              <SettingsNavigation activeSection={displayedSection} onSelect={selectAccountSection} security={security} label="Account settings" />
            </div>
            <div className="rounded-xl border border-emerald-200 bg-success-soft p-4">
              <p className="flex items-center gap-2 text-sm font-extrabold text-brand-green"><Icon name="check" className="size-5" /> Protection active</p>
              <p className="mt-2 text-xs leading-5 text-copy">Password, authenticator, and account changes are protected and recorded in the audit trail.</p>
            </div>
          </aside>

          <main className={`${activeSection ? 'block' : 'hidden lg:block'} min-w-0`}>
            <button type="button" onClick={() => selectAccountSection(null)} className="mb-3 inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm font-bold text-brand-blue hover:bg-info-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue lg:hidden">
              <Icon name="chevronLeft" className="size-4" /> All account settings
            </button>
            {displayedSection === 'profile' && (
            <section id="account-profile-panel" className="ga-card p-5 sm:p-7" aria-labelledby="account-profile-title">
              <SectionHeading id="account-profile-title" icon="profile" title="Personal details" description="Review your official assignment and keep your contact information current." />
              <div className="mt-6 grid gap-4 rounded-xl border border-line bg-slate-50 p-4 sm:grid-cols-2">
                <div><p className="text-xs font-bold uppercase tracking-[0.08em] text-muted-copy">Full name</p><p className="mt-1 font-bold text-ink">{user.fullName}</p></div>
                <div><p className="text-xs font-bold uppercase tracking-[0.08em] text-muted-copy">Role</p><p className="mt-1 font-bold text-ink">{roleLabel}</p></div>
                <div><p className="text-xs font-bold uppercase tracking-[0.08em] text-muted-copy">Staff ID</p><p className="mt-1 font-bold text-ink">{user.employeeId}</p></div>
                <div><p className="text-xs font-bold uppercase tracking-[0.08em] text-muted-copy">Assigned service area</p><p className="mt-1 font-bold text-ink">{barangayLabel}</p></div>
                <p className="sm:col-span-2 text-xs leading-5 text-muted-copy"><Icon name="info" className="mr-1 inline size-4 align-text-bottom" /> Official identity, role, and assignment changes are handled by a System Administrator.</p>
              </div>

              <form className="mt-6 grid gap-5 sm:grid-cols-2" onSubmit={saveProfile} aria-busy={profileBusy}>
                <div>
                  <label htmlFor="account-email" className="ga-label">Official email</label>
                  <input id="account-email" type="email" autoComplete="email" maxLength="150" required value={profile.email} onChange={(event) => { setProfile((value) => ({ ...value, email: event.target.value })); setProfileError('') }} aria-describedby={profileError ? 'profile-form-error' : undefined} className="ga-input mt-2" />
                </div>
                <PhilippineMobileField id="account-contact" value={profile.contactNumber} onChange={(contactNumber) => { setProfile((value) => ({ ...value, contactNumber })); setProfileError('') }} describedBy={profileError ? 'profile-form-error' : undefined} />
                {profileError && <p id="profile-form-error" role="alert" className="rounded-lg border border-red-200 bg-danger-soft px-4 py-3 text-sm text-brand-red sm:col-span-2">{profileError}</p>}
                <div className="sm:col-span-2 sm:flex sm:justify-end"><button type="submit" disabled={profileBusy || !profileDirty} className="ga-btn-primary w-full sm:w-auto">{profileBusy ? <LoadingLabel>Saving...</LoadingLabel> : 'Save contact details'}</button></div>
              </form>
            </section>
            )}

            {displayedSection === 'password' && (
            <section id="account-password-panel" className="ga-card p-5 sm:p-7" aria-labelledby="account-password-title">
              <SectionHeading id="account-password-title" icon="lock" title="Change password" description="Confirm your identity before updating the password used to access your staff account." />
              <form className="mt-6 max-w-2xl space-y-5" onSubmit={savePassword} aria-busy={passwordBusy}>
                <div>
                  <label htmlFor="current-password" className="ga-label">Current password</label>
                  <div className="relative mt-2">
                    <input id="current-password" type={showCurrentPassword ? 'text' : 'password'} autoComplete="current-password" minLength="8" maxLength="72" required value={password.currentPassword} onChange={(event) => { setPassword((value) => ({ ...value, currentPassword: event.target.value })); setPasswordError('') }} className="ga-input pr-20" />
                    <button type="button" onClick={() => setShowCurrentPassword((value) => !value)} className="absolute inset-y-0 right-1 min-w-16 rounded-lg px-3 text-sm font-bold text-brand-blue hover:bg-info-soft focus-visible:outline-2 focus-visible:outline-brand-blue">{showCurrentPassword ? 'Hide' : 'Show'}</button>
                  </div>
                </div>

                <PasswordStrengthField id="new-account-password" name="newPassword" label="New password" value={password.newPassword} onChange={(value) => { setPassword((current) => ({ ...current, newPassword: value })); setPasswordError('') }} revealed={showNewPassword} onRevealChange={setShowNewPassword} />

                <div>
                  <label htmlFor="confirm-account-password" className="ga-label">Confirm new password</label>
                  <input id="confirm-account-password" type={showNewPassword ? 'text' : 'password'} autoComplete="new-password" minLength="12" maxLength="72" required value={password.confirmation} onChange={(event) => { setPassword((value) => ({ ...value, confirmation: event.target.value })); setPasswordError('') }} aria-invalid={Boolean(password.confirmation && password.confirmation !== password.newPassword)} className="ga-input mt-2" />
                  <p className={`mt-2 text-xs font-bold ${password.confirmation && password.confirmation === password.newPassword ? 'text-brand-green' : 'text-muted-copy'}`}>{password.confirmation ? (password.confirmation === password.newPassword ? 'Passwords match.' : 'Passwords do not match yet.') : 'Re-enter the new password exactly.'}</p>
                </div>

                <div>
                  <label htmlFor="password-totp" className="ga-label">Current authentication code</label>
                  <p className="mt-1 text-xs leading-5 text-muted-copy">Enter the six-digit code from the authenticator currently connected to this account.</p>
                  <InputOTP id="password-totp" maxLength={6} pattern={REGEXP_ONLY_DIGITS} inputMode="numeric" autoComplete="one-time-code" required value={password.totpCode} onChange={(value) => { setPassword((current) => ({ ...current, totpCode: value })); setPasswordError('') }} containerClassName="mt-3 justify-start">
                    <InputOTPGroup>{Array.from({ length: 6 }, (_, index) => <InputOTPSlot key={index} index={index} invalid={Boolean(passwordError)} />)}</InputOTPGroup>
                  </InputOTP>
                </div>

                {passwordError && <p role="alert" className="rounded-lg border border-red-200 bg-danger-soft px-4 py-3 text-sm text-brand-red">{passwordError}</p>}
                <div className="rounded-xl border border-blue-200 bg-info-soft p-4 text-sm leading-6 text-copy"><strong className="text-ink">Security note:</strong> This browser stays signed in. Every other active session will be revoked after the password changes.</div>
                <div className="flex justify-end"><button type="submit" disabled={passwordBusy || !passwordReady} className="ga-btn-primary w-full sm:w-auto">{passwordBusy ? <LoadingLabel>Changing...</LoadingLabel> : 'Change password'}</button></div>
              </form>
            </section>
            )}

            {displayedSection === 'authenticator' && (
            <section id="account-authenticator-panel" className="ga-card p-5 sm:p-7" aria-labelledby="account-authenticator-title">
              <SectionHeading id="account-authenticator-title" icon="security" title="Authenticator app" description="Keep two-step verification connected when you replace or change phones." />
              <div className="mt-6 max-w-2xl space-y-5">
                <div className="flex flex-col gap-4 rounded-xl border border-emerald-200 bg-success-soft p-5 sm:flex-row sm:items-center">
                  <span aria-hidden="true" className="grid size-12 shrink-0 place-items-center rounded-xl bg-white text-brand-green shadow-sm"><Icon name="security" className="size-6" /></span>
                  <div className="min-w-0 flex-1">
                    <p className="font-extrabold text-ink">Authenticator is active</p>
                    <p className="mt-1 text-sm leading-6 text-copy">A six-digit code is required for protected sign-ins and sensitive account changes.</p>
                  </div>
                  <span className="w-fit rounded-full border border-emerald-200 bg-white px-3 py-1 text-xs font-bold text-brand-green">Protected</span>
                </div>
                <div className="rounded-xl border border-line p-5">
                  <h3 className="font-extrabold text-ink">Set up on a new phone</h3>
                  <p className="mt-2 text-sm leading-6 text-copy">For security, the existing QR code cannot be displayed again. After you confirm your password and current authentication code, GarantiyAid creates a new QR code for the new phone.</p>
                  <div className="mt-4 rounded-lg bg-slate-50 p-4 text-sm leading-6 text-muted-copy">
                    Your current authenticator remains active until the new phone produces a valid code. If you no longer have access to it, contact a System Administrator for an audited reset.
                  </div>
                  <button type="button" onClick={() => openSecurityAction('replace')} className="ga-btn-primary mt-5 w-full sm:w-auto"><Icon name="reset" className="size-5" /> Set up on a new phone</button>
                </div>
              </div>
            </section>
            )}

            {displayedSection === 'recovery' && (
            <section id="account-recovery-panel" className="ga-card p-5 sm:p-7" aria-labelledby="account-recovery-title">
              <SectionHeading id="account-recovery-title" icon="key" title="Recovery codes" description="Use a one-time recovery code when your authenticator is temporarily unavailable." />
              <div className="mt-6 max-w-2xl space-y-5">
                <div className="flex items-center gap-4 rounded-xl border border-line bg-slate-50 p-5">
                  <span aria-hidden="true" className="grid size-12 shrink-0 place-items-center rounded-xl bg-white text-brand-blue shadow-sm"><Icon name="key" className="size-6" /></span>
                  <div className="min-w-0 flex-1">
                    <p className="text-2xl font-black tabular-nums text-ink">{security.recoveryCodesRemaining}</p>
                    <p className="text-sm text-copy">unused recovery code(s) remaining</p>
                  </div>
                </div>
                <div className="rounded-xl border border-amber-200 bg-warning-soft p-4 text-sm leading-6 text-copy"><strong className="text-brand-amber">Codes cannot be viewed again.</strong> Generate a replacement set only if the current codes are lost, exposed, or running low. Every previous code will stop working.</div>
                <button type="button" onClick={() => openSecurityAction('recovery')} className="ga-btn-primary w-full sm:w-auto"><Icon name="reset" className="size-5" /> Generate new recovery codes</button>
              </div>
            </section>
            )}

            {displayedSection === 'sessions' && (
            <section id="account-sessions-panel" className="ga-card p-5 sm:p-7" aria-labelledby="account-sessions-title">
              <SectionHeading id="account-sessions-title" icon="devices" title="Where you're signed in" description="Review this browser and end access on every other device." />
              <div className="mt-6 flex flex-col gap-5 rounded-xl border border-line bg-slate-50 p-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-start gap-4">
                  <span aria-hidden="true" className="grid size-11 shrink-0 place-items-center rounded-xl bg-white text-brand-blue shadow-sm"><Icon name="devices" /></span>
                  <div className="min-w-0">
                    <p className="font-extrabold text-ink">This browser <span className="ml-1 rounded-full bg-success-soft px-2 py-0.5 text-xs text-brand-green">Current</span></p>
                    <p className="mt-1 text-sm text-copy">Started {formatDate(security.currentSession?.createdAt)}</p>
                    <p className="mt-1 text-xs text-muted-copy">Network address: {security.currentSession?.ipAddress || 'Not recorded'} · Expires {formatDate(security.currentSession?.expiresAt)}</p>
                  </div>
                </div>
                <div className="shrink-0 text-left sm:text-right">
                  <p className="text-2xl font-black tabular-nums text-ink">{security.activeSessionCount}</p>
                  <p className="text-xs font-bold uppercase tracking-[0.08em] text-muted-copy">active session(s)</p>
                </div>
              </div>
              <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm leading-6 text-muted-copy">Use this after a shared, lost, or unfamiliar device may have accessed your account. Your current browser will stay signed in.</p>
                <button type="button" onClick={() => setConfirmSessions(true)} disabled={security.activeSessionCount <= 1} className="ga-btn-secondary shrink-0">Sign out other sessions</button>
              </div>
            </section>
            )}
          </main>
        </div>
      </section>

      <dialog ref={dialogRef} aria-labelledby="security-dialog-title" onCancel={(event) => { if (securityBusy || (recoveryCodes && !codesSaved)) event.preventDefault(); closeSecurityAction() }} className="m-auto max-h-[calc(100dvh-2rem)] w-[min(42rem,calc(100%-2rem))] overflow-y-auto rounded-2xl border border-line bg-white p-0 text-ink shadow-lg backdrop:bg-slate-950/60">
        {securityAction && (
          <div className="p-5 sm:p-7" data-dialog-stagger>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="ga-eyebrow">Sensitive account action</p>
                <h2 id="security-dialog-title" className="mt-1 text-2xl font-black tracking-tight">{securityAction === 'replace' ? 'Set up on a new phone' : 'Generate new recovery codes'}</h2>
                <p className="mt-2 text-sm leading-6 text-muted-copy">{securityAction === 'replace' ? 'Your current authenticator stays active until the new setup is verified.' : 'Generating a new set immediately invalidates every previous recovery code.'}</p>
              </div>
              <button type="button" onClick={closeSecurityAction} disabled={securityBusy} aria-label="Close" className="grid size-11 shrink-0 place-items-center rounded-lg text-muted-copy hover:bg-slate-100 hover:text-ink focus-visible:outline-2 focus-visible:outline-brand-blue disabled:cursor-not-allowed disabled:opacity-50"><Icon name="close" /></button>
            </div>

            {recoveryCodes ? (
              <div className="mt-6">
                <RecoveryCodes codes={recoveryCodes} saved={codesSaved} onSavedChange={setCodesSaved} />
                <button type="button" onClick={closeSecurityAction} disabled={!codesSaved} className="ga-btn-primary mt-5 w-full">Done</button>
              </div>
            ) : replacement ? (
              <form onSubmit={confirmReplacement} className="mt-6" aria-busy={securityBusy}>
                <div className="grid gap-5 sm:grid-cols-[13rem_1fr] sm:items-start">
                  <div className="rounded-xl border border-blue-200 bg-info-soft p-3 text-center">
                    <div className="mx-auto w-fit rounded-lg bg-white p-2 shadow-sm">
                      <QRCodeSVG value={replacement.otpauthUri} size={176} level="M" marginSize={2} title="New GarantiyAid authenticator QR code" className="h-auto w-full" />
                    </div>
                    <a href={replacement.otpauthUri} className="mt-3 block min-h-11 rounded-lg px-2 py-3 text-sm font-bold text-brand-blue hover:bg-white">Open authenticator app</a>
                  </div>
                  <div>
                    <h3 className="font-extrabold text-ink">Connect the new authenticator</h3>
                    <ol className="mt-2 space-y-2 text-sm leading-6 text-copy">
                      <li><strong>1.</strong> Scan the QR code with the new authenticator.</li>
                      <li><strong>2.</strong> Enter its current six-digit code below.</li>
                      <li><strong>3.</strong> Save the new recovery codes.</li>
                    </ol>
                    <details className="mt-3 rounded-lg border border-line bg-slate-50 p-3">
                      <summary className="min-h-10 py-2 text-sm font-bold text-brand-blue">Cannot scan the QR?</summary>
                      <code className="mt-2 block break-all rounded-lg bg-white p-3 text-xs font-bold tracking-[0.08em]">{replacement.secret}</code>
                    </details>
                  </div>
                </div>
                <div className="mt-5">
                  <label htmlFor="replacement-code" className="ga-label">Code from the new authenticator</label>
                  <InputOTP id="replacement-code" maxLength={6} pattern={REGEXP_ONLY_DIGITS} inputMode="numeric" autoComplete="one-time-code" required value={replacementCode} onChange={(value) => { setReplacementCode(value); setSecurityError('') }} containerClassName="mt-3 justify-start">
                    <InputOTPGroup>{Array.from({ length: 6 }, (_, index) => <InputOTPSlot key={index} index={index} invalid={Boolean(securityError)} />)}</InputOTPGroup>
                  </InputOTP>
                </div>
                {securityError && <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-danger-soft px-4 py-3 text-sm text-brand-red">{securityError}</p>}
                <button type="submit" disabled={securityBusy || replacementCode.length !== 6} className="ga-btn-primary mt-5 w-full">{securityBusy ? <LoadingLabel>Verifying...</LoadingLabel> : 'Verify and connect new phone'}</button>
              </form>
            ) : (
              <form onSubmit={submitReauthentication} className="mt-6 space-y-5" aria-busy={securityBusy}>
                <div className="rounded-xl border border-blue-200 bg-info-soft p-4 text-sm leading-6 text-copy"><strong className="text-ink">Confirm it is you.</strong> Enter your current password and a fresh code from the authenticator already connected to this account.</div>
                <div>
                  <label htmlFor="security-current-password" className="ga-label">Current password</label>
                  <input id="security-current-password" type="password" autoComplete="current-password" minLength="8" maxLength="72" required autoFocus value={reauthentication.currentPassword} onChange={(event) => { setReauthentication((value) => ({ ...value, currentPassword: event.target.value })); setSecurityError('') }} className="ga-input mt-2" />
                </div>
                <div>
                  <label htmlFor="security-totp" className="ga-label">Current authentication code</label>
                  <InputOTP id="security-totp" maxLength={6} pattern={REGEXP_ONLY_DIGITS} inputMode="numeric" autoComplete="one-time-code" required value={reauthentication.totpCode} onChange={(value) => { setReauthentication((current) => ({ ...current, totpCode: value })); setSecurityError('') }} containerClassName="mt-3 justify-start">
                    <InputOTPGroup>{Array.from({ length: 6 }, (_, index) => <InputOTPSlot key={index} index={index} invalid={Boolean(securityError)} />)}</InputOTPGroup>
                  </InputOTP>
                </div>
                {securityError && <p role="alert" className="rounded-lg border border-red-200 bg-danger-soft px-4 py-3 text-sm text-brand-red">{securityError}</p>}
                <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                  <button type="button" onClick={closeSecurityAction} disabled={securityBusy} className="ga-btn-secondary">Cancel</button>
                  <button type="submit" disabled={securityBusy || reauthentication.currentPassword.length < 8 || reauthentication.totpCode.length !== 6} className="ga-btn-primary">{securityBusy ? <LoadingLabel>Verifying...</LoadingLabel> : securityAction === 'replace' ? 'Continue to new QR code' : 'Generate new codes'}</button>
                </div>
              </form>
            )}
          </div>
        )}
      </dialog>

      <ConfirmationDialog open={confirmSessions} title="Sign out every other session?" description="This browser will stay signed in. Every other active GarantiyAid staff session for your account will end immediately." actionLabel="Sign out other sessions" destructive onCancel={() => setConfirmSessions(false)} onConfirm={signOutOtherSessions} />
    </DashboardShell>
  )
}

export default AccountSettingsPage
