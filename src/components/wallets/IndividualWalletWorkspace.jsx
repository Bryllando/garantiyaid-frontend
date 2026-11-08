import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  createSimulatedTransfer,
  createSimulatedWallet,
  getAuthErrorMessage,
  isSessionExpiredError,
  requestWalletByBeneficiary,
  requestWalletTransactions,
} from '../../auth/staffAuth.js'
import { ConfirmationDialog } from '../ui/confirmation-dialog.jsx'
import { Icon } from '../ui/icon.jsx'
import { LoadingLabel } from '../ui/spinner.jsx'
import { useMotionEntry } from '../ui/use-motion-entry.js'

const money = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' })
const dateTime = new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Manila' })
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function fullName(beneficiary) {
  return [beneficiary?.firstName, beneficiary?.middleName, beneficiary?.lastName].filter(Boolean).join(' ')
}

function humanize(value) {
  return String(value ?? '').toLowerCase().replaceAll('_', ' ').replace(/^./, (letter) => letter.toUpperCase())
}

function signedAmount(transaction) {
  return ['SIMULATED_TRANSFER_OUT', 'BENEFIT_REVERSAL'].includes(transaction.transactionType) ? -Number(transaction.amount) : Number(transaction.amount)
}

function WalletHistory({ history, loadingReceiptId, onPage, onReceipt, showPagination = true }) {
  if (!history) return null
  if (history.transactions.length === 0) return <div className="border-t border-line px-5 py-10 text-center"><p className="font-extrabold text-ink">No wallet activity yet</p><p className="mt-2 text-sm text-muted-copy">Credits and internal simulated transfers will appear here.</p></div>

  return (
    <>
      <ul className="divide-y divide-line">
        {history.transactions.map((transaction) => {
          const amount = signedAmount(transaction)
          return (
            <li key={transaction.transactionId} className="grid gap-4 px-5 py-4 transition-colors hover:bg-slate-50 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2"><p className="font-bold text-ink">{humanize(transaction.transactionType)}</p><span className="rounded-full border border-emerald-200 bg-success-soft px-2 py-0.5 text-xs font-bold text-brand-green">{humanize(transaction.status)}</span></div>
                <p className="mt-1 truncate font-mono text-xs font-semibold text-muted-copy" title={transaction.referenceNo}>{transaction.referenceNo}</p>
                <p className="mt-1 text-xs text-muted-copy">{dateTime.format(new Date(transaction.createdAt))}{transaction.transferGroupId ? ` · Transfer ${transaction.transferGroupId.slice(0, 8)}` : ''}</p>
              </div>
              <div className="flex items-center justify-between gap-4 sm:justify-end">
                <p className={`text-base font-black tabular-nums ${amount < 0 ? 'text-brand-amber' : 'text-brand-green'}`}>{amount < 0 ? '−' : '+'}{money.format(Math.abs(amount))}</p>
                <button type="button" onClick={() => onReceipt(transaction)} disabled={loadingReceiptId === transaction.transactionId} className="min-h-10 cursor-pointer rounded-lg border border-line bg-white px-3 text-xs font-bold text-brand-blue hover:border-brand-blue hover:bg-info-soft disabled:cursor-not-allowed disabled:opacity-50">{loadingReceiptId === transaction.transactionId ? <LoadingLabel>Loading...</LoadingLabel> : 'Receipt'}</button>
              </div>
            </li>
          )
        })}
      </ul>
      {showPagination && <div className="flex items-center justify-between border-t border-line px-5 py-4"><p className="text-xs font-semibold text-muted-copy">Page {history.pagination.page} of {Math.max(history.pagination.totalPages, 1)}</p><div className="flex gap-2"><button type="button" disabled={history.pagination.page <= 1} onClick={() => onPage(history.pagination.page - 1)} className="min-h-10 cursor-pointer rounded-lg border border-line px-3 text-sm font-bold text-copy disabled:cursor-not-allowed disabled:opacity-50">Previous</button><button type="button" disabled={history.pagination.page >= history.pagination.totalPages} onClick={() => onPage(history.pagination.page + 1)} className="min-h-10 cursor-pointer rounded-lg border border-line px-3 text-sm font-bold text-copy disabled:cursor-not-allowed disabled:opacity-50">Next</button></div></div>}
    </>
  )
}

