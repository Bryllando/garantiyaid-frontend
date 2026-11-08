import { useEffect, useRef, useState } from 'react'
import { Icon } from '../components/ui/icon.jsx'
import BeneficiaryHelpChat from '../components/assistant/BeneficiaryHelpChat.jsx'

const navigation = [
  ['services', 'Services'],
  ['workflow', 'Process'],
  ['burial-referrals', 'Burial referrals'],
  ['roles', 'Staff roles'],
  ['beneficiary-guidance', 'For residents'],
]

const services = [
  ['beneficiaries', 'Beneficiary records', 'Prepare records and supporting documents, then submit enrollments for review.', 'See review steps', 'review-step'],
  ['calendar', 'Distribution & queues', 'Assign approved beneficiaries to sessions and manage the queue on distribution day.', 'See scheduling steps', 'schedule-step'],
  ['receipt', 'Documented releases', 'Keep claim verification, handover evidence, and the release receipt together.', 'See handover steps', 'handover-step'],
]

const workflow = [
  { id: 'review-step', title: 'Submit and review the enrollment', description: 'Submit the beneficiary record and supporting documents for an independent decision.', staff: 'Barangay staff and an independent reviewer', result: 'Recorded enrollment decision' },
  { id: 'schedule-step', title: 'Assign the distribution schedule', description: 'Assign an approved beneficiary to an event, service session, and queue.', staff: 'Admin; assigned Barangay staff for draft schedules', result: 'Event, session, and queue assignment' },
  { id: 'verification-step', title: 'Complete the claim checks', description: 'Check the beneficiary and claim against the verification requirements of the event.', staff: 'Assigned verification staff', result: 'Recorded claim-check result' },
  { id: 'handover-step', title: 'Record the physical handover', description: 'Hand over the assistance, retain acknowledgment evidence, and issue the release receipt.', staff: 'Assigned Barangay staff', result: 'Handover record and receipt' },
]

const roles = [
  { title: 'Barangay Facilitator', duties: ['Prepares beneficiary records, enrollments, and referral requests.', 'Manages the local queue, verifies claims, and records physical handovers.'], scope: 'Records and operations within the assigned barangay.' },
  { title: 'DSWD Staff', duties: ['Reviews enrollments, referral requests, and program requirements.', 'Checks claims and reviews assigned concerns.'], scope: 'Enrollment decisions require a reviewer independent of the submitter.' },
  { title: 'System Administrator', duties: ['Manages staff access, barangay assignments, events, and allocations.', 'Oversees reconciliation and audit records.'], scope: 'Burial referrals are read-only for Admin oversight.' },
]

const referralSteps = [
  ['Prepare the case', 'Barangay facilitator', 'Record the living applicant, deceased person, receiving office, and supporting documents.'],
  ['Review the request', 'DSWD reviewer', 'Check the details and attachments. Return requests that need correction before preparing a letter.'],
  ['Print, sign, and issue', 'Designated officer and issuing staff', 'Staff print the reviewed letter for the designated officer to sign. Record issuance after the signed letter is handed over or dispatched.'],
  ['Record the office response', 'Barangay or DSWD staff', 'Record the actual receiving-office response, its outcome, and a traceable reference.'],
]

