import { useState } from 'react'
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

function TransferResult({ result, recipient }) {
  if (!result) return null
  return (
    <section className="mt-6 overflow-hidden rounded-xl border border-emerald-200 bg-white shadow-sm" aria-labelledby="transfer-result-heading">
      <div className="flex items-start gap-3 bg-success-soft p-5"><span className="grid size-10 shrink-0 place-items-center rounded-full bg-white text-brand-green shadow-sm"><Icon name="check" /></span><div><p className="text-xs font-bold uppercase tracking-[0.1em] text-brand-green">Both wallet histories refreshed</p><h3 id="transfer-result-heading" className="mt-1 text-lg font-extrabold text-ink">Matching debit and credit recorded</h3><p className="mt-1 text-sm text-copy">Transfer group <span className="font-mono font-bold">{result.transferGroupId}</span></p></div></div>
      <div className="grid gap-px bg-emerald-200 sm:grid-cols-2">
        <div className="bg-white p-5"><p className="text-xs font-bold uppercase tracking-[0.08em] text-muted-copy">Sender debit</p><p className="mt-2 font-mono text-xs font-bold text-ink">{result.sourceTransaction.referenceNo}</p><p className="mt-3 text-xl font-black text-brand-amber">−{money.format(Number(result.sourceTransaction.amount))}</p></div>
        <div className="bg-white p-5"><p className="text-xs font-bold uppercase tracking-[0.08em] text-muted-copy">Recipient credit · {fullName(recipient)}</p><p className="mt-2 font-mono text-xs font-bold text-ink">{result.recipientTransaction.referenceNo}</p><p className="mt-3 text-xl font-black text-brand-green">+{money.format(Number(result.recipientTransaction.amount))}</p></div>
      </div>
    </section>
  )
}