function TransferResult({ result, recipient, resultRef }) {
  if (!result) return null
  return (
    <section ref={resultRef} tabIndex={-1} className="mt-6 scroll-mt-36 overflow-hidden rounded-xl border border-emerald-200 bg-white shadow-sm focus:outline-2 focus:outline-brand-green" aria-labelledby="transfer-result-heading">
      <div className="flex items-start gap-3 bg-success-soft p-5"><span className="grid size-10 shrink-0 place-items-center rounded-full bg-white text-brand-green shadow-sm"><Icon name="check" /></span><div><p className="text-xs font-bold uppercase tracking-[0.1em] text-brand-green">Simulated transfer recorded</p><h3 id="transfer-result-heading" className="mt-1 text-lg font-extrabold text-ink">Matching debit and credit recorded</h3><p className="mt-1 text-sm text-copy">Transfer group <span className="break-all font-mono font-bold">{result.transferGroupId}</span></p></div></div>
      <div className="grid gap-px bg-emerald-200 sm:grid-cols-2">
        <div className="bg-white p-5"><p className="text-xs font-bold uppercase tracking-[0.08em] text-muted-copy">Sender debit</p><p className="mt-2 font-mono text-xs font-bold text-ink">{result.sourceTransaction.referenceNo}</p><p className="mt-3 text-xl font-black text-brand-amber">−{money.format(Number(result.sourceTransaction.amount))}</p></div>
        <div className="bg-white p-5"><p className="text-xs font-bold uppercase tracking-[0.08em] text-muted-copy">Recipient credit · {fullName(recipient)}</p><p className="mt-2 font-mono text-xs font-bold text-ink">{result.recipientTransaction.referenceNo}</p><p className="mt-3 text-xl font-black text-brand-green">+{money.format(Number(result.recipientTransaction.amount))}</p></div>
      </div>
    </section>
  )
}

