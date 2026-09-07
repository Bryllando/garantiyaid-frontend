import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import DashboardShell from '../components/layout/DashboardShell.jsx'
import { ConfirmationDialog } from '../components/ui/confirmation-dialog.jsx'
import { Icon } from '../components/ui/icon.jsx'
import { PhilippineMobileField } from '../components/ui/philippine-mobile-field.jsx'
import { Skeleton } from '../components/ui/skeleton.jsx'
import { LoadingLabel } from '../components/ui/spinner.jsx'
import { useMotionEntry } from '../components/ui/use-motion-entry.js'
import {
  buildStaffAccountPayload,
  createBarangay,
  createStaffUser,
  getAuthErrorMessage,
  isSessionExpiredError,
  requestBarangayList,
  requestStaffUserList,
  removeStaffUser,
  restoreStaffUser,
  STAFF_ROLE_LABELS,
  updateBarangay,
  updateStaffUser,
} from '../auth/staffAuth.js'

const roles = ['', 'SYSTEM_ADMIN', 'DSWD_STAFF', 'BARANGAY_FACILITATOR']
const creatableStaffRoles = [
  {
    role: 'DSWD_STAFF',
    eyebrow: 'National operations',
    description: 'Review enrollments, manage assistance programs, monitor distributions, and prepare oversight reports.',
    login: 'Receives a generated DSWD Staff ID for sign-in',
  },
  {
    role: 'BARANGAY_FACILITATOR',
    eyebrow: 'Local service delivery',
    description: 'Manage assigned beneficiaries, distribution queues, and claim verification within one barangay.',
    login: 'Receives a BSTF Staff ID; username is an alternative',
  },
]
const emptyStaff = { username: '', fullName: '', email: '', contactNumber: '', role: 'DSWD_STAFF', barangayId: '' }
const emptyBarangay = { barangayCode: '', barangayName: '', city: '', province: '' }
const dateFormatter = new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeZone: 'Asia/Manila' })
const initials = (name = 'Staff') => name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase()

