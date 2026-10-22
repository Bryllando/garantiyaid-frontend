const destinations = [
  ['/beneficiaries', 'Beneficiary records'],
  ['/enrollments', 'Enrollment review'],
  ['/biometrics', 'Biometric records'],
]

function BeneficiaryWorkflowNav({ currentPath, onNavigate }) {
  return <nav aria-label="Beneficiary services" className="ga-beneficiary-nav mt-4 flex flex-wrap gap-x-5 border-b border-line">
    {destinations.map(([href, label]) => <a key={href} href={href} aria-current={currentPath === href ? 'page' : undefined} onClick={(event) => { if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return; event.preventDefault(); onNavigate(href) }} className={`inline-flex min-h-11 items-center border-b-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-brand-blue ${currentPath === href ? 'border-brand-blue text-brand-blue' : 'border-transparent text-copy hover:border-slate-400'}`}>{label}</a>)}
  </nav>
}

export default BeneficiaryWorkflowNav
