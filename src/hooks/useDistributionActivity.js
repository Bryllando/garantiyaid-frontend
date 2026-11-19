import { useEffect, useId, useRef, useState } from 'react'
import { toast } from 'sonner'

const labels = {
  PHYSICAL_ASSISTANCE_RELEASED: 'Physical assistance released',
  CLAIM_RECEIPT_ISSUED: 'Claim receipt issued',
  CLAIM_DISPUTE_FILED: 'Claim dispute filed',
  CLAIM_DISPUTE_REVIEW_UPDATED: 'Dispute review updated',
  QR_CLAIM_UPDATED: 'QR check recorded for a claim',
  BIOMETRIC_CLAIM_UPDATED: 'Face check recorded for a claim',
  CLAIM_SIGNATURE_COMPLETED: 'Claim signature recorded',
  MANUAL_IDENTITY_REVIEW_RECORDED: 'Manual identity review recorded',
  QR_SCAN_ANOMALY: 'QR check needs review',
  BIOMETRIC_ANOMALY: 'Face check needs review',
  SIMULATED_BENEFIT_CREDIT_COMPLETED: 'Simulated credit recorded',
  SIMULATED_BENEFIT_CREDIT_REVERSED: 'Simulated credit reversed',
  DISTRIBUTION_CREATED: 'Distribution created',
  DISTRIBUTION_UPDATED: 'Distribution details updated',
  DISTRIBUTION_OPENED: 'Distribution opened',
  DISTRIBUTION_CLOSED: 'Distribution closed',
  DISTRIBUTION_CANCELLED: 'Distribution cancelled',
  SCHEDULE_CREATED: 'Appointment scheduled',
  SCHEDULE_GENERATED: 'Schedules generated',
  SCHEDULE_RESCHEDULED: 'Appointment rescheduled',
  SCHEDULE_CANCELLED: 'Appointment cancelled',
  SCHEDULE_REACTIVATED: 'Appointment reactivated',
  SCHEDULE_AI_DRAFT_CONFIRMED: 'Draft schedule confirmed',
}

const time = new Intl.DateTimeFormat('en-PH', { timeStyle: 'medium', timeZone: 'Asia/Manila' })
const recentLimit = 30

export function useDistributionActivity(distributionId, title) {
  const [history, setHistory] = useState([])
  const toastId = useId()
  const seen = useRef(new Set())
  const pending = useRef([])
  const notificationTimer = useRef(null)

  useEffect(() => () => {
    clearTimeout(notificationTimer.current)
    notificationTimer.current = null
    pending.current = []
    toast.dismiss(toastId)
  }, [distributionId, toastId])

  // One summary event accompanies each saved operation, even when it changes several records.
  function recordActivity(name, payload) {
    if (name !== 'dashboard.metrics.updated' || !distributionId || payload?.distributionId !== distributionId) return
    const occurredAt = Date.parse(payload.occurredAt)
    if (!payload.eventId || seen.current.has(payload.eventId) || !Number.isFinite(occurredAt)) return
    seen.current.add(payload.eventId)
    if (seen.current.size > 100) seen.current.delete(seen.current.values().next().value)
    const { reason, claimId, queueNumber } = payload.data ?? {}
    const label = Object.hasOwn(labels, reason) ? labels[reason] : 'Distribution records updated'
    const clock = `${time.format(occurredAt)} PHT`
    const reference = Number.isSafeInteger(queueNumber) && queueNumber > 0 ? `Queue ${queueNumber}` : ''
    const entry = { id: payload.eventId, distributionId, claimId: typeof claimId === 'string' ? claimId : '', label, occurredAt, clock, reference }
    setHistory(entries => [entry, ...entries].sort((a, b) => b.occurredAt - a.occurredAt).slice(0, recentLimit))

    if (document.visibilityState !== 'visible') return
    pending.current.push(entry)
    if (notificationTimer.current !== null) return
    notificationTimer.current = setTimeout(() => {
      const [first, ...rest] = pending.current
      pending.current = []
      notificationTimer.current = null
      if (!first || document.visibilityState !== 'visible') return
      const distributionTitle = title || 'Selected distribution'
      const description = rest.length ? distributionTitle : [first.reference, distributionTitle, first.clock].filter(Boolean).join(' · ')
      toast.info(rest.length ? `${rest.length + 1} distribution updates` : first.label, {
        id: toastId,
        description,
        className: '!pr-14',
        classNames: {
          closeButton: '!left-auto !right-1 !top-1/2 !size-11 !-translate-y-1/2 !transform-none !rounded-md !border-transparent focus-visible:!outline-2 focus-visible:!outline-brand-blue',
        },
      })
    }, 300)
  }
  return [history.filter(entry => entry.distributionId === distributionId), recordActivity]
}
