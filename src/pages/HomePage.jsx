import { Icon } from '../components/ui/icon.jsx'

const workflow = [
  ['enrollments', 'Register and review', 'Barangay staff prepare beneficiary records, while authorized DSWD staff record the program decision.'],
  ['calendar', 'Allocate and schedule', 'Approved beneficiaries receive a controlled distribution assignment, service session, and queue number.'],
  ['biometrics', 'Verify at the site', 'Facilitators follow the event requirement: QR, biometric verification, signature, or an approved combination.'],
  ['reports', 'Settle and oversee', 'Verified claims move to the simulated ledger, reporting, reconciliation, and audit workflow.'],
]

const roles = [
  ['System Administrator', 'Maintains staff access, barangay assignments, security recovery, and controlled distribution setup.'],
  ['DSWD Staff', 'Manages programs, reviews enrollments, monitors distributions, settles verified claims, and prepares oversight reports.'],
  ['Barangay Facilitator', 'Registers local beneficiaries, submits enrollment records, manages the assigned queue, and completes field verification.'],
]

const safeguards = [
  ['security', 'Scoped staff access', 'Role and barangay checks limit operational records and actions to authorized personnel.'],
  ['biometrics', 'Protected verification', 'Raw face captures are cleared after processing, and protected templates remain encrypted.'],
  ['qr', 'Duplicate-claim controls', 'One-time QR credentials, claim checks, and verification rules help prevent repeat releases.'],
  ['audit', 'Traceable decisions', 'Important account, enrollment, distribution, verification, and settlement actions are recorded for review.'],
]

function BrandMark({ light = false }) {
  return (
    <span className={`flex items-center gap-3 font-bold tracking-tight ${light ? 'text-white' : 'text-brand-navy'}`}>
      <img src="/GarantiyAid-logo.svg" alt="" width="64" height="64" className="size-11 shrink-0 object-contain sm:size-12" />
      <span>
        <span className="block text-lg leading-none">GarantiyAid</span>
        <span className={`mt-1 block text-[0.68rem] font-semibold uppercase tracking-[0.12em] ${light ? 'text-blue-200' : 'text-muted-copy'}`}>Assistance operations</span>
      </span>
    </span>
  )
}

function HeroVisual() {
  return (
    <figure data-motion-reveal className="relative mx-auto w-full max-w-2xl">
      <div aria-hidden="true" className="absolute -inset-3 rounded-[1.5rem] border border-blue-100 bg-info-soft" />
      <div className="relative overflow-hidden rounded-2xl border border-line bg-white p-2 shadow-lg">
        <img
          src="/LandingPage.png"
          alt="Illustration of an inclusive barangay assistance desk serving older adults, families, and a wheelchair user."
          width="1586"
          height="992"
          loading="eager"
          fetchPriority="high"
          decoding="async"
          className="aspect-[793/496] w-full rounded-xl bg-slate-100 object-cover"
        />
        <figcaption className="flex flex-col gap-3 px-3 py-4 sm:flex-row sm:items-center sm:px-4">
          <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-xl bg-success-soft text-brand-green"><Icon name="people" /></span>
          <div className="min-w-0 flex-1"><p className="font-bold text-ink">Inclusive assistance, delivered with dignity</p><p className="mt-1 text-sm leading-5 text-muted-copy">From approved enrollment and scheduling to secure verification and auditable claims, GarantiyAid supports organized community service.</p></div>
          <span className="inline-flex w-fit shrink-0 items-center gap-2 rounded-full border border-blue-200 bg-info-soft px-3 py-1.5 text-xs font-bold text-brand-blue"><Icon name="security" className="size-4" /> Secure workflow</span>
        </figcaption>
      </div>
    </figure>
  )
}

