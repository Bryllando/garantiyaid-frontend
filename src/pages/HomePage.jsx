import { Icon } from '../components/ui/icon.jsx'

const workflow = [
  ['administration', 'Set up the service area', 'Create the barangay and assign the responsible staff.'],
  ['calendar', 'Schedule by sitio or purok', 'Group beneficiaries into clear sessions with capacity limits.'],
  ['biometrics', 'Verify at the distribution site', 'Use the live camera, liveness check, and signature when required.'],
  ['reports', 'Record and review', 'Keep claim results and staff actions available for oversight.'],
]

const roles = [
  ['System Administrator', 'Creates barangays, staff accounts, assignments, and security recovery records.'],
  ['DSWD Staff', 'Manages programs, monitors distributions, settles verified claims, and prepares reports.'],
  ['Barangay Facilitator', 'Runs the assigned queue and completes on-site beneficiary verification.'],
]

const safeguards = [
  ['security', 'Role-based access', 'Each staff role sees only the tools and records needed for assigned work.'],
  ['biometrics', 'Protected identity checks', 'Raw face captures are cleared after processing and templates stay encrypted.'],
  ['audit', 'Traceable actions', 'Important account, distribution, verification, and settlement actions are audited.'],
]

function BrandMark({ light = false }) {
  return (
    <span className={`flex items-center gap-3 font-bold tracking-tight ${light ? 'text-white' : 'text-brand-navy'}`}>
      <img src="/GarantiyAid-logo.svg" alt="" width="64" height="64" className="size-11 shrink-0 object-contain sm:size-12" />
      <span>
        <span className="block text-lg leading-none">GarantiyAid</span>
        <span className={`mt-1 block text-[0.68rem] font-semibold uppercase tracking-[0.12em] ${light ? 'text-blue-200' : 'text-muted-copy'}`}>Aid operations</span>
      </span>
    </span>
  )
}

function WorkflowPreview() {
  return (
    <div data-motion-reveal className="relative mx-auto w-full max-w-xl">
      <div aria-hidden="true" className="absolute -inset-5 rounded-[2rem] bg-blue-100/60 blur-2xl" />
      <section className="relative overflow-hidden rounded-2xl border border-line bg-white shadow-lg" aria-label="Example GarantiyAid field workflow">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <p className="text-sm font-bold text-ink">Example field workflow</p>
            <p className="mt-1 text-xs text-muted-copy">Barangay Liburon · Distribution setup</p>
          </div>
          <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-success-soft px-3 py-1.5 text-xs font-bold text-brand-green">
            <span aria-hidden="true" className="size-2 rounded-full bg-emerald-500" /> Ready
          </span>
        </header>
        <ol className="divide-y divide-line px-5" aria-label="Setup progress">
          {[
            ['Barangay and staff assigned', true],
            ['Sitio sessions prepared', true],
            ['Open event for claims', false],
          ].map(([label, complete], index) => (
            <li key={label} className="flex items-center gap-4 py-4">
              <span aria-hidden="true" className={`grid size-9 shrink-0 place-items-center rounded-full ${complete ? 'bg-brand-green text-white' : 'border border-line bg-slate-50 text-copy'}`}>
                {complete ? <Icon name="check" className="size-4" strokeWidth={2.4} /> : index + 1}
              </span>
              <span className="min-w-0 flex-1 font-semibold text-ink">{label}</span>
              <span className={`text-xs font-bold ${complete ? 'text-brand-green' : 'text-brand-blue'}`}>{complete ? 'Complete' : 'Next'}</span>
            </li>
          ))}
        </ol>
        <div className="border-t border-line bg-slate-50 px-5 py-4">
          <div className="flex items-start gap-3 text-sm leading-6 text-copy">
            <Icon name="security" className="mt-0.5 size-5 shrink-0 text-brand-blue" />
            <p><strong className="text-ink">Privacy-first preview.</strong> No real beneficiary information is displayed on this public page.</p>
          </div>
        </div>
      </section>
    </div>
  )
}

