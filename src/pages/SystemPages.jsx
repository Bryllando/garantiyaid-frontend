import { Component, useEffect, useRef } from 'react'
import { Icon } from '../components/ui/icon.jsx'

function Brand() {
  return (
    <span className="flex items-center gap-3 font-bold tracking-tight text-brand-navy">
      <img src="/GarantiyAid-logo.svg" alt="" width="512" height="512" className="size-12 shrink-0 object-contain sm:size-14" />
      <span className="text-lg">GarantiyAid</span>
    </span>
  )
}

function PublicPageShell({ children, wide = false, showLoginLink = true, notice = false }) {
  return (
    <div className="flex min-h-[100dvh] flex-col bg-page text-ink">
      <a href="#main-content" className="fixed left-4 top-4 z-50 -translate-y-20 rounded-lg bg-brand-navy px-4 py-2 font-semibold text-white transition-transform focus:translate-y-0">Skip to content</a>
      <header className="border-b border-line bg-white">
        <nav aria-label="Public navigation" className="mx-auto flex h-18 w-full max-w-7xl items-center justify-between gap-4 px-5 sm:px-6 lg:px-8">
          <a href="/" aria-label="GarantiyAid home" className="rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-blue"><Brand /></a>
          {showLoginLink ? <a href="/login" className="inline-flex min-h-11 items-center rounded-lg bg-brand-blue px-4 text-sm font-bold text-white hover:bg-brand-blue-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue">Staff Login</a> : <span className="text-sm text-copy">Staff portal</span>}
        </nav>
      </header>
      <main id="main-content" data-route-focus tabIndex={-1} className={`mx-auto w-full flex-1 px-5 py-10 outline-none sm:px-6 sm:py-14 lg:px-8 ${wide ? 'max-w-5xl' : notice ? 'max-w-4xl' : 'grid max-w-2xl place-items-center'}`}>{children}</main>
      <footer className="border-t border-line bg-white"><div className="mx-auto flex w-full max-w-7xl flex-col gap-3 px-5 py-5 text-xs text-copy sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8"><p>&copy; {new Date().getFullYear()} GarantiyAid. Government-service capstone prototype.</p><div className="flex flex-wrap gap-x-5"><a href="/privacy" className="inline-flex min-h-11 items-center font-semibold text-brand-blue underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue">Privacy Notice</a><a href="/" className="inline-flex min-h-11 items-center font-semibold text-brand-blue underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue">Home page</a></div></div></footer>
    </div>
  )
}

function ServiceNotice({ title, description, primary, secondary, help, helpTitle = 'Need assistance?', icon = 'info', error = false, children }) {
  const headingRef = useRef(null)
  useEffect(() => { headingRef.current?.focus() }, [])

  return (
    <section className="w-full rounded-sm border border-line border-t-4 border-t-brand-navy bg-white text-left" aria-labelledby="status-page-title">
      <div className="p-5 sm:p-8">
        <div className="flex items-center gap-2.5 text-sm font-semibold text-copy"><Icon name={icon} className={`size-5 shrink-0 ${error ? 'text-brand-red' : 'text-brand-navy'}`} />Service notice</div>
        <h1 id="status-page-title" ref={headingRef} tabIndex={-1} aria-describedby="status-page-description" className="mt-4 text-2xl font-semibold leading-tight text-ink outline-none sm:text-[1.75rem]">{title}</h1>
        <p id="status-page-description" className="mt-3 max-w-2xl text-base leading-7 text-copy">{description}</p>
        {children}
        <div className="mt-7 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:gap-6">
          {primary}
          {secondary}
        </div>
      </div>
      <div className="border-t border-line bg-slate-50 px-5 py-5 sm:px-8">
        <h2 className="text-sm font-semibold text-ink">{helpTitle}</h2>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-copy">{help}</p>
      </div>
    </section>
  )
}

const primaryLink = 'ga-btn-primary px-6'
const secondaryLink = 'ga-btn-secondary px-6'
const noticeAction = 'inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-sm bg-brand-blue px-6 py-3 text-base font-semibold text-white hover:bg-brand-blue-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue sm:w-auto'
const noticeLink = 'inline-flex min-h-11 items-center text-sm font-semibold text-brand-blue underline underline-offset-4 hover:text-brand-blue-hover focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-blue'

export function SessionExpiredPage({ onLogin }) {
  return (
    <PublicPageShell notice showLoginLink={false}>
      <ServiceNotice
        icon="lock"
        title="Your session has ended"
        description="Sign in again to access staff records and services."
        primary={<button type="button" onClick={onLogin} className={noticeAction}>Sign in again</button>}
        secondary={<a href="/" className={noticeLink}>Return to home page</a>}
        help="If you cannot sign in, contact your office’s System Administrator for account assistance."
      />
    </PublicPageShell>
  )
}

export function NotFoundPage() {
  return (
    <PublicPageShell notice showLoginLink={false}>
      <ServiceNotice
        title="Page not found"
        description="Check the address for typing errors, or return to the home page to find the service you need."
        primary={<a href="/" className={noticeAction}>Return to home page</a>}
        secondary={<a href="/login" className={noticeLink}>Staff sign in</a>}
        help="If you followed a link from GarantiyAid, give your office’s System Administrator the address of the page containing that link."
        helpTitle="Report a broken link"
      />
    </PublicPageShell>
  )
}