function HomePage() {
  return (
    <>
      <a href="#main-content" className="fixed left-4 top-4 z-50 -translate-y-24 rounded-lg bg-brand-navy px-4 py-3 font-bold text-white transition-transform focus:translate-y-0">Skip to content</a>

      <div className="border-b border-blue-900 bg-brand-navy text-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-1 px-5 py-2.5 text-sm leading-5 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <p className="flex items-center gap-2 font-bold"><Icon name="info" className="size-4 shrink-0 text-blue-200" /> Government-service capstone prototype</p>
          <p className="text-blue-100">Not an official application, eligibility, or claim-status channel.</p>
        </div>
      </div>

      <header className="sticky top-0 z-40 border-b border-line bg-white/95 backdrop-blur-sm">
        <nav aria-label="Primary navigation" className="mx-auto flex min-h-[4.75rem] max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <a href="#top" aria-label="GarantiyAid home" className="rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-blue"><BrandMark /></a>
          <div className="hidden items-center gap-6 text-sm font-semibold text-copy lg:flex">
            <a className="rounded hover:text-brand-blue focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-blue" href="#workflow">Service process</a>
            <a className="rounded hover:text-brand-blue focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-blue" href="#roles">Staff roles</a>
            <a className="rounded hover:text-brand-blue focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-blue" href="#safeguards">Safeguards</a>
            <a className="rounded hover:text-brand-blue focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-blue" href="/privacy">Privacy</a>
          </div>
          <a href="/login" className="ga-btn-primary min-h-11 px-4 text-sm">Staff sign in</a>
        </nav>
      </header>

      <main id="main-content" data-route-focus tabIndex={-1} className="outline-none">
        <section id="top" className="ga-hero relative overflow-hidden bg-white" aria-labelledby="hero-title">
          <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-5 py-14 sm:px-6 sm:py-20 lg:grid-cols-[0.95fr_1.05fr] lg:px-8 lg:py-24">
            <div data-motion-stagger>
              <p className="ga-eyebrow">Accountable social assistance operations</p>
              <h1 id="hero-title" className="mt-4 max-w-3xl text-4xl font-bold leading-[1.08] tracking-[-0.035em] text-ink sm:text-5xl lg:text-[3.5rem]">Deliver assistance with dignity—and a clear record at every step.</h1>
              <p className="mt-6 max-w-2xl text-lg leading-8 text-copy">GarantiyAid helps authorized staff coordinate approved enrollments, barangay schedules, secure identity checks, verified claims, and public-service oversight.</p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <a href="/login" className="ga-btn-primary px-6">Enter staff portal <Icon name="arrowRight" /></a>
                <a href="#workflow" className="ga-btn-secondary px-6">How the service works</a>
              </div>
              <ul className="mt-8 grid gap-3 border-t border-line pt-6 text-sm font-semibold text-copy sm:grid-cols-3" aria-label="Platform commitments">
                {['Role-scoped staff access', 'Inclusive field operations', 'Audit-ready decisions'].map((item) => <li key={item} className="flex items-start gap-2"><Icon name="check" className="mt-0.5 size-4 shrink-0 text-brand-green" strokeWidth={2.4} />{item}</li>)}
              </ul>
            </div>
            <HeroVisual />
          </div>
        </section>

        <section className="border-y border-line bg-page py-8" aria-labelledby="service-guidance-title">
          <div className="mx-auto max-w-7xl px-5 sm:px-6 lg:px-8">
            <h2 id="service-guidance-title" className="sr-only">Before using GarantiyAid</h2>
            <div data-motion-stagger className="grid gap-4 lg:grid-cols-3">
              <article className="ga-card-flat flex items-start gap-4 p-5"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-info-soft text-brand-blue"><Icon name="people" /></span><div><h3 className="font-bold text-ink">For beneficiaries</h3><p className="mt-1 text-sm leading-6 text-muted-copy">No public application or beneficiary lookup is offered here. Use your LGU or DSWD’s official assistance channels.</p></div></article>
              <article className="ga-card-flat flex items-start gap-4 p-5"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-success-soft text-brand-green"><Icon name="security" /></span><div><h3 className="font-bold text-ink">For authorized staff</h3><p className="mt-1 text-sm leading-6 text-muted-copy">Sign in with your assigned staff account and authenticator to access role-scoped operations.</p></div></article>
              <article className="ga-card-flat flex items-start gap-4 border-amber-200 bg-warning-soft p-5"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white text-brand-amber"><Icon name="info" /></span><div><h3 className="font-bold text-ink">Prototype scope</h3><p className="mt-1 text-sm leading-6 text-copy">Academic demonstration only. Production use requires agency approval, policy review, and authorized infrastructure.</p></div></article>
            </div>
          </div>
        </section>

        <section id="workflow" className="scroll-mt-24 bg-white py-16 lg:py-20" aria-labelledby="workflow-title">
          <div className="mx-auto max-w-7xl px-5 sm:px-6 lg:px-8">
            <div className="max-w-3xl" data-motion-stagger>
              <p className="ga-eyebrow">Service process</p>
              <h2 id="workflow-title" className="mt-3 text-3xl font-bold tracking-tight text-ink sm:text-4xl">How an approved claim moves through the system.</h2>
              <p className="mt-4 text-base leading-7 text-muted-copy">The workflow separates review, scheduling, field verification, and oversight so responsibility remains visible.</p>
            </div>
            <ol data-motion-stagger className="mt-10 grid gap-px overflow-hidden rounded-2xl border border-line bg-line md:grid-cols-2 xl:grid-cols-4">
              {workflow.map(([icon, title, description], index) => (
                <li key={title} className="bg-white p-6">
                  <div className="flex items-center justify-between gap-4">
                    <span className="grid size-11 place-items-center rounded-xl bg-info-soft text-brand-blue"><Icon name={icon} /></span>
                    <span className="text-sm font-bold tabular-nums text-muted-copy">0{index + 1}</span>
                  </div>
                  <h3 className="mt-5 text-lg font-bold text-ink">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-copy">{description}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="roles" className="scroll-mt-24 border-y border-line bg-page py-16 lg:py-20" aria-labelledby="roles-title">
          <div className="mx-auto grid max-w-7xl gap-10 px-5 sm:px-6 lg:grid-cols-[0.72fr_1.28fr] lg:px-8">
            <div data-motion-stagger>
              <p className="ga-eyebrow">Separation of duties</p>
              <h2 id="roles-title" className="mt-3 text-3xl font-bold tracking-tight text-ink sm:text-4xl">Clear responsibility for every staff role.</h2>
              <p className="mt-4 text-base leading-7 text-muted-copy">Accounts receive only the navigation and records needed for their assigned government-service work.</p>
            </div>
            <div data-motion-stagger className="divide-y divide-line rounded-2xl border border-line bg-white px-5 sm:px-6">
              {roles.map(([title, description], index) => (
                <article key={title} className="grid gap-2 py-5 sm:grid-cols-[3rem_1fr] sm:gap-4">
                  <span className="text-sm font-bold tabular-nums text-brand-blue">0{index + 1}</span>
                  <div><h3 className="font-bold text-ink">{title}</h3><p className="mt-1 text-sm leading-6 text-muted-copy">{description}</p></div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="safeguards" className="scroll-mt-24 bg-brand-navy py-16 text-white lg:py-20" aria-labelledby="safeguards-title">
          <div className="mx-auto max-w-7xl px-5 sm:px-6 lg:px-8">
            <div className="max-w-3xl" data-motion-stagger>
              <p className="text-sm font-semibold text-blue-200">Accountability by design</p>
              <h2 id="safeguards-title" className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Protection is part of the service process.</h2>
              <p className="mt-4 text-base leading-7 text-slate-300">The public page exposes no beneficiary records, active credentials, live distribution data, or protected audit history.</p>
            </div>
            <div data-motion-stagger className="mt-10 grid gap-px overflow-hidden rounded-2xl bg-white/15 md:grid-cols-2">
              {safeguards.map(([icon, title, description]) => (
                <article key={title} className="bg-brand-navy p-6">
                  <span className="grid size-11 place-items-center rounded-xl bg-white/10 text-blue-100"><Icon name={icon} /></span>
                  <h3 className="mt-5 text-lg font-bold">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-300">{description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-white py-14 lg:py-16" aria-labelledby="portal-title">
          <div className="mx-auto max-w-5xl px-5 sm:px-6 lg:px-8">
            <div className="grid gap-6 rounded-2xl border border-blue-200 bg-info-soft px-6 py-8 sm:px-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
              <div><p className="ga-eyebrow">Authorized staff access</p><h2 id="portal-title" className="mt-2 text-2xl font-bold text-ink sm:text-3xl">Continue to your assigned workspace.</h2><p className="mt-2 max-w-2xl text-base leading-7 text-copy">Use your issued Staff ID or username, password, and authenticator. Never share beneficiary records or access credentials through public channels.</p></div>
              <a href="/login" className="ga-btn-primary shrink-0 px-7">Staff sign in <Icon name="arrowRight" /></a>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/10 bg-brand-navy text-slate-300">
        <div className="mx-auto flex max-w-7xl flex-col gap-8 px-5 py-10 sm:px-6 md:flex-row md:items-start md:justify-between lg:px-8">
          <div><BrandMark light /><p className="mt-4 max-w-lg text-sm leading-6">A government-service capstone prototype for clearer, safer, and more accountable social assistance operations. Not an official DSWD website or public assistance channel.</p></div>
          <nav aria-label="Footer navigation" className="flex flex-wrap gap-x-7 gap-y-3 text-sm"><a className="rounded hover:text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white" href="#workflow">Service process</a><a className="rounded hover:text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white" href="#safeguards">Safeguards</a><a className="rounded hover:text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white" href="/privacy">Privacy notice</a></nav>
        </div>
        <div className="border-t border-white/10 px-5 py-5 text-center text-xs text-slate-400">&copy; {new Date().getFullYear()} GarantiyAid · Government-service capstone prototype</div>
      </footer>
    </>
  )
}

export default HomePage
