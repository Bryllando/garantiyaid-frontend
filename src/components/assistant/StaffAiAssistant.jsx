import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { animate } from 'animejs'
import {
  enqueueAssistantDistributionReminder,
  previewAssistantDistributionReminder,
  recordStaffAssistantFeedback,
  requestDistributionList,
  requestDistributionSchedules,
  requestStaffAssistantMessage,
  STAFF_ROLE_LABELS,
} from '../../auth/staffAuth.js'
import AssistantDistributionScheduler from './AssistantDistributionScheduler.jsx'
import { Icon } from '../ui/icon.jsx'
import { LoadingLabel } from '../ui/spinner.jsx'

const AssistantMessage = lazy(() => import('./AssistantMessage.js'))

const DEFAULT_MESSAGE = 'GarantiyAid Notice: {beneficiary}, scheduled ka sa {distribution} sa {date}, {time}, sa {location}. Queue #{queue}. Dal-a ang QR credential ug valid ID. Dili transferable ang notice.'

const LANGUAGE_LABELS = { en: 'English', fil: 'Filipino', ceb: 'Cebuano' }

const roleExperience = {
  SYSTEM_ADMIN: {
    greeting: {
      en: 'I can draft distribution events, prepare controlled reminders, and guide you through system-wide operations.',
      fil: 'Makakagawa ako ng distribution draft, controlled reminder, at gabay para sa system-wide operations.',
      ceb: 'Makahimo ko og distribution draft, kontroladong reminder, ug giya para sa system-wide operations.',
    },
    schedulePath: '/distributions/manage',
    scheduleLabel: 'Open distribution setup',
  },
  DSWD_STAFF: {
    greeting: {
      en: 'I can prepare scoped beneficiary reminders and guide you through authorized DSWD operations.',
      fil: 'Makapaghanda ako ng scoped beneficiary reminder at gabay sa awtorisadong DSWD operations.',
      ceb: 'Makahimo ko og scoped beneficiary reminder ug giya sa awtorisadong DSWD operations.',
    },
    schedulePath: '/dswd/live-dashboard',
    scheduleLabel: 'Open live monitoring',
  },
  BARANGAY_FACILITATOR: {
    greeting: {
      en: 'I can prepare reminders only for scheduled beneficiaries in your assigned Barangay.',
      fil: 'Makapaghanda ako ng reminder para lamang sa scheduled beneficiaries sa iyong Barangay.',
      ceb: 'Makahimo ko og reminder para ra sa scheduled beneficiaries sa imong Barangay.',
    },
    schedulePath: '/facilitator/queue',
    scheduleLabel: 'Open queue & schedules',
  },
}

function formatEvent(distribution) {
  const date = new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(`${distribution.distributionDate}T00:00:00+08:00`))
  return `${distribution.title} · ${date}`
}

function formatSchedule(value) {
  if (!value) return 'Not available'
  return new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value))
}

function messageIntent(message, userRole) {
  const normalized = message.toLowerCase()
  if (/\b(hello|hi|hey|kumusta|maayong|test|testing|tubag)\b/.test(normalized)) return 'greeting'
  if (userRole === 'SYSTEM_ADMIN' && /\b(create|draft|plan|himo|buhat|plano)\b/.test(normalized) && /\b(distribution|event|schedule)\b/.test(normalized)) return 'distributionDraft'
  if (/\b(text|sms|message|remind|notify|notification|textan|mensahe|pahibalo|ipadala)\b/.test(normalized)) return 'reminder'
  if (/\b(schedule|queue|distribution|event)\b/.test(normalized)) return 'schedule'
  if (/\b(status|delivery|failed|sent)\b/.test(normalized)) return 'delivery'
  if (/\b(beneficiary|beneficiaries|benepisyaryo|contact|sitio|purok)\b/.test(normalized)) return 'beneficiary'
  return 'help'
}

function AssistantFeedback({ busy, status, onRate }) {
  return (
    <div className="rounded-xl border border-line bg-white p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold text-copy">Was this assistance useful?</p>
        <div className="flex gap-2">
          <button type="button" disabled={busy || Boolean(status)} onClick={() => onRate('HELPFUL')} className="min-h-11 rounded-lg border border-line px-3 font-bold text-brand-green hover:bg-success-soft focus-visible:outline-2 focus-visible:outline-brand-blue disabled:opacity-50">Helpful</button>
          <button type="button" disabled={busy || Boolean(status)} onClick={() => onRate('NEEDS_IMPROVEMENT')} className="min-h-11 rounded-lg border border-line px-3 font-bold text-copy hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-brand-blue disabled:opacity-50">Needs improvement</button>
        </div>
      </div>
      {status && <p role="status" className={`mt-2 text-xs font-semibold ${status === 'saved' ? 'text-brand-green' : 'text-brand-red'}`}>{status === 'saved' ? 'Feedback recorded. Thank you.' : status}</p>}
    </div>
  )
}

