import { Icon } from './icon.jsx'

function emailDeliveryLabel(delivery) {
  if (!delivery) return 'Email status unavailable'
  if (!delivery.configured || delivery.status === 'DISABLED') return 'Email notifications are off'
  return { PENDING: 'Email queued', SENT: 'Accepted by email service', FAILED: 'Email not sent' }[delivery.status] ?? 'Email status unavailable'
}

// oxlint-disable-next-line react/only-export-components -- Cards and action toasts share the same delivery wording.
export function emailDeliveryFeedback(delivery) {
  if (!delivery) return ''
  const recipient = delivery.recipientMasked ? ` to ${delivery.recipientMasked}` : ''
  if (delivery.status === 'PENDING') return `Email queued${recipient}. Check Email history for an updated status.`
  if (delivery.status === 'SENT') return `The email service accepted the message${recipient}. Inbox delivery is not confirmed.`
  if (delivery.status === 'FAILED') return 'Email could not be sent. Contact your System Administrator for help.'
  if (!delivery.configured || delivery.status === 'DISABLED') return 'Email notifications are off. Contact the staff member privately if they need help.'
  return 'Email status is unavailable. Check again later.'
}

export function SecurityEmailStatus({ delivery, configuration = false, compact = false, live = false, className = '' }) {
  const sent = !configuration && delivery?.status === 'SENT'
  const failed = delivery?.status === 'FAILED'
  const title = configuration && delivery?.configured ? 'Email notifications are on' : emailDeliveryLabel(delivery)
  const description = configuration && delivery?.configured
    ? 'Account and security notices go to your registered email. Check each notification for its sending status.'
    : emailDeliveryFeedback(delivery)
  const tone = sent ? 'text-brand-green' : failed ? 'text-brand-red' : 'text-copy'

  if (compact) return <span className={`block break-words text-sm leading-6 ${tone} ${className}`}><strong className="font-semibold">{title}</strong>{delivery?.recipientMasked && <span className="block text-copy">To {delivery.recipientMasked}</span>}</span>

  return (
    <div
      role={live ? 'status' : undefined}
      aria-live={live ? 'polite' : undefined}
      aria-atomic={live ? 'true' : undefined}
      className={`${failed ? 'border-brand-red bg-danger-soft' : 'border-line bg-slate-50'} flex items-start gap-3 border-l-2 p-3 ${className}`}
    >
      <span aria-hidden="true" className={`mt-0.5 shrink-0 ${tone}`}>
        <Icon name="email" className="size-5" />
      </span>
      <div className="min-w-0">
        <p className={`text-sm font-semibold ${tone}`}>{title}</p>
        <p className="mt-1 break-words text-sm leading-6 text-copy">{description}</p>
      </div>
    </div>
  )
}
