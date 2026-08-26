import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import DashboardShell from '../components/layout/DashboardShell.jsx'
import { ConfirmationDialog } from '../components/ui/confirmation-dialog.jsx'
import { Skeleton } from '../components/ui/skeleton.jsx'
import {
  buildStaffAccountPayload,
  createBarangay,
  createStaffUser,
  getAuthErrorMessage,
  isSessionExpiredError,
  requestBarangayList,
  requestStaffUserList,
  STAFF_ROLE_LABELS,
  updateBarangay,
  updateStaffUser,
} from '../auth/staffAuth.js'

const roles = ['', 'SYSTEM_ADMIN', 'DSWD_STAFF', 'BARANGAY_FACILITATOR']
const emptyStaff = { employeeId: '', username: '', fullName: '', email: '', contactNumber: '', password: '', role: 'DSWD_STAFF', barangayId: '' }
const emptyBarangay = { barangayCode: '', barangayName: '', city: '', province: '' }
const dateFormatter = new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeZone: 'Asia/Manila' })
const initials = (name = 'Staff') => name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase()

function StatusBadge({ active }) {
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${active ? 'ga-status-success' : 'border-line bg-slate-100 text-copy'}`}>{active ? 'Active' : 'Inactive'}</span>
}

function LoadingRows({ label }) {
  return <div className="space-y-4 p-5" role="status" aria-label={label}>{Array.from({ length: 5 }, (_, index) => <div key={index} className="flex items-center gap-4"><Skeleton className="size-11 rounded-full" /><div className="flex-1"><Skeleton className="h-4 w-48 max-w-full" /><Skeleton className="mt-2 h-3 w-64 max-w-full" /></div><Skeleton className="hidden h-11 w-24 sm:block" /></div>)}</div>
}

function Field({ description, id, label, onChange, ...inputProps }) {
  return <div><label htmlFor={id} className="ga-label">{label}</label><input id={id} aria-describedby={description ? `${id}-description` : undefined} onChange={(event) => onChange(event.target.value)} className="ga-input mt-2" {...inputProps} />{description && <p id={`${id}-description`} className="mt-2 text-xs leading-5 text-muted-copy">{description}</p>}</div>
}

function StaffFormDialog({ activeBarangays, currentUserId, onClose, onSave, user }) {
  const dialogRef = useRef(null)
  const [form, setForm] = useState(() => user ? {
    employeeId: user.employeeId, username: user.username ?? '', fullName: user.fullName, email: user.email,
    contactNumber: user.contactNumber ?? '', password: '', role: user.role, barangayId: user.barangayId ?? '',
  } : emptyStaff)
  const [showPassword, setShowPassword] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const isSelf = user?.userId === currentUserId
  useEffect(() => { dialogRef.current?.showModal() }, [])
  function change(field, value) { setForm((current) => ({ ...current, [field]: value })) }
  async function submit(event) {
    event.preventDefault()
    const payload = buildStaffAccountPayload(form, user)
    if (user && Object.keys(payload).length === 0) { toast.info('No staff account changes to save.'); return dialogRef.current?.close() }
    setIsSaving(true)
    try { await onSave(payload); dialogRef.current?.close() } catch { /* The page reports the API error. */ } finally { setIsSaving(false) }
  }
  return <dialog ref={dialogRef} onClose={onClose} className="m-auto max-h-[calc(100dvh-2rem)] w-[min(48rem,calc(100%-2rem))] overflow-y-auto rounded-2xl border border-line bg-white p-0 text-ink shadow-lg backdrop:bg-slate-950/55"><form onSubmit={submit} className="p-5 sm:p-7"><div className="flex items-start justify-between gap-5"><div><p className="ga-eyebrow">Authorized personnel</p><h2 className="mt-2 text-2xl font-extrabold">{user ? 'Edit staff account' : 'Create staff account'}</h2><p className="mt-2 text-sm leading-6 text-muted-copy">Assign only the role and service area required for the staff member’s official responsibility.</p></div><button type="button" onClick={() => dialogRef.current?.close()} aria-label="Close staff form" className="grid size-11 shrink-0 place-items-center rounded-lg border border-line text-xl text-copy hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-brand-blue">×</button></div>
      {isSelf && <p className="mt-5 rounded-lg border border-blue-200 bg-info-soft p-3 text-sm text-copy">You can update your contact details here, but another administrator must change your role or active status.</p>}
      <div className="mt-6 grid gap-5 sm:grid-cols-2"><Field id="staff-employee-id" label="Employee ID" required maxLength="30" disabled={Boolean(user)} value={form.employeeId} onChange={(value) => change('employeeId', value)} description={user ? 'Employee IDs are permanent account identifiers.' : 'Use the official agency or LGU staff identifier.'} /><Field id="staff-full-name" label="Full name" required maxLength="150" autoComplete="name" value={form.fullName} onChange={(value) => change('fullName', value)} /><Field id="staff-email" label="Official email" type="email" required maxLength="150" autoComplete="email" value={form.email} onChange={(value) => change('email', value)} /><Field id="staff-contact" label="Contact number" type="tel" maxLength="20" autoComplete="tel" value={form.contactNumber} onChange={(value) => change('contactNumber', value)} />
        <div><label htmlFor="staff-role" className="ga-label">System role</label><select id="staff-role" required disabled={isSelf} value={form.role} onChange={(event) => change('role', event.target.value)} className="ga-input mt-2">{roles.slice(1).map((role) => <option key={role} value={role}>{STAFF_ROLE_LABELS[role]}</option>)}</select><p className="mt-2 text-xs leading-5 text-muted-copy">Role changes revoke the staff member’s active sessions.</p></div>
        {form.role === 'DSWD_STAFF' ? <div className="rounded-lg border border-blue-200 bg-info-soft p-4 text-sm leading-6 text-copy"><strong className="text-ink">Login identifier:</strong> DSWD Staff sign in using their official employee ID.</div> : <Field id="staff-username" label="Username" required minLength="4" maxLength="30" pattern="[a-zA-Z][a-zA-Z0-9._]{3,29}" autoComplete="username" value={form.username} onChange={(value) => change('username', value)} description="Starts with a letter; lowercase letters, numbers, dots, and underscores only." />}
        {form.role === 'BARANGAY_FACILITATOR' && <div className="sm:col-span-2"><label htmlFor="staff-barangay" className="ga-label">Assigned barangay</label><select id="staff-barangay" required value={form.barangayId} onChange={(event) => change('barangayId', event.target.value)} className="ga-input mt-2"><option value="">Select an active barangay</option>{activeBarangays.map((barangay) => <option key={barangay.barangayId} value={barangay.barangayId}>{barangay.barangayName}, {barangay.city}</option>)}</select><p className="mt-2 text-xs leading-5 text-muted-copy">Facilitators can access beneficiary and distribution records only for this barangay.</p></div>}
        {!user && <div className="sm:col-span-2"><label htmlFor="staff-password" className="ga-label">Temporary password</label><div className="relative mt-2"><input id="staff-password" type={showPassword ? 'text' : 'password'} required minLength="12" maxLength="72" autoComplete="new-password" value={form.password} onChange={(event) => change('password', event.target.value)} className="ga-input pr-20" /><button type="button" onClick={() => setShowPassword((value) => !value)} aria-pressed={showPassword} className="absolute inset-y-0 right-1 min-w-16 rounded-lg px-3 text-sm font-bold text-brand-blue hover:bg-info-soft focus-visible:outline-2 focus-visible:outline-brand-blue">{showPassword ? 'Hide' : 'Show'}</button></div><p className="mt-2 text-xs leading-5 text-muted-copy">Minimum 12 characters. Communicate it through an approved channel; it is not shown again after creation.</p></div>}
      </div><div className="mt-7 flex flex-col-reverse gap-3 border-t border-line pt-5 sm:flex-row sm:justify-end"><button type="button" disabled={isSaving} onClick={() => dialogRef.current?.close()} className="ga-btn-secondary">Cancel</button><button type="submit" disabled={isSaving} className="ga-btn-primary">{isSaving ? 'Saving…' : user ? 'Save account' : 'Create staff account'}</button></div></form></dialog>
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
  return <dialog ref={dialogRef} onClose={onClose} className="m-auto w-[min(38rem,calc(100%-2rem))] rounded-2xl border border-line bg-white p-0 text-ink shadow-lg backdrop:bg-slate-950/55"><form onSubmit={submit} className="p-5 sm:p-7"><div className="flex items-start justify-between gap-5"><div><p className="ga-eyebrow">Service-area registry</p><h2 className="mt-2 text-2xl font-extrabold">{barangay ? 'Edit barangay' : 'Add barangay'}</h2><p className="mt-2 text-sm leading-6 text-muted-copy">Use the official barangay name and local-government jurisdiction.</p></div><button type="button" onClick={() => dialogRef.current?.close()} aria-label="Close barangay form" className="grid size-11 shrink-0 place-items-center rounded-lg border border-line text-xl hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-brand-blue">×</button></div><div className="mt-6 grid gap-5 sm:grid-cols-2"><Field id="barangay-code" label="Barangay code" maxLength="20" value={form.barangayCode} onChange={(value) => change('barangayCode', value)} /><div className="sm:col-span-2"><Field id="barangay-name" label="Official barangay name" required maxLength="100" value={form.barangayName} onChange={(value) => change('barangayName', value)} /></div><Field id="barangay-city" label="City or municipality" required maxLength="100" value={form.city} onChange={(value) => change('city', value)} /><Field id="barangay-province" label="Province" required maxLength="100" value={form.province} onChange={(value) => change('province', value)} /></div><div className="mt-7 flex flex-col-reverse gap-3 border-t border-line pt-5 sm:flex-row sm:justify-end"><button type="button" disabled={isSaving} onClick={() => dialogRef.current?.close()} className="ga-btn-secondary">Cancel</button><button type="submit" disabled={isSaving} className="ga-btn-primary">{isSaving ? 'Saving…' : barangay ? 'Save barangay' : 'Add barangay'}</button></div></form></dialog>
}

function StaffActions({ isSelf, onEdit, onToggle, user }) {
  return <div className="flex flex-wrap gap-2"><button type="button" onClick={() => onEdit(user)} className="min-h-11 rounded-lg px-3 text-sm font-bold text-brand-blue hover:bg-info-soft focus-visible:outline-2 focus-visible:outline-brand-blue">Edit</button><button type="button" disabled={isSelf} title={isSelf ? 'Another administrator must change your active status.' : undefined} onClick={() => onToggle(user)} className={`min-h-11 rounded-lg px-3 text-sm font-bold focus-visible:outline-2 disabled:cursor-not-allowed disabled:text-slate-400 ${user.isActive ? 'text-brand-red hover:bg-danger-soft focus-visible:outline-brand-red' : 'text-brand-green hover:bg-success-soft focus-visible:outline-brand-green'}`}>{user.isActive ? 'Deactivate' : 'Reactivate'}</button></div>
}

function StaffBarangayAdministrationPage({ session, onLogout, onNavigate, onSessionExpired }) {
  const authorized = session.user.role === 'SYSTEM_ADMIN'
  const [view, setView] = useState('staff')
  const [staffDraft, setStaffDraft] = useState({ search: '', role: '', isActive: '' })
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
  const [staffForm, setStaffForm] = useState(null)
  const [barangayForm, setBarangayForm] = useState(null)
  const [confirmation, setConfirmation] = useState(null)

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

  const activeBarangays = useMemo(() => barangays.filter((barangay) => barangay.isActive), [barangays])
  const visibleBarangays = useMemo(() => {
    const search = barangaySearch.trim().toLowerCase()
    return barangays.filter((barangay) => (!barangayStatus || String(barangay.isActive) === barangayStatus) && (!search || [barangay.barangayCode, barangay.barangayName, barangay.city, barangay.province].some((value) => value?.toLowerCase().includes(search))))
  }, [barangaySearch, barangayStatus, barangays])

  function applyStaffFilters(event) { event.preventDefault(); setStaffLoading(true); setStaffPage(1); setStaffFilters({ ...staffDraft, search: staffDraft.search.trim() }) }
  async function saveStaff(payload) {
    try {
      const saved = staffForm.user ? await updateStaffUser(session.accessToken, staffForm.user.userId, payload) : await createStaffUser(session.accessToken, payload)
      toast.success(staffForm.user ? 'Staff account updated.' : 'Staff account created.', { description: `${saved.fullName} · ${STAFF_ROLE_LABELS[saved.role]}` })
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
  async function confirmStatusChange() {
    const action = confirmation
    try {
      if (action.type === 'staff') {
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
  function toggleStaff(user) {
    setConfirmation({ type: 'staff', record: user, title: `${user.isActive ? 'Deactivate' : 'Reactivate'} ${user.fullName}?`, description: user.isActive ? 'The account will be unable to sign in and every active session will be revoked. Historical activity remains in the audit log.' : 'The staff member will be allowed to sign in again using their existing credentials.', actionLabel: user.isActive ? 'Deactivate account' : 'Reactivate account', destructive: user.isActive })
  }
  function toggleBarangay(barangay) {
    setConfirmation({ type: 'barangay', record: barangay, title: `${barangay.isActive ? 'Deactivate' : 'Reactivate'} ${barangay.barangayName}?`, description: barangay.isActive ? 'New facilitator assignments and distribution events will be blocked. Active facilitators must be reassigned or deactivated first.' : 'The barangay will become available for staff assignments and new distribution events.', actionLabel: barangay.isActive ? 'Deactivate barangay' : 'Reactivate barangay', destructive: barangay.isActive })
  }

  const staffRows = staffData?.users ?? []
  const activeBarangayCount = barangays.filter((barangay) => barangay.isActive).length
  if (!authorized) return <DashboardShell breadcrumbs={['Operations', 'Administration']} currentPath="/admin/administration" onLogout={onLogout} onNavigate={onNavigate} pageTitle="Staff & barangays" user={session.user}><section className="ga-card mx-auto max-w-md p-8 text-center" role="alert"><h1 className="text-2xl font-extrabold">Administrator access required</h1><p className="mt-3 text-muted-copy">Only System Administrators can manage staff accounts and barangay service areas.</p><button type="button" onClick={() => onNavigate('/dashboard')} className="ga-btn-primary mt-6">Return to dashboard</button></section></DashboardShell>

  return <DashboardShell breadcrumbs={['Operations', 'Administration', view === 'staff' ? 'Staff accounts' : 'Barangays']} currentPath="/admin/administration" onLogout={onLogout} onNavigate={onNavigate} pageTitle="Staff & barangays" user={session.user}>
    <header className="flex flex-col gap-5 border-b border-line pb-6 sm:flex-row sm:items-end sm:justify-between"><div><p className="ga-eyebrow">Role and service-area governance</p><h1 className="ga-page-title">Staff and barangay administration</h1><p className="ga-page-copy">Maintain authorized personnel, least-privilege role assignments, and the official barangay registry used across GarantiyAid operations.</p></div><button type="button" onClick={() => view === 'staff' ? setStaffForm({ user: null }) : setBarangayForm({ barangay: null })} className="ga-btn-primary shrink-0">{view === 'staff' ? 'Create staff account' : 'Add barangay'}</button></header>
    <section className="mt-6 rounded-xl border border-blue-200 bg-info-soft p-4 text-sm leading-6 text-copy"><strong className="text-ink">Administrator responsibility:</strong> account, role, status, barangay assignment, and registry changes are recorded in the audit log.</section>
    <div className="mt-5 inline-flex w-full rounded-xl border border-line bg-white p-1 shadow-sm sm:w-auto" role="group" aria-label="Administration section"><button type="button" aria-pressed={view === 'staff'} onClick={() => setView('staff')} className={`min-h-11 flex-1 rounded-lg px-5 text-sm font-bold transition-colors sm:flex-none ${view === 'staff' ? 'bg-brand-navy text-white' : 'text-copy hover:bg-slate-50'}`}>Staff accounts <span className="ml-1 opacity-75">{staffData?.pagination.total ?? '—'}</span></button><button type="button" aria-pressed={view === 'barangays'} onClick={() => setView('barangays')} className={`min-h-11 flex-1 rounded-lg px-5 text-sm font-bold transition-colors sm:flex-none ${view === 'barangays' ? 'bg-brand-navy text-white' : 'text-copy hover:bg-slate-50'}`}>Barangays <span className="ml-1 opacity-75">{barangays.length || '—'}</span></button></div>

    {view === 'staff' ? <section className="mt-5"><div className="grid gap-3 sm:grid-cols-3"><div className="ga-card-flat p-4"><p className="text-xs font-bold uppercase tracking-wide text-muted-copy">Matching accounts</p><p className="mt-1 text-2xl font-extrabold tabular-nums">{staffData?.pagination.total ?? '—'}</p></div><div className="ga-card-flat p-4"><p className="text-xs font-bold uppercase tracking-wide text-muted-copy">Current role scope</p><p className="mt-1 text-base font-extrabold">{staffFilters.role ? STAFF_ROLE_LABELS[staffFilters.role] : 'All staff roles'}</p></div><button type="button" onClick={() => onNavigate('/admin/staff-security')} className="ga-card-flat min-h-20 cursor-pointer p-4 text-left transition-colors hover:border-blue-300 hover:bg-info-soft focus-visible:outline-2 focus-visible:outline-brand-blue"><p className="text-xs font-bold uppercase tracking-wide text-brand-blue">Security recovery</p><p className="mt-1 font-extrabold">Manage TOTP resets →</p></button></div>
      <form onSubmit={applyStaffFilters} className="ga-card mt-4 grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_14rem_11rem_auto]" aria-label="Staff account filters"><div><label htmlFor="staff-search" className="sr-only">Search staff accounts</label><input id="staff-search" value={staffDraft.search} onChange={(event) => setStaffDraft((current) => ({ ...current, search: event.target.value }))} placeholder="Search name, employee ID, username, or email" className="ga-input" /></div><div><label htmlFor="staff-filter-role" className="sr-only">Staff role</label><select id="staff-filter-role" value={staffDraft.role} onChange={(event) => setStaffDraft((current) => ({ ...current, role: event.target.value }))} className="ga-input">{roles.map((role) => <option key={role || 'ALL'} value={role}>{role ? STAFF_ROLE_LABELS[role] : 'All roles'}</option>)}</select></div><div><label htmlFor="staff-filter-status" className="sr-only">Account status</label><select id="staff-filter-status" value={staffDraft.isActive} onChange={(event) => setStaffDraft((current) => ({ ...current, isActive: event.target.value }))} className="ga-input"><option value="">All statuses</option><option value="true">Active</option><option value="false">Inactive</option></select></div><button className="ga-btn-primary">Apply filters</button></form>
      <div className="ga-card mt-4 overflow-hidden">{staffLoading ? <LoadingRows label="Loading staff accounts" /> : staffError ? <div className="p-6" role="alert"><h2 className="font-extrabold">Staff accounts could not be loaded</h2><p className="mt-2 text-sm text-muted-copy">{staffError}</p><button type="button" onClick={() => { setStaffLoading(true); setStaffReload((value) => value + 1) }} className="ga-btn-primary mt-4">Try again</button></div> : staffRows.length === 0 ? <div className="p-10 text-center"><span className="mx-auto grid size-12 place-items-center rounded-full bg-info-soft font-black text-brand-blue">0</span><h2 className="mt-4 font-extrabold">No staff accounts found</h2><p className="mt-2 text-sm text-muted-copy">Adjust the filters or create the first account in this scope.</p></div> : <><div className="hidden overflow-x-auto lg:block"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-muted-copy"><tr><th className="px-5 py-3">Staff member</th><th className="px-5 py-3">Role and scope</th><th className="px-5 py-3">Security</th><th className="px-5 py-3">Status</th><th className="px-5 py-3 text-right">Actions</th></tr></thead><tbody className="divide-y divide-line">{staffRows.map((user) => <tr key={user.userId} className="hover:bg-slate-50"><td className="px-5 py-4"><div className="flex items-center gap-3"><span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-navy text-xs font-bold text-white">{initials(user.fullName)}</span><div className="min-w-0"><p className="font-bold text-ink">{user.fullName}</p><p className="mt-1 text-xs text-muted-copy">{user.employeeId} · {user.username || 'Employee ID login'}</p><p className="mt-1 text-xs text-muted-copy">{user.email}</p></div></div></td><td className="px-5 py-4"><p className="font-bold">{STAFF_ROLE_LABELS[user.role]}</p><p className="mt-1 text-xs text-muted-copy">{user.barangay ? `${user.barangay.barangayName}, ${user.barangay.city}` : 'National or system-wide scope'}</p></td><td className="px-5 py-4"><p className={`font-bold ${user.totpEnabled ? 'text-brand-green' : 'text-brand-amber'}`}>{user.totpEnabled ? 'TOTP active' : 'Setup required'}</p><p className="mt-1 text-xs text-muted-copy">Updated {dateFormatter.format(new Date(user.updatedAt))}</p></td><td className="px-5 py-4"><StatusBadge active={user.isActive} /></td><td className="px-5 py-4"><div className="flex justify-end"><StaffActions user={user} isSelf={user.userId === session.user.userId} onEdit={(record) => setStaffForm({ user: record })} onToggle={toggleStaff} /></div></td></tr>)}</tbody></table></div><div className="divide-y divide-line lg:hidden">{staffRows.map((user) => <article key={user.userId} className="p-5"><div className="flex items-start gap-3"><span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-navy text-xs font-bold text-white">{initials(user.fullName)}</span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-start justify-between gap-2"><h2 className="font-extrabold">{user.fullName}</h2><StatusBadge active={user.isActive} /></div><p className="mt-1 text-sm text-muted-copy">{user.employeeId} · {STAFF_ROLE_LABELS[user.role]}</p><p className="mt-2 text-sm font-semibold text-copy">{user.barangay?.barangayName || 'National or system-wide scope'}</p><p className={`mt-2 text-sm font-bold ${user.totpEnabled ? 'text-brand-green' : 'text-brand-amber'}`}>{user.totpEnabled ? 'TOTP active' : 'Authenticator setup required'}</p></div></div><div className="mt-4 border-t border-line pt-3"><StaffActions user={user} isSelf={user.userId === session.user.userId} onEdit={(record) => setStaffForm({ user: record })} onToggle={toggleStaff} /></div></article>)}</div>{staffData.pagination.totalPages > 1 && <div className="flex flex-col gap-3 border-t border-line px-5 py-4 text-sm sm:flex-row sm:items-center sm:justify-between"><span>Page {staffPage} of {staffData.pagination.totalPages}</span><div className="flex gap-2"><button type="button" disabled={staffPage === 1} onClick={() => { setStaffLoading(true); setStaffPage((value) => value - 1) }} className="ga-btn-secondary min-h-11 px-4 text-sm">Previous</button><button type="button" disabled={staffPage === staffData.pagination.totalPages} onClick={() => { setStaffLoading(true); setStaffPage((value) => value + 1) }} className="ga-btn-secondary min-h-11 px-4 text-sm">Next</button></div></div>}</>}</div>
    </section> : <section className="mt-5"><div className="grid gap-3 sm:grid-cols-3"><div className="ga-card-flat p-4"><p className="text-xs font-bold uppercase tracking-wide text-muted-copy">Registered barangays</p><p className="mt-1 text-2xl font-extrabold tabular-nums">{barangays.length}</p></div><div className="ga-card-flat p-4"><p className="text-xs font-bold uppercase tracking-wide text-muted-copy">Active service areas</p><p className="mt-1 text-2xl font-extrabold tabular-nums text-brand-green">{activeBarangayCount}</p></div><div className="ga-card-flat p-4"><p className="text-xs font-bold uppercase tracking-wide text-muted-copy">Inactive records</p><p className="mt-1 text-2xl font-extrabold tabular-nums">{barangays.length - activeBarangayCount}</p></div></div>
      <div className="ga-card mt-4 grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_12rem]" aria-label="Barangay filters"><div><label htmlFor="barangay-search" className="sr-only">Search barangays</label><input id="barangay-search" value={barangaySearch} onChange={(event) => setBarangaySearch(event.target.value)} placeholder="Search name, code, city, or province" className="ga-input" /></div><div><label htmlFor="barangay-status" className="sr-only">Barangay status</label><select id="barangay-status" value={barangayStatus} onChange={(event) => setBarangayStatus(event.target.value)} className="ga-input"><option value="">All statuses</option><option value="true">Active</option><option value="false">Inactive</option></select></div></div>
      <div className="ga-card mt-4 overflow-hidden">{barangayLoading ? <LoadingRows label="Loading barangays" /> : barangayError ? <div className="p-6" role="alert"><h2 className="font-extrabold">Barangays could not be loaded</h2><p className="mt-2 text-sm text-muted-copy">{barangayError}</p><button type="button" onClick={() => { setBarangayLoading(true); setBarangayReload((value) => value + 1) }} className="ga-btn-primary mt-4">Try again</button></div> : visibleBarangays.length === 0 ? <div className="p-10 text-center"><span className="mx-auto grid size-12 place-items-center rounded-full bg-info-soft font-black text-brand-blue">0</span><h2 className="mt-4 font-extrabold">No barangays found</h2><p className="mt-2 text-sm text-muted-copy">Adjust the search or add an official barangay record.</p></div> : <><div className="hidden overflow-x-auto md:block"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-muted-copy"><tr><th className="px-5 py-3">Barangay</th><th className="px-5 py-3">Jurisdiction</th><th className="px-5 py-3">Status</th><th className="px-5 py-3 text-right">Actions</th></tr></thead><tbody className="divide-y divide-line">{visibleBarangays.map((barangay) => <tr key={barangay.barangayId} className="hover:bg-slate-50"><td className="px-5 py-4"><p className="font-bold">{barangay.barangayName}</p><p className="mt-1 text-xs text-muted-copy">{barangay.barangayCode || 'No barangay code recorded'}</p></td><td className="px-5 py-4"><p>{barangay.city}</p><p className="mt-1 text-xs text-muted-copy">{barangay.province}</p></td><td className="px-5 py-4"><StatusBadge active={barangay.isActive} /></td><td className="px-5 py-4"><div className="flex justify-end gap-2"><button type="button" onClick={() => setBarangayForm({ barangay })} className="min-h-11 rounded-lg px-3 text-sm font-bold text-brand-blue hover:bg-info-soft">Edit</button><button type="button" onClick={() => toggleBarangay(barangay)} className={`min-h-11 rounded-lg px-3 text-sm font-bold ${barangay.isActive ? 'text-brand-red hover:bg-danger-soft' : 'text-brand-green hover:bg-success-soft'}`}>{barangay.isActive ? 'Deactivate' : 'Reactivate'}</button></div></td></tr>)}</tbody></table></div><div className="divide-y divide-line md:hidden">{visibleBarangays.map((barangay) => <article key={barangay.barangayId} className="p-5"><div className="flex items-start justify-between gap-3"><div><h2 className="font-extrabold">{barangay.barangayName}</h2><p className="mt-1 text-sm text-muted-copy">{barangay.barangayCode || 'No code'} · {barangay.city}, {barangay.province}</p></div><StatusBadge active={barangay.isActive} /></div><div className="mt-4 flex gap-2 border-t border-line pt-3"><button type="button" onClick={() => setBarangayForm({ barangay })} className="min-h-11 rounded-lg px-3 text-sm font-bold text-brand-blue hover:bg-info-soft">Edit</button><button type="button" onClick={() => toggleBarangay(barangay)} className={`min-h-11 rounded-lg px-3 text-sm font-bold ${barangay.isActive ? 'text-brand-red hover:bg-danger-soft' : 'text-brand-green hover:bg-success-soft'}`}>{barangay.isActive ? 'Deactivate' : 'Reactivate'}</button></div></article>)}</div></>}</div>
    </section>}
    {staffForm && <StaffFormDialog activeBarangays={activeBarangays} currentUserId={session.user.userId} user={staffForm.user} onClose={() => setStaffForm(null)} onSave={saveStaff} />}
    {barangayForm && <BarangayFormDialog barangay={barangayForm.barangay} onClose={() => setBarangayForm(null)} onSave={saveBarangay} />}
    <ConfirmationDialog open={Boolean(confirmation)} title={confirmation?.title} description={confirmation?.description} actionLabel={confirmation?.actionLabel} destructive={confirmation?.destructive} onCancel={() => setConfirmation(null)} onConfirm={confirmStatusChange} />
  </DashboardShell>
}

export default StaffBarangayAdministrationPage
