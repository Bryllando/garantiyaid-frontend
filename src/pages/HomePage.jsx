const steps = [
  ['Enroll', 'Authorized staff register eligible beneficiaries and maintain accurate records.'],
  ['Schedule', 'Distribution dates, time slots, and queue assignments organize each visit.'],
  ['Verify', 'On-site staff validate the QR claim and required identity checks.'],
  ['Record', 'Completed claims are recorded for monitoring and accountability.'],
]

const roles = [
  ['System Administrator', 'Protects staff access, manages authenticator recovery, and reviews audit activity.'],
  ['DSWD Staff', 'Monitors programs and distributions, reviews the simulated ledger, and prepares reports.'],
  ['Barangay Facilitator', 'Coordinates local queues and verifies beneficiary claim references on site.'],
]

const features = [
  ['Beneficiary records', 'Maintain approved beneficiary information through controlled staff access.'],
  ['Distribution scheduling', 'Coordinate events, time slots, and orderly beneficiary queues.'],
  ['QR claim verification', 'Validate single-use references and help prevent duplicate claims.'],
  ['Live monitoring', 'Review current distribution, queue, and verification activity.'],
  ['Reports and audit logs', 'Support oversight with traceable operational records.'],
  ['Beneficiary updates', 'Support schedule and service notifications through approved channels.'],
]

function BrandMark({ light = false }) {
  return (
    <span className={`flex items-center gap-3 font-bold tracking-tight ${light ? 'text-white' : 'text-brand-navy'}`}>
      <span aria-hidden="true" className={`grid size-10 place-items-center rounded-lg text-sm font-bold ${light ? 'bg-white text-brand-navy' : 'bg-brand-navy text-white'}`}>GA</span>
      <span className="text-lg">GarantiyAid</span>
    </span>
  )
}