function HomePage() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [activeSection, setActiveSection] = useState('top')
  const headerRef = useRef(null)
  const menuButtonRef = useRef(null)

  useEffect(() => {
    const sections = ['top', ...navigation.map(([id]) => id)].map(id => document.getElementById(id))
    let frame
    function updateSection() {
      let current = 'top'
      for (const section of sections) {
        if (section.getBoundingClientRect().top <= 112) current = section.id
      }
      if (window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2) current = navigation.at(-1)[0]
      setActiveSection(current)
    }
    function onScroll() {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(updateSection)
    }
    function onResize() {
      if (window.matchMedia('(min-width: 1024px)').matches) setMenuOpen(false)
      onScroll()
    }
    updateSection()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onResize)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onResize)
    }
  }, [])

  useEffect(() => {
    if (!menuOpen) return
    function onKeyDown(event) {
      if (event.key === 'Escape') {
        setMenuOpen(false)
        menuButtonRef.current?.focus()
      }
    }
    function onPointerDown(event) {
      if (!headerRef.current?.contains(event.target)) setMenuOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('pointerdown', onPointerDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('pointerdown', onPointerDown)
    }
  }, [menuOpen])

  return (
    <div className="bg-white">
      <a href="#main-content" className="fixed left-4 top-4 z-50 -translate-y-24 rounded bg-brand-navy px-4 py-3 font-bold text-white focus:translate-y-0">Skip to content</a>

      <div className="bg-brand-navy text-white">
        <div className="mx-auto flex max-w-7xl flex-wrap justify-between gap-x-6 gap-y-1 px-5 py-2 text-xs leading-5 sm:px-8">
          <p>Government-service capstone prototype</p>
          <p className="text-blue-100">For evaluation only</p>
        </div>
      </div>

      <header ref={headerRef} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setMenuOpen(false) }} className="sticky top-0 z-40 border-b border-line bg-white shadow-sm">
        <nav aria-label="Primary navigation" className="relative mx-auto flex min-h-20 max-w-7xl items-center justify-between gap-4 px-5 sm:px-8">
          <a href="#top" aria-label="GarantiyAid home" onClick={() => setMenuOpen(false)} className="flex shrink-0 items-center gap-2.5 rounded focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-blue">
            <img src="/GarantiyAid-logo.svg" alt="" width="44" height="44" className="size-11" />
            <span><span className="block text-lg font-bold tracking-tight text-brand-navy sm:text-xl">GarantiyAid</span><span className="block text-xs leading-5 text-muted-copy">Assistance management</span></span>
          </a>
          <button ref={menuButtonRef} type="button" aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'} aria-expanded={menuOpen} aria-controls="public-navigation" onClick={() => setMenuOpen(!menuOpen)} className="inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded border border-line px-3 text-brand-navy hover:bg-info-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue lg:hidden"><span className="hidden text-sm font-semibold sm:inline">Menu</span><Icon name={menuOpen ? 'close' : 'menu'} /></button>
          <div id="public-navigation" className={`${menuOpen ? 'block' : 'hidden'} absolute inset-x-0 top-full max-h-[calc(100dvh-9rem)] overflow-y-auto border-y border-line bg-white p-5 shadow-lg sm:px-8 lg:static lg:flex lg:max-h-none lg:items-center lg:gap-5 lg:overflow-visible lg:border-0 lg:p-0 lg:shadow-none`}>
            <div className="grid gap-1 lg:flex">
              {navigation.map(([id, label]) => (
                <a key={id} href={`#${id}`} aria-current={activeSection === id ? 'location' : undefined} onClick={() => setMenuOpen(false)} className={`inline-flex min-h-12 items-center rounded-sm border-b-2 px-3 py-3 text-sm font-semibold leading-6 transition-colors hover:bg-info-soft hover:text-brand-blue focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue ${activeSection === id ? 'border-brand-blue bg-info-soft text-brand-blue' : 'border-transparent text-copy'}`}>{label}</a>
              ))}
            </div>
            <a href="/login" className="mt-4 inline-flex min-h-12 w-full items-center justify-center gap-3 rounded-sm bg-brand-blue px-4 py-3 text-sm font-semibold text-white hover:bg-brand-blue-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue lg:mt-0 lg:w-auto lg:shrink-0">Staff sign in <Icon name="arrowRight" className="size-4" /></a>
          </div>
        </nav>
      </header>

      <main id="main-content" data-route-focus tabIndex={-1} className="scroll-mt-24 outline-none">
        <section id="top" tabIndex={-1} aria-labelledby="hero-title" className="scroll-mt-24 bg-brand-navy text-white outline-none">
          <div className="mx-auto grid max-w-7xl items-center gap-9 px-5 py-10 sm:px-8 sm:py-14 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-12 lg:py-16">
            <div>
              <p className="flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.12em] text-blue-100"><span aria-hidden="true" className="h-px w-7 shrink-0 bg-amber-300" />Social welfare &amp; assistance management</p>
              <h1 id="hero-title" lang="ceb" className="mt-6 max-w-lg font-serif text-[2.5rem] leading-[1.1] tracking-tight sm:text-5xl xl:text-6xl">Mas klarong pagdumala sa ayuda.</h1>
              <p className="mt-6 max-w-md text-base leading-7 text-blue-100 sm:text-lg sm:leading-8">A shared staff workspace for beneficiary records, distribution schedules, and accountable assistance releases.</p>
              <div className="mt-8 flex flex-wrap items-center gap-x-7 gap-y-3">
                <a href="/login" className="inline-flex min-h-12 items-center justify-center gap-4 rounded-sm bg-amber-300 px-6 py-3 text-sm font-bold text-brand-navy hover:bg-amber-200 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white">Staff sign in <Icon name="arrowRight" className="size-4" /></a>
                <a href="#workflow" className="inline-flex min-h-12 items-center gap-2 rounded-sm text-sm font-semibold text-white underline decoration-white/50 underline-offset-4 hover:decoration-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white">See the process <Icon name="chevronDown" className="size-4" /></a>
              </div>
            </div>
            <figure className="min-w-0">
              <img src="/LandingPage(2).png" alt="A collage of community outreach activities, assistance processing, and children gathered outside a school." width="1466" height="877" fetchPriority="high" className="h-auto w-full rounded-sm border border-white/20" />
              <figcaption className="mt-3 border-l-2 border-amber-300 pl-3 text-xs leading-5 text-blue-100">Community outreach &amp; assistance</figcaption>
            </figure>
          </div>
        </section>

        <section id="services" tabIndex={-1} aria-labelledby="services-title" className="scroll-mt-24 border-b border-line bg-page outline-none">
          <div className="mx-auto max-w-7xl px-5 py-12 sm:px-8 sm:py-16">
            <div className="max-w-2xl">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-brand-blue">The staff workspace</p>
              <h2 id="services-title" className="mt-3 text-3xl font-semibold leading-tight tracking-tight text-brand-navy sm:text-4xl">Tools for daily assistance work.</h2>
              <p className="mt-4 text-base leading-7 text-copy">Prepare records, organize distribution days, and document each release. Choose a task below to see how it works.</p>
            </div>
            <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1.8fr)_minmax(0,1fr)] lg:gap-8">
              <ul aria-label="Staff workspace tools" className="divide-y divide-line overflow-hidden rounded-md border border-line bg-white">
                {services.map(([icon, title, description, linkLabel, target]) => (
                  <li key={title}>
                    <a href={`#${target}`} aria-labelledby={`${target}-tool-title`} aria-describedby={`${target}-tool-description ${target}-tool-link`} className="group grid grid-cols-[minmax(0,1fr)_1.25rem] gap-4 px-5 py-5 transition-colors hover:bg-info-soft focus-visible:bg-info-soft focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-blue sm:grid-cols-[2rem_minmax(0,1fr)_1.25rem] sm:px-6">
                      <Icon name={icon} className="mt-1 hidden size-6 text-brand-blue sm:block" />
                      <div>
                        <h3 id={`${target}-tool-title`} className="text-lg font-semibold text-brand-navy">{title}</h3>
                        <p id={`${target}-tool-description`} className="mt-1 text-base leading-7 text-copy">{description}</p>
                        <span id={`${target}-tool-link`} className="mt-2 inline-block text-sm font-semibold text-brand-blue underline decoration-brand-blue/40 underline-offset-4 group-hover:decoration-brand-blue">{linkLabel}</span>
                      </div>
                      <Icon name="chevronRight" className="size-5 self-center text-brand-blue" />
                    </a>
                  </li>
                ))}
              </ul>
              <aside aria-labelledby="referral-overview-title" className="flex flex-col rounded-md border-t-4 border-amber-300 bg-brand-navy p-6 text-white sm:p-7">
                <div className="flex items-center gap-3 text-blue-100"><Icon name="printer" className="size-6 shrink-0" /><p className="text-xs font-semibold uppercase tracking-[0.1em]">Referral letters</p></div>
                <h3 id="referral-overview-title" className="mt-6 font-serif text-3xl leading-tight">Burial referral letters</h3>
                <p className="mt-4 text-base leading-7 text-blue-100">Prepare a reviewed letter for the applicant to bring to the receiving office, with the supporting documents.</p>
                <div className="mt-auto pt-6">
                  <a href="#burial-referrals" className="inline-flex min-h-12 w-full items-center justify-between gap-3 rounded-sm bg-white px-4 py-3 text-sm font-semibold text-brand-navy hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white">View referral steps <Icon name="arrowRight" className="size-4 shrink-0" /></a>
                  <p className="mt-4 text-sm leading-6 text-blue-100">The receiving office assesses the request and decides the assistance.</p>
                </div>
              </aside>
            </div>
          </div>
        </section>

        <section id="workflow" tabIndex={-1} aria-labelledby="workflow-title" className="scroll-mt-24 bg-white outline-none">
          <div className="mx-auto max-w-7xl px-5 py-12 sm:px-8 sm:py-16">
            <div className="max-w-3xl">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-brand-blue">Service procedure</p>
              <h2 id="workflow-title" className="mt-3 text-3xl font-semibold leading-tight tracking-tight text-brand-navy sm:text-4xl">Physical assistance: processing and release</h2>
              <p className="mt-4 text-base leading-7 text-copy">Each stage has a responsible staff role and a recorded result. Enrollment approval, scheduling, verification, and the actual release are recorded separately.</p>
            </div>
            <ol aria-label="Physical assistance procedure" className="mt-8 divide-y divide-line rounded-sm border border-line">
              {workflow.map(({ id, title, description, staff, result }, index) => (
                <li key={id} id={id} tabIndex={-1} className="grid scroll-mt-24 grid-cols-[2.25rem_minmax(0,1fr)] gap-x-4 gap-y-4 p-5 outline-none target:bg-info-soft target:outline-2 target:outline-solid target:-outline-offset-2 target:outline-brand-blue sm:p-6 lg:grid-cols-[2.25rem_minmax(0,1.2fr)_minmax(0,1fr)] lg:gap-x-6">
                  <span aria-hidden="true" className="grid size-9 place-items-center rounded-sm bg-brand-navy text-sm font-bold tabular-nums text-white">{index + 1}</span>
                  <div><h3 className="text-lg font-semibold text-brand-navy">{title}</h3><p className="mt-1 text-base leading-7 text-copy">{description}</p></div>
                  <dl className="col-start-2 grid gap-4 sm:grid-cols-2 lg:col-start-auto">
                    <div><dt className="text-xs font-semibold uppercase tracking-wide text-muted-copy">Handled by</dt><dd className="mt-2 text-sm leading-6 text-ink">{staff}</dd></div>
                    <div><dt className="text-xs font-semibold uppercase tracking-wide text-muted-copy">Recorded result</dt><dd className="mt-2 text-sm leading-6 text-ink">{result}</dd></div>
                  </dl>
                </li>
              ))}
            </ol>
            <div className="mt-5 flex items-start gap-3 border-l-4 border-brand-blue bg-info-soft p-4 text-sm leading-6 text-copy">
              <Icon name="info" className="mt-0.5 size-5 shrink-0 text-brand-blue" />
              <p><strong className="font-semibold text-ink">Verification is not a completed release.</strong> Physical assistance requires a recorded handover and receipt.</p>
            </div>
          </div>
        </section>

        <section id="burial-referrals" tabIndex={-1} aria-labelledby="burial-title" className="scroll-mt-24 border-y border-line bg-page outline-none">
          <div className="mx-auto max-w-7xl px-5 py-12 sm:px-8 sm:py-16">
            <div className="max-w-3xl">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-brand-blue">Referral service</p>
              <h2 id="burial-title" className="mt-3 text-3xl font-semibold tracking-tight text-brand-navy sm:text-4xl">Burial assistance referral</h2>
              <p className="mt-4 text-base leading-7 text-copy">Staff prepare a referral letter and document its review, signed issuance, and the response from the receiving office.</p>
            </div>
            <div className="mt-8 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.65fr)] lg:gap-8">
              <aside aria-labelledby="referral-details-title" className="rounded-sm border border-line border-t-4 border-t-brand-navy bg-white p-5 sm:p-6">
                <h3 id="referral-details-title" className="flex items-center gap-3 text-lg font-semibold text-brand-navy"><Icon name="printer" className="size-5 shrink-0" />Service information</h3>
                <dl className="mt-5 space-y-5">
                  <div><dt className="text-xs font-semibold uppercase tracking-wide text-muted-copy">Document produced</dt><dd className="mt-1 text-base leading-7 text-ink">A reviewed referral letter for signature.</dd></div>
                  <div><dt className="text-xs font-semibold uppercase tracking-wide text-muted-copy">Where it is submitted</dt><dd className="mt-1 text-base leading-7 text-ink">The receiving office named in the request.</dd></div>
                  <div><dt className="text-xs font-semibold uppercase tracking-wide text-muted-copy">Requirements</dt><dd className="mt-1 text-base leading-7 text-ink">Confirm the document checklist and authorized signatory with the offices involved.</dd></div>
                </dl>
                <p className="mt-5 border-t border-line pt-4 text-sm leading-6 text-copy"><strong className="font-semibold text-ink">Printing does not record issuance.</strong> Staff record the actual signed handoff or dispatch separately.</p>
              </aside>
              <ol aria-label="Burial referral procedure" className="divide-y divide-line rounded-sm border border-line bg-white">
                {referralSteps.map(([title, staff, description], index) => (
                  <li key={title} className="flex gap-4 p-5 sm:p-6">
                    <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-sm bg-info-soft text-sm font-bold tabular-nums text-brand-blue">{index + 1}</span>
                    <div><h3 className="text-lg font-semibold text-brand-navy">{title}</h3><p className="mt-1 text-sm font-semibold text-brand-blue">{staff}</p><p className="mt-2 text-base leading-7 text-copy">{description}</p></div>
                  </li>
                ))}
              </ol>
            </div>
            <p className="mt-5 border-l-4 border-brand-blue bg-info-soft p-4 text-sm leading-6 text-copy"><strong className="font-semibold text-ink">A referral is not an approval, Guarantee Letter, or payment.</strong> The receiving office assesses the request and decides the assistance.</p>
          </div>
        </section>

        <section id="roles" tabIndex={-1} aria-labelledby="roles-title" className="scroll-mt-24 outline-none">
          <div className="mx-auto max-w-7xl px-5 py-12 sm:px-8 sm:py-16">
            <div className="max-w-3xl">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-brand-blue">Separation of duties</p>
              <h2 id="roles-title" className="mt-3 text-3xl font-semibold tracking-tight text-brand-navy sm:text-4xl">Staff responsibilities</h2>
              <p className="mt-4 text-base leading-7 text-copy">Access follows the staff role and assigned area. The partner office must confirm its authorized personnel and procedure before official use.</p>
            </div>
            <dl aria-label="Staff responsibilities" className="mt-8 divide-y divide-line rounded-sm border border-line">
              {roles.map(({ title, duties, scope }) => (
                <div key={title} className="grid gap-4 p-5 sm:p-6 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.6fr)_minmax(0,1fr)] lg:gap-8">
                  <dt className="text-lg font-semibold text-brand-navy">{title}</dt>
                  <dd><span className="text-xs font-semibold uppercase tracking-wide text-muted-copy">Main work</span><ul className="mt-2 list-disc space-y-1 pl-4 text-base leading-7 text-copy">{duties.map(duty => <li key={duty}>{duty}</li>)}</ul></dd>
                  <dd className="border-l-2 border-line pl-4"><span className="text-xs font-semibold uppercase tracking-wide text-muted-copy">Scope of access</span><p className="mt-2 text-sm leading-6 text-copy">{scope}</p></dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <section id="beneficiary-guidance" tabIndex={-1} aria-labelledby="beneficiary-title" className="scroll-mt-24 border-y border-line bg-info-soft outline-none">
          <div className="mx-auto grid max-w-7xl items-start gap-8 px-5 py-12 sm:px-8 sm:py-16 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:gap-12">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-brand-blue">For residents</p>
              <h2 id="beneficiary-title" className="mt-3 text-3xl font-semibold leading-tight tracking-tight text-brand-navy sm:text-4xl">Where to request assistance</h2>
              <ol aria-label="Resident assistance steps" className="mt-6 space-y-5">
                <li className="flex gap-4"><span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-sm border border-brand-blue/30 text-sm font-bold text-brand-blue">1</span><div><h3 className="font-semibold text-ink">Start with your barangay</h3><p className="mt-1 text-base leading-7 text-copy">Ask where to submit your request and which office handles the assistance program.</p></div></li>
                <li className="flex gap-4"><span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-sm border border-brand-blue/30 text-sm font-bold text-brand-blue">2</span><div><h3 className="font-semibold text-ink">Confirm with the program office</h3><p className="mt-1 text-base leading-7 text-copy">The responsible LGU or DSWD office can confirm its requirements, schedules, and application process.</p></div></li>
              </ol>
              <p className="mt-6 border-t border-brand-blue/20 pt-4 text-sm leading-6 text-copy">No public application or beneficiary lookup is offered here. Use the handling office's official channels for personal case inquiries.</p>
            </div>
            <aside aria-labelledby="public-help-title" className="rounded-sm border border-line bg-white p-5 sm:p-6">
              <h3 id="public-help-title" className="text-xl font-semibold text-brand-navy">General guidance</h3>
              <p className="mt-3 text-base leading-7 text-copy">Ask about the assistance process, staff responsibilities, or where to start. GarantiyAid Help cannot check your personal application or claim.</p>
              <BeneficiaryHelpChat />
              <p className="mt-4 border-t border-line pt-4 text-sm leading-6 text-muted-copy">Do not send personal records, ID numbers, or sign-in codes.</p>
            </aside>
          </div>
        </section>
      </main>

      <footer className="bg-brand-navy text-white">
        <div className="mx-auto grid max-w-7xl gap-8 px-5 py-9 sm:px-8 md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] md:gap-16">
          <div>
            <p className="text-xl font-bold tracking-tight">GarantiyAid</p>
            <p className="mt-3 max-w-xl text-sm leading-6 text-blue-100">Beneficiary records, assistance schedules, and release documentation for authorized staff.</p>
            <nav aria-label="Footer information" className="mt-3 flex flex-wrap gap-x-6">
              <a href="#beneficiary-guidance" className="inline-flex min-h-11 items-center rounded text-sm font-semibold text-white underline decoration-white/50 underline-offset-4 hover:decoration-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">For residents</a>
              <a href="#roles" className="inline-flex min-h-11 items-center rounded text-sm font-semibold text-white underline decoration-white/50 underline-offset-4 hover:decoration-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">Staff responsibilities</a>
              <a href="/privacy" className="inline-flex min-h-11 items-center rounded text-sm font-semibold text-white underline decoration-white/50 underline-offset-4 hover:decoration-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">Privacy notice</a>
            </nav>
          </div>
          <div>
            <h2 className="text-sm font-semibold">Authorized staff access</h2>
            <p className="mt-3 text-sm leading-6 text-blue-100">For an account or sign-in help, contact your system administrator.</p>
            <a href="/login" className="mt-4 inline-flex min-h-12 items-center gap-4 rounded-sm border border-white/50 px-4 py-3 text-sm font-semibold text-white hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white">Staff sign in <Icon name="arrowRight" className="size-4" /></a>
          </div>
        </div>
        <div className="mx-auto max-w-7xl border-t border-white/20 px-5 py-6 text-sm leading-6 text-blue-100 sm:px-8">
          <p className="font-semibold text-white">Prototype status</p>
          <p className="mt-2">An academic prototype, not an official DSWD or LGU website. Not an official application, eligibility, or claim-status channel. Agency approval and supervised staff testing are required before operational use.</p>
          <p className="mt-2">Digital wallet credits are simulated in this prototype; no real funds are transferred.</p>
        </div>
        <div className="mx-auto max-w-7xl border-t border-white/20 px-5 py-4 text-xs leading-5 text-blue-100 sm:px-8">
          <p>&copy; {new Date().getFullYear()} GarantiyAid. Academic prototype.</p>
        </div>
      </footer>
    </div>
  )
}

export default HomePage