function StaffAiAssistant({ accessToken, onNavigate, onSessionExpired, user }) {
  const [open, setOpen] = useState(false)
  const [view, setView] = useState('home')
  const [messages, setMessages] = useState([])
  const [chatInput, setChatInput] = useState('')
  const [streamingText, setStreamingText] = useState('')
  const [chatStatus, setChatStatus] = useState('thinking')
  const [language, setLanguage] = useState('ceb')
  const [lastIntent, setLastIntent] = useState('GUIDANCE')
  const [feedbackBusy, setFeedbackBusy] = useState(false)
  const [feedbackStatus, setFeedbackStatus] = useState('')
  const [externalAiUsed, setExternalAiUsed] = useState(null)
  const [distributions, setDistributions] = useState([])
  const [serviceAreas, setServiceAreas] = useState([])
  const [form, setForm] = useState({
    distributionId: '',
    serviceArea: '',
    deliveryMode: 'now',
    sendAt: '',
    messageTemplate: DEFAULT_MESSAGE,
  })
  const [preview, setPreview] = useState(null)
  const [reviewed, setReviewed] = useState(false)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)
  const launcherRef = useRef(null)
  const panelRef = useRef(null)
  const closeRef = useRef(null)
  const messageEndRef = useRef(null)
  const chatRequestRef = useRef(null)
  const experience = roleExperience[user?.role] ?? roleExperience.BARANGAY_FACILITATOR
  const selectedDistribution = distributions.find((row) => row.distributionId === form.distributionId)

  const visibleDistributions = useMemo(() => distributions.filter((row) => row.status !== 'CANCELLED'), [distributions])

  useEffect(() => {
    if (!open) return undefined
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (!reducedMotion && panelRef.current) {
      animate(panelRef.current, {
        opacity: [0, 1],
        y: [20, 0],
        scale: [0.96, 1],
        duration: 420,
        ease: 'outExpo',
      })
    }
    requestAnimationFrame(() => closeRef.current?.focus())

    const closeOnEscape = (event) => {
      if (event.key !== 'Escape') return
      setOpen(false)
      requestAnimationFrame(() => launcherRef.current?.focus())
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [open])

  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ block: 'nearest' })
  }, [messages, streamingText, chatStatus])

  useEffect(() => () => {
    chatRequestRef.current?.abort()
    chatRequestRef.current = null
  }, [accessToken])

  function animateLauncher() {
    if (!launcherRef.current || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    animate(launcherRef.current, {
      scale: [1, 0.88, 1.08, 1],
      rotate: [0, -7, 7, 0],
      duration: 560,
      ease: 'outExpo',
    })
  }

  function toggleAssistant() {
    animateLauncher()
    setOpen((current) => !current)
  }

  function closeAssistant() {
    setOpen(false)
    requestAnimationFrame(() => launcherRef.current?.focus())
  }

  async function loadDistributions() {
    if (distributions.length) return distributions
    setBusy('distributions')
    setError('')
    try {
      const data = await requestDistributionList(accessToken, { page: 1, pageSize: 100 })
      setDistributions(data.distributions)
      return data.distributions
    } catch (requestError) {
      if (requestError.status === 401) onSessionExpired?.()
      setError(requestError.message)
      return []
    } finally {
      setBusy('')
    }
  }

  async function startReminder() {
    setView('compose')
    setLastIntent('PREPARE_AREA_REMINDER')
    setFeedbackStatus('')
    setPreview(null)
    setReviewed(false)
    setResult(null)
    setError('')
    const rows = await loadDistributions()
    const usable = rows.filter((row) => row.status !== 'CANCELLED')
    if (!form.distributionId && usable[0]) {
      setForm((current) => ({ ...current, distributionId: usable[0].distributionId }))
      await loadServiceAreas(usable[0].distributionId)
    }
  }

  async function loadServiceAreas(distributionId) {
    if (!distributionId) {
      setServiceAreas([])
      return
    }
    setBusy('areas')
    setError('')
    try {
      const data = await requestDistributionSchedules(accessToken, distributionId)
      const areas = [...new Set(data.schedules.map((schedule) => schedule.beneficiary?.sitioPurok?.trim()).filter(Boolean))]
        .sort((left, right) => left.localeCompare(right, 'en-PH'))
      setServiceAreas(areas)
      setForm((current) => ({ ...current, serviceArea: areas.includes(current.serviceArea) ? current.serviceArea : '' }))
    } catch (requestError) {
      if (requestError.status === 401) onSessionExpired?.()
      setError(requestError.message)
      setServiceAreas([])
    } finally {
      setBusy('')
    }
  }

  function reminderPayload() {
    return {
      messageTemplate: form.messageTemplate.trim(),
      ...(form.serviceArea ? { serviceArea: form.serviceArea } : {}),
      ...(form.deliveryMode === 'scheduled' && form.sendAt
        ? { sendAt: new Date(form.sendAt).toISOString() }
        : { sendAt: new Date().toISOString() }),
    }
  }

  async function handlePreview(event) {
    event.preventDefault()
    setError('')
    setReviewed(false)
    if (!form.distributionId) return setError('Choose a distribution event before previewing recipients.')
    if (form.messageTemplate.trim().length < 10) return setError('Write a reminder containing at least 10 characters.')
    if (form.deliveryMode === 'scheduled' && !form.sendAt) return setError('Choose when the reminder should be queued.')

    setBusy('preview')
    try {
      const data = await previewAssistantDistributionReminder(accessToken, form.distributionId, reminderPayload())
      setPreview(data)
      setView('preview')
    } catch (requestError) {
      if (requestError.status === 401) onSessionExpired?.()
      setError(requestError.message)
    } finally {
      setBusy('')
    }
  }

  async function confirmReminder() {
    if (!preview || !reviewed) return
    setBusy('confirm')
    setError('')
    try {
      const data = await enqueueAssistantDistributionReminder(accessToken, form.distributionId, {
        ...reminderPayload(),
        confirmed: true,
        expectedRecipientCount: preview.recipientCount,
        expectedPreviewHash: preview.previewHash,
      })
      setResult({ kind: 'reminder', ...data })
      setLastIntent('PREPARE_AREA_REMINDER')
      setFeedbackStatus('')
      setView('success')
    } catch (requestError) {
      if (requestError.status === 401) onSessionExpired?.()
      setError(requestError.message)
      if (requestError.code === 'NOTIFICATION_PREVIEW_CHANGED') setView('compose')
    } finally {
      setBusy('')
    }
  }

  function navigate(path) {
    closeAssistant()
    onNavigate?.(path)
  }

  async function sendChat(event) {
    event.preventDefault()
    const content = chatInput.trim()
    if (!content || chatRequestRef.current) return
    const intent = messageIntent(content, user?.role)
    setMessages((current) => [...current, { role: 'user', content }])
    setLastIntent(intent.replace(/([A-Z])/g, '_$1').toUpperCase())
    setFeedbackStatus('')
    setChatInput('')
    if (intent === 'reminder') return void startReminder()
    if (intent === 'distributionDraft') return setView('scheduler')
    setBusy('chat')
    setError('')
    setStreamingText('')
    setChatStatus('thinking')
    const controller = new AbortController()
    chatRequestRef.current = controller
    try {
      const data = await requestStaffAssistantMessage(accessToken, {
        language,
        intent: intent.toUpperCase(),
        messageText: content,
        history: messages.slice(-6).map((message) => ({ role: message.role, content: message.content.slice(0, 1000) })),
      }, {
        signal: controller.signal,
        onText: (text) => { if (chatRequestRef.current === controller) setStreamingText(text) },
        onStatus: (status) => { if (chatRequestRef.current === controller) setChatStatus(status) },
      })
      if (chatRequestRef.current !== controller) return
      setMessages((current) => [...current, { role: 'assistant', content: data.messageText }])
      setExternalAiUsed(data.externalAiUsed)
    } catch (requestError) {
      if (chatRequestRef.current !== controller) return
      if (requestError.status === 401) onSessionExpired?.()
      setError(controller.signal.aborted ? 'Response stopped. You can send another message.'
        : requestError.name === 'TimeoutError' ? 'The answer took too long. Please try again.'
          : requestError.message || 'GarantiyAid AI could not answer. Please try again.')
    } finally {
      if (chatRequestRef.current === controller) {
        chatRequestRef.current = null
        setStreamingText('')
        setBusy('')
      }
    }
  }

  async function submitFeedback(rating) {
    setFeedbackBusy(true)
    setFeedbackStatus('')
    try {
      await recordStaffAssistantFeedback(accessToken, {
        rating,
        context: result?.kind === 'distribution'
          ? 'DISTRIBUTION_DRAFT'
          : result?.kind === 'reminder'
            ? 'REMINDER_QUEUED'
            : 'GUIDANCE',
        intent: lastIntent,
      })
      setFeedbackStatus('saved')
    } catch (requestError) {
      if (requestError.status === 401) onSessionExpired?.()
      setFeedbackStatus(requestError.message || 'Feedback could not be recorded.')
    } finally {
      setFeedbackBusy(false)
    }
  }

  function resetWorkflow() {
    setView('home')
    setPreview(null)
    setReviewed(false)
    setResult(null)
    setFeedbackStatus('')
    setError('')
  }

  return (
    <>
      {open && (
        <section id="garantiyaid-ai-panel" ref={panelRef} role="dialog" aria-modal="false" aria-labelledby="garantiyaid-ai-title" className="fixed inset-x-3 bottom-3 top-[5.5rem] z-[60] flex flex-col overflow-hidden rounded-2xl border border-line bg-white shadow-lg sm:inset-x-auto sm:bottom-6 sm:right-6 sm:top-auto sm:h-[min(44rem,calc(100dvh-7rem))] sm:w-[min(29rem,calc(100vw-3rem))]">
          <header className="shrink-0 border-b border-blue-900/20 bg-brand-navy px-4 py-4 text-white">
            <div className="flex items-center gap-3">
              <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-white shadow-sm">
                <img src="/GarantiyAid-AI-logo.svg" alt="" width="64" height="64" className="size-10" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h2 id="garantiyaid-ai-title" className="truncate text-base font-bold">GarantiyAid AI</h2>
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-400/15 px-2 py-1 text-[0.6875rem] font-bold text-emerald-100"><span className="size-1.5 rounded-full bg-emerald-300" />{busy === 'chat' ? 'Thinking' : 'Ready'}</span>
                </div>
                <p className="mt-0.5 truncate text-xs text-blue-100">{STAFF_ROLE_LABELS[user?.role] ?? 'Authorized staff'} · Controlled assistant</p>
              </div>
              <label className="sr-only" htmlFor="staff-ai-language">Assistant language</label>
              <select id="staff-ai-language" value={language} onChange={(event) => setLanguage(event.target.value)} className="min-h-11 max-w-24 rounded-lg border border-white/20 bg-white/10 px-2 text-xs font-bold text-white outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
                {Object.entries(LANGUAGE_LABELS).map(([value, label]) => <option key={value} value={value} className="text-ink">{label}</option>)}
              </select>
              <button ref={closeRef} type="button" onClick={closeAssistant} aria-label="Close GarantiyAid AI" className="grid size-11 shrink-0 place-items-center rounded-lg text-blue-100 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
                <Icon name="close" />
              </button>
            </div>
          </header>

          <div className="flex-1 overflow-y-auto bg-page p-4" aria-live="polite">
            {view === 'home' && (
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <img src="/GarantiyAid-AI-logo.svg" alt="" width="64" height="64" className="mt-1 size-8 shrink-0" />
                  <div className="max-w-[85%] rounded-2xl rounded-tl-md border border-line bg-white px-4 py-3 text-sm leading-6 text-copy shadow-sm">
                    <p className="font-bold text-ink">Maayong adlaw, {user?.fullName?.split(' ')[0] || 'Staff'}.</p>
                    <p className="mt-1">{experience.greeting[language]}</p>
                  </div>
                </div>

                {messages.map((message, index) => (
                  <div key={`${message.role}-${index}`} className={`flex ${message.role === 'user' ? 'justify-end' : 'items-start gap-3'}`}>
                    {message.role === 'assistant' && <img src="/GarantiyAid-AI-logo.svg" alt="" width="64" height="64" className="mt-1 size-8 shrink-0" />}
                    {message.role === 'user' ? (
                      <p className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-brand-blue px-4 py-3 text-sm leading-6 text-white">{message.content}</p>
                    ) : (
                      <div className="min-w-0 flex-1 rounded-2xl rounded-tl-md border border-line bg-white px-4 py-4 text-copy shadow-sm">
                        <Suspense fallback={<p className="whitespace-pre-wrap break-words">{message.content}</p>}>
                          <AssistantMessage content={message.content} />
                        </Suspense>
                      </div>
                    )}
                  </div>
                ))}
                {busy === 'chat' && <div className="flex items-start gap-3">
                  <img src="/GarantiyAid-AI-logo.svg" alt="" width="64" height="64" className="mt-1 size-8 shrink-0" />
                  <div className="min-w-0 flex-1 rounded-2xl rounded-tl-md border border-line bg-white px-4 py-4 text-sm leading-6 text-copy shadow-sm">
                    {streamingText && <div aria-live="off"><Suspense fallback={<p className="whitespace-pre-wrap break-words">{streamingText}</p>}><AssistantMessage content={streamingText} /></Suspense></div>}
                    <div role="status" className={streamingText ? 'mt-2 text-xs text-muted-copy' : ''}>
                      <LoadingLabel>{streamingText ? 'Writing reply...' : chatStatus === 'retrying' ? 'Still working on your answer. Retrying...' : 'GarantiyAid AI is thinking...'}</LoadingLabel>
                    </div>
                  </div>
                </div>}
                {error && <p role="alert" className="rounded-xl border border-red-200 bg-danger-soft p-3 text-sm font-semibold text-brand-red">{error}</p>}
                <div ref={messageEndRef} />

                <fieldset disabled={busy === 'chat'} className="min-w-0 border-0 pt-2 disabled:opacity-60">
                  <p className="text-xs font-bold uppercase tracking-[0.1em] text-muted-copy">Suggested actions</p>
                  <div className="mt-3 grid gap-2">
                    {user?.role === 'SYSTEM_ADMIN' && (
                      <button type="button" onClick={() => { setView('scheduler'); setLastIntent('CREATE_DISTRIBUTION_DRAFT'); setFeedbackStatus(''); setError('') }} className="flex min-h-14 w-full items-center gap-3 rounded-xl border border-blue-200 bg-info-soft px-4 text-left font-bold text-brand-blue transition-[background-color,border-color,transform] hover:-translate-y-0.5 hover:border-brand-blue hover:bg-blue-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue motion-reduce:transform-none">
                        <Icon name="calendar" className="size-5 shrink-0" />
                        <span className="flex-1">Draft a distribution event</span>
                        <Icon name="chevronRight" className="size-4" />
                      </button>
                    )}
                    <button type="button" onClick={startReminder} className="flex min-h-14 w-full items-center gap-3 rounded-xl border border-blue-200 bg-info-soft px-4 text-left font-bold text-brand-blue transition-[background-color,border-color,transform] hover:-translate-y-0.5 hover:border-brand-blue hover:bg-blue-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue motion-reduce:transform-none">
                      <Icon name="smsDelivery" className="size-5 shrink-0" />
                      <span className="flex-1">Prepare an area reminder</span>
                      <Icon name="chevronRight" className="size-4" />
                    </button>
                    <button type="button" onClick={() => navigate(experience.schedulePath)} className="flex min-h-12 w-full items-center gap-3 rounded-xl border border-line bg-white px-4 text-left text-sm font-bold text-copy transition-colors hover:border-blue-200 hover:bg-info-soft hover:text-brand-blue focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue">
                      <Icon name="calendar" className="size-5 shrink-0" />
                      <span className="flex-1">{experience.scheduleLabel}</span>
                      <Icon name="chevronRight" className="size-4" />
                    </button>
                    <button type="button" onClick={() => navigate('/notifications')} className="flex min-h-12 w-full items-center gap-3 rounded-xl border border-line bg-white px-4 text-left text-sm font-bold text-copy transition-colors hover:border-blue-200 hover:bg-info-soft hover:text-brand-blue focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue">
                      <Icon name="notifications" className="size-5 shrink-0" />
                      <span className="flex-1">Review delivery status</span>
                      <Icon name="chevronRight" className="size-4" />
                    </button>
                  </div>
                </fieldset>
                {messages.length > 0 && <AssistantFeedback busy={feedbackBusy || busy === 'chat'} status={feedbackStatus} onRate={submitFeedback} />}
              </div>
            )}

            {view === 'scheduler' && user?.role === 'SYSTEM_ADMIN' && (
              <AssistantDistributionScheduler
                accessToken={accessToken}
                onBack={resetWorkflow}
                onSessionExpired={onSessionExpired}
                onDone={(distribution) => {
                  setResult({ kind: 'distribution', distribution })
                  setLastIntent('CREATE_DISTRIBUTION_DRAFT')
                  setFeedbackStatus('')
                  setView('success')
                }}
              />
            )}

            {view === 'compose' && (
              <form onSubmit={handlePreview} className="space-y-5" noValidate>
                <div>
                  <button type="button" onClick={resetWorkflow} className="inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm font-bold text-brand-blue hover:bg-info-soft focus-visible:outline-2 focus-visible:outline-brand-blue"><Icon name="arrowLeft" className="size-4" /> Assistant home</button>
                  <p className="mt-2 text-xs font-bold uppercase tracking-[0.1em] text-brand-blue">Guided workflow</p>
                  <h3 className="mt-1 text-xl font-bold text-ink">Prepare area reminder</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-copy">Only active, scheduled beneficiaries with valid Philippine mobile numbers will be included.</p>
                </div>

                <div>
                  <label htmlFor="ai-distribution" className="ga-label">Distribution event</label>
                  <select id="ai-distribution" required value={form.distributionId} disabled={busy === 'distributions'} onChange={(event) => { const distributionId = event.target.value; setForm((current) => ({ ...current, distributionId })); void loadServiceAreas(distributionId) }} className="ga-input mt-2">
                    <option value="">Choose an event</option>
                    {visibleDistributions.map((distribution) => <option key={distribution.distributionId} value={distribution.distributionId}>{formatEvent(distribution)}</option>)}
                  </select>
                  {selectedDistribution && <p className="mt-2 flex items-center gap-2 text-xs leading-5 text-muted-copy"><Icon name="location" className="size-4 shrink-0" />{selectedDistribution.barangay?.barangayName} · {selectedDistribution.location}</p>}
                </div>

                <div>
                  <label htmlFor="ai-service-area" className="ga-label">Sitio / Purok</label>
                  <select id="ai-service-area" value={form.serviceArea} disabled={!form.distributionId || busy === 'areas'} onChange={(event) => setForm((current) => ({ ...current, serviceArea: event.target.value }))} className="ga-input mt-2">
                    <option value="">All scheduled service areas</option>
                    {serviceAreas.map((area) => <option key={area} value={area}>{area}</option>)}
                  </select>
                  <p className="mt-2 text-xs leading-5 text-muted-copy">Barangay Facilitators remain restricted to their assigned barangay.</p>
                </div>

                <fieldset>
                  <legend className="ga-label">Queue reminder</legend>
                  <div className="mt-2 grid grid-cols-2 gap-2 rounded-xl border border-line bg-white p-1.5">
                    <button type="button" aria-pressed={form.deliveryMode === 'now'} onClick={() => setForm((current) => ({ ...current, deliveryMode: 'now' }))} className={`min-h-11 rounded-lg px-3 text-sm font-bold transition-colors focus-visible:outline-2 focus-visible:outline-brand-blue ${form.deliveryMode === 'now' ? 'bg-brand-navy text-white' : 'text-copy hover:bg-slate-50'}`}>Queue now</button>
                    <button type="button" aria-pressed={form.deliveryMode === 'scheduled'} onClick={() => setForm((current) => ({ ...current, deliveryMode: 'scheduled' }))} className={`min-h-11 rounded-lg px-3 text-sm font-bold transition-colors focus-visible:outline-2 focus-visible:outline-brand-blue ${form.deliveryMode === 'scheduled' ? 'bg-brand-navy text-white' : 'text-copy hover:bg-slate-50'}`}>Schedule</button>
                  </div>
                </fieldset>

                {form.deliveryMode === 'scheduled' && <div><label htmlFor="ai-send-at" className="ga-label">Delivery date and time</label><input id="ai-send-at" type="datetime-local" required value={form.sendAt} onChange={(event) => setForm((current) => ({ ...current, sendAt: event.target.value }))} className="ga-input mt-2" /><p className="mt-2 text-xs text-muted-copy">Must be before every selected beneficiary’s session.</p></div>}

                <div>
                  <div className="flex items-end justify-between gap-3"><label htmlFor="ai-message" className="ga-label">SMS message template</label><span className="text-xs tabular-nums text-muted-copy">{form.messageTemplate.length}/320</span></div>
                  <textarea id="ai-message" required maxLength="320" rows="6" value={form.messageTemplate} onChange={(event) => setForm((current) => ({ ...current, messageTemplate: event.target.value }))} aria-describedby="ai-message-help" className="ga-input mt-2 min-h-36 resize-y py-3" />
                  <p id="ai-message-help" className="mt-2 text-xs leading-5 text-muted-copy">Personalize with {'{beneficiary}'}, {'{distribution}'}, {'{date}'}, {'{time}'}, {'{location}'}, and {'{queue}'}.</p>
                </div>

                {error && <div role="alert" className="rounded-xl border border-red-200 bg-danger-soft p-4 text-sm font-semibold text-brand-red"><p>{error}</p><p className="mt-1 font-normal">Review the fields and try again.</p></div>}

                <button type="submit" disabled={Boolean(busy) || !form.distributionId} className="ga-btn-primary w-full">{busy === 'preview' ? <LoadingLabel>Checking recipients...</LoadingLabel> : 'Preview recipients and message'}</button>
              </form>
            )}

            {view === 'preview' && preview && (
              <div className="space-y-5">
                <div>
                  <button type="button" onClick={() => { setView('compose'); setError('') }} className="inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm font-bold text-brand-blue hover:bg-info-soft focus-visible:outline-2 focus-visible:outline-brand-blue"><Icon name="arrowLeft" className="size-4" /> Edit reminder</button>
                  <p className="mt-2 text-xs font-bold uppercase tracking-[0.1em] text-brand-green">Secure preview</p>
                  <h3 className="mt-1 text-xl font-bold text-ink">Review before queueing</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-copy">No message has been queued yet.</p>
                </div>

                <dl className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-emerald-200 bg-success-soft p-4"><dt className="text-xs font-bold text-brand-green">Recipients</dt><dd className="mt-1 text-2xl font-bold tabular-nums text-ink">{preview.recipientCount}</dd></div>
                  <div className="rounded-xl border border-amber-200 bg-warning-soft p-4"><dt className="text-xs font-bold text-brand-amber">Excluded</dt><dd className="mt-1 text-2xl font-bold tabular-nums text-ink">{preview.excludedCount}</dd></div>
                </dl>

                {preview.excludedCount > 0 && <div className="rounded-xl border border-line bg-white p-4 text-sm text-copy"><p className="font-bold text-ink">Excluded safely</p><p className="mt-2">Invalid or missing contact: {preview.excluded.invalidContactCount}</p><p className="mt-1">Already claimed: {preview.excluded.completedClaimCount}</p></div>}

                <section aria-labelledby="ai-message-preview-title">
                  <h4 id="ai-message-preview-title" className="text-sm font-bold text-ink">Personalized message sample</h4>
                  <div className="mt-2 rounded-2xl rounded-tl-md border border-blue-200 bg-info-soft p-4 text-sm leading-6 text-ink">{preview.recipients[0]?.message || 'No eligible recipient message is available.'}</div>
                </section>

                <section aria-labelledby="ai-recipient-preview-title">
                  <div className="flex items-center justify-between gap-3"><h4 id="ai-recipient-preview-title" className="text-sm font-bold text-ink">Recipient preview</h4><span className="text-xs text-muted-copy">First {Math.min(5, preview.recipientCount)}</span></div>
                  <ul className="mt-2 divide-y divide-line overflow-hidden rounded-xl border border-line bg-white">
                    {preview.recipients.slice(0, 5).map((recipient) => <li key={recipient.scheduleId} className="flex items-start gap-3 p-3"><span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-navy text-xs font-bold text-white">{recipient.beneficiaryName?.[0] || 'B'}</span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold text-ink">{recipient.beneficiaryName}</span><span className="mt-0.5 block text-xs text-muted-copy">{recipient.serviceArea || 'No Sitio/Purok'} · {recipient.recipientMasked}</span><span className="mt-0.5 block text-xs text-muted-copy">Queue #{recipient.queueNumber} · {formatSchedule(recipient.slotStart)}</span></span></li>)}
                    {preview.recipientCount === 0 && <li className="p-5 text-center text-sm text-muted-copy">No eligible recipients matched this reminder.</li>}
                  </ul>
                </section>

                <div className="rounded-xl border border-amber-200 bg-warning-soft p-4 text-sm leading-6 text-copy"><p className="flex items-start gap-2 font-bold text-brand-amber"><Icon name="info" className="mt-0.5 size-4 shrink-0" />SMS is a notice, not claim authorization.</p><p className="mt-1">The official schedule, QR credential, and identity verification still control claiming.</p></div>

                <label className="flex min-h-12 cursor-pointer items-start gap-3 rounded-xl border border-line bg-white p-4 text-sm leading-6 text-copy"><input type="checkbox" checked={reviewed} onChange={(event) => setReviewed(event.target.checked)} className="mt-1 size-5 shrink-0 accent-brand-blue" /><span>I reviewed the recipients, message, delivery time, and official-event details.</span></label>

                {error && <div role="alert" className="rounded-xl border border-red-200 bg-danger-soft p-4 text-sm font-semibold text-brand-red">{error}</div>}
                <button type="button" onClick={confirmReminder} disabled={!reviewed || preview.recipientCount === 0 || Boolean(busy)} className="ga-btn-primary w-full">{busy === 'confirm' ? <LoadingLabel>Queueing reminders...</LoadingLabel> : `Confirm and queue ${preview.recipientCount} reminder${preview.recipientCount === 1 ? '' : 's'}`}</button>
              </div>
            )}

            {view === 'success' && result && (
              <div className="flex min-h-full flex-col justify-center py-6 text-center">
                <span aria-hidden="true" className="mx-auto grid size-16 place-items-center rounded-full bg-success-soft text-brand-green"><Icon name="check" className="size-8" strokeWidth={2.4} /></span>
                <p className="mt-5 text-xs font-bold uppercase tracking-[0.1em] text-brand-green">{result.kind === 'distribution' ? 'Draft created' : 'Reminder approved'}</p>
                <h3 className="mt-2 text-2xl font-bold text-ink">{result.kind === 'distribution' ? result.distribution.title : `${result.queuedCount} reminder${result.queuedCount === 1 ? '' : 's'} queued`}</h3>
                <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-muted-copy">{result.kind === 'distribution' ? 'The event remains a draft. Review it in Distribution setup before allocating beneficiaries, generating schedules, sending notices, or opening field operations.' : 'The existing notification worker will process the approved records. Current environment: simulated SMS only, so no real phone received a text.'}</p>
                <div className="mt-5 text-left"><AssistantFeedback busy={feedbackBusy} status={feedbackStatus} onRate={submitFeedback} /></div>
                <div className="mt-6 grid gap-3">
                  <button type="button" onClick={() => navigate(result.kind === 'distribution' ? '/distributions/manage' : '/notifications')} className="ga-btn-primary w-full">{result.kind === 'distribution' ? 'Review distribution draft' : 'Review delivery records'}</button>
                  <button type="button" onClick={resetWorkflow} className="ga-btn-secondary w-full">Back to assistant</button>
                </div>
              </div>
            )}
          </div>

          {view === 'home' && (
            <form onSubmit={sendChat} className="shrink-0 border-t border-line bg-white p-3">
              <label htmlFor="garantiyaid-ai-message" className="sr-only">Ask GarantiyAid AI</label>
              <div className="flex items-end gap-2 rounded-xl border border-slate-300 bg-white p-1.5 focus-within:border-brand-blue focus-within:ring-2 focus-within:ring-blue-100">
                <textarea id="garantiyaid-ai-message" rows="1" maxLength="300" value={chatInput} onChange={(event) => setChatInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit() } }} placeholder="Ask about reminders or schedules..." className="max-h-28 min-h-11 min-w-0 flex-1 resize-none bg-transparent px-3 py-2.5 text-base text-ink outline-none placeholder:text-slate-400" />
                {busy === 'chat' ? (
                  <button type="button" onClick={() => chatRequestRef.current?.abort()} aria-label="Stop generating answer" className="min-h-11 shrink-0 rounded-lg bg-brand-blue px-3 text-sm font-bold text-white hover:bg-brand-blue-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue">Stop</button>
                ) : (
                  <button type="submit" disabled={!chatInput.trim()} aria-label="Send message" className="grid size-11 shrink-0 place-items-center rounded-lg bg-brand-blue text-white transition-colors hover:bg-brand-blue-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue disabled:opacity-40"><Icon name="arrowRight" /></button>
                )}
              </div>
              <p className="mt-2 text-center text-[0.6875rem] leading-4 text-muted-copy">{externalAiUsed === true ? 'OpenRouter AI · Sensitive patterns redacted' : externalAiUsed === false ? 'Controlled fallback active' : 'Secure AI guidance · Do not enter personal records'}</p>
            </form>
          )}
        </section>
      )}

      <button ref={launcherRef} type="button" onClick={toggleAssistant} tabIndex={open ? -1 : 0} aria-label={open ? 'Close GarantiyAid AI' : 'Open GarantiyAid AI'} aria-expanded={open} aria-controls="garantiyaid-ai-panel" className={`fixed bottom-5 right-5 z-[61] grid size-16 place-items-center rounded-full border-2 border-white bg-brand-navy shadow-lg transition-[box-shadow,transform] hover:-translate-y-1 hover:shadow-xl focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-brand-blue motion-reduce:transform-none sm:bottom-7 sm:right-7 ${open ? 'pointer-events-none scale-90 opacity-0' : ''}`}>
        <span aria-hidden="true" className="absolute inset-0 rounded-full border border-blue-300/60" />
        <img src="/GarantiyAid-AI-logo.svg" alt="" width="64" height="64" className="relative size-14" />
        <span className="sr-only">GarantiyAid AI assistant</span>
      </button>
    </>
  )
}

export default StaffAiAssistant