function HomePage() {
  return (
    <>
      <a href="#main-content" className="fixed left-4 top-4 z-50 -translate-y-20 rounded-lg bg-brand-navy px-4 py-2 font-semibold text-white transition-transform focus:translate-y-0">Skip to content</a>

      <header className="sticky top-0 z-40 border-b border-line bg-white/95 backdrop-blur-sm">
        <nav aria-label="Primary navigation" className="mx-auto flex min-h-[4.75rem] max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <a href="#top" aria-label="GarantiyAid home" className="rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-blue"><BrandMark /></a>
          <div className="hidden items-center gap-7 text-sm font-semibold text-copy lg:flex">
            <a className="rounded hover:text-brand-blue focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-blue" href="#how-it-works">How it works</a>
            <a className="rounded hover:text-brand-blue focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-blue" href="#roles">Staff roles</a>
            <a className="rounded hover:text-brand-blue focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-blue" href="#features">Capabilities</a>
            <a className="rounded hover:text-brand-blue focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-blue" href="#security">Security</a>
          </div>
          <a href="/login" className="ga-btn-primary min-h-11 px-4 text-sm">Staff Login</a>
        </nav>
      </header>

      <main id="main-content" data-route-focus tabIndex={-1} className="outline-none">
        <section id="top" className="ga-hero relative overflow-hidden bg-white" aria-labelledby="hero-title">
          <div aria-hidden="true" className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-page to-transparent" />
          <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-5 py-14 sm:px-6 sm:py-18 lg:grid-cols-[0.92fr_1.08fr] lg:px-8 lg:py-22">
            <div data-motion-stagger>
              <p className="ga-eyebrow">Government social assistance operations</p>
              <h1 id="hero-title" className="mt-4 max-w-3xl text-4xl font-bold leading-[1.08] tracking-[-0.035em] text-ink sm:text-5xl lg:text-[3.5rem]">Clearer aid distribution. Accountable at every step.</h1>
              <p className="mt-6 max-w-2xl text-lg leading-8 text-copy">GarantiyAid helps authorized government personnel schedule assistance, verify claims, and maintain reliable operational records in one secure platform.</p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <a href="/login" className="ga-btn-primary px-6">Access Staff Portal</a>
                <a href="#how-it-works" className="ga-btn-secondary px-6">See how it works</a>
              </div>
              <ul className="mt-8 grid gap-3 border-t border-line pt-6 text-sm font-semibold text-copy sm:grid-cols-3" aria-label="Platform assurances">
                {['Authorized staff only', 'Role-based access', 'Traceable activity'].map((item) => <li key={item} className="flex items-center gap-2"><span aria-hidden="true" className="size-2 rounded-full bg-brand-green" />{item}</li>)}
              </ul>
            </div>

            <figure data-motion-reveal className="ga-hero-visual relative mx-auto w-full max-w-2xl">
              <div className="absolute -inset-3 rounded-[1.35rem] bg-info-soft ring-1 ring-blue-100" />
              <div className="relative overflow-hidden rounded-xl border border-line bg-white shadow-lg">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
                  <p className="text-sm font-bold text-ink">Operations overview</p>
                  <span className="inline-flex items-center gap-2 rounded-full bg-success-soft px-3 py-1 text-xs font-bold text-brand-green"><span aria-hidden="true" className="ga-live-dot size-2 rounded-full bg-emerald-500" />Protected view</span>
                </div>
                <img src="/garantiyaid-admin-overview.png" alt="Illustrative GarantiyAid administrator overview showing operational status, summary cards, and recent activity" width="1168" height="655" fetchPriority="high" className="w-full" />
              </div>
              <figcaption className="relative mt-4 text-center text-sm text-muted-copy">Illustrative staff workspace. No live beneficiary data is shown.</figcaption>
            </figure>
          </div>
        </section>

        <section id="how-it-works" className="scroll-mt-24 bg-brand-navy py-16 text-white lg:py-20" aria-labelledby="process-title">
          <div data-motion-stagger className="mx-auto max-w-7xl px-5 sm:px-6 lg:px-8">
            <div className="max-w-3xl">
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-blue-200">Distribution workflow</p>
              <h2 id="process-title" className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">One clear path from enrollment to verified assistance.</h2>
              <p className="mt-4 text-base leading-7 text-slate-300">Each stage gives staff a focused responsibility while keeping sensitive records inside the protected portal.</p>
            </div>
            <ol className="mt-10 grid overflow-hidden rounded-xl border border-white/15 bg-white/[0.05] md:grid-cols-2 lg:grid-cols-4">
              {steps.map(([title, description], index) => (
                <li key={title} className="border-white/10 p-5 md:border-r md:last:border-r-0 lg:p-6">
                  <span className="text-sm font-bold text-emerald-300" aria-hidden="true">0{index + 1}</span>
                  <h3 className="mt-4 text-lg font-bold text-white">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-300">{description}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="roles" className="scroll-mt-24 bg-page py-16 lg:py-20" aria-labelledby="roles-title">
          <div data-motion-stagger className="mx-auto max-w-7xl px-5 sm:px-6 lg:px-8">
            <div className="max-w-3xl">
              <p className="ga-eyebrow">Role-based service</p>
              <h2 id="roles-title" className="mt-3 text-3xl font-bold tracking-tight text-ink sm:text-4xl">The right workspace for each responsibility.</h2>
              <p className="mt-4 text-base leading-7 text-muted-copy">Users see tools aligned with their assigned government-service role.</p>
            </div>
            <div className="mt-9 grid overflow-hidden rounded-xl border border-line bg-white shadow-sm lg:grid-cols-3">
              {roles.map(([title, description], index) => (
                <article key={title} className="border-b border-line p-6 last:border-b-0 lg:border-b-0 lg:border-r lg:last:border-r-0">
                  <p className="text-sm font-bold text-brand-blue">Role 0{index + 1}</p>
                  <h3 className="mt-3 text-xl font-bold text-ink">{title}</h3>
                  <p className="mt-3 text-base leading-7 text-muted-copy">{description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="features" className="scroll-mt-24 border-y border-line bg-white py-16 lg:py-20" aria-labelledby="features-title">
          <div data-motion-stagger className="mx-auto grid max-w-7xl gap-10 px-5 sm:px-6 lg:grid-cols-[0.72fr_1.28fr] lg:px-8">
            <div>
              <p className="ga-eyebrow">Operational capabilities</p>
              <h2 id="features-title" className="mt-3 text-3xl font-bold tracking-tight text-ink sm:text-4xl">Built for accountable public service.</h2>
              <p className="mt-4 text-base leading-7 text-muted-copy">Practical tools support authorized staff before, during, and after each distribution event.</p>
            </div>
            <div className="grid border-t border-line md:grid-cols-2">
              {features.map(([title, description], index) => (
                <article key={title} className={`border-b border-line py-5 md:px-5 ${index % 2 === 0 ? 'md:border-r md:pl-0' : 'md:pr-0'}`}>
                  <h3 className="font-bold text-ink">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-copy">{description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="security" className="scroll-mt-24 bg-page py-16 lg:py-20" aria-labelledby="security-title">
          <div data-motion-stagger className="mx-auto grid max-w-7xl gap-8 px-5 sm:px-6 lg:grid-cols-[1fr_1fr] lg:items-center lg:px-8">
            <div>
              <p className="ga-eyebrow">Security and privacy</p>
              <h2 id="security-title" className="mt-3 text-3xl font-bold tracking-tight text-ink sm:text-4xl">Public information stays public. Operational records stay protected.</h2>
              <p className="mt-4 text-base leading-7 text-muted-copy">The public website contains no beneficiary records, internal distribution details, live statistics, or audit logs.</p>
            </div>
            <div className="ga-card p-6 sm:p-7">
              <ul className="divide-y divide-line">
                {[
                  ['Protected staff access', 'Password, authenticator verification, and role checks protect internal operations.'],
                  ['Privacy-aware pages', 'Sensitive records remain inside authenticated staff workspaces.'],
                  ['Accountable activity', 'Important staff and system actions are retained for authorized review.'],
                ].map(([title, description]) => <li key={title} className="py-4 first:pt-0 last:pb-0"><h3 className="font-bold text-ink">{title}</h3><p className="mt-1 text-sm leading-6 text-muted-copy">{description}</p></li>)}
              </ul>
            </div>
          </div>
        </section>

        <section className="bg-white py-14" aria-labelledby="portal-title">
          <div data-motion-stagger className="mx-auto flex max-w-5xl flex-col gap-5 px-5 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
            <div><p className="ga-eyebrow">Authorized personnel</p><h2 id="portal-title" className="mt-2 text-2xl font-bold text-ink sm:text-3xl">Continue to the secure staff portal.</h2><p className="mt-2 text-base text-muted-copy">Use your official credentials and authenticator.</p></div>
            <a href="/login" className="ga-btn-primary shrink-0 px-7">Staff Login</a>
          </div>
        </section>
      </main>

      <footer className="bg-brand-navy text-slate-300">
        <div className="mx-auto flex max-w-7xl flex-col gap-8 px-5 py-10 sm:px-6 md:flex-row md:items-start md:justify-between lg:px-8">
          <div><BrandMark light /><p className="mt-4 max-w-md text-sm leading-6">A secure capstone platform supporting transparent and efficient social welfare assistance distribution.</p></div>
          <div className="flex flex-wrap gap-x-7 gap-y-3 text-sm"><a className="hover:text-white" href="#how-it-works">How it works</a><a className="hover:text-white" href="#security">Security</a><a className="hover:text-white" href="/privacy">Privacy Notice</a></div>
        </div>
        <div className="border-t border-white/10 px-5 py-5 text-center text-xs text-slate-400">&copy; {new Date().getFullYear()} GarantiyAid. For authorized government-service use.</div>
      </footer>
    </>
  )
}

export default HomePage