function StatusBadge({ active, archivedAt }) {
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${archivedAt ? 'border-blue-200 bg-info-soft text-brand-blue' : active ? 'ga-status-success' : 'border-line bg-slate-100 text-copy'}`}>{archivedAt ? 'Archived' : active ? 'Active' : 'Inactive'}</span>
}

function LoadingRows({ label }) {
  return <div className="space-y-4 p-5" role="status" aria-label={label}>{Array.from({ length: 5 }, (_, index) => <div key={index} className="flex items-center gap-4"><Skeleton className="size-11 rounded-full" /><div className="flex-1"><Skeleton className="h-4 w-48 max-w-full" /><Skeleton className="mt-2 h-3 w-64 max-w-full" /></div><Skeleton className="hidden h-11 w-24 sm:block" /></div>)}</div>
}

function Field({ description, id, label, onChange, ...inputProps }) {
  return <div><label htmlFor={id} className="ga-label">{label}</label><input id={id} aria-describedby={description ? `${id}-description` : undefined} onChange={(event) => onChange(event.target.value)} className="ga-input mt-2" {...inputProps} />{description && <p id={`${id}-description`} className="mt-2 text-xs leading-5 text-muted-copy">{description}</p>}</div>
}

function RoleIcon({ role, className = 'size-7' }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      {role === 'SYSTEM_ADMIN'
        ? <><path d="M12 3 20 7v5c0 5-3.4 8-8 9-4.6-1-8-4-8-9V7l8-4Z" /><path d="m9 12 2 2 4-4" /></>
        : role === 'DSWD_STAFF'
          ? <><path d="M3 21h18M5 21V7l7-4 7 4v14" /><path d="M9 9h1M14 9h1M9 13h1M14 13h1M10 21v-4h4v4" /></>
          : <><path d="M3 21h18M5 21V10l7-6 7 6v11" /><path d="M9 21v-6h6v6M8 11h8" /></>}
    </svg>
  )
}

function StaffRoleDialog({ onClose, onSelect }) {
  const dialogRef = useRef(null)
  useEffect(() => { dialogRef.current?.showModal() }, [])

  return (
    <dialog ref={dialogRef} onClose={onClose} aria-labelledby="staff-role-title" aria-describedby="staff-role-description" className="m-auto max-h-[calc(100dvh-2rem)] w-[min(58rem,calc(100%-2rem))] overflow-y-auto rounded-2xl border border-line bg-white p-0 text-ink shadow-lg backdrop:bg-slate-950/55 backdrop:backdrop-blur-[3px]">
      <div className="p-5 sm:p-7 lg:p-8">
        <header className="flex items-start justify-between gap-5">
          <div>
            <p className="ga-eyebrow">Staff account setup · Step 1 of 2</p>
            <h2 id="staff-role-title" className="mt-2 text-2xl font-extrabold tracking-tight sm:text-3xl">Choose the staff account type</h2>
            <p id="staff-role-description" className="mt-2 max-w-2xl text-sm leading-6 text-muted-copy">Select the role that matches the staff member’s official responsibility. Access is limited automatically by this choice.</p>
          </div>
          <button type="button" onClick={() => dialogRef.current?.close()} aria-label="Close staff type selection" className="grid size-11 shrink-0 place-items-center rounded-lg border border-line text-xl text-copy transition-colors hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue">×</button>
        </header>

        <div data-dialog-stagger className="mt-7 grid gap-4 md:grid-cols-2">
          {creatableStaffRoles.map((option, index) => (
            <button key={option.role} type="button" autoFocus={index === 0} onClick={() => onSelect(option.role)} className="group flex min-h-64 cursor-pointer flex-col rounded-2xl border border-line bg-white p-5 text-left transition-[border-color,background-color,box-shadow] hover:border-brand-blue hover:bg-info-soft hover:shadow-sm active:bg-blue-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue sm:p-6">
              <span className="grid size-14 place-items-center rounded-xl bg-brand-navy text-white transition-colors group-hover:bg-brand-blue"><RoleIcon role={option.role} /></span>
              <span className="mt-5 text-xs font-bold uppercase tracking-[0.11em] text-brand-blue">{option.eyebrow}</span>
              <span className="mt-2 text-xl font-extrabold text-ink">{STAFF_ROLE_LABELS[option.role]}</span>
              <span className="mt-2 flex-1 text-sm leading-6 text-muted-copy">{option.description}</span>
              <span className="mt-5 flex items-center justify-between gap-4 border-t border-line pt-4 text-sm font-bold text-brand-blue"><span>{option.login}</span><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-5 shrink-0 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"><path d="m9 18 6-6-6-6" /></svg></span>
            </button>
          ))}
        </div>

        <div className="mt-6 flex flex-col gap-3 border-t border-line pt-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="max-w-2xl text-xs leading-5 text-muted-copy">System Administrator accounts are intentionally excluded from routine staff creation. Existing administrators can still be maintained from the account list.</p>
          <button type="button" onClick={() => dialogRef.current?.close()} className="ga-btn-secondary shrink-0">Cancel</button>
        </div>
      </div>
    </dialog>
  )
}

function GeneratedCredentialNotice() {
  return (
    <section aria-labelledby="generated-credential-title" className="overflow-hidden rounded-2xl border border-blue-200 bg-info-soft shadow-sm">
      <div className="flex items-start gap-4 p-4 sm:p-5">
        <span aria-hidden="true" className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-navy text-white shadow-sm">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-5"><circle cx="8" cy="15" r="4" /><path d="m11 12 8-8M18 5l2 2M15 8l2 2" /></svg>
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 id="generated-credential-title" className="font-extrabold text-ink">Secure temporary credential</h3>
            <span className="rounded-full border border-blue-200 bg-white px-2.5 py-1 text-xs font-bold text-brand-blue">System generated</span>
          </div>
          <p className="mt-1 text-sm leading-6 text-copy">After the account is created, the server generates a random 16-character password. Administrators cannot enter or reuse a predictable password.</p>
        </div>
      </div>
      <ol className="grid border-t border-blue-200 bg-white/70 sm:grid-cols-3">
        {['Created on the server', 'Shown once after creation', 'Changed at first sign-in'].map((label, index) => <li key={label} className="flex items-center gap-3 border-blue-100 px-4 py-3 text-xs font-bold text-copy not-last:border-b sm:not-last:border-r sm:not-last:border-b-0"><span aria-hidden="true" className="grid size-6 shrink-0 place-items-center rounded-full bg-brand-blue text-[0.7rem] text-white">{index + 1}</span>{label}</li>)}
      </ol>
    </section>
  )
}

function StaffFormDialog({ activeBarangays, currentUserId, initialRole, onBack, onClose, onSave, user }) {
  const dialogRef = useRef(null)
  const [form, setForm] = useState(() => user ? {
    username: user.username ?? '', fullName: user.fullName, email: user.email,
    contactNumber: user.contactNumber ?? '', role: user.role, barangayId: user.barangayId ?? '',
  } : { ...emptyStaff, role: initialRole ?? emptyStaff.role })
  const [isSaving, setIsSaving] = useState(false)
  const isSelf = user?.userId === currentUserId
  const roleLabel = STAFF_ROLE_LABELS[form.role]
  const selectedRole = creatableStaffRoles.find((option) => option.role === form.role)
  const staffIdPreview = user?.employeeId ?? `${form.role === 'DSWD_STAFF' ? 'DSWD' : 'BSTF'}-####`
  useEffect(() => { dialogRef.current?.showModal() }, [])
  function change(field, value) { setForm((current) => ({ ...current, [field]: value })) }
  async function submit(event) {
    event.preventDefault()
    const payload = buildStaffAccountPayload(form, user)
    if (user && Object.keys(payload).length === 0) { toast.info('No staff account changes to save.'); return dialogRef.current?.close() }
    setIsSaving(true)
    try { await onSave(payload); dialogRef.current?.close() } catch { /* The page reports the API error. */ } finally { setIsSaving(false) }
  }
  return (
    <dialog ref={dialogRef} onClose={onClose} aria-labelledby="staff-form-title" aria-describedby="staff-form-description" className="m-auto max-h-[calc(100dvh-2rem)] w-[min(48rem,calc(100%-2rem))] overflow-y-auto rounded-2xl border border-line bg-white p-0 text-ink shadow-lg backdrop:bg-slate-950/55 backdrop:backdrop-blur-[3px]">
      <form onSubmit={submit} className="p-5 sm:p-7">
        <header className="flex items-start justify-between gap-5">
          <div>
            <p className="ga-eyebrow">{user ? 'Authorized personnel' : 'Staff account setup · Step 2 of 2'}</p>
            <h2 id="staff-form-title" className="mt-2 text-2xl font-extrabold tracking-tight">{user ? 'Edit staff account' : `Create ${roleLabel} account`}</h2>
            <p id="staff-form-description" className="mt-2 text-sm leading-6 text-muted-copy">Enter verified staff details. GarantiyAid assigns a permanent role-based Staff ID when the account is created.</p>
          </div>
          <button type="button" onClick={() => dialogRef.current?.close()} aria-label="Close staff form" className="grid size-11 shrink-0 place-items-center rounded-lg border border-line text-xl text-copy transition-colors hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue">×</button>
        </header>

        {isSelf && <p className="mt-5 rounded-lg border border-blue-200 bg-info-soft p-3 text-sm text-copy">You can update your contact details here. Your Staff ID and role remain fixed; another administrator manages your active status.</p>}

        <div data-dialog-stagger className="mt-6 grid gap-5 sm:grid-cols-2">
          {!user && (
            <div className="sm:col-span-2">
              <p className="ga-label">Selected staff type</p>
              <div className="mt-2 flex flex-col gap-4 rounded-xl border border-blue-200 bg-info-soft p-4 sm:flex-row sm:items-center">
                <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-brand-navy text-white"><RoleIcon role={form.role} className="size-6" /></span>
                <div className="min-w-0 flex-1"><p className="font-extrabold text-ink">{roleLabel}</p><p className="mt-1 text-xs font-semibold text-brand-blue">{selectedRole?.eyebrow}</p></div>
                <button type="button" onClick={onBack} disabled={isSaving} className="min-h-11 shrink-0 rounded-lg px-4 text-sm font-bold text-brand-blue transition-colors hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue">Change type</button>
              </div>
            </div>
          )}

          <div className="sm:col-span-2">
            <p className="ga-label">System-generated Staff ID</p>
            <div className="mt-2 flex flex-col gap-4 rounded-xl border border-dashed border-blue-300 bg-slate-50 p-4 sm:flex-row sm:items-center">
              <span aria-hidden="true" className="grid size-11 shrink-0 place-items-center rounded-lg bg-white text-brand-blue shadow-sm ring-1 ring-blue-200">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-5"><path d="M15 7h3a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h3" /><path d="M9 4h6v6H9zM8 14h8M8 17h5" /></svg>
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <output className="font-mono text-lg font-extrabold tracking-wide text-ink">{staffIdPreview}</output>
                  <span className="rounded-full border border-blue-200 bg-white px-2.5 py-1 text-xs font-bold text-brand-blue">{user ? 'Permanent' : 'Assigned after creation'}</span>
                </div>
                <p className="mt-1 text-xs leading-5 text-muted-copy">{user ? 'This identifier cannot be edited or reassigned.' : `The server reserves the next ${form.role === 'DSWD_STAFF' ? 'DSWD' : 'BSTF'} number securely. Administrators do not enter IDs manually.`}</p>
              </div>
            </div>
          </div>
          <Field id="staff-full-name" label="Full name" required maxLength="150" autoComplete="name" autoFocus={!user} value={form.fullName} onChange={(value) => change('fullName', value)} />
          <Field id="staff-email" label="Official email" type="email" required maxLength="150" autoComplete="email" value={form.email} onChange={(value) => change('email', value)} />
          <PhilippineMobileField id="staff-contact" value={form.contactNumber} onChange={(value) => change('contactNumber', value)} />

          {user && <div><p className="ga-label">System role</p><div className="mt-2 flex min-h-12 items-center gap-3 rounded-lg border border-line bg-slate-100 px-4 text-sm"><RoleIcon role={form.role} className="size-5 text-brand-blue" /><span className="font-bold text-ink">{roleLabel}</span><span className="ml-auto rounded-full border border-line bg-white px-2.5 py-1 text-xs font-bold text-muted-copy">Fixed</span></div><p className="mt-2 text-xs leading-5 text-muted-copy">Role is permanent because it determines the Staff ID and access scope.</p></div>}
          {form.role === 'DSWD_STAFF' ? <div className="rounded-lg border border-blue-200 bg-info-soft p-4 text-sm leading-6 text-copy"><strong className="text-ink">Sign-in method:</strong> DSWD Staff use the generated <span className="font-mono font-bold">DSWD-####</span> Staff ID. No username is created.</div> : <Field id="staff-username" label="Username" required minLength="4" maxLength="30" pattern="[a-zA-Z][a-zA-Z0-9._]{3,29}" autoComplete="username" value={form.username} onChange={(value) => change('username', value)} description="Optional sign-in alternative to the permanent BSTF Staff ID. Starts with a letter; lowercase letters, numbers, dots, and underscores only." />}
          {form.role === 'BARANGAY_FACILITATOR' && <div className="sm:col-span-2"><label htmlFor="staff-barangay" className="ga-label">Assigned barangay</label><select id="staff-barangay" required value={form.barangayId} onChange={(event) => change('barangayId', event.target.value)} className="ga-input mt-2"><option value="">Select an active barangay</option>{activeBarangays.map((barangay) => <option key={barangay.barangayId} value={barangay.barangayId}>{barangay.barangayName}, {barangay.city}</option>)}</select><p className="mt-2 text-xs leading-5 text-muted-copy">Facilitators can access beneficiary and distribution records only for this barangay.</p></div>}
          {!user && (
            <div className="sm:col-span-2">
              <GeneratedCredentialNotice />
            </div>
          )}
        </div>

        <div className="mt-7 flex flex-col-reverse gap-3 border-t border-line pt-5 sm:flex-row sm:justify-end">
          <button type="button" disabled={isSaving} onClick={() => dialogRef.current?.close()} className="ga-btn-secondary">Cancel</button>
          <button type="submit" disabled={isSaving} className="ga-btn-primary">{isSaving ? <LoadingLabel>{user ? 'Saving changes...' : 'Creating account...'}</LoadingLabel> : user ? 'Save account' : `Create ${roleLabel} account`}</button>
        </div>
      </form>
    </dialog>
  )
}

function StaffAccountCreatedDialog({ account, onClose }) {
  const dialogRef = useRef(null)
  const [passwordVisible, setPasswordVisible] = useState(false)
  const [copyStatus, setCopyStatus] = useState('')
  const { temporaryPassword, user } = account
  const loginIdentifier = user.username ? `${user.employeeId} or ${user.username}` : user.employeeId

  useEffect(() => { dialogRef.current?.showModal() }, [])

  async function copyHandoff() {
    const handoff = [
      'GarantiyAid staff account',
      `Name: ${user.fullName}`,
      `Staff ID: ${user.employeeId}`,
      `Sign-in Staff ID${user.username ? ' or username' : ''}: ${loginIdentifier}`,
      `Temporary password: ${temporaryPassword}`,
      'Next: Sign in, create a private password, then set up an authenticator.',
    ].join('\n')

    try {
      await navigator.clipboard.writeText(handoff)
      setCopyStatus('Secure handoff copied. Clear the clipboard after sharing it through an approved channel.')
    } catch {
      toast.error('The secure handoff could not be copied. Copy each value manually.')
    }
  }

  return (
    <dialog ref={dialogRef} onClose={onClose} aria-labelledby="staff-created-title" aria-describedby="staff-created-description" className="m-auto max-h-[calc(100dvh-2rem)] w-[min(42rem,calc(100%-2rem))] overflow-y-auto rounded-2xl border border-line bg-white p-0 text-ink shadow-lg backdrop:bg-slate-950/55 backdrop:backdrop-blur-[3px]">
      <div className="p-5 sm:p-7">
        <header className="flex items-start gap-4">
          <span aria-hidden="true" className="grid size-12 shrink-0 place-items-center rounded-full bg-success-soft text-brand-green ring-1 ring-emerald-200">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" className="size-6"><path d="m5 12 4 4L19 6" /></svg>
          </span>
          <div className="min-w-0 flex-1">
            <p className="ga-eyebrow text-brand-green">Account created</p>
            <h2 id="staff-created-title" className="mt-2 text-2xl font-extrabold tracking-tight">Securely hand off the new account</h2>
            <p id="staff-created-description" className="mt-2 text-sm leading-6 text-muted-copy">These credentials are shown only in this window. Share them with {user.fullName} through an approved channel.</p>
          </div>
          <button type="button" onClick={() => dialogRef.current?.close()} aria-label="Close account handoff" className="grid size-11 shrink-0 place-items-center rounded-lg border border-line text-xl text-copy transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-brand-blue">×</button>
        </header>

        <div data-dialog-stagger className="mt-6 space-y-4">
          <section className="overflow-hidden rounded-xl bg-brand-navy p-5 text-white shadow-sm" aria-label="Generated Staff ID">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><p className="text-xs font-bold uppercase tracking-[0.12em] text-blue-200">Permanent Staff ID</p><p className="mt-2 font-mono text-2xl font-extrabold tracking-wide sm:text-3xl">{user.employeeId}</p></div>
              <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-bold">System generated</span>
            </div>
            <p className="mt-3 text-sm leading-6 text-slate-300">This permanent Staff ID can be used to sign in{user.username ? '; the username remains available as an alternative.' : '.'}</p>
          </section>

          <section className="rounded-xl border border-line bg-slate-50 p-4 sm:p-5" aria-labelledby="handoff-credentials-title">
            <div className="flex flex-wrap items-center justify-between gap-2"><h3 id="handoff-credentials-title" className="font-extrabold">One-time credential handoff</h3><span className="rounded-full border border-amber-200 bg-warning-soft px-2.5 py-1 text-xs font-bold text-brand-amber">Shown once</span></div>
            <dl className="mt-4 grid gap-4 sm:grid-cols-2">
              <div><dt className="text-xs font-bold uppercase tracking-wide text-muted-copy">Sign-in Staff ID{user.username ? ' or username' : ''}</dt><dd className="mt-1 break-all font-mono text-base font-extrabold text-ink">{loginIdentifier}</dd></div>
              <div><dt className="text-xs font-bold uppercase tracking-wide text-muted-copy">Temporary password</dt><dd className="mt-1 flex min-w-0 items-center gap-2"><input readOnly aria-label="Temporary password" type={passwordVisible ? 'text' : 'password'} value={temporaryPassword} className="min-w-0 flex-1 border-0 bg-transparent p-0 font-mono text-base font-extrabold text-ink outline-none" /><button type="button" onClick={() => setPasswordVisible((visible) => !visible)} className="min-h-11 rounded-lg px-3 text-sm font-bold text-brand-blue hover:bg-info-soft focus-visible:outline-2 focus-visible:outline-brand-blue">{passwordVisible ? 'Hide' : 'Show'}</button></dd></div>
            </dl>
          </section>

          <section className="rounded-xl border border-blue-200 bg-info-soft p-4 text-sm leading-6 text-copy">
            <h3 className="font-extrabold text-ink">What happens at first sign-in</h3>
            <ol className="mt-2 list-decimal space-y-1 pl-5"><li>Replace the temporary password with a private password.</li><li>Connect an authenticator app and verify the first TOTP code.</li><li>Save the one-time recovery codes before dashboard access.</li></ol>
          </section>
        </div>

        <p className="mt-4 min-h-5 text-xs font-semibold leading-5 text-brand-green" aria-live="polite">{copyStatus}</p>
        <div className="mt-4 flex flex-col-reverse gap-3 border-t border-line pt-5 sm:flex-row sm:justify-end">
          <button type="button" onClick={() => dialogRef.current?.close()} className="ga-btn-secondary">Done</button>
          <button type="button" onClick={copyHandoff} className="ga-btn-primary"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-5"><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>Copy secure handoff</button>
        </div>
      </div>
    </dialog>
  )
}

function BarangayFormDialog({ barangay, onClose, onSave }) {
  const dialogRef = useRef(null)
  const [form, setForm] = useState(() => barangay ? { barangayCode: barangay.barangayCode ?? '', barangayName: barangay.barangayName, city: barangay.city, province: barangay.province } : emptyBarangay)
  const [isSaving, setIsSaving] = useState(false)
  useEffect(() => { dialogRef.current?.showModal() }, [])
  function change(field, value) { setForm((current) => ({ ...current, [field]: value })) }
  async function submit(event) {
    event.preventDefault(); setIsSaving(true)
    try { await onSave(form); dialogRef.current?.close() } catch { /* The page reports the API error. */ } finally { setIsSaving(false) }
  }
  return (
    <dialog
      ref={dialogRef}
      onCancel={(event) => { if (isSaving) event.preventDefault() }}
      onClose={onClose}
      aria-labelledby="barangay-form-title"
      aria-describedby="barangay-form-description"
      className="m-auto max-h-[calc(100dvh-1rem)] w-[min(42rem,calc(100%-1rem))] overflow-y-auto rounded-2xl border border-line bg-white p-0 text-ink shadow-2xl backdrop:bg-slate-950/60 backdrop:backdrop-blur-[3px] sm:max-h-[calc(100dvh-2rem)] sm:w-[min(42rem,calc(100%-2rem))]"
    >
      <form onSubmit={submit}>
        <header className="border-b border-line bg-gradient-to-br from-white via-white to-blue-50/70 p-5 sm:p-7">
          <div className="flex items-start gap-4">
            <span aria-hidden="true" className="grid size-12 shrink-0 place-items-center rounded-xl bg-brand-navy text-white shadow-sm sm:size-14">
              <RoleIcon role="BARANGAY_FACILITATOR" className="size-6 sm:size-7" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-brand-blue">Service-area registry</p>
              <h2 id="barangay-form-title" className="mt-2 text-2xl font-extrabold tracking-tight sm:text-3xl">{barangay ? 'Edit barangay record' : 'Register a barangay'}</h2>
              <p id="barangay-form-description" className="mt-2 max-w-xl text-sm leading-6 text-muted-copy">Create an accurate service-area record using the barangay’s official name and local-government jurisdiction.</p>
            </div>
            <button type="button" disabled={isSaving} onClick={() => dialogRef.current?.close()} aria-label="Close barangay form" className="grid size-11 shrink-0 cursor-pointer place-items-center rounded-lg border border-line bg-white text-copy transition-colors hover:border-blue-200 hover:bg-info-soft hover:text-brand-blue focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue disabled:cursor-not-allowed disabled:opacity-50">
              <Icon name="close" />
            </button>
          </div>
        </header>

        <div data-dialog-stagger className="space-y-5 p-5 sm:p-7">
          <p className="text-xs font-semibold leading-5 text-muted-copy"><span className="font-extrabold text-brand-red">*</span> Required information</p>

          <fieldset className="rounded-2xl border border-line bg-white p-4 sm:p-5">
            <legend className="px-2 text-sm font-extrabold text-ink">Barangay identity</legend>
            <div className="mt-1 grid gap-5">
              <Field
                id="barangay-name"
                label="Official barangay name"
                description="Enter the complete name used in official local-government records."
                required
                autoFocus
                maxLength="100"
                value={form.barangayName}
                onChange={(value) => change('barangayName', value)}
              />
              <Field
                id="barangay-code"
                label="Barangay code (optional)"
                description="Add the official administrative code when one is available."
                maxLength="20"
                value={form.barangayCode}
                onChange={(value) => change('barangayCode', value)}
              />
            </div>
          </fieldset>

          <fieldset className="rounded-2xl border border-line bg-slate-50/70 p-4 sm:p-5">
            <legend className="px-2 text-sm font-extrabold text-ink">Local-government jurisdiction</legend>
            <p className="mb-4 mt-1 text-xs leading-5 text-muted-copy">This determines where the barangay appears in staff assignments and service-area filters.</p>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field id="barangay-city" label="City or municipality" required maxLength="100" value={form.city} onChange={(value) => change('city', value)} />
              <Field id="barangay-province" label="Province" required maxLength="100" value={form.province} onChange={(value) => change('province', value)} />
            </div>
          </fieldset>

          <div className="flex items-start gap-3 rounded-xl border border-blue-200 bg-info-soft p-4 text-sm leading-6 text-copy">
            <span aria-hidden="true" className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-white text-brand-blue shadow-sm"><Icon name="info" className="size-4" strokeWidth={2} /></span>
            <p><strong className="text-ink">Before saving:</strong> verify the spelling and jurisdiction. These details will be used when assigning Barangay Facilitator accounts.</p>
          </div>
        </div>

        <footer className="flex flex-col-reverse gap-3 border-t border-line bg-slate-50/80 p-5 sm:flex-row sm:items-center sm:justify-end sm:px-7">
          <button type="button" disabled={isSaving} onClick={() => dialogRef.current?.close()} className="ga-btn-secondary">Cancel</button>
          <button type="submit" disabled={isSaving} className="ga-btn-primary">
            {isSaving ? <LoadingLabel>{barangay ? 'Saving changes...' : 'Registering barangay...'}</LoadingLabel> : <><Icon name={barangay ? 'check' : 'plus'} />{barangay ? 'Save changes' : 'Register barangay'}</>}
          </button>
        </footer>
      </form>
    </dialog>
  )
}

function StaffActions({ isSelf, onEdit, onToggle, user }) {
  if (user.archivedAt) return <button type="button" onClick={() => onToggle(user, 'restore')} className="inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-bold text-brand-green hover:bg-success-soft focus-visible:outline-2 focus-visible:outline-brand-green"><Icon name="reset" />Restore account</button>
  const archivesHistory = user.removalMode === 'ARCHIVE'
  return <div className="flex flex-wrap gap-2"><button type="button" onClick={() => onEdit(user)} className="min-h-11 rounded-lg px-3 text-sm font-bold text-brand-blue hover:bg-info-soft focus-visible:outline-2 focus-visible:outline-brand-blue">Edit</button><button type="button" disabled={isSelf} title={isSelf ? 'Another administrator must change your active status.' : user.isActive ? 'Block sign-in and revoke active sessions without deleting records.' : 'Restore sign-in access using the existing credentials.'} onClick={() => onToggle(user)} className={`min-h-11 rounded-lg px-3 text-sm font-bold focus-visible:outline-2 disabled:cursor-not-allowed disabled:text-slate-400 ${user.isActive ? 'text-brand-red hover:bg-danger-soft focus-visible:outline-brand-red' : 'text-brand-green hover:bg-success-soft focus-visible:outline-brand-green'}`}>{user.isActive ? 'Deactivate' : 'Reactivate'}</button>{!user.isActive && <button type="button" disabled={isSelf} title={archivesHistory ? 'Hide this account while preserving its linked official records.' : 'Permanently delete this unused account while retaining its audit entries.'} onClick={() => onToggle(user, true)} className={`inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-bold focus-visible:outline-2 disabled:cursor-not-allowed disabled:text-slate-400 ${archivesHistory ? 'text-brand-blue hover:bg-info-soft focus-visible:outline-brand-blue' : 'text-brand-red hover:bg-danger-soft focus-visible:outline-brand-red'}`}>{archivesHistory && <Icon name="archive" />}{archivesHistory ? 'Move to archive' : 'Delete'}</button>}</div>
}

function StaffBarangayAdministrationPage({ session, onLogout, onNavigate, onSessionExpired }) {
  const authorized = session.user.role === 'SYSTEM_ADMIN'
  const [view, setView] = useState('staff')
  const [staffDraft, setStaffDraft] = useState({ search: '', role: '', isActive: '', archived: 'false' })
  const [staffFilters, setStaffFilters] = useState(staffDraft)
  const [staffPage, setStaffPage] = useState(1)
  const [staffData, setStaffData] = useState(null)
  const [barangays, setBarangays] = useState([])
  const [barangaySearch, setBarangaySearch] = useState('')
  const [barangayStatus, setBarangayStatus] = useState('')
  const [staffLoading, setStaffLoading] = useState(authorized)
  const [barangayLoading, setBarangayLoading] = useState(authorized)
  const [staffError, setStaffError] = useState('')
  const [barangayError, setBarangayError] = useState('')
  const [staffReload, setStaffReload] = useState(0)
  const [barangayReload, setBarangayReload] = useState(0)
  const [staffRolePickerOpen, setStaffRolePickerOpen] = useState(false)
  const [staffForm, setStaffForm] = useState(null)
  const [createdStaff, setCreatedStaff] = useState(null)
  const [barangayForm, setBarangayForm] = useState(null)
  const [confirmation, setConfirmation] = useState(null)
  const showingArchived = staffFilters.archived === 'true'
  const staffRegistryRef = useMotionEntry(showingArchived ? 'archived' : 'current')
  const staffRegistryHeadingRef = useRef(null)
  const archiveViewInitialized = useRef(false)

  const reportError = useCallback((requestError) => {
    if (isSessionExpiredError(requestError)) return onSessionExpired()
    toast.error(getAuthErrorMessage(requestError))
  }, [onSessionExpired])

  useEffect(() => {
    if (!authorized) return undefined
    let active = true
    requestStaffUserList(session.accessToken, { page: staffPage, pageSize: 20, ...staffFilters })
      .then((result) => { if (active) { setStaffData(result); setStaffError('') } })
      .catch((error) => { if (active) { if (isSessionExpiredError(error)) return onSessionExpired(); setStaffError(getAuthErrorMessage(error)) } })
      .finally(() => { if (active) setStaffLoading(false) })
    return () => { active = false }
  }, [authorized, onSessionExpired, session.accessToken, staffFilters, staffPage, staffReload])

  useEffect(() => {
    if (!authorized) return undefined
    let active = true
    requestBarangayList(session.accessToken, { activeOnly: false })
      .then((items) => { if (active) { setBarangays(items); setBarangayError('') } })
      .catch((error) => { if (active) { if (isSessionExpiredError(error)) return onSessionExpired(); setBarangayError(getAuthErrorMessage(error)) } })
      .finally(() => { if (active) setBarangayLoading(false) })
    return () => { active = false }
  }, [authorized, barangayReload, onSessionExpired, session.accessToken])

  useEffect(() => {
    if (!archiveViewInitialized.current) {
      archiveViewInitialized.current = true
      return
    }
    staffRegistryHeadingRef.current?.focus({ preventScroll: true })
  }, [showingArchived])

  const activeBarangays = useMemo(() => barangays.filter((barangay) => barangay.isActive), [barangays])
  const visibleBarangays = useMemo(() => {
    const search = barangaySearch.trim().toLowerCase()
    return barangays.filter((barangay) => (!barangayStatus || String(barangay.isActive) === barangayStatus) && (!search || [barangay.barangayCode, barangay.barangayName, barangay.city, barangay.province].some((value) => value?.toLowerCase().includes(search))))
  }, [barangaySearch, barangayStatus, barangays])

  function applyStaffFilters(event) { event.preventDefault(); setStaffLoading(true); setStaffPage(1); setStaffFilters({ ...staffDraft, search: staffDraft.search.trim() }) }
  async function saveStaff(payload) {
    try {
      const isEditing = Boolean(staffForm.user)
      if (isEditing) {
        const saved = await updateStaffUser(session.accessToken, staffForm.user.userId, payload)
        toast.success('Staff account updated.', { description: `${saved.fullName} · ${STAFF_ROLE_LABELS[saved.role]}` })
      } else {
        setCreatedStaff(await createStaffUser(session.accessToken, payload))
      }
      setStaffForm(null); setStaffLoading(true); setStaffReload((value) => value + 1)
    } catch (error) { reportError(error); throw error }
  }
  async function saveBarangay(payload) {
    try {
      const saved = barangayForm.barangay ? await updateBarangay(session.accessToken, barangayForm.barangay.barangayId, payload) : await createBarangay(session.accessToken, payload)
      toast.success(barangayForm.barangay ? 'Barangay record updated.' : 'Barangay added.', { description: `${saved.barangayName}, ${saved.city}` })
      setBarangayForm(null); setBarangayLoading(true); setBarangayReload((value) => value + 1)
    } catch (error) { reportError(error); throw error }
  }
  async function confirmStatusChange(_reason, typedConfirmation) {
    const action = confirmation
    try {
      if (action.type === 'delete-staff') {
        const result = await removeStaffUser(session.accessToken, action.record.userId, typedConfirmation)
        toast.success(result.removalMode === 'ARCHIVE' ? 'Staff account archived; official history preserved.' : 'Unused staff account permanently deleted; audit entries retained.', { description: action.record.employeeId })
        setStaffLoading(true); setStaffPage(1); setStaffReload((value) => value + 1)
      } else if (action.type === 'restore-staff') {
        await restoreStaffUser(session.accessToken, action.record.userId)
        toast.success('Staff account restored to the inactive list.', { description: `${action.record.employeeId} must be reactivated before sign-in.` })
        setStaffLoading(true); setStaffPage(1); setStaffReload((value) => value + 1)
      } else if (action.type === 'staff') {
        await updateStaffUser(session.accessToken, action.record.userId, { isActive: !action.record.isActive })
        toast.success(action.record.isActive ? 'Staff account deactivated and sessions revoked.' : 'Staff account reactivated.')
        setStaffLoading(true); setStaffReload((value) => value + 1)
      } else {
        await updateBarangay(session.accessToken, action.record.barangayId, { isActive: !action.record.isActive })
        toast.success(action.record.isActive ? 'Barangay deactivated.' : 'Barangay reactivated.')
        setBarangayLoading(true); setBarangayReload((value) => value + 1)
      }
      setConfirmation(null)
    } catch (error) { reportError(error); throw error }
  }
  function toggleStaff(user, action) {
    if (action === 'restore') return restoreStaff(user)
    if (action) return removeStaff(user)
    setConfirmation({ type: 'staff', record: user, title: `${user.isActive ? 'Deactivate' : 'Reactivate'} ${user.fullName}?`, description: user.isActive ? 'The account will be unable to sign in and every active session will be revoked. Historical activity remains in the audit log.' : 'The staff member will be allowed to sign in again using their existing credentials.', actionLabel: user.isActive ? 'Deactivate account' : 'Reactivate account', destructive: user.isActive })
  }
  function removeStaff(user) {
    const archivesHistory = user.removalMode === 'ARCHIVE'
    setConfirmation({ type: 'delete-staff', record: user, title: archivesHistory ? `Move ${user.fullName} to the archive?` : `Permanently delete ${user.fullName}?`, description: archivesHistory ? 'The account will move to Archived accounts and remain unable to sign in. Linked government and audit records will be preserved.' : 'This unused account will be permanently deleted. Existing audit entries will remain with a preserved Staff ID snapshot.', actionLabel: archivesHistory ? 'Move to archive' : 'Delete account permanently', confirmationText: `${archivesHistory ? 'ARCHIVE' : 'DELETE'} ${user.employeeId}`, destructive: !archivesHistory })
  }
  function restoreStaff(user) {
    setConfirmation({ type: 'restore-staff', record: user, title: `Restore ${user.fullName}?`, description: 'The account will return to the inactive staff list. It will remain unable to sign in until an administrator reactivates it.', actionLabel: 'Restore account' })
  }
  function changeStaffArchiveView(archived) {
    const nextFilters = { ...staffFilters, archived: archived ? 'true' : 'false', isActive: '' }
    setStaffDraft(nextFilters); setStaffFilters(nextFilters); setStaffPage(1); setStaffLoading(true)
  }
  function toggleBarangay(barangay) {
    setConfirmation({ type: 'barangay', record: barangay, title: `${barangay.isActive ? 'Deactivate' : 'Reactivate'} ${barangay.barangayName}?`, description: barangay.isActive ? 'New facilitator assignments and distribution events will be blocked. Active facilitators must be reassigned or deactivated first.' : 'The barangay will become available for staff assignments and new distribution events.', actionLabel: barangay.isActive ? 'Deactivate barangay' : 'Reactivate barangay', destructive: barangay.isActive })
  }

  const staffRows = staffData?.users ?? []
  const activeBarangayCount = barangays.filter((barangay) => barangay.isActive).length
  if (!authorized) return <DashboardShell breadcrumbs={['Operations', 'Administration']} currentPath="/admin/administration" onLogout={onLogout} onNavigate={onNavigate} pageTitle="Staff & barangays" user={session.user}><section className="ga-card mx-auto max-w-md p-8 text-center" role="alert"><h1 className="text-2xl font-extrabold">Administrator access required</h1><p className="mt-3 text-muted-copy">Only System Administrators can manage staff accounts and barangay service areas.</p><button type="button" onClick={() => onNavigate('/dashboard')} className="ga-btn-primary mt-6">Return to dashboard</button></section></DashboardShell>

  return <DashboardShell breadcrumbs={['Operations', 'Administration', view === 'staff' ? 'Staff accounts' : 'Barangays']} currentPath="/admin/administration" onLogout={onLogout} onNavigate={onNavigate} pageTitle="Staff & barangays" user={session.user}>
    <header className="flex flex-col gap-5 border-b border-line pb-6 sm:flex-row sm:items-end sm:justify-between"><div><p className="ga-eyebrow">Administration</p><h1 className="ga-page-title">Staff and barangays</h1><p className="ga-page-copy">Create the barangay first, then create and assign the staff member who will operate there.</p></div><div className="flex flex-col gap-2 sm:flex-row">{view === 'staff' && <button type="button" onClick={() => changeStaffArchiveView(!showingArchived)} className="ga-btn-secondary shrink-0"><Icon name={showingArchived ? 'arrowLeft' : 'archive'} />{showingArchived ? 'Back to current accounts' : 'Archived accounts'}</button>}<button type="button" onClick={() => view === 'staff' ? setStaffRolePickerOpen(true) : setBarangayForm({ barangay: null })} className="ga-btn-primary shrink-0">{view === 'staff' ? 'Create staff account' : 'Add barangay'}</button></div></header>
    <section className="ga-card mt-6 overflow-hidden" aria-labelledby="setup-path-heading">
      <div className="border-b border-line px-5 py-4"><p className="ga-eyebrow">Recommended order</p><h2 id="setup-path-heading" className="mt-1 text-lg font-bold text-ink">Set up a barangay workspace</h2></div>
      <ol className="grid md:grid-cols-3">
        {[
          ['administration', 'Add the barangay', 'Record the official name, city or municipality, and province.'],
          ['people', 'Create the staff account', 'Choose Barangay Facilitator and enter verified staff information.'],
          ['check', 'Assign and activate', 'Link the facilitator to the barangay and issue the one-time credentials.'],
        ].map(([icon, title, description], index) => <li key={title} className="border-b border-line p-5 last:border-b-0 md:border-b-0 md:border-r md:last:border-r-0"><div className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-lg bg-info-soft text-brand-blue"><Icon name={icon} className="size-4" strokeWidth={2.2} /></span><span className="text-xs font-bold tabular-nums text-muted-copy">STEP {index + 1}</span></div><h3 className="mt-4 font-bold text-ink">{title}</h3><p className="mt-1 text-sm leading-6 text-muted-copy">{description}</p></li>)}
      </ol>
      <p className="border-t border-line bg-slate-50 px-5 py-3 text-xs leading-5 text-muted-copy">Account, role, assignment, status, and barangay changes are recorded in the audit log.</p>
    </section>
    <div className="mt-5 inline-flex w-full rounded-xl border border-line bg-white p-1 shadow-sm sm:w-auto" role="group" aria-label="Administration section"><button type="button" aria-pressed={view === 'staff'} onClick={() => setView('staff')} className={`min-h-11 flex-1 rounded-lg px-5 text-sm font-bold transition-colors sm:flex-none ${view === 'staff' ? 'bg-brand-navy text-white' : 'text-copy hover:bg-slate-50'}`}>Staff accounts <span className="ml-1 opacity-75">{staffData?.pagination.total ?? '—'}</span></button><button type="button" aria-pressed={view === 'barangays'} onClick={() => setView('barangays')} className={`min-h-11 flex-1 rounded-lg px-5 text-sm font-bold transition-colors sm:flex-none ${view === 'barangays' ? 'bg-brand-navy text-white' : 'text-copy hover:bg-slate-50'}`}>Barangays <span className="ml-1 opacity-75">{barangays.length || '—'}</span></button></div>

    {view === 'staff' ? <section ref={staffRegistryRef} className="mt-5" aria-labelledby="staff-registry-heading"><div className="flex items-start gap-3"><span aria-hidden="true" className="grid size-11 shrink-0 place-items-center rounded-xl bg-info-soft text-brand-blue"><Icon name={showingArchived ? 'archive' : 'people'} /></span><div><p className="ga-eyebrow">{showingArchived ? 'Preserved registry' : 'Account registry'}</p><h2 ref={staffRegistryHeadingRef} tabIndex={-1} id="staff-registry-heading" className="mt-1 text-xl font-extrabold text-ink">{showingArchived ? 'Archived accounts' : 'Current staff accounts'}</h2><p className="mt-1 text-sm leading-6 text-muted-copy">{showingArchived ? 'These accounts cannot sign in. Their official records and audit history remain preserved.' : 'Manage active and inactive staff accounts, access, and assignments.'}</p></div></div><div className="mt-4 grid gap-3 sm:grid-cols-3"><div className="ga-card-flat p-4"><p className="text-xs font-bold uppercase tracking-wide text-muted-copy">{showingArchived ? 'Archived accounts' : 'Matching accounts'}</p><p className="mt-1 text-2xl font-extrabold tabular-nums">{staffData?.pagination.total ?? '—'}</p></div><div className="ga-card-flat p-4"><p className="text-xs font-bold uppercase tracking-wide text-muted-copy">Current role scope</p><p className="mt-1 text-base font-extrabold">{staffFilters.role ? STAFF_ROLE_LABELS[staffFilters.role] : 'All staff roles'}</p></div><button type="button" onClick={() => onNavigate('/admin/staff-security')} className="ga-card-flat min-h-20 cursor-pointer p-4 text-left transition-colors hover:border-blue-300 hover:bg-info-soft focus-visible:outline-2 focus-visible:outline-brand-blue"><p className="text-xs font-bold uppercase tracking-wide text-brand-blue">Security recovery</p><p className="mt-1 font-extrabold">Manage TOTP resets →</p></button></div>
      <aside className="mt-4 flex items-start gap-3 rounded-xl border border-blue-200 bg-info-soft p-4 text-sm leading-6 text-copy"><span aria-hidden="true" className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-white text-brand-blue shadow-sm"><Icon name={showingArchived ? 'archive' : 'info'} className="size-4" strokeWidth={2} /></span>{showingArchived ? <p><strong className="text-ink">Archived accounts:</strong> Restore returns an account to the inactive list. A separate Reactivate action is still required before the staff member can sign in.</p> : <p><strong className="text-ink">Deactivate, archive, or delete:</strong> Deactivate is reversible. Inactive accounts with official history can be moved to the archive while preserving records; unused or audit-only accounts can be permanently deleted without deleting their audit entries.</p>}</aside>
      <form onSubmit={applyStaffFilters} className={`ga-card mt-4 grid gap-3 p-4 sm:grid-cols-2 ${showingArchived ? 'xl:grid-cols-[minmax(0,1fr)_14rem_auto]' : 'xl:grid-cols-[minmax(0,1fr)_14rem_11rem_auto]'}`} aria-label={`${showingArchived ? 'Archived' : 'Current'} staff account filters`}><div><label htmlFor="staff-search" className="sr-only">Search staff accounts</label><input id="staff-search" value={staffDraft.search} onChange={(event) => setStaffDraft((current) => ({ ...current, search: event.target.value }))} placeholder="Search name, Staff ID, username, or email" className="ga-input" /></div><div><label htmlFor="staff-filter-role" className="sr-only">Staff role</label><select id="staff-filter-role" value={staffDraft.role} onChange={(event) => setStaffDraft((current) => ({ ...current, role: event.target.value }))} className="ga-input">{roles.map((role) => <option key={role || 'ALL'} value={role}>{role ? STAFF_ROLE_LABELS[role] : 'All roles'}</option>)}</select></div>{!showingArchived && <div><label htmlFor="staff-filter-status" className="sr-only">Account status</label><select id="staff-filter-status" value={staffDraft.isActive} onChange={(event) => setStaffDraft((current) => ({ ...current, isActive: event.target.value }))} className="ga-input"><option value="">All statuses</option><option value="true">Active</option><option value="false">Inactive</option></select></div>}<button type="submit" className="ga-btn-primary">Apply filters</button></form>
      <div className="ga-card mt-4 overflow-hidden">
        {staffLoading ? <LoadingRows label="Loading staff accounts" /> : staffError ? <div className="p-6" role="alert"><h2 className="font-extrabold">Staff accounts could not be loaded</h2><p className="mt-2 text-sm text-muted-copy">{staffError}</p><button type="button" onClick={() => { setStaffLoading(true); setStaffReload((value) => value + 1) }} className="ga-btn-primary mt-4">Try again</button></div> : staffRows.length === 0 ? <div className="p-10 text-center"><span className="mx-auto grid size-12 place-items-center rounded-full bg-info-soft font-black text-brand-blue">0</span><h2 className="mt-4 font-extrabold">{staffFilters.archived === 'true' ? 'No archived accounts' : 'No staff accounts found'}</h2><p className="mt-2 text-sm text-muted-copy">{staffFilters.archived === 'true' ? 'Archived staff accounts will appear here and can be restored.' : 'Adjust the filters or create the first account in this scope.'}</p></div> : <>
          <div className="hidden overflow-x-auto lg:block"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-muted-copy"><tr><th className="px-5 py-3">Staff member</th><th className="px-5 py-3">Role and scope</th><th className="px-5 py-3">Security</th><th className="px-5 py-3">Status</th><th className="px-5 py-3 text-right">Actions</th></tr></thead><tbody className="divide-y divide-line">{staffRows.map((user) => <tr key={user.userId} className="hover:bg-slate-50"><td className="px-5 py-4"><div className="flex items-center gap-3"><span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-navy text-xs font-bold text-white">{initials(user.fullName)}</span><div className="min-w-0"><p className="font-bold text-ink">{user.fullName}</p><p className="mt-1 text-xs text-muted-copy">{user.employeeId} · {user.username || 'Staff ID login'}</p><p className="mt-1 text-xs text-muted-copy">{user.email}</p></div></div></td><td className="px-5 py-4"><p className="font-bold">{STAFF_ROLE_LABELS[user.role]}</p><p className="mt-1 text-xs text-muted-copy">{user.barangay ? `${user.barangay.barangayName}, ${user.barangay.city}` : 'National or system-wide scope'}</p></td><td className="px-5 py-4"><p className={`font-bold ${user.archivedAt ? 'text-brand-blue' : user.totpEnabled ? 'text-brand-green' : 'text-brand-amber'}`}>{user.archivedAt ? 'History preserved' : user.totpEnabled ? 'TOTP active' : 'Setup required'}</p><p className="mt-1 text-xs text-muted-copy">{user.archivedAt ? 'Archived' : 'Updated'} {dateFormatter.format(new Date(user.archivedAt || user.updatedAt))}</p></td><td className="px-5 py-4"><StatusBadge active={user.isActive} archivedAt={user.archivedAt} /></td><td className="px-5 py-4"><div className="flex justify-end"><StaffActions user={user} isSelf={user.userId === session.user.userId} onEdit={(record) => setStaffForm({ user: record })} onToggle={toggleStaff} /></div></td></tr>)}</tbody></table></div>
          <div className="divide-y divide-line lg:hidden">{staffRows.map((user) => <article key={user.userId} className="p-5"><div className="flex items-start gap-3"><span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-navy text-xs font-bold text-white">{initials(user.fullName)}</span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-start justify-between gap-2"><h2 className="font-extrabold">{user.fullName}</h2><StatusBadge active={user.isActive} archivedAt={user.archivedAt} /></div><p className="mt-1 text-sm text-muted-copy">{user.employeeId} · {STAFF_ROLE_LABELS[user.role]}</p><p className="mt-2 text-sm font-semibold text-copy">{user.barangay?.barangayName || 'National or system-wide scope'}</p><p className={`mt-2 text-sm font-bold ${user.archivedAt ? 'text-brand-blue' : user.totpEnabled ? 'text-brand-green' : 'text-brand-amber'}`}>{user.archivedAt ? `Archived ${dateFormatter.format(new Date(user.archivedAt))}` : user.totpEnabled ? 'TOTP active' : 'Authenticator setup required'}</p></div></div><div className="mt-4 border-t border-line pt-3"><StaffActions user={user} isSelf={user.userId === session.user.userId} onEdit={(record) => setStaffForm({ user: record })} onToggle={toggleStaff} /></div></article>)}</div>
          {staffData.pagination.totalPages > 1 && <div className="flex flex-col gap-3 border-t border-line px-5 py-4 text-sm sm:flex-row sm:items-center sm:justify-between"><span>Page {staffPage} of {staffData.pagination.totalPages}</span><div className="flex gap-2"><button type="button" disabled={staffPage === 1} onClick={() => { setStaffLoading(true); setStaffPage((value) => value - 1) }} className="ga-btn-secondary min-h-11 px-4 text-sm">Previous</button><button type="button" disabled={staffPage === staffData.pagination.totalPages} onClick={() => { setStaffLoading(true); setStaffPage((value) => value + 1) }} className="ga-btn-secondary min-h-11 px-4 text-sm">Next</button></div></div>}
        </>}
      </div>
    </section> : <section className="mt-5"><div className="grid gap-3 sm:grid-cols-3"><div className="ga-card-flat p-4"><p className="text-xs font-bold uppercase tracking-wide text-muted-copy">Registered barangays</p><p className="mt-1 text-2xl font-extrabold tabular-nums">{barangays.length}</p></div><div className="ga-card-flat p-4"><p className="text-xs font-bold uppercase tracking-wide text-muted-copy">Active service areas</p><p className="mt-1 text-2xl font-extrabold tabular-nums text-brand-green">{activeBarangayCount}</p></div><div className="ga-card-flat p-4"><p className="text-xs font-bold uppercase tracking-wide text-muted-copy">Inactive records</p><p className="mt-1 text-2xl font-extrabold tabular-nums">{barangays.length - activeBarangayCount}</p></div></div>
      <div className="ga-card mt-4 grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_12rem]" aria-label="Barangay filters"><div><label htmlFor="barangay-search" className="sr-only">Search barangays</label><input id="barangay-search" value={barangaySearch} onChange={(event) => setBarangaySearch(event.target.value)} placeholder="Search name, code, city, or province" className="ga-input" /></div><div><label htmlFor="barangay-status" className="sr-only">Barangay status</label><select id="barangay-status" value={barangayStatus} onChange={(event) => setBarangayStatus(event.target.value)} className="ga-input"><option value="">All statuses</option><option value="true">Active</option><option value="false">Inactive</option></select></div></div>
      <div className="ga-card mt-4 overflow-hidden">{barangayLoading ? <LoadingRows label="Loading barangays" /> : barangayError ? <div className="p-6" role="alert"><h2 className="font-extrabold">Barangays could not be loaded</h2><p className="mt-2 text-sm text-muted-copy">{barangayError}</p><button type="button" onClick={() => { setBarangayLoading(true); setBarangayReload((value) => value + 1) }} className="ga-btn-primary mt-4">Try again</button></div> : visibleBarangays.length === 0 ? <div className="p-10 text-center"><span className="mx-auto grid size-12 place-items-center rounded-full bg-info-soft font-black text-brand-blue">0</span><h2 className="mt-4 font-extrabold">No barangays found</h2><p className="mt-2 text-sm text-muted-copy">Adjust the search or add an official barangay record.</p></div> : <><div className="hidden overflow-x-auto md:block"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-muted-copy"><tr><th className="px-5 py-3">Barangay</th><th className="px-5 py-3">Jurisdiction</th><th className="px-5 py-3">Status</th><th className="px-5 py-3 text-right">Actions</th></tr></thead><tbody className="divide-y divide-line">{visibleBarangays.map((barangay) => <tr key={barangay.barangayId} className="hover:bg-slate-50"><td className="px-5 py-4"><p className="font-bold">{barangay.barangayName}</p><p className="mt-1 text-xs text-muted-copy">{barangay.barangayCode || 'No barangay code recorded'}</p></td><td className="px-5 py-4"><p>{barangay.city}</p><p className="mt-1 text-xs text-muted-copy">{barangay.province}</p></td><td className="px-5 py-4"><StatusBadge active={barangay.isActive} /></td><td className="px-5 py-4"><div className="flex justify-end gap-2"><button type="button" onClick={() => setBarangayForm({ barangay })} className="min-h-11 rounded-lg px-3 text-sm font-bold text-brand-blue hover:bg-info-soft">Edit</button><button type="button" onClick={() => toggleBarangay(barangay)} className={`min-h-11 rounded-lg px-3 text-sm font-bold ${barangay.isActive ? 'text-brand-red hover:bg-danger-soft' : 'text-brand-green hover:bg-success-soft'}`}>{barangay.isActive ? 'Deactivate' : 'Reactivate'}</button></div></td></tr>)}</tbody></table></div><div className="divide-y divide-line md:hidden">{visibleBarangays.map((barangay) => <article key={barangay.barangayId} className="p-5"><div className="flex items-start justify-between gap-3"><div><h2 className="font-extrabold">{barangay.barangayName}</h2><p className="mt-1 text-sm text-muted-copy">{barangay.barangayCode || 'No code'} · {barangay.city}, {barangay.province}</p></div><StatusBadge active={barangay.isActive} /></div><div className="mt-4 flex gap-2 border-t border-line pt-3"><button type="button" onClick={() => setBarangayForm({ barangay })} className="min-h-11 rounded-lg px-3 text-sm font-bold text-brand-blue hover:bg-info-soft">Edit</button><button type="button" onClick={() => toggleBarangay(barangay)} className={`min-h-11 rounded-lg px-3 text-sm font-bold ${barangay.isActive ? 'text-brand-red hover:bg-danger-soft' : 'text-brand-green hover:bg-success-soft'}`}>{barangay.isActive ? 'Deactivate' : 'Reactivate'}</button></div></article>)}</div></>}</div>
    </section>}
    {staffRolePickerOpen && <StaffRoleDialog onClose={() => setStaffRolePickerOpen(false)} onSelect={(role) => { setStaffRolePickerOpen(false); setStaffForm({ user: null, role }) }} />}
    {staffForm && <StaffFormDialog activeBarangays={activeBarangays} currentUserId={session.user.userId} initialRole={staffForm.role} user={staffForm.user} onBack={staffForm.user ? undefined : () => { setStaffForm(null); setStaffRolePickerOpen(true) }} onClose={() => setStaffForm(null)} onSave={saveStaff} />}
    {createdStaff && <StaffAccountCreatedDialog account={createdStaff} onClose={() => setCreatedStaff(null)} />}
    {barangayForm && <BarangayFormDialog barangay={barangayForm.barangay} onClose={() => setBarangayForm(null)} onSave={saveBarangay} />}
    <ConfirmationDialog open={Boolean(confirmation)} title={confirmation?.title} description={confirmation?.description} actionLabel={confirmation?.actionLabel} confirmationText={confirmation?.confirmationText} destructive={confirmation?.destructive} onCancel={() => setConfirmation(null)} onConfirm={confirmStatusChange} />
  </DashboardShell>
}

export default StaffBarangayAdministrationPage
