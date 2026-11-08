import { useEffect, useState } from 'react'
import { getAuthErrorMessage, isSessionExpiredError, requestBeneficiary, requestDistributionClaim } from '../../auth/staffAuth.js'
import { reconciliationIssue } from '../../utils/eventOperations.js'
import { LoadingLabel } from '../ui/spinner.jsx'
import { Skeleton } from '../ui/skeleton.jsx'

const money = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' })
const formatMoney = (value) => money.format(Number(value ?? 0))

function ReconciliationIssue({ exception, distributionId, token, onNavigate, onSessionExpired }) {
  const [details, setDetails] = useState(null)
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    let active = true
    const request = exception.claimId
      ? requestDistributionClaim(token, distributionId, exception.claimId)
      : exception.beneficiaryId ? requestBeneficiary(token, exception.beneficiaryId).then((beneficiary) => ({ beneficiary })) : Promise.resolve(null)
    request.then((record) => { if (active) setDetails({ source: exception, record }) })
      .catch((issue) => { if (active) { if (isSessionExpiredError(issue)) return onSessionExpired(); setDetails({ source: exception, error: getAuthErrorMessage(issue) }) } })
    return () => { active = false }
  }, [distributionId, exception, onSessionExpired, retry, token])
  const loading = details?.source !== exception
  const record = loading ? null : details.record
  const error = loading ? '' : details.error
  const guidance = reconciliationIssue(exception, record, distributionId)
  const name = [record?.beneficiary?.firstName, record?.beneficiary?.middleName, record?.beneficiary?.lastName].filter(Boolean).join(' ')
  return <li className="min-w-0 px-4 py-4 text-sm sm:px-5">
    <p className="font-semibold text-ink">{guidance.title}</p>
    {loading ? <p role="status" className="mt-2 text-muted-copy"><LoadingLabel>Loading beneficiary...</LoadingLabel></p> : name ? <p className="mt-1 text-copy"><span>{name}</span>{record.schedule?.queueNumber != null && <span className="text-muted-copy"> · Queue {record.schedule.queueNumber}</span>}</p> : <p className="mt-1 text-muted-copy">Beneficiary details unavailable</p>}
    {error && <div role="alert" className="mt-2 text-sm text-brand-amber"><p>{error}</p><button type="button" onClick={() => { setDetails(null); setRetry((value) => value + 1) }} className="ga-admin-link">Retry beneficiary details</button></div>}
    <dl className="mt-3 grid gap-1 sm:grid-cols-[7rem_1fr]"><dt className="text-muted-copy">Responsible</dt><dd className="font-medium text-ink">{guidance.owner}</dd><dt className="mt-1 text-muted-copy sm:mt-0">Next step</dt><dd className="leading-6 text-copy">{loading || error ? 'Open the affected record to confirm its current status and any active dispute.' : guidance.next}</dd></dl>
    {exception.code === 'WALLET_LEDGER_BALANCE_MISMATCH' && <p className="mt-2 text-copy">Stored balance {formatMoney(exception.storedBalance)} · Ledger {formatMoney(exception.calculatedBalance)}</p>}
    <a href={guidance.href} onClick={(event) => { event.preventDefault(); onNavigate(guidance.href) }} className="ga-admin-link mt-2">{guidance.action}</a>
  </li>
}

export default function ReconciliationPanel({ reconciliation, distributionId, token, onNavigate, onSessionExpired }) {
  const [page, setPage] = useState(1)
  if (!reconciliation) return <Skeleton className="h-80 rounded-xl" />
  const exceptions = reconciliation.exceptions
  const pages = Math.max(1, Math.ceil(exceptions.length / 5))
  const currentPage = Math.min(page, pages)
  const state = reconciliation.readyToClose ? 'Reconciled' : reconciliation.ledgerBalanced ? 'Action required' : 'Mismatch detected'
  const physical = reconciliation.deliveryMode === 'PHYSICAL_GOODS'
  const packageTotals = reconciliation.physicalPackage
  const totals = physical ? [
    ['Recorded handovers', packageTotals?.handoverCount ?? 'Not recorded'],
    ['Value of completed claims', formatMoney(reconciliation.physicalReleasedAmount)],
    ...(packageTotals ? [['Allocated package units', packageTotals.allocatedQuantity ?? 'Not recorded'], ['Recorded handover units', `${packageTotals.recordedQuantity} ${packageTotals.unit ?? 'known units'}`], ['Units on voided claims', packageTotals.voidedClaimQuantity], ['Handovers without quantity', packageTotals.quantityNotRecordedCount]] : []),
  ] : [
    ['Expected wallet credit', formatMoney(reconciliation.expectedWalletCreditedAmount ?? reconciliation.expectedClaimedAmount)],
    ['Net credited', formatMoney(reconciliation.netCreditedAmount)],
    ['Completed credits', reconciliation.completedBenefitCreditCount],
    ['Reversed credits', reconciliation.reversedBenefitCreditCount],
  ]
  return <section id="event-reconciliation" className="overflow-hidden rounded-lg border border-line bg-white" aria-labelledby="reconciliation-heading">
    <header className="border-b border-line p-4 sm:p-5"><div className="flex flex-wrap items-start justify-between gap-3"><h2 id="reconciliation-heading" className="font-semibold text-ink">Distribution reconciliation</h2><span className={`rounded-md px-2 py-1 text-xs font-semibold ${reconciliation.readyToClose ? 'bg-success-soft text-brand-green' : 'bg-warning-soft text-brand-amber'}`}>{state}</span></div><p className="mt-2 text-sm leading-6 text-copy">{physical ? 'Compare recorded handovers with the signed release log, including package quantities.' : 'Compare claim records with completed credits and reversals in the simulated ledger.'}</p></header>
    <dl className="grid grid-cols-2 gap-px bg-line">{totals.map(([label, value]) => <div key={label} className="min-w-0 bg-white p-4"><dt className="text-xs leading-5 text-muted-copy">{label}</dt><dd className="mt-1 break-words text-lg font-semibold tabular-nums text-ink">{value ?? 'Unavailable'}</dd></div>)}</dl>
    <div className="border-t border-line"><h3 className="px-4 pt-4 text-sm font-semibold sm:px-5">Items requiring review ({exceptions.length})</h3>{exceptions.length === 0 ? <p className="p-4 text-sm leading-6 text-copy sm:px-5">No reconciliation exceptions were found. Check missed visits and outstanding beneficiary concerns before preparing the event report.</p> : <><ul className="mt-2 divide-y divide-line">{exceptions.slice((currentPage - 1) * 5, currentPage * 5).map((exception, index) => <ReconciliationIssue key={`${distributionId}:${exception.code}:${exception.claimId || exception.walletId || index}`} exception={exception} distributionId={distributionId} token={token} onNavigate={onNavigate} onSessionExpired={onSessionExpired} />)}</ul>{pages > 1 && <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3 text-sm"><span>Page {currentPage} of {pages}</span><div className="flex gap-2"><button type="button" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)} className="ga-btn-secondary">Previous issues</button><button type="button" disabled={currentPage >= pages} onClick={() => setPage(currentPage + 1)} className="ga-btn-secondary">Next issues</button></div></div>}</>}</div>
    <p className="border-t border-line bg-slate-50 px-4 py-3 text-sm leading-6 text-muted-copy">{physical ? 'Compare actual goods and the signed release log before closing. Recorded handovers and quantities include voided claims; voiding does not record a return of goods. Completed claim value excludes voided claims.' : 'Reconciliation checks recorded claims and transactions. It does not resolve disputes or close the event.'}</p>
  </section>
}
