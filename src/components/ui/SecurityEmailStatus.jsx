import { Icon } from './icon.jsx'

function emailDeliveryLabel(delivery) {
  if (!delivery) return 'Email status unavailable'
  if (!delivery.configured || delivery.status === 'DISABLED') return 'Email notifications are off'
  return { PENDING: 'Email queued', SENT: 'Email sent', FAILED: 'Email failed' }[delivery.status] ?? 'Email status unavailable'
}

// oxlint-disable-next-line react/only-export-components -- Cards and action toasts share the same delivery wording.
export function emailDeliveryFeedback(delivery) {
  if (!delivery) return ''
  const recipient = delivery.recipientMasked ? ` to ${delivery.recipientMasked}` : ''
  if (delivery.status === 'PENDING') return `Email queued${recipient}. Waiting to send.`
  if (delivery.status === 'SENT') return `Email sent${recipient}. Gmail accepted the message; Inbox placement is not confirmed.`
  if (delivery.status === 'FAILED') return 'Email could not be sent. The account change was saved. Contact the System Administrator.'
  if (!delivery.configured || delivery.status === 'DISABLED') return 'Email notifications are off. The account change was saved.'
  return 'Email status is unavailable. Check again later.'
}

export function SecurityEmailStatus({ delivery, configuration = false, compact = false, live = false, className = '' }) {
  const sent = !configuration && delivery?.status === 'SENT'
  const failed = delivery?.status === 'FAILED'
  const title = configuration && delivery?.configured ? 'Email notifications configured' : emailDeliveryLabel(delivery)
  const description = configuration && delivery?.configured
    ? 'Security notices use this official email. Delivery status is available with each notification.'
    : emailDeliveryFeedback(delivery)
  const tone = sent ? 'text-brand-green' : failed ? 'text-brand-red' : 'text-copy'

  if (compact) return <span className={`block text-xs leading-5 ${tone} ${className}`}><strong>{title}</strong>{delivery?.recipientMasked && ` · ${delivery.recipientMasked}`}</span>

  return (
    <div
      role={live ? 'status' : undefined}
      aria-live={live ? 'polite' : undefined}
      className={`${sent ? 'border-emerald-200 bg-success-soft' : failed ? 'border-red-200 bg-danger-soft' : 'border-line bg-slate-50'} flex items-start gap-3 rounded-lg border p-3 ${className}`}
    >
      <span aria-hidden="true" className={`mt-0.5 shrink-0 ${tone}`}>
        <Icon name="email" className="size-5" />
      </span>
      <div className="min-w-0">
        <p className={`text-sm font-bold ${tone}`}>{title}</p>
        <p className="mt-1 text-xs leading-5 text-copy">{description}</p>
      </div>
    </div>
  )
}