export function UnexpectedErrorPage({ onRetry = () => window.location.reload() }) {
  return (
    <PublicPageShell notice showLoginLink={false}>
      <ServiceNotice
        error
        title="Unable to display this page"
        description="Reload the page to try again. Unsaved changes may be lost."
        primary={<button type="button" onClick={onRetry} className={noticeAction}><Icon name="reset" />Reload page</button>}
        secondary={<a href="/" className={noticeLink}>Return to home page</a>}
        helpTitle="If the problem continues"
        help="Contact your office’s System Administrator. Include the page you were using and what you were trying to do."
      >
        <div className="mt-6 border-l-2 border-line pl-4">
          <h2 className="text-sm font-semibold text-ink">Check your last action</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-copy">If you were saving a record or starting an import, check its status after reloading before submitting it again.</p>
        </div>
      </ServiceNotice>
    </PublicPageShell>
  )
}

const privacySections = [
  ['Information handled by the system', 'Depending on an authorized user’s role and the approved program workflow, GarantiyAid may process staff identity and access records; beneficiary identity, eligibility, contact, and supporting-document records; distribution allocations, schedules, claims, and verification results; simulated ledger entries; and security or audit metadata such as actions, timestamps, and IP addresses.'],
  ['How information is used', 'Information is used to administer eligible assistance, coordinate distribution schedules, verify claims, prevent duplicate or unauthorized activity, notify beneficiaries, reconcile prototype records, secure staff access, and support authorized oversight and reporting.'],
  ['Access and disclosure', 'Operational records are available only through authenticated, role-based staff access. GarantiyAid is not intended to sell personal information or use it for advertising. Any disclosure outside the system must be supported by official authority and the implementing organization’s approved privacy procedures.'],
  ['Security safeguards', 'The prototype uses password and authenticator verification, role checks, session controls, protected audit records, and restricted public pages. Sensitive credentials, raw tokens, and protected operational records must never be published on the landing page or included in ordinary support messages.'],
  ['Retention and disposal', 'This capstone prototype does not establish final legal retention periods. Before production use, the implementing agency must approve retention, archival, backup, and secure-disposal rules for each record category under its applicable policies and legal obligations.'],
  ['Privacy requests and concerns', 'Beneficiaries and staff should use the implementing DSWD office or barangay’s official channel to request access, correction, or assistance regarding their records. Staff account and authenticator concerns should be directed to the designated System Administrator.'],
]

export function PrivacyPage() {
  return (
    <PublicPageShell wide>
      <article className="ga-card overflow-hidden" aria-labelledby="privacy-title">
        <header className="border-b border-line bg-brand-navy px-6 py-9 text-white sm:px-10 sm:py-11">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-blue-200">Public transparency</p>
          <h1 id="privacy-title" className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">Privacy Notice</h1>
          <p className="mt-4 max-w-3xl text-sm leading-6 text-slate-300 sm:text-base">How the GarantiyAid capstone prototype is designed to handle personal and operational information.</p>
          <p className="mt-4 text-xs font-semibold text-blue-200">Last reviewed: August 26, 2026</p>
        </header>

        <div className="px-6 py-8 sm:px-10 sm:py-10">
          <section className="rounded-xl border border-amber-200 bg-warning-soft p-5" aria-labelledby="prototype-notice"><h2 id="prototype-notice" className="font-extrabold text-ink">Prototype notice</h2><p className="mt-2 text-sm leading-6 text-copy">GarantiyAid is a capstone system, not a final production privacy policy. The implementing agency must review this notice, assign official privacy contacts, and approve operational policies before real beneficiary data is used.</p></section>

          <section className="mt-8" aria-labelledby="scope-heading"><h2 id="scope-heading" className="text-xl font-extrabold text-ink">Purpose and scope</h2><p className="mt-3 text-sm leading-7 text-copy sm:text-base">GarantiyAid supports transparent and efficient social welfare aid distribution. This notice covers the public landing page and the protected staff web portal. The public website does not display beneficiary records, internal distribution details, live statistics, or audit logs.</p></section>

          <div className="mt-8 divide-y divide-line border-y border-line">
            {privacySections.map(([title, description]) => <section key={title} className="py-7" aria-labelledby={`privacy-${title.toLowerCase().replaceAll(' ', '-')}`}><h2 id={`privacy-${title.toLowerCase().replaceAll(' ', '-')}`} className="text-lg font-extrabold text-ink">{title}</h2><p className="mt-3 text-sm leading-7 text-copy sm:text-base">{description}</p></section>)}
          </div>

          <section className="mt-8 rounded-xl border border-blue-200 bg-info-soft p-5" aria-labelledby="privacy-help"><h2 id="privacy-help" className="font-extrabold text-ink">Need privacy assistance?</h2><p className="mt-2 text-sm leading-6 text-copy">Use your DSWD office or barangay’s verified official contact channel. Do not send passwords, authenticator codes, QR tokens, government IDs, or sensitive documents through an unverified account.</p></section>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row"><a href="/" className={primaryLink}>Return to Public Home</a><a href="/login" className={secondaryLink}>Staff Login</a></div>
        </div>
      </article>
    </PublicPageShell>
  )
}

export class AppErrorBoundary extends Component {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    return this.state.failed ? <UnexpectedErrorPage /> : this.props.children
  }
}