export default function IndividualWalletWorkspace({ session, loadingReceiptId, onReceipt, onSessionExpired }) {
  const [beneficiaryId, setBeneficiaryId] = useState('')
  const [record, setRecord] = useState(null)
  const [history, setHistory] = useState(null)
  const [counterparty, setCounterparty] = useState(null)
  const [lastTransfer, setLastTransfer] = useState(null)
  const [form, setForm] = useState({ recipientBeneficiaryId: '', amount: '', description: '' })
  const [pendingTransfer, setPendingTransfer] = useState(null)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const detailRef = useMotionEntry(record ? `${record.beneficiary.beneficiaryId}:${record.wallet?.balance ?? 'none'}:${history?.pagination.page ?? 0}` : 'wallet-search')

  function reportError(requestError, fallback) {
    if (isSessionExpiredError(requestError)) return onSessionExpired()
    const message = getAuthErrorMessage(requestError) || fallback
    setError(message)
    toast.error(fallback, { description: message })
  }

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

  async function findWallet(event) {
    event?.preventDefault()
    const id = beneficiaryId.trim()
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
    try {
      const result = await requestWalletByBeneficiary(session.accessToken, id)
      setRecord(result)
      if (result.wallet) setHistory(await requestWalletTransactions(session.accessToken, result.wallet.walletId, { page: 1, pageSize: 10 }))
    } catch (requestError) {
      reportError(requestError, 'Unable to find beneficiary wallet')
    } finally {
      setBusy('')
    }
  }

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
    const recipientBeneficiaryId = form.recipientBeneficiaryId.trim()
    const amount = Number(form.amount)
    if (!uuidPattern.test(recipientBeneficiaryId)) return setError('Enter a valid recipient beneficiary ID in UUID format.')
    if (recipientBeneficiaryId === record.beneficiary.beneficiaryId) return setError('Sender and recipient must be different beneficiaries.')
    if (!/^\d+(\.\d{1,2})?$/.test(form.amount) || amount <= 0) return setError('Enter a transfer amount greater than zero with up to two decimal places.')
    if (amount > Number(record.wallet.balance)) return setError('The sender wallet does not have enough simulated balance.')
    setBusy('recipient')
    setError('')
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

  async function confirmTransfer() {
    const transfer = pendingTransfer
    setBusy('transfer')
    try {
      const result = await createSimulatedTransfer(session.accessToken, record.wallet.walletId, {
        recipientBeneficiaryId: transfer.recipient.beneficiary.beneficiaryId,
        amount: transfer.amount,
        ...(transfer.description ? { description: transfer.description } : {}),
      }, transfer.idempotencyKey)
      const [sourceRecord, sourceHistory, recipientRecord, recipientHistory] = await Promise.all([
        requestWalletByBeneficiary(session.accessToken, record.beneficiary.beneficiaryId),
        requestWalletTransactions(session.accessToken, result.sourceWallet.walletId, { page: 1, pageSize: 10 }),
        requestWalletByBeneficiary(session.accessToken, transfer.recipient.beneficiary.beneficiaryId),
        requestWalletTransactions(session.accessToken, result.recipientWallet.walletId, { page: 1, pageSize: 10 }),
      ])
      setRecord(sourceRecord)
      setHistory(sourceHistory)
      setCounterparty({ record: recipientRecord, history: recipientHistory })
      setLastTransfer(result)
      setPendingTransfer(null)
      setForm({ recipientBeneficiaryId: '', amount: '', description: '' })
      setError('')
      toast.success('Simulated transfer completed', { description: `${money.format(transfer.amount)} · Both wallet histories refreshed` })
    } catch (requestError) {
      reportError(requestError, 'Unable to complete simulated transfer')
      throw requestError
    } finally {
      setBusy('')
    }
  }

  return (
    <div className="mt-7">
      <section className="overflow-hidden rounded-xl border border-blue-200 bg-brand-navy text-white shadow-sm">
        <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center sm:p-6"><div><p className="text-xs font-bold uppercase tracking-[0.14em] text-blue-200">Closed-loop recordkeeping</p><h2 className="mt-2 text-2xl font-extrabold">Individual simulated wallet</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">Locate a beneficiary, review the ledger balance and history, then record an internal demonstration transfer. No cash, bank, e-wallet, or government payment rail is connected.</p></div><span className="w-fit rounded-full border border-white/15 bg-white/10 px-3 py-2 text-xs font-bold text-emerald-300">Real funds moved: No</span></div>
        <form onSubmit={findWallet} className="border-t border-white/10 bg-white/[0.06] p-5 sm:p-6"><label htmlFor="wallet-beneficiary-id" className="text-sm font-bold text-white">Beneficiary ID</label><div className="mt-2 flex flex-col gap-3 sm:flex-row"><input id="wallet-beneficiary-id" required autoComplete="off" spellCheck="false" value={beneficiaryId} onChange={(event) => setBeneficiaryId(event.target.value)} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" className="ga-input font-mono" /><button type="submit" disabled={Boolean(busy)} className="ga-btn-primary shrink-0 border border-blue-400 bg-blue-600 hover:bg-blue-500">{busy === 'lookup' ? <LoadingLabel>Finding wallet...</LoadingLabel> : 'Find wallet'}</button></div></form>
      </section>

      {error && <div role="alert" className="mt-4 rounded-xl border border-amber-200 bg-warning-soft p-4 text-sm font-semibold text-copy">{error}</div>}

      {record && <div ref={detailRef}>
        <section className="ga-card mt-6 overflow-hidden" aria-labelledby="wallet-owner-heading">
          <div className="grid gap-px bg-line lg:grid-cols-[minmax(0,1.3fr)_repeat(2,minmax(12rem,0.55fr))]">
            <div className="bg-white p-5 sm:p-6"><p className="ga-eyebrow">Beneficiary</p><h2 id="wallet-owner-heading" className="mt-1 text-2xl font-extrabold text-ink">{fullName(record.beneficiary)}</h2><p className="mt-2 text-sm text-muted-copy">{record.beneficiary.barangay?.barangayName}, {record.beneficiary.barangay?.city}</p><p className="mt-3 break-all font-mono text-xs font-semibold text-muted-copy">{record.beneficiary.beneficiaryId}</p></div>
            <div className="bg-white p-5 sm:p-6"><p className="text-xs font-bold uppercase tracking-[0.08em] text-muted-copy">Available balance</p><p className="mt-3 text-3xl font-black tabular-nums text-brand-green">{record.wallet ? money.format(Number(record.wallet.balance)) : 'No wallet'}</p><p className="mt-2 text-xs text-muted-copy">Simulated PHP ledger value</p></div>
            <div className="bg-white p-5 sm:p-6"><p className="text-xs font-bold uppercase tracking-[0.08em] text-muted-copy">Wallet status</p><span className={`mt-3 inline-flex rounded-full border px-3 py-1.5 text-sm font-bold ${record.wallet?.accountStatus === 'ACTIVE' ? 'border-emerald-200 bg-success-soft text-brand-green' : record.wallet ? 'border-amber-200 bg-warning-soft text-brand-amber' : 'border-line bg-slate-100 text-copy'}`}>{record.wallet ? humanize(record.wallet.accountStatus) : 'Not created'}</span><p className="mt-3 text-xs text-muted-copy">Beneficiary: {humanize(record.beneficiary.status)}</p>{record.wallet && <p className="mt-2 break-all font-mono text-[0.7rem] text-muted-copy">{record.wallet.walletId}</p>}</div>
          </div>
          {!record.wallet && <div className="flex flex-col gap-4 border-t border-line bg-slate-50 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6"><div><p className="font-extrabold text-ink">This beneficiary has no simulated wallet</p><p className="mt-1 text-sm text-muted-copy">{record.beneficiary.status === 'ACTIVE' ? 'Create an empty PHP ledger wallet before recording individual activity.' : 'Wallet creation is available only for an active beneficiary.'}</p></div><button type="button" onClick={addWallet} disabled={Boolean(busy) || record.beneficiary.status !== 'ACTIVE'} className="ga-btn-primary shrink-0"><Icon name="plus" className="size-4" />{busy === 'create' ? <LoadingLabel>Creating...</LoadingLabel> : 'Create simulated wallet'}</button></div>}
        </section>

        {record.wallet && <div className="mt-6 grid items-start gap-6 xl:grid-cols-[minmax(22rem,0.72fr)_minmax(0,1.28fr)]">
          <section className="ga-card p-5 sm:p-6" aria-labelledby="transfer-heading">
            <p className="ga-eyebrow">Internal movement</p><h2 id="transfer-heading" className="mt-1 text-xl font-extrabold text-ink">Record simulated transfer</h2><p className="mt-2 text-sm leading-6 text-muted-copy">The recipient is verified before a confirmation screen shows both parties and the exact amount.</p>
            <form onSubmit={reviewTransfer} className="mt-5 space-y-4">
              <div><label htmlFor="recipient-beneficiary-id" className="ga-label">Recipient beneficiary ID</label><input id="recipient-beneficiary-id" required autoComplete="off" spellCheck="false" value={form.recipientBeneficiaryId} onChange={(event) => setForm((current) => ({ ...current, recipientBeneficiaryId: event.target.value }))} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" className="ga-input mt-2 font-mono" /></div>
              <div><label htmlFor="transfer-amount" className="ga-label">Amount</label><div className="relative mt-2"><span className="pointer-events-none absolute inset-y-0 left-4 flex items-center font-bold text-muted-copy">₱</span><input id="transfer-amount" required inputMode="decimal" value={form.amount} onChange={(event) => setForm((current) => ({ ...current, amount: event.target.value }))} placeholder="0.00" className="ga-input pl-9 tabular-nums" /></div><p className="mt-2 text-xs text-muted-copy">Available: {money.format(Number(record.wallet.balance))}</p></div>
              <div><label htmlFor="transfer-description" className="ga-label">Ledger note <span className="font-normal text-muted-copy">(optional)</span></label><textarea id="transfer-description" maxLength="255" rows="3" value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} placeholder="Purpose of this demonstration transfer" className="ga-input mt-2 min-h-24 resize-y py-3" /></div>
              <button type="submit" disabled={Boolean(busy) || record.wallet.accountStatus !== 'ACTIVE'} className="ga-btn-primary w-full">{busy === 'recipient' ? <LoadingLabel>Verifying recipient...</LoadingLabel> : 'Review simulated transfer'}</button>
            </form>
          </section>

          <section className="ga-card overflow-hidden" aria-labelledby="wallet-history-heading"><div className="flex flex-wrap items-center justify-between gap-3 p-5 sm:p-6"><div><p className="ga-eyebrow">Account activity</p><h2 id="wallet-history-heading" className="mt-1 text-xl font-extrabold text-ink">Wallet history</h2></div><button type="button" onClick={() => fetchHistory(record.wallet.walletId, history?.pagination.page ?? 1)} disabled={Boolean(busy)} className="ga-btn-secondary min-h-10 px-3 text-sm">{busy === 'history' ? <LoadingLabel>Refreshing...</LoadingLabel> : 'Refresh'}</button></div><WalletHistory history={history} loadingReceiptId={loadingReceiptId} onPage={(page) => fetchHistory(record.wallet.walletId, page)} onReceipt={onReceipt} /></section>
        </div>}

        <TransferResult result={lastTransfer} recipient={counterparty?.record.beneficiary} />
        {counterparty && <section className="ga-card mt-6 overflow-hidden" aria-labelledby="recipient-history-heading"><div className="border-b border-line p-5 sm:p-6"><p className="ga-eyebrow">Recipient ledger refreshed</p><h2 id="recipient-history-heading" className="mt-1 text-xl font-extrabold text-ink">{fullName(counterparty.record.beneficiary)}</h2><p className="mt-2 text-sm text-muted-copy">Balance {money.format(Number(counterparty.record.wallet.balance))} · showing the latest records</p></div><WalletHistory history={counterparty.history} loadingReceiptId={loadingReceiptId} onReceipt={onReceipt} showPagination={false} /></section>}
      </div>}

      <ConfirmationDialog
        open={Boolean(pendingTransfer)}
        title="Confirm simulated transfer"
        description={pendingTransfer ? `Sender: ${fullName(record.beneficiary)}. Recipient: ${fullName(pendingTransfer.recipient.beneficiary)}. Amount: ${money.format(pendingTransfer.amount)}. ${pendingTransfer.recipient.wallet ? '' : 'An empty recipient wallet will be created automatically. '}This records paired internal ledger entries; no real funds move.` : ''}
        actionLabel="Complete simulated transfer"
        onCancel={() => setPendingTransfer(null)}
        onConfirm={confirmTransfer}
      />
    </div>
  )
}