function HomePage() {
  return (
    <>
      <a href="#main-content" className="fixed left-4 top-4 z-50 -translate-y-24 rounded-lg bg-brand-navy px-4 py-3 font-bold text-white transition-transform focus:translate-y-0">Skip to content</a>

      <header className="sticky top-0 z-40 border-b border-line bg-white/95 backdrop-blur-sm">
        <nav aria-label="Primary navigation" className="mx-auto flex min-h-[4.75rem] max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <a href="#top" aria-label="GarantiyAid home" className="rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-blue"><BrandMark /></a>
          <div className="hidden items-center gap-7 text-sm font-semibold text-copy lg:flex">
            <a className="rounded hover:text-brand-blue focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-blue" href="#workflow">Workflow</a>
            <a className="rounded hover:text-brand-blue focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-blue" href="#roles">Staff roles</a>
            <a className="rounded hover:text-brand-blue focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-blue" href="#safeguards">Safeguards</a>
          </div>
          <a href="/login" className="ga-btn-primary min-h-11 px-4 text-sm">Staff sign in</a>
        </nav>
      </header>

      <main id="main-content" data-route-focus tabIndex={-1} className="outline-none">
        <section id="top" className="ga-hero relative overflow-hidden bg-white" aria-labelledby="hero-title">
          <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-5 py-16 sm:px-6 sm:py-20 lg:grid-cols-[0.95fr_1.05fr] lg:px-8 lg:py-24">
            <div data-motion-stagger>
              <p className="ga-eyebrow">Social assistance operations</p>
              <h1 id="hero-title" className="mt-4 max-w-3xl text-4xl font-bold leading-[1.08] tracking-[-0.035em] text-ink sm:text-5xl lg:text-[3.5rem]">One clear workflow from barangay setup to verified claim.</h1>
              <p className="mt-6 max-w-2xl text-lg leading-8 text-copy">GarantiyAid helps government staff register service areas, schedule beneficiaries by sitio, and complete secure on-site verification.</p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <a href="/login" className="ga-btn-primary px-6">Open staff portal</a>
                <a href="#workflow" className="ga-btn-secondary px-6">View the workflow</a>
              </div>
              <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-3 border-t border-line pt-6 text-sm font-semibold text-copy" aria-label="Platform capabilities">
                {['Barangay-scoped access', 'Sitio-based scheduling', 'Face and signature verification'].map((item) => <li key={item} className="flex items-center gap-2"><Icon name="check" className="size-4 text-brand-green" strokeWidth={2.4} />{item}</li>)}
              </ul>
            </div>
            <WorkflowPreview />
          </div>
        </section>

        <section id="workflow" className="scroll-mt-24 border-y border-line bg-page py-16 lg:py-20" aria-labelledby="workflow-title">
          <div className="mx-auto max-w-7xl px-5 sm:px-6 lg:px-8">
            <div className="max-w-3xl" data-motion-stagger>
              <p className="ga-eyebrow">Core workflow</p>
              <h2 id="workflow-title" className="mt-3 text-3xl font-bold tracking-tight text-ink sm:text-4xl">Designed around the work staff actually perform.</h2>
              <p className="mt-4 text-base leading-7 text-muted-copy">Each step has one owner, one outcome, and a visible next action.</p>
            </div>
            <ol data-motion-stagger className="mt-10 grid overflow-hidden rounded-2xl border border-line bg-white md:grid-cols-2 xl:grid-cols-4">
              {workflow.map(([icon, title, description], index) => (
                <li key={title} className={`border-b border-line p-6 last:border-b-0 ${index % 2 === 1 ? 'md:border-l' : ''} xl:border-b-0 xl:border-l xl:first:border-l-0`}>
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

        <section id="roles" className="scroll-mt-24 bg-white py-16 lg:py-20" aria-labelledby="roles-title">
          <div className="mx-auto grid max-w-7xl gap-10 px-5 sm:px-6 lg:grid-cols-[0.72fr_1.28fr] lg:px-8">
            <div data-motion-stagger>
              <p className="ga-eyebrow">Staff roles</p>
              <h2 id="roles-title" className="mt-3 text-3xl font-bold tracking-tight text-ink sm:text-4xl">The right tools for each responsibility.</h2>
              <p className="mt-4 text-base leading-7 text-muted-copy">Assignments stay controlled while daily work remains easy to find.</p>
            </div>
            <div data-motion-stagger className="divide-y divide-line border-y border-line">
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
              <p className="text-sm font-semibold text-blue-200">Built-in safeguards</p>
              <h2 id="safeguards-title" className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Sensitive work stays inside the staff portal.</h2>
              <p className="mt-4 text-base leading-7 text-slate-300">The public site never exposes beneficiary records, live distribution data, or audit history.</p>
            </div>
            <div data-motion-stagger className="mt-10 grid gap-px overflow-hidden rounded-2xl bg-white/15 lg:grid-cols-3">
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

        <section className="bg-white py-14" aria-labelledby="portal-title">
          <div className="mx-auto flex max-w-5xl flex-col gap-5 px-5 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
            <div><p className="ga-eyebrow">Staff access</p><h2 id="portal-title" className="mt-2 text-2xl font-bold text-ink sm:text-3xl">Continue to your assigned workspace.</h2><p className="mt-2 text-base text-muted-copy">Use your Staff ID or username and authenticator.</p></div>
            <a href="/login" className="ga-btn-primary shrink-0 px-7">Staff sign in</a>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/10 bg-brand-navy text-slate-300">
        <div className="mx-auto flex max-w-7xl flex-col gap-8 px-5 py-10 sm:px-6 md:flex-row md:items-start md:justify-between lg:px-8">
          <div><BrandMark light /><p className="mt-4 max-w-md text-sm leading-6">A capstone platform for clearer, safer social assistance distribution.</p></div>
          <div className="flex flex-wrap gap-x-7 gap-y-3 text-sm"><a className="hover:text-white" href="#workflow">Workflow</a><a className="hover:text-white" href="#safeguards">Safeguards</a><a className="hover:text-white" href="/privacy">Privacy notice</a></div>
        </div>
        <div className="border-t border-white/10 px-5 py-5 text-center text-xs text-slate-400">&copy; {new Date().getFullYear()} GarantiyAid · Capstone prototype</div>
      </footer>
    </>
  )
}

export default HomePage
