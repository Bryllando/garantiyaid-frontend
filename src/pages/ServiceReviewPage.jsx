import { useState } from 'react'
import DashboardShell from '../components/layout/DashboardShell.jsx'
import { Icon } from '../components/ui/icon.jsx'

const scenarios = [
  {
    title: 'Enrollment and eligibility',
    handoff: 'Facilitator → DSWD reviewer',
    evidence: 'Local HTTP workflow passed',
    steps: ['Register or find a beneficiary in the assigned barangay.', 'Upload and review the required documents.', 'Submit enrollment, inspect every eligibility result, then approve or reject.'],
    result: 'The final decision, eligibility snapshot, reviewer, and audit record agree.',
    remaining: 'The reusable HTTP verifier starts with an existing beneficiary. Demonstrate new registration in the browser.',
    links: { SYSTEM_ADMIN: ['/beneficiaries', 'Beneficiary records'], DSWD_STAFF: ['/enrollments', 'Enrollment review'], BARANGAY_FACILITATOR: ['/beneficiaries', 'Beneficiary records'] },
  },
  {
    title: 'Allocation, schedule, and QR',
    handoff: 'Administrator → Facilitator',
    evidence: 'Local distribution verifiers passed',
    steps: ['Create a physical-goods distribution and assign eligible beneficiaries.', 'Generate capacity-bound slots and schedules.', 'Open the event, issue QR credentials, and inspect the assigned queue.'],
    result: 'One beneficiary has one valid allocation and a scheduled place; QR credentials are issued only for an open event.',
    remaining: 'Confirm the final QR and queue in two signed-in staff browsers.',
    links: { SYSTEM_ADMIN: ['/distributions/manage', 'Distribution setup'], BARANGAY_FACILITATOR: ['/facilitator/queue', 'Queue & schedules'] },
  },
  {
    title: 'Verified physical release',
    handoff: 'Facilitator',
    evidence: 'Local release HTTP workflow passed',
    steps: ['Verify the claim with its required QR, face, or signature evidence.', 'Record the release evidence and mark the goods released.', 'Open the receipt and reconcile the event.'],
    result: 'Exactly one CLAIMED transition records the release actor, method, time, and evidence without a wallet credit.',
    remaining: 'Repeat the release-to-receipt path with consultation accounts on the deployed environment.',
    links: { BARANGAY_FACILITATOR: ['/facilitator/qr-verification', 'QR verification'], SYSTEM_ADMIN: ['/claim-accountability', 'Claim accountability'], DSWD_STAFF: ['/claim-accountability', 'Claim accountability'] },
  },
  {
    title: 'Simulated wallet settlement',
    handoff: 'DSWD staff',
    evidence: 'Local wallet verifier passed',
    steps: ['Credit a verified claim once to its simulated wallet.', 'Transfer between two simulated wallets after checking sender, recipient, and amount.', 'Compare debit, credit, receipt, and reconciliation.'],
    result: 'The two ledger entries balance, and an idempotent retry does not transfer again.',
    remaining: 'Show the wallet detail and matching histories in the deployed web interface.',
    links: { SYSTEM_ADMIN: ['/dswd/ledger', 'Claim settlement'], DSWD_STAFF: ['/dswd/ledger', 'Ledger'] },
  },
  {
    title: 'Duplicate and spoof attempts',
    handoff: 'Facilitator → Independent reviewer',
    evidence: 'Automated biometric checks passed',
    steps: ['Attempt enrollment with a face already linked to another active, consented beneficiary.', 'Repeat enrollment for the same record, then try a different person.', 'Try a duplicate claim and a failed liveness capture.'],
    result: 'Cross-record matches are flagged for review; self-matches are excluded; duplicate claims are blocked.',
    remaining: 'Real captures, spoof samples, and processor outage behavior need remote-service UAT.',
    links: { SYSTEM_ADMIN: ['/biometrics', 'Biometric identity'], DSWD_STAFF: ['/biometrics', 'Biometric identity'], BARANGAY_FACILITATOR: ['/biometrics', 'Biometric identity'] },
  },
  {
    title: 'Role and barangay boundaries',
    handoff: 'All staff roles',
    evidence: 'Automated authorization checks passed',
    steps: ['Sign in as each staff role and compare the available actions.', 'Try a facilitator action against another barangay through the API.', 'Confirm denied requests make no data change.'],
    result: 'The backend enforces role and barangay scope even when a control is hidden in the web interface.',
    remaining: 'Repeat the role walkthrough with consultation accounts and record the result.',
    links: { SYSTEM_ADMIN: ['/admin/administration', 'Staff & barangays'], DSWD_STAFF: ['/enrollments', 'Enrollment review'], BARANGAY_FACILITATOR: ['/facilitator/queue', 'Queue & schedules'] },
  },
  {
    title: 'Password recovery',
    handoff: 'Staff account owner',
    evidence: 'Automated security checks passed',
    steps: ['Request a reset link from the sign-in page.', 'Use it once, then retry the same and an expired link.', 'Check that older signed-in sessions can no longer call protected APIs.'],
    result: 'Only a valid single-use token resets the password; existing sessions are revoked.',
    remaining: 'Confirm the email queue and delivery in the consultation environment.',
    links: { SYSTEM_ADMIN: ['/account?section=password', 'Account security'], DSWD_STAFF: ['/account?section=password', 'Account security'], BARANGAY_FACILITATOR: ['/account?section=password', 'Account security'] },
  },
  {
    title: 'Help case handoff',
    handoff: 'Public help → Staff owner',
    evidence: 'Automated conversation checks passed',
    steps: ['Ask a question that requires staff follow-up.', 'Open the escalation inbox and inspect the redacted transcript.', 'Assign an owner, reply, and resolve the case.'],
    result: 'A single owner handles the case; only authorized staff see linked barangay records.',
    remaining: 'Demonstrate the public-to-staff handoff and the final response in separate browsers.',
    links: { SYSTEM_ADMIN: ['/help-cases', 'Help cases'], DSWD_STAFF: ['/help-cases', 'Help cases'], BARANGAY_FACILITATOR: ['/help-cases', 'Help cases'] },
  },
  {
    title: 'Live operational updates',
    handoff: 'One staff browser → Another',
    evidence: 'Automated Socket.IO checks passed',
    steps: ['Keep the overview and facilitator queue open in separate authorized browsers.', 'Change a schedule or settle a claim in one browser.', 'Confirm the affected figures and queue refresh without losing filters or selection.'],
    result: 'Only authorized rooms receive sanitized event data, and the relevant view refreshes.',
    remaining: 'Test two live browsers, temporary disconnection, reconnection, and sign-out cleanup.',
    links: { SYSTEM_ADMIN: ['/dashboard', 'Overview'], DSWD_STAFF: ['/dswd/live-dashboard', 'Live monitoring'], BARANGAY_FACILITATOR: ['/facilitator/queue', 'Queue & schedules'] },
  },
  {
    title: 'Schedule notices and retries',
    handoff: 'Staff approval → Message queue',
    evidence: 'Automated worker checks passed',
    steps: ['Preview and confirm a schedule-created, changed, or cancelled notice.', 'Inspect queued, sent, and failed history.', 'Retry a failed notice and verify its final state.'],
    result: 'A stable notification record shows each delivery state; retries do not duplicate the notice.',
    remaining: 'The local Redis queue was unavailable for the live verifier. Start Redis and the worker before UAT. SMS remains simulated.',
    links: { SYSTEM_ADMIN: ['/notifications', 'SMS delivery'], DSWD_STAFF: ['/notifications', 'SMS delivery'], BARANGAY_FACILITATOR: ['/notifications', 'SMS delivery'] },
  },
]