export default function IndividualWalletWorkspace({ session, loadingReceiptId, onNavigate, onReceipt, onSessionExpired }) {
  const canTransfer = session.user.role === 'DSWD_STAFF'
  const [beneficiaryId, setBeneficiaryId] = useState(() => new URLSearchParams(window.location.search).get('beneficiary') || '')
  const linkedLookupRef = useRef(beneficiaryId)
  const [record, setRecord] = useState(null)
  const [history, setHistory] = useState(null)
  const [counterparty, setCounterparty] = useState(null)
  const [lastTransfer, setLastTransfer] = useState(null)
  const resultRef = useRef(null)
  const [form, setForm] = useState({ recipientBeneficiaryId: '', amount: '', description: '' })
  const [pendingTransfer, setPendingTransfer] = useState(null)
  const [transferAttempt, setTransferAttempt] = useState(null)
  const [transferError, setTransferError] = useState('')
  const [refreshError, setRefreshError] = useState('')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const detailRef = useMotionEntry(record ? `${record.beneficiary.beneficiaryId}:${record.wallet?.balance ?? 'none'}:${history?.pagination.page ?? 0}` : 'wallet-search')

  useEffect(() => {
    if (lastTransfer) resultRef.current?.focus()
  }, [lastTransfer])

  const reportError = useCallback((requestError, fallback) => {
    if (isSessionExpiredError(requestError)) return onSessionExpired()
    const message = getAuthErrorMessage(requestError) || fallback
    setError(message)
    toast.error(fallback, { description: message })
  }, [onSessionExpired])

  async function fetchHistory(walletId, page = 1) {
    setBusy('history')
    try {
      setHistory(await requestWalletTransactions(session.accessToken, walletId, { page, pageSize: 10 }))
      setError('')
    } catch (requestError) {
      reportError(requestError, 'Unable to load wallet history')
    } finally {
      setBusy('')
    }
  }

  const findWallet = useCallback(async (event, selectedBeneficiaryId = beneficiaryId) => {
    event?.preventDefault()
    if (transferAttempt) return
    const id = selectedBeneficiaryId.trim()
    if (!uuidPattern.test(id)) {
      setError('Enter a valid beneficiary ID in UUID format.')
      return
    }
    setBusy('lookup')
    setError('')
    setRecord(null)
    setHistory(null)
    setCounterparty(null)
    setLastTransfer(null)
    setRefreshError('')
    setTransferError('')
    try {
      const result = await requestWalletByBeneficiary(session.accessToken, id)
      setRecord(result)
      if (result.wallet) setHistory(await requestWalletTransactions(session.accessToken, result.wallet.walletId, { page: 1, pageSize: 10 }))
      const url = new URL(window.location.href)
      url.searchParams.set('beneficiary', id)
      window.history.replaceState(window.history.state, '', url)
      requestAnimationFrame(() => detailRef.current?.focus())
    } catch (requestError) {
      reportError(requestError, 'Unable to find beneficiary wallet')
    } finally {
      setBusy('')
    }
  }, [beneficiaryId, detailRef, reportError, session.accessToken, transferAttempt])

  useEffect(() => {
    const id = linkedLookupRef.current
    linkedLookupRef.current = ''
    if (id) void findWallet(null, id)
  }, [findWallet])

  async function addWallet() {
    setBusy('create')
    setError('')
    try {
      const result = await createSimulatedWallet(session.accessToken, record.beneficiary.beneficiaryId)
      const refreshed = await requestWalletByBeneficiary(session.accessToken, record.beneficiary.beneficiaryId)
      setRecord(refreshed)
      setHistory(await requestWalletTransactions(session.accessToken, result.wallet.walletId, { page: 1, pageSize: 10 }))
      toast.success(result.created ? 'Simulated wallet created' : 'Wallet already exists', { description: `${fullName(refreshed.beneficiary)} · ${result.wallet.walletId}` })
    } catch (requestError) {
      reportError(requestError, 'Unable to create simulated wallet')
    } finally {
      setBusy('')
    }
  }

  async function reviewTransfer(event) {
    event.preventDefault()
    if (transferAttempt || refreshError || busy) return
    const recipientBeneficiaryId = form.recipientBeneficiaryId.trim()
    const amount = Number(form.amount)
    if (!uuidPattern.test(recipientBeneficiaryId)) return setError('Enter a valid recipient beneficiary ID in UUID format.')
    if (recipientBeneficiaryId === record.beneficiary.beneficiaryId) return setError('Sender and recipient must be different beneficiaries.')
    if (!/^\d+(\.\d{1,2})?$/.test(form.amount) || amount <= 0) return setError('Enter a transfer amount greater than zero with up to two decimal places.')
    if (amount > Number(record.wallet.balance)) return setError('The sender wallet does not have enough simulated balance.')
    setBusy('recipient')
    setError('')
    setTransferError('')
    try {
      const recipient = await requestWalletByBeneficiary(session.accessToken, recipientBeneficiaryId)
      if (recipient.beneficiary.status !== 'ACTIVE') return setError('The recipient beneficiary is not active.')
      setPendingTransfer({
        recipient,
        amount,
        description: form.description.trim(),
        idempotencyKey: crypto.randomUUID(),
      })
    } catch (requestError) {
      reportError(requestError, 'Unable to verify transfer recipient')
    } finally {
      setBusy('')
    }
  }

  async function refreshTransfer(result) {
    setBusy('refresh')
    try {
      const [sourceRecord, sourceHistory, recipientRecord, recipientHistory] = await Promise.all([
        requestWalletByBeneficiary(session.accessToken, record.beneficiary.beneficiaryId),
        requestWalletTransactions(session.accessToken, result.sourceWallet.walletId, { page: 1, pageSize: 10 }),
        requestWalletByBeneficiary(session.accessToken, result.recipient.beneficiaryId),
        requestWalletTransactions(session.accessToken, result.recipientWallet.walletId, { page: 1, pageSize: 10 }),
      ])
      setRecord(sourceRecord)
      setHistory(sourceHistory)
      setCounterparty({ record: recipientRecord, history: recipientHistory })
      setRefreshError('')
    } catch (requestError) {
      if (isSessionExpiredError(requestError)) return onSessionExpired()
      setRefreshError(getAuthErrorMessage(requestError))
    } finally {
      setBusy('')
    }
  }

  async function confirmTransfer() {
    if (!pendingTransfer || busy) return
    const transfer = transferAttempt || pendingTransfer
    setTransferAttempt(transfer)
    setTransferError('')
    setBusy('transfer')
    let recorded
    try {
      const result = await createSimulatedTransfer(session.accessToken, record.wallet.walletId, {
        recipientBeneficiaryId: transfer.recipient.beneficiary.beneficiaryId,
        amount: transfer.amount,
        ...(transfer.description ? { description: transfer.description } : {}),
      }, transfer.idempotencyKey)
      recorded = { ...result, recipient: transfer.recipient.beneficiary }
      setLastTransfer(recorded)
      setRecord((current) => ({ ...current, wallet: result.sourceWallet }))
      setHistory(null)
      setCounterparty(null)
      setPendingTransfer(null)
      setTransferAttempt(null)
      setForm({ recipientBeneficiaryId: '', amount: '', description: '' })
      setError('')
      toast.success('Simulated transfer recorded', { description: money.format(transfer.amount) })
    } catch (requestError) {
      if (isSessionExpiredError(requestError)) return onSessionExpired()
      const uncertain = !requestError.status || requestError.status >= 500
      if (!uncertain) setTransferAttempt(null)
      setTransferError(uncertain
        ? 'The transfer result could not be confirmed. Retry this same request to check or complete it without recording a second transfer.'
        : getAuthErrorMessage(requestError))
    } finally {
      setBusy('')
    }
    if (recorded) await refreshTransfer(recorded)
  }

  return (
    <div className="mt-7">
      <section className="ga-card overflow-hidden" aria-labelledby="wallet-lookup-heading">
        <div className="flex items-start gap-4 border-b border-line p-5 sm:p-6"><span className="grid size-11 shrink-0 place-items-center rounded-lg bg-info-soft text-brand-blue"><Icon name="profile" /></span><div className="min-w-0"><h2 id="wallet-lookup-heading" className="text-xl font-extrabold text-ink">Find a beneficiary wallet</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-muted-copy">{canTransfer ? 'Review the balance and history before an authorized simulated transfer.' : 'Review the balance and history, or create an empty wallet for an active beneficiary.'}</p></div></div>
        <form onSubmit={findWallet} className="p-5 sm:p-6"><div className="max-w-4xl"><label htmlFor="wallet-beneficiary-id" className="ga-label">Beneficiary ID</label><div className="mt-2 flex flex-col gap-3 sm:flex-row"><div className="relative min-w-0 flex-1"><Icon name="search" className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted-copy" /><input id="wallet-beneficiary-id" disabled={Boolean(transferAttempt)} required autoComplete="off" spellCheck="false" value={beneficiaryId} onChange={(event) => setBeneficiaryId(event.target.value)} placeholder="Paste beneficiary ID" aria-describedby={`wallet-lookup-hint${error ? ' wallet-lookup-error' : ''}`} className="ga-input min-w-0 pl-11" /></div><button type="submit" disabled={Boolean(busy || transferAttempt)} className="ga-btn-primary shrink-0">{busy === 'lookup' ? <LoadingLabel>Finding wallet...</LoadingLabel> : <><Icon name="search" className="size-4" />Find wallet</>}</button></div><p id="wallet-lookup-hint" className="mt-2 text-sm leading-6 text-muted-copy">Paste the full ID shown on the beneficiary record.</p>{error && <p id="wallet-lookup-error" role="alert" className="mt-3 text-sm font-semibold text-brand-red">{error}</p>}</div></form>
        <div className="flex flex-col gap-3 border-t border-line bg-slate-50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6"><p className="text-sm leading-6 text-muted-copy">Don't have the ID? Open the beneficiary record, then choose <strong className="font-semibold text-copy">View simulated wallet</strong> under Other record services.</p><a href="/beneficiaries" aria-disabled={Boolean(busy || transferAttempt)} onClick={(event) => { event.preventDefault(); if (!busy && !transferAttempt) onNavigate('/beneficiaries') }} className="ga-btn-secondary shrink-0 aria-disabled:cursor-not-allowed aria-disabled:opacity-50"><Icon name="people" className="size-4" />Find beneficiary by name<Icon name="arrowRight" className="size-4" /></a></div>
      </section>

      {record && <div ref={detailRef} tabIndex={-1} aria-label="Selected wallet record" className="scroll-mt-36 outline-none focus-visible:outline-2 focus-visible:outline-brand-blue">
        <section className="ga-card mt-6 overflow-hidden" aria-labelledby="wallet-owner-heading">
          <div className="grid gap-px bg-line lg:grid-cols-[minmax(0,1.3fr)_repeat(2,minmax(12rem,0.55fr))]">
            <div className="bg-white p-5 sm:p-6"><p className="ga-eyebrow">Beneficiary</p><h2 id="wallet-owner-heading" className="mt-1 text-2xl font-extrabold text-ink">{fullName(record.beneficiary)}</h2><p className="mt-2 text-sm text-muted-copy">{record.beneficiary.barangay?.barangayName}, {record.beneficiary.barangay?.city}</p><p className="mt-3 break-all font-mono text-xs font-semibold text-muted-copy">{record.beneficiary.beneficiaryId}</p><a href={`/beneficiaries?beneficiary=${encodeURIComponent(record.beneficiary.beneficiaryId)}`} onClick={(event) => { event.preventDefault(); onNavigate(`/beneficiaries?beneficiary=${encodeURIComponent(record.beneficiary.beneficiaryId)}`) }} className="mt-4 inline-flex min-h-11 items-center text-sm font-bold text-brand-blue hover:underline">View beneficiary record <Icon name="arrowRight" className="ml-2 size-4" /></a></div>
            <div className="bg-white p-5 sm:p-6"><p className="text-xs font-bold uppercase tracking-[0.08em] text-muted-copy">Available balance</p><p className="mt-3 text-3xl font-black tabular-nums text-brand-green">{record.wallet ? money.format(Number(record.wallet.balance)) : 'No wallet'}</p><p className="mt-2 text-xs text-muted-copy">Simulated PHP ledger value</p></div>
            <div className="bg-white p-5 sm:p-6"><p className="text-xs font-bold uppercase tracking-[0.08em] text-muted-copy">Wallet status</p><span className={`mt-3 inline-flex rounded-full border px-3 py-1.5 text-sm font-bold ${record.wallet?.accountStatus === 'ACTIVE' ? 'border-emerald-200 bg-success-soft text-brand-green' : record.wallet ? 'border-amber-200 bg-warning-soft text-brand-amber' : 'border-line bg-slate-100 text-copy'}`}>{record.wallet ? humanize(record.wallet.accountStatus) : 'Not created'}</span><p className="mt-3 text-xs text-muted-copy">Beneficiary: {humanize(record.beneficiary.status)}</p>{record.wallet && <p className="mt-2 break-all font-mono text-[0.7rem] text-muted-copy">{record.wallet.walletId}</p>}</div>
          </div>
          {!record.wallet && <div className="flex flex-col gap-4 border-t border-line bg-slate-50 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6"><div><p className="font-extrabold text-ink">This beneficiary has no simulated wallet</p><p className="mt-1 text-sm text-muted-copy">{record.beneficiary.status === 'ACTIVE' ? 'Create an empty PHP ledger wallet before recording individual activity.' : 'Wallet creation is available only for an active beneficiary.'}</p></div><button type="button" onClick={addWallet} disabled={Boolean(busy) || record.beneficiary.status !== 'ACTIVE'} className="ga-btn-primary shrink-0"><Icon name="plus" className="size-4" />{busy === 'create' ? <LoadingLabel>Creating...</LoadingLabel> : 'Create simulated wallet'}</button></div>}
        </section>

        {record.wallet && <div className={`mt-6 grid items-start gap-6 ${canTransfer ? 'xl:grid-cols-[minmax(22rem,0.72fr)_minmax(0,1.28fr)]' : ''}`}>
          {canTransfer && <section className="ga-card p-5 sm:p-6" aria-labelledby="transfer-heading">
            <p className="ga-eyebrow">Internal movement</p><h2 id="transfer-heading" className="mt-1 text-xl font-extrabold text-ink">Record simulated transfer</h2><p className="mt-2 text-sm leading-6 text-muted-copy">The recipient is verified before a confirmation screen shows both parties and the exact amount.</p>
            {transferAttempt && !pendingTransfer && <div role="alert" className="mt-4 border-l-2 border-brand-amber bg-warning-soft p-4 text-sm leading-6"><p className="font-bold">Transfer result not confirmed</p><p>Check the previous request before starting another transfer.</p><button type="button" onClick={() => setPendingTransfer(transferAttempt)} className="ga-btn-secondary mt-3">Check transfer result</button></div>}
            <form onSubmit={reviewTransfer}><fieldset disabled={Boolean(busy || transferAttempt || refreshError)} className="mt-5 min-w-0 space-y-4">
              <div><label htmlFor="recipient-beneficiary-id" className="ga-label">Recipient beneficiary ID</label><input id="recipient-beneficiary-id" required autoComplete="off" spellCheck="false" value={form.recipientBeneficiaryId} onChange={(event) => setForm((current) => ({ ...current, recipientBeneficiaryId: event.target.value }))} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" className="ga-input mt-2 font-mono" /></div>
              <div><label htmlFor="transfer-amount" className="ga-label">Amount</label><div className="relative mt-2"><span className="pointer-events-none absolute inset-y-0 left-4 flex items-center font-bold text-muted-copy">₱</span><input id="transfer-amount" required inputMode="decimal" value={form.amount} onChange={(event) => setForm((current) => ({ ...current, amount: event.target.value }))} placeholder="0.00" className="ga-input pl-9 tabular-nums" /></div><p className="mt-2 text-xs text-muted-copy">Available: {money.format(Number(record.wallet.balance))}</p></div>
              <div><label htmlFor="transfer-description" className="ga-label">Ledger note <span className="font-normal text-muted-copy">(optional)</span></label><textarea id="transfer-description" maxLength="255" rows="3" value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} placeholder="Purpose of this demonstration transfer" className="ga-input mt-2 min-h-24 resize-y py-3" /></div>
              <button type="submit" disabled={Boolean(busy) || record.wallet.accountStatus !== 'ACTIVE'} className="ga-btn-primary w-full">{busy === 'recipient' ? <LoadingLabel>Verifying recipient...</LoadingLabel> : 'Review simulated transfer'}</button>
            </fieldset></form>
          </section>}

          <section className="ga-card overflow-hidden" aria-labelledby="wallet-history-heading"><div className="flex flex-wrap items-center justify-between gap-3 p-5 sm:p-6"><div><p className="ga-eyebrow">Account activity</p><h2 id="wallet-history-heading" className="mt-1 text-xl font-extrabold text-ink">Wallet history</h2></div><button type="button" onClick={() => fetchHistory(record.wallet.walletId, history?.pagination.page ?? 1)} disabled={Boolean(busy)} className="ga-btn-secondary min-h-10 px-3 text-sm">{busy === 'history' ? <LoadingLabel>Refreshing...</LoadingLabel> : 'Refresh'}</button></div><WalletHistory history={history} loadingReceiptId={loadingReceiptId} onPage={(page) => fetchHistory(record.wallet.walletId, page)} onReceipt={onReceipt} /></section>
        </div>}

        <TransferResult result={lastTransfer} recipient={lastTransfer?.recipient} resultRef={resultRef} />
        {refreshError && <section role="alert" className="ga-card mt-4 border-l-2 border-brand-amber p-5"><h3 className="font-bold">Transfer recorded; wallet details could not be refreshed</h3><p className="mt-2 text-sm leading-6">{refreshError} Refresh the balances and histories before starting another transfer.</p><button type="button" onClick={() => refreshTransfer(lastTransfer)} disabled={Boolean(busy)} className="ga-btn-secondary mt-3">{busy === 'refresh' ? <LoadingLabel>Refreshing balances...</LoadingLabel> : 'Refresh balances'}</button></section>}
        {counterparty && <section className="ga-card mt-6 overflow-hidden" aria-labelledby="recipient-history-heading"><div className="border-b border-line p-5 sm:p-6"><p className="ga-eyebrow">Recipient ledger refreshed</p><h2 id="recipient-history-heading" className="mt-1 text-xl font-extrabold text-ink">{fullName(counterparty.record.beneficiary)}</h2><p className="mt-2 text-sm text-muted-copy">Balance {money.format(Number(counterparty.record.wallet.balance))} · showing the latest records</p></div><WalletHistory history={counterparty.history} loadingReceiptId={loadingReceiptId} onReceipt={onReceipt} showPagination={false} /></section>}
      </div>}

      <ConfirmationDialog
        open={Boolean(pendingTransfer)}
        title="Confirm simulated transfer"
        description={pendingTransfer ? `Sender: ${fullName(record.beneficiary)}. Recipient: ${fullName(pendingTransfer.recipient.beneficiary)}. Amount: ${money.format(pendingTransfer.amount)}. ${pendingTransfer.recipient.wallet ? '' : 'An empty recipient wallet will be created automatically. '}This records paired internal ledger entries; no real funds move.` : ''}
        actionLabel="Complete simulated transfer"
        error={transferError}
        onCancel={() => setPendingTransfer(null)}
        onConfirm={confirmTransfer}
      />
    </div>
  )
}
