import { Component } from 'react'

function Brand() {
  return (
    <span className="flex items-center gap-3 font-bold tracking-tight text-brand-navy">
      <img src="/GarantiyAid-logo.svg" alt="" width="512" height="512" className="size-12 shrink-0 object-contain sm:size-14" />
      <span className="text-lg">GarantiyAid</span>
    </span>
  )
}

function PublicPageShell({ children, wide = false }) {
  return (
    <div className="flex min-h-[100dvh] flex-col bg-page text-ink">
      <a href="#main-content" className="fixed left-4 top-4 z-50 -translate-y-20 rounded-lg bg-brand-navy px-4 py-2 font-semibold text-white transition-transform focus:translate-y-0">Skip to content</a>
      <header className="border-b border-line bg-white">
        <nav aria-label="Public navigation" className="mx-auto flex h-18 w-full max-w-7xl items-center justify-between gap-4 px-5 sm:px-6 lg:px-8">
          <a href="/" aria-label="GarantiyAid home" className="rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-blue"><Brand /></a>
          <a href="/login" className="inline-flex min-h-11 items-center rounded-lg bg-brand-blue px-4 text-sm font-bold text-white hover:bg-brand-blue-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue">Staff Login</a>
        </nav>
      </header>
      <main id="main-content" data-route-focus tabIndex={-1} className={`mx-auto w-full flex-1 px-5 py-10 outline-none sm:px-6 sm:py-14 lg:px-8 ${wide ? 'max-w-5xl' : 'grid max-w-2xl place-items-center'}`}>{children}</main>
      <footer className="border-t border-line bg-white"><div className="mx-auto flex w-full max-w-7xl flex-col gap-3 px-5 py-6 text-xs text-muted-copy sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8"><p>&copy; {new Date().getFullYear()} GarantiyAid. Government-service capstone prototype.</p><div className="flex gap-5"><a href="/privacy" className="font-semibold text-brand-blue hover:text-brand-blue-hover">Privacy Notice</a><a href="/" className="font-semibold text-brand-blue hover:text-brand-blue-hover">Public Home</a></div></div></footer>
    </div>
  )
}

function StatusCard({ alert = false, code, eyebrow, title, description, primary, secondary, children }) {
  return (
    <section role={alert ? 'alert' : undefined} className="ga-card w-full p-6 text-center sm:p-9" aria-labelledby="status-page-title">
      <span aria-hidden="true" className="mx-auto grid min-h-14 min-w-14 place-items-center rounded-xl border border-amber-200 bg-warning-soft px-3 text-lg font-black tracking-tight text-brand-amber">{code}</span>
      <p className="mt-5 text-xs font-bold uppercase tracking-[0.14em] text-brand-amber">{eyebrow}</p>
      <h1 id="status-page-title" className="mt-2 text-3xl font-bold tracking-tight text-ink sm:text-4xl">{title}</h1>
      <p className="mx-auto mt-3 max-w-lg text-base leading-7 text-muted-copy">{description}</p>
      {children}
      <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:justify-center">
        {primary}
        {secondary}
      </div>
    </section>
  )
}

const primaryLink = 'ga-btn-primary px-6'
const secondaryLink = 'ga-btn-secondary px-6'

export function SessionExpiredPage({ onLogin }) {
  return (
    <PublicPageShell>
      <StatusCard
        code="SEC"
        eyebrow="Secure session ended"
        title="Sign in again to continue"
        description="Your staff session is no longer available. This can happen after expiration, logout, session revocation, or an administrator security reset."
        primary={<button type="button" onClick={onLogin} className={`${primaryLink} cursor-pointer`}>Return to Staff Login</button>}
        secondary={<a href="/" className={secondaryLink}>Public Home</a>}
      >
        <div className="mt-6 rounded-lg border border-blue-200 bg-info-soft p-4 text-left text-sm leading-6 text-copy"><strong className="text-ink">Your protected access is closed.</strong> Re-enter your password and authenticator code to start a new verified session.</div>
      </StatusCard>
    </PublicPageShell>
  )
}

export function NotFoundPage() {
  return (
    <PublicPageShell>
      <StatusCard
        code="404"
        eyebrow="Page not found"
        title="This page is not available"
        description="The address may be incorrect, the page may have moved, or your saved link may be outdated."
        primary={<a href="/" className={primaryLink}>Return to Public Home</a>}
        secondary={<a href="/login" className={secondaryLink}>Open Staff Login</a>}
      />
    </PublicPageShell>
  )
}

export function UnexpectedErrorPage({ onRetry = () => window.location.reload() }) {
  return (
    <PublicPageShell>
      <StatusCard
        alert
        code="ERR"
        eyebrow="Unexpected application error"
        title="GarantiyAid could not display this page"
        description="Your data was not intentionally changed by this screen. Reload the application, or return to the public home page if the problem continues."
        primary={<button type="button" onClick={onRetry} className={`${primaryLink} cursor-pointer`}>Reload application</button>}
        secondary={<a href="/" className={secondaryLink}>Public Home</a>}
      />
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