function ServiceReviewPage({ session, onLogout, onNavigate }) {
  const [selectedIndex, setSelectedIndex] = useState(0)
  const selected = scenarios[selectedIndex]
  const destination = selected.links[session.user.role]

  return <DashboardShell breadcrumbs={['Operations', 'Service review']} currentPath="/service-review" onLogout={onLogout} onNavigate={onNavigate} pageTitle="Service review" showAssistant={false} user={session.user}>
    <div className="w-full pb-8">
      <div className="border-b border-line pb-6 sm:flex sm:items-end sm:justify-between sm:gap-6">
        <div><p className="ga-eyebrow">Consultation guide</p><h1 className="mt-2 text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">Service review</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-muted-copy">Follow each staff handoff and inspect the record it leaves behind. Local automated results are separate from checks that still need a live environment.</p></div>
        <p className="mt-4 shrink-0 text-xs font-semibold text-muted-copy sm:mt-0">Local review · 25 Sep 2026</p>
      </div>
      <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(17rem,22rem)_minmax(0,1fr)]">
        <div className="rounded-2xl border border-line bg-white p-4 shadow-sm xl:hidden"><label htmlFor="service-review-check" className="ga-label">Service check</label><select id="service-review-check" value={selectedIndex} onChange={(event) => setSelectedIndex(Number(event.target.value))} className="ga-input mt-2">{scenarios.map((item, index) => <option key={item.title} value={index}>{index + 1}. {item.title}</option>)}</select><p className="mt-2 text-xs text-muted-copy">{selected.handoff}</p></div>
        <nav aria-label="Review scenarios" className="hidden rounded-2xl border border-line bg-white p-2 shadow-sm xl:block">
          <p className="px-3 py-3 text-xs font-bold uppercase tracking-[0.12em] text-muted-copy">Ten service checks</p>
          <ol className="space-y-1">{scenarios.map((item, index) => <li key={item.title}><button type="button" onClick={() => setSelectedIndex(index)} aria-current={selectedIndex === index ? 'step' : undefined} className={`flex w-full items-start gap-3 rounded-xl border px-3 py-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue ${selectedIndex === index ? 'border-brand-blue/30 bg-info-soft' : 'border-transparent hover:bg-slate-50'}`}><span className={`grid size-7 shrink-0 place-items-center rounded-lg text-xs font-bold ${selectedIndex === index ? 'bg-brand-blue text-white' : 'bg-slate-100 text-muted-copy'}`}>{String(index + 1).padStart(2, '0')}</span><span className="min-w-0"><span className="block text-sm font-semibold leading-5 text-ink">{item.title}</span><span className="mt-1 block text-xs leading-4 text-muted-copy">{item.handoff}</span></span></button></li>)}</ol>
        </nav>
        <article aria-live="polite" className="min-w-0 self-start overflow-hidden rounded-2xl border border-line bg-white shadow-sm">
          <div className="border-b border-line bg-slate-50 px-5 py-5 sm:px-7"><div className="flex flex-wrap items-center gap-2"><span className="rounded-full border border-line bg-white px-2.5 py-1 text-[0.7rem] font-bold uppercase tracking-wide text-muted-copy">Check {selectedIndex + 1} of {scenarios.length}</span><span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[0.7rem] font-semibold text-emerald-800">{selected.evidence}</span></div><h2 className="mt-4 text-2xl font-extrabold tracking-tight text-ink">{selected.title}</h2><p className="mt-1 text-sm text-muted-copy">{selected.handoff}</p></div>
          <div className="grid gap-8 px-5 py-6 sm:px-7 lg:grid-cols-[minmax(0,1fr)_minmax(15rem,0.75fr)]">
            <section><h3 className="text-xs font-bold uppercase tracking-[0.12em] text-muted-copy">Walkthrough</h3><ol className="mt-4 space-y-4">{selected.steps.map((step, index) => <li key={step} className="flex gap-3"><span className="grid size-7 shrink-0 place-items-center rounded-full border border-line text-xs font-bold text-brand-blue">{index + 1}</span><span className="pt-0.5 text-sm leading-6 text-copy">{step}</span></li>)}</ol></section>
            <div className="space-y-4"><section className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4"><h3 className="flex items-center gap-2 text-sm font-bold text-emerald-900"><Icon name="check" className="size-4" /> Expected record</h3><p className="mt-2 text-sm leading-6 text-copy">{selected.result}</p></section><section className="rounded-xl border border-amber-200 bg-amber-50/70 p-4"><h3 className="flex items-center gap-2 text-sm font-bold text-amber-900"><Icon name="info" className="size-4" /> Live check still needed</h3><p className="mt-2 text-sm leading-6 text-copy">{selected.remaining}</p></section></div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-line px-5 py-4 sm:px-7"><p className="max-w-xl text-xs leading-5 text-muted-copy">This guide shows reviewed evidence; it does not execute tests or certify the deployed service.</p>{destination && <a href={destination[0]} onClick={(event) => { event.preventDefault(); onNavigate(destination[0]) }} className="ga-btn-secondary inline-flex items-center gap-2">Open {destination[1]} <Icon name="arrowRight" className="size-4" /></a>}</div>
        </article>
      </div>
    </div>
  </DashboardShell>
}

export default ServiceReviewPage
