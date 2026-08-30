import { useEffect, useRef, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { Icon } from '../ui/icon.jsx'
import { LoadingLabel } from '../ui/spinner.jsx'

const money = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' })
const dateTime = new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Manila' })
const dateOnly = new Intl.DateTimeFormat('en-PH', { dateStyle: 'long', timeZone: 'Asia/Manila' })

function humanize(value = '') {
  return value.toLowerCase().replaceAll('_', ' ').replace(/^./, (letter) => letter.toUpperCase())
}

function ReceiptField({ label, value, mono = false }) {
  return <div><dt className="text-xs font-bold uppercase tracking-[0.08em] text-muted-copy">{label}</dt><dd className={`mt-1 font-bold text-ink ${mono ? '[overflow-wrap:anywhere] font-mono text-xs' : ''}`}>{value || 'Not recorded'}</dd></div>
}

export default function ClaimReceiptDialog({ receipt, onClose, onDispute, onPrint }) {
  const dialogRef = useRef(null)
  const [isPrinting, setIsPrinting] = useState(false)
  const [error, setError] = useState('')
  const snapshot = receipt.snapshot
  const evidence = snapshot.verificationEvidence
  const qrValue = `${window.location.origin}/claim-accountability?distribution=${snapshot.distribution.distributionId}&claim=${snapshot.claim.claimId}&receipt=${encodeURIComponent(receipt.receiptNo)}&hash=${receipt.evidenceHash}`

  useEffect(() => { dialogRef.current?.showModal() }, [])

  async function printReceipt() {
    setError('')
    setIsPrinting(true)
    try {
      await onPrint()
      window.print()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setIsPrinting(false)
    }
  }

  return (
    <dialog ref={dialogRef} onCancel={(event) => { event.preventDefault(); dialogRef.current?.close() }} onClose={onClose} aria-labelledby="claim-receipt-title" className="m-auto max-h-[calc(100dvh-1rem)] w-[min(58rem,calc(100%-1rem))] overflow-y-auto rounded-2xl border border-line bg-white p-0 text-ink shadow-lg backdrop:bg-slate-950/60 backdrop:backdrop-blur-[3px] sm:max-h-[calc(100dvh-2rem)] sm:w-[min(58rem,calc(100%-2rem))]">
      <article data-claim-receipt-print className="bg-white">
        <header className="flex items-start justify-between gap-5 border-b border-white/10 bg-brand-navy p-5 text-white sm:p-7">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-blue-200"><span>GarantiyAid</span><span aria-hidden="true">•</span><span>{receipt.receiptVersion}</span></div>
            <h2 id="claim-receipt-title" className="mt-2 text-2xl font-extrabold sm:text-3xl">Claim acknowledgment receipt</h2>
            <p className="mt-2 text-sm leading-6 text-slate-300">Official system record issued {dateTime.format(new Date(receipt.issuedAt))}</p>
          </div>
          <button type="button" onClick={() => dialogRef.current?.close()} aria-label="Close claim receipt" className="grid size-11 shrink-0 place-items-center rounded-lg border border-white/20 text-white hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"><Icon name="close" /></button>
        </header>

        <div className="p-5 sm:p-7">
          <section className="grid gap-5 border-b border-line pb-6 md:grid-cols-[1fr_auto] md:items-end">
            <div><p className="text-xs font-bold uppercase tracking-[0.08em] text-muted-copy">Receipt number</p><p className="mt-1 [overflow-wrap:anywhere] font-mono text-base font-black text-brand-navy">{receipt.receiptNo}</p><p className="mt-3 text-sm leading-6 text-copy">This receipt preserves the claim status and verification evidence recorded when it was first issued.</p></div>
            <div className="md:text-right"><p className="text-xs font-bold uppercase tracking-[0.08em] text-muted-copy">Assistance amount</p><p className="mt-1 text-3xl font-black tabular-nums text-brand-green">{money.format(Number(snapshot.assistance.amount))}</p><span className={`mt-2 inline-flex rounded-full border px-3 py-1 text-xs font-bold ${receipt.currentClaimStatus === 'VOIDED' ? 'border-red-200 bg-danger-soft text-brand-red' : 'border-emerald-200 bg-success-soft text-brand-green'}`}>Current status: {humanize(receipt.currentClaimStatus)}</span></div>
          </section>

          <section className="mt-6" aria-labelledby="receipt-beneficiary-heading">
            <h3 id="receipt-beneficiary-heading" className="text-lg font-extrabold text-ink">Beneficiary and assistance</h3>
            <dl className="mt-4 grid gap-x-8 gap-y-5 text-sm sm:grid-cols-2 lg:grid-cols-3">
              <ReceiptField label="Beneficiary" value={snapshot.beneficiary.fullName} />
              <ReceiptField label="Beneficiary ID" value={snapshot.beneficiary.beneficiaryId} mono />
              <ReceiptField label="Service area" value={[snapshot.beneficiary.sitioPurok, snapshot.beneficiary.barangayName].filter(Boolean).join(', ')} />
              <ReceiptField label="Program" value={`${snapshot.distribution.programCode} — ${snapshot.distribution.programName}`} />
              <ReceiptField label="Distribution" value={snapshot.distribution.title} />
              <ReceiptField label="Distribution date" value={dateOnly.format(new Date(snapshot.distribution.distributionDate))} />
              <ReceiptField label="Venue" value={snapshot.distribution.location} />
              <ReceiptField label="Queue / session" value={`#${snapshot.service.queueNumber} · ${snapshot.service.sessionLabel}`} />
              <ReceiptField label="Recorded claim status" value={humanize(snapshot.claim.claimStatus)} />
            </dl>
          </section>

          <section className="mt-7 rounded-xl border border-line bg-slate-50 p-5" aria-labelledby="receipt-evidence-heading">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 flex-1">
                <p className="ga-eyebrow">Evidence chain</p>
                <h3 id="receipt-evidence-heading" className="mt-1 text-lg font-extrabold text-ink">Recorded verification controls</h3>
                <ul className="mt-4 space-y-3 text-sm text-copy">
                  <li className="flex gap-3"><span aria-hidden="true" className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-success-soft text-brand-green"><Icon name="check" className="size-3" strokeWidth={2.5} /></span><span><strong className="text-ink">Identity method:</strong> {humanize(snapshot.claim.verificationMethod)}</span></li>
                  <li className="flex gap-3"><span aria-hidden="true" className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-success-soft text-brand-green"><Icon name="check" className="size-3" strokeWidth={2.5} /></span><span><strong className="text-ink">Facial match:</strong> {evidence.biometric ? `${Number(evidence.biometric.matchScore) * 100}% match · ${Number(evidence.biometric.livenessScore) * 100}% liveness` : 'Not required or not recorded'}</span></li>
                  <li className="flex gap-3"><span aria-hidden="true" className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-success-soft text-brand-green"><Icon name="check" className="size-3" strokeWidth={2.5} /></span><span><strong className="text-ink">Digital signature:</strong> {evidence.signature ? `${evidence.signature.method} · ${evidence.signature.pointCount ?? 0} captured points` : 'Not required or not recorded'}</span></li>
                  <li className="flex gap-3"><span aria-hidden="true" className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-success-soft text-brand-green"><Icon name="check" className="size-3" strokeWidth={2.5} /></span><span><strong className="text-ink">Ledger record:</strong> {evidence.transaction?.referenceNo ?? 'No benefit-credit reference at issuance'}</span></li>
                </ul>
              </div>
              <div className="mx-auto shrink-0 rounded-xl border border-line bg-white p-3 text-center sm:mx-0"><QRCodeSVG value={qrValue} size={132} level="M" marginSize={1} /><p className="mt-2 text-[0.68rem] font-bold uppercase tracking-[0.08em] text-muted-copy">Verify record</p></div>
            </div>
            <dl className="mt-5 grid gap-4 border-t border-line pt-5 text-sm sm:grid-cols-2">
              <ReceiptField label="Evidence hash" value={receipt.evidenceHash} mono />
              <ReceiptField label="Signature hash" value={evidence.signature?.imageSha256} mono />
              <ReceiptField label="Verified by" value={evidence.verifiedBy ? `${evidence.verifiedBy.fullName} (${evidence.verifiedBy.employeeId})` : null} />
              <ReceiptField label="Processed by" value={evidence.transaction?.processedBy ? `${evidence.transaction.processedBy.fullName} (${evidence.transaction.processedBy.employeeId})` : null} />
            </dl>
          </section>

          <p className="mt-5 rounded-lg border border-amber-200 bg-warning-soft p-4 text-sm leading-6 text-copy"><strong className="text-ink">Important:</strong> Keep this receipt. If any detail is incorrect or the beneficiary denies the claim, file a dispute using this receipt number. The original record remains preserved while an independent reviewer investigates.</p>
          <p className="mt-4 text-xs leading-5 text-muted-copy">Prototype accountability record. It does not connect to a government disbursement or banking rail.</p>

          {error && <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-danger-soft p-3 text-sm font-semibold text-brand-red">{error}</p>}
          <footer data-claim-receipt-actions className="mt-6 flex flex-col-reverse gap-3 border-t border-line pt-5 sm:flex-row sm:justify-end">
            <button type="button" onClick={onDispute} disabled={isPrinting} className="ga-btn-secondary">Report a dispute</button>
            <button type="button" onClick={printReceipt} disabled={isPrinting} className="ga-btn-primary"><Icon name="printer" className="size-4" />{isPrinting ? <LoadingLabel>Preparing print...</LoadingLabel> : 'Print receipt'}</button>
          </footer>
        </div>
      </article>
    </dialog>
  )
}
