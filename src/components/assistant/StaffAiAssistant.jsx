import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { animate } from 'animejs'
import {
  enqueueAssistantDistributionReminder,
  confirmAssistantDistribution,
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
import { messageIntent, routingReplies } from './staff-message-intent.js'
import AssistantTaskDetails from './AssistantTaskDetails.jsx'
import { collectTaskDetails, detailCopy, isTaskCancellation, isTaskQuestion, nextTaskField, setTaskValue, taskReply, translated } from './task-details.js'
import { allPages, formatPreviewTime, reminderFormFromTask, reminderRequest, resolveServiceArea, UNRESOLVED_AREA } from './task-preview.js'
import { confirmationSnapshot, uncertainConfirmation, retryConfirmationMessage, pendingConfirmation } from './confirmation-state.js'

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
  return `${distribution.title} · ${date} · ${distribution.barangay?.barangayName || distribution.location || distribution.distributionId}`
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
  const [recovery, setRecovery] = useState(() => pendingConfirmation(user?.userId))
  const [view, setView] = useState(() => pendingConfirmation(user?.userId) ? 'recovery' : 'home')
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
  const [pendingTask, setPendingTask] = useState(null)
  const [editingDetail, setEditingDetail] = useState('')
  const [detailError, setDetailError] = useState('')
  const [guidedReminder, setGuidedReminder] = useState(false)
  const [uncertain, setUncertain] = useState(false)
  const submittingRef = useRef(false)
  const launcherRef = useRef(null)
  const panelRef = useRef(null)
  const contentRef = useRef(null)
  const closeRef = useRef(null)
  const messageEndRef = useRef(null)
  const chatRequestRef = useRef(null)
  const lookupRunRef = useRef(0)
  const experience = roleExperience[user?.role] ?? roleExperience.BARANGAY_FACILITATOR
  const selectedDistribution = distributions.find((row) => row.distributionId === form.distributionId)

  const visibleDistributions = useMemo(() => distributions.filter((row) => ['DRAFT', 'OPEN'].includes(row.status)), [distributions])

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

  useEffect(() => {
    if (view === 'home') return
    const heading = contentRef.current?.querySelector('h3')
    if (!heading) return
    contentRef.current.scrollTop = 0
    heading.tabIndex = -1
    heading.focus({ preventScroll: true })
  }, [view])

  useEffect(() => () => {
    lookupRunRef.current += 1
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
    const run = ++lookupRunRef.current
    setBusy('distributions')
    setError('')
    try {
      const rows = await allPages((page) => requestDistributionList(accessToken, page), 'distributions')
      if (run !== lookupRunRef.current) return null
      setDistributions(rows)
      return rows
    } catch (requestError) {
      if (run !== lookupRunRef.current) return null
      if (requestError.status === 401) onSessionExpired?.()
      setError(requestError.message)
      return null
    } finally {
      if (run === lookupRunRef.current) setBusy('')
    }
  }

  async function startReminder() {
    setGuidedReminder(false)
    setView('compose')
    setLastIntent('PREPARE_AREA_REMINDER')
    setFeedbackStatus('')
    setPreview(null)
    setReviewed(false)
    setResult(null)
    setError('')
    const rows = await loadDistributions()
    if (!rows) return
    const usable = rows.filter((row) => ['DRAFT', 'OPEN'].includes(row.status))
    if (!form.distributionId && usable[0]) {
      setForm((current) => ({ ...current, distributionId: usable[0].distributionId }))
      await loadServiceAreas(usable[0].distributionId)
    }
  }

  async function loadServiceAreas(distributionId, requestedArea) {
    const run = ++lookupRunRef.current
    if (!distributionId) {
      setServiceAreas([])
      return
    }
    setBusy('areas')
    setError('')
    try {
      const schedules = await allPages((page) => requestDistributionSchedules(accessToken, distributionId, page), 'schedules')
      if (run !== lookupRunRef.current) return
      const areas = [...new Set(schedules.map((schedule) => schedule.beneficiary?.sitioPurok?.trim()).filter(Boolean))]
        .sort((left, right) => left.localeCompare(right, 'en-PH'))
      setServiceAreas(areas)
      setForm((current) => ({ ...current, serviceArea: requestedArea !== undefined ? resolveServiceArea(requestedArea, areas) : areas.includes(current.serviceArea) ? current.serviceArea : guidedReminder ? UNRESOLVED_AREA : '' }))
    } catch (requestError) {
      if (run !== lookupRunRef.current) return
      if (requestError.status === 401) onSessionExpired?.()
      setError(requestError.message)
      setServiceAreas([])
    } finally {
      if (run === lookupRunRef.current) setBusy('')
    }
  }

  function reminderPayload() {
    return reminderRequest(form)
  }

  async function handlePreview(event) {
    event.preventDefault()
    if (busy) return
    setError('')
    setReviewed(false)
    if (!form.distributionId) return setError('Choose a distribution event before previewing recipients.')
    if (form.messageTemplate.trim().length < 10) return setError('Write a reminder containing at least 10 characters.')
    if (form.deliveryMode === 'scheduled' && !form.sendAt) return setError('Choose when the reminder should be queued.')

    setBusy('preview')
    try {
      const request = reminderPayload()
      const data = await previewAssistantDistributionReminder(accessToken, form.distributionId, request)
      if (form.deliveryMode === 'scheduled' && (!data.checkedAt || new Date(reminderPayload().sendAt) <= new Date(data.checkedAt))) throw new Error('The requested queue time has passed according to the server. Choose a future Philippine date and time.')
      setPreview(confirmationSnapshot({ ...data, distributionId: form.distributionId }, request))
      setUncertain(false)
      setView('preview')
    } catch (requestError) {
      if (requestError.status === 401) onSessionExpired?.()
      setError(requestError.message)
    } finally {
      setBusy('')
    }
  }

  async function confirmReminder() {
    if (!preview || !reviewed || busy || submittingRef.current) return
    submittingRef.current = true
    setBusy('confirm')
    setError('')
    const request = { ...preview.request, approvalId: preview.approvalId, confirmed: true, expectedRecipientCount: preview.recipientCount, expectedPreviewHash: preview.previewHash }
    rememberConfirmation({ kind: 'reminder', approvalId: preview.approvalId, distributionId: preview.distributionId, request })
    try {
      const data = await enqueueAssistantDistributionReminder(accessToken, preview.distributionId, request)
      setResult({ kind: 'reminder', ...data })
      setPendingTask(null)
      setUncertain(false)
      rememberConfirmation(null)
      setLastIntent('PREPARE_AREA_REMINDER')
      setFeedbackStatus('')
      setView('success')
    } catch (requestError) {
      if (requestError.status === 401) onSessionExpired?.()
      const unknown = uncertainConfirmation(requestError)
      setUncertain(unknown)
      setError(unknown ? retryConfirmationMessage : requestError.message)
      if (!unknown) { rememberConfirmation(null); setPreview(null); setReviewed(false); setView('compose') }
    } finally {
      submittingRef.current = false
      setBusy('')
    }
  }

  function rememberConfirmation(attempt) {
    pendingConfirmation(user?.userId, attempt)
    setRecovery(attempt)
  }

  async function recoverConfirmation() {
    if (!recovery || submittingRef.current) return
    submittingRef.current = true
    setBusy('confirm')
    setError('')
    try {
      const outcome = recovery.kind === 'distribution'
        ? { kind: 'distribution', distribution: await confirmAssistantDistribution(accessToken, recovery.request, recovery.approvalId) }
        : { kind: 'reminder', ...await enqueueAssistantDistributionReminder(accessToken, recovery.distributionId, recovery.request, recovery.approvalId) }
      rememberConfirmation(null)
      setPendingTask(null)
      setResult(outcome)
      setView('success')
    } catch (requestError) {
      if (requestError.status === 401) onSessionExpired?.()
      setError(uncertainConfirmation(requestError) ? retryConfirmationMessage : requestError.message)
      if (!uncertainConfirmation(requestError)) rememberConfirmation(null)
    } finally { submittingRef.current = false; setBusy('') }
  }

  function navigate(path) {
    closeAssistant()
    onNavigate?.(path)
  }

  function taskMessage(content) {
    setMessages((current) => [...current, { role: 'assistant', content, local: true }])
    setExternalAiUsed(null)
  }

  function keepTaskDetails(update) {
    setPendingTask(update.task)
    setDetailError(update.error)
    if (!update.error) setEditingDetail('')
    taskMessage(update.error || taskReply(update.task, language))
  }

  function beginTask(kind, content = '') {
    if (pendingTask) return taskMessage(translated(detailCopy.switch, language))
    if (kind === 'distributionDraft' && user?.role !== 'SYSTEM_ADMIN') return
    setLastIntent(kind === 'reminder' ? 'PREPARE_AREA_REMINDER' : 'CREATE_DISTRIBUTION_DRAFT')
    setFeedbackStatus('')
    setError('')
    keepTaskDetails(collectTaskDetails({ kind, values: {} }, content, { initial: true }))
  }

  function cancelTask() {
    setPendingTask(null)
    setEditingDetail('')
    setDetailError('')
    taskMessage(translated(detailCopy.cancelled, language))
    requestAnimationFrame(() => document.getElementById('garantiyaid-ai-message')?.focus())
  }

  async function previewTask() {
    if (!pendingTask || nextTaskField(pendingTask) || busy) return
    if (pendingTask.kind === 'distributionDraft') return setView('scheduler')
    setGuidedReminder(true)
    setPreview(null)
    setReviewed(false)
    setError('')
    setView('compose')
    setForm(reminderFormFromTask(pendingTask.values, []))
    setServiceAreas([])
    const rows = await loadDistributions()
    if (!rows) return
    const mapped = reminderFormFromTask(pendingTask.values, rows.filter((row) => ['DRAFT', 'OPEN'].includes(row.status)))
    setForm(mapped)
    if (mapped.distributionId) await loadServiceAreas(mapped.distributionId, pendingTask.values.serviceArea)
  }

  function backFromPreview(values) {
    if (pendingTask && values) setPendingTask((task) => ({ ...task, values }))
    setEditingDetail('')
    setDetailError('')
    resetWorkflow()
  }

  function backFromReminder() {
    backFromPreview(guidedReminder ? {
      ...pendingTask.values,
      distribution: selectedDistribution?.title || pendingTask.values.distribution,
      distributionId: form.distributionId,
      serviceArea: form.serviceArea === UNRESOLVED_AREA ? pendingTask.values.serviceArea : form.serviceArea || 'All scheduled service areas',
      messageTemplate: form.messageTemplate, deliveryMode: form.deliveryMode,
      ...(form.deliveryMode === 'scheduled' ? { date: form.sendAt.slice(0, 10), startTime: form.sendAt.slice(11, 16) } : {}),
    } : undefined)
  }

  async function reloadReminderChoices() {
    const rows = await loadDistributions()
    if (rows && form.distributionId) await loadServiceAreas(form.distributionId, form.serviceArea === UNRESOLVED_AREA ? pendingTask?.values.serviceArea : form.serviceArea || 'All scheduled service areas')
  }

  async function sendChat(event) {
    event.preventDefault()
    const content = chatInput.trim()
    if (!content || busy || chatRequestRef.current) return
    const classifiedIntent = messageIntent(content, user?.role)
    const guidanceDuringTask = pendingTask && isTaskQuestion(content)
    const intent = guidanceDuringTask && !['greeting', 'schedule', 'delivery', 'beneficiary', 'help'].includes(classifiedIntent) ? 'help' : classifiedIntent
    setMessages((current) => [...current, { role: 'user', content, local: Boolean(pendingTask || ['reminder', 'distributionDraft'].includes(intent)) }])
    setLastIntent(intent.replace(/([A-Z])/g, '_$1').toUpperCase())
    setFeedbackStatus('')
    setChatInput('')
    setError('')
    if (pendingTask) {
      if (isTaskCancellation(content)) return cancelTask()
      if (intent === 'cancel') return taskMessage(routingReplies.cancel[language])
      if (['reminder', 'distributionDraft'].includes(intent) && intent !== pendingTask.kind) return taskMessage(translated(detailCopy.switch, language))
      if (!guidanceDuringTask) return keepTaskDetails(collectTaskDetails(pendingTask, content, { key: editingDetail || nextTaskField(pendingTask)?.key, initial: intent === pendingTask.kind }))
    }
    if (routingReplies[intent]) {
      setMessages((current) => [...current, { role: 'assistant', content: routingReplies[intent][language] }])
      setExternalAiUsed(null)
      return
    }
    if (intent === 'reminder' || intent === 'distributionDraft') return beginTask(intent, content)
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
        history: messages.filter((message) => !message.local).slice(-6).map((message) => ({ role: message.role, content: message.content.slice(0, 1000) })),
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
    lookupRunRef.current += 1
    setView('home')
    setPreview(null)
    setReviewed(false)
    setResult(null)
    setFeedbackStatus('')
    setError('')
  }

  return (
    <>
      {(
        <section id="garantiyaid-ai-panel" hidden={!open} style={open ? undefined : { display: 'none' }} ref={panelRef} role="dialog" aria-modal="false" aria-labelledby="garantiyaid-ai-title" className="fixed inset-x-3 bottom-3 top-[5.5rem] z-[60] flex flex-col overflow-hidden rounded-2xl border border-line bg-white shadow-lg sm:inset-x-auto sm:bottom-6 sm:right-6 sm:top-auto sm:h-[min(44rem,calc(100dvh-7rem))] sm:w-[min(29rem,calc(100vw-3rem))]">
          <header className="shrink-0 border-b border-blue-900/20 bg-brand-navy px-4 py-3 text-white">
            <div className="flex items-center gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white shadow-sm">
                <img src="/GarantiyAid-AI-logo.svg" alt="" width="64" height="64" className="size-9" />
              </span>
              <div className="min-w-0 flex-1">
                <h2 id="garantiyaid-ai-title" className="whitespace-nowrap text-base font-bold">GarantiyAid AI</h2>
                <p className="mt-1 truncate text-xs text-blue-100">{STAFF_ROLE_LABELS[user?.role] ?? 'Authorized staff'}</p>
              </div>
              <button ref={closeRef} type="button" onClick={closeAssistant} aria-label="Close GarantiyAid AI" className="grid size-11 shrink-0 place-items-center rounded-lg text-blue-100 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
                <Icon name="close" />
              </button>
            </div>
            <div className="mt-2 flex items-center justify-between gap-3 border-t border-white/10 pt-2">
              <span role="status" className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${recovery ? 'bg-amber-300/15 text-amber-100' : 'bg-emerald-400/15 text-emerald-100'}`}><span aria-hidden="true" className="size-1.5 rounded-full bg-current" />{busy === 'chat' ? 'Thinking' : recovery ? 'Result pending' : 'Ready to help'}</span>
              <label className="sr-only" htmlFor="staff-ai-language">Assistant language</label>
              <select id="staff-ai-language" value={language} onChange={(event) => setLanguage(event.target.value)} className="min-h-11 w-28 rounded-lg border border-white/20 bg-white/10 px-2 text-xs font-bold text-white outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
                {Object.entries(LANGUAGE_LABELS).map(([value, label]) => <option key={value} value={value} className="text-ink">{label}</option>)}
              </select>
            </div>
          </header>

          <div ref={contentRef} data-assistant-content className="min-h-0 flex-1 overflow-y-auto bg-page p-4">
            {view === 'home' && (
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <img src="/GarantiyAid-AI-logo.svg" alt="" width="64" height="64" className="mt-1 size-8 shrink-0" />
                  <div className="max-w-[85%] rounded-2xl rounded-tl-md border border-line bg-white px-4 py-3 text-sm leading-6 text-copy shadow-sm">
                    <p className="font-bold text-ink">{language === 'en' ? 'Good day' : language === 'fil' ? 'Magandang araw' : 'Maayong adlaw'}, {user?.fullName?.split(' ')[0] || 'Staff'}.</p>
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
                {pendingTask && <AssistantTaskDetails task={pendingTask} editing={editingDetail} onEdit={(key) => { setEditingDetail(key); setDetailError('') }} onSave={(key, value) => keepTaskDetails(setTaskValue(pendingTask, key, value))} onCancel={cancelTask} onPreview={previewTask} language={language} error={detailError} busy={Boolean(busy)} />}
                <p role="status" className="sr-only">{busy !== 'chat' && messages.at(-1)?.role === 'assistant' ? messages.at(-1).content : ''}</p>
                <div ref={messageEndRef} />

                {!pendingTask && <fieldset disabled={busy === 'chat'} className="min-w-0 border-0 pt-2 disabled:opacity-60">
                  <p className="text-xs font-bold uppercase tracking-[0.1em] text-muted-copy">Suggested actions</p>
                  <div className="mt-3 grid gap-2">
                    {user?.role === 'SYSTEM_ADMIN' && (
                      <button type="button" onClick={() => beginTask('distributionDraft')} className="flex min-h-14 w-full items-center gap-3 rounded-xl border border-blue-200 bg-info-soft px-4 text-left font-bold text-brand-blue transition-[background-color,border-color,transform] hover:-translate-y-0.5 hover:border-brand-blue hover:bg-blue-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue motion-reduce:transform-none">
                        <Icon name="calendar" className="size-5 shrink-0" />
                        <span className="flex-1">Draft a distribution event</span>
                        <Icon name="chevronRight" className="size-4" />
                      </button>
                    )}
                    <button type="button" onClick={() => beginTask('reminder')} className="flex min-h-14 w-full items-center gap-3 rounded-xl border border-blue-200 bg-info-soft px-4 text-left font-bold text-brand-blue transition-[background-color,border-color,transform] hover:-translate-y-0.5 hover:border-brand-blue hover:bg-blue-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue motion-reduce:transform-none">
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
                  <details className="mt-3 text-sm"><summary className="min-h-11 cursor-pointer rounded-lg py-3 font-semibold text-muted-copy focus-visible:outline-2 focus-visible:outline-brand-blue">Use an existing form</summary><div className="grid gap-2 pt-2">{user?.role === 'SYSTEM_ADMIN' && <button type="button" onClick={() => setView('scheduler')} className="ga-btn-secondary">Distribution form</button>}<button type="button" onClick={startReminder} className="ga-btn-secondary">Reminder form</button></div></details>
                </fieldset>}
                {messages.length > 0 && <AssistantFeedback busy={feedbackBusy || busy === 'chat'} status={feedbackStatus} onRate={submitFeedback} />}
              </div>
            )}

            {view === 'scheduler' && user?.role === 'SYSTEM_ADMIN' && (
              <AssistantDistributionScheduler
                accessToken={accessToken}
                onBack={backFromPreview}
                taskDetails={pendingTask?.kind === 'distributionDraft' ? pendingTask.values : undefined}
                onPendingConfirmation={rememberConfirmation}
                onSessionExpired={onSessionExpired}
                onDone={(distribution) => {
                  setPendingTask(null)
                  setResult({ kind: 'distribution', distribution })
                  setLastIntent('CREATE_DISTRIBUTION_DRAFT')
                  setFeedbackStatus('')
                  setView('success')
                }}
              />
            )}

            {view === 'compose' && (
              <form onSubmit={handlePreview} className="space-y-5" noValidate>
                <fieldset disabled={Boolean(busy)} className="min-w-0 space-y-5 border-0 p-0 disabled:opacity-60">
                <legend className="sr-only">Reminder details</legend>
                <div>
                  <button type="button" onClick={backFromReminder} className="inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm font-bold text-brand-blue hover:bg-info-soft focus-visible:outline-2 focus-visible:outline-brand-blue"><Icon name="arrowLeft" className="size-4" /> {guidedReminder ? 'Collected details' : 'Assistant home'}</button>
                  <p className="mt-2 text-xs font-bold uppercase tracking-[0.1em] text-brand-blue">Guided workflow</p>
                  <h3 className="mt-1 text-xl font-bold text-ink">Prepare area reminder</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-copy">Only active, scheduled beneficiaries with valid Philippine mobile numbers will be included.</p>
                </div>

                {guidedReminder && <div className="rounded-xl border border-blue-200 bg-info-soft p-4 text-sm leading-6 text-copy"><p className="font-bold text-ink">Match your requested event and area</p><p>Event: {pendingTask.values.distribution}. Area: {pendingTask.values.serviceArea}.</p><p className="mt-1">Only a unique exact match is selected. Choose any unmatched record below, then review before confirming.</p></div>}

                <div>
                  <label htmlFor="ai-distribution" className="ga-label">Distribution event</label>
                  <select id="ai-distribution" required value={form.distributionId} disabled={busy === 'distributions'} onChange={(event) => { const distributionId = event.target.value; setForm((current) => ({ ...current, distributionId, serviceArea: UNRESOLVED_AREA })); void loadServiceAreas(distributionId, guidedReminder ? pendingTask.values.serviceArea : undefined) }} className="ga-input mt-2">
                    <option value="">Choose an event</option>
                    {visibleDistributions.map((distribution) => <option key={distribution.distributionId} value={distribution.distributionId}>{formatEvent(distribution)}</option>)}
                  </select>
                  {selectedDistribution && <p className="mt-2 flex items-center gap-2 text-xs leading-5 text-muted-copy"><Icon name="location" className="size-4 shrink-0" />{selectedDistribution.barangay?.barangayName} · {selectedDistribution.location}</p>}
                </div>

                <div>
                  <label htmlFor="ai-service-area" className="ga-label">Sitio / Purok</label>
                  <select id="ai-service-area" value={form.serviceArea} disabled={!form.distributionId || busy === 'areas'} onChange={(event) => setForm((current) => ({ ...current, serviceArea: event.target.value }))} className="ga-input mt-2">
                    <option value={UNRESOLVED_AREA}>Choose the recipient area</option>
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

                {form.deliveryMode === 'scheduled' && <div><label htmlFor="ai-send-at" className="ga-label">Queue date and time (PHT)</label><input id="ai-send-at" type="datetime-local" required value={form.sendAt} onChange={(event) => setForm((current) => ({ ...current, sendAt: event.target.value }))} className="ga-input mt-2" /><p className="mt-2 text-xs text-muted-copy">Philippine time, regardless of your device time zone. Must be before every selected beneficiary’s session.</p></div>}

                <div>
                  <div className="flex items-end justify-between gap-3"><label htmlFor="ai-message" className="ga-label">SMS message template</label><span className="text-xs tabular-nums text-muted-copy">{form.messageTemplate.length}/320</span></div>
                  <textarea id="ai-message" required maxLength="320" rows="6" value={form.messageTemplate} onChange={(event) => setForm((current) => ({ ...current, messageTemplate: event.target.value }))} aria-describedby="ai-message-help" className="ga-input mt-2 min-h-36 resize-y py-3" />
                  <p id="ai-message-help" className="mt-2 text-xs leading-5 text-muted-copy">Personalize with {'{beneficiary}'}, {'{distribution}'}, {'{date}'}, {'{time}'}, {'{location}'}, and {'{queue}'}.</p>
                </div>

                {error && <div role="alert" className="rounded-xl border border-red-200 bg-danger-soft p-4 text-sm font-semibold text-brand-red"><p>{error}</p><p className="mt-1 font-normal">Review the fields and try again.</p></div>}

                </fieldset>
                {busy && <p role="status" className="text-sm text-muted-copy"><LoadingLabel>{busy === 'preview' ? 'Checking recipients...' : 'Loading authorized records...'}</LoadingLabel></p>}
                {error && <button type="button" onClick={reloadReminderChoices} disabled={Boolean(busy)} className="ga-btn-secondary w-full">Reload event choices</button>}
                <button type="submit" disabled={Boolean(busy) || !form.distributionId || form.serviceArea === UNRESOLVED_AREA} className="ga-btn-primary w-full">{busy === 'preview' ? <LoadingLabel>Checking recipients...</LoadingLabel> : 'Preview recipients and message'}</button>
              </form>
            )}

            {view === 'preview' && preview && (
              <div className="space-y-5">
                <div>
                  <button type="button" disabled={Boolean(busy) || uncertain} onClick={() => { setView('compose'); setPreview(null); setReviewed(false); setError('') }} className="inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm font-bold text-brand-blue hover:bg-info-soft focus-visible:outline-2 focus-visible:outline-brand-blue"><Icon name="arrowLeft" className="size-4" /> Edit reminder</button>
                  <p className="mt-2 text-xs font-bold uppercase tracking-[0.1em] text-brand-green">Secure preview</p>
                  <h3 className="mt-1 text-xl font-bold text-ink">Review before queueing</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-copy">{uncertain ? 'The previous confirmation may have completed. Recover its result below.' : 'No message has been queued yet.'}</p>
                </div>

                <dl className="space-y-3 rounded-xl border border-line bg-white p-4 text-sm"><div><dt className="text-muted-copy">Distribution event</dt><dd className="mt-1 font-bold text-ink">{preview.distribution?.title || selectedDistribution?.title}</dd></div><div><dt className="text-muted-copy">Recipient area</dt><dd className="mt-1 font-bold text-ink">{form.serviceArea || 'All scheduled service areas'}</dd></div><div><dt className="text-muted-copy">Queue timing</dt><dd className="mt-1 font-bold text-ink">{form.deliveryMode === 'scheduled' ? formatPreviewTime(`${form.sendAt}:00+08:00`) : 'Immediately after confirmation (server time)'}</dd></div></dl>

                <dl className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-emerald-200 bg-success-soft p-4"><dt className="text-xs font-bold text-brand-green">Recipients</dt><dd className="mt-1 text-2xl font-bold tabular-nums text-ink">{preview.recipientCount}</dd></div>
                  <div className="rounded-xl border border-amber-200 bg-warning-soft p-4"><dt className="text-xs font-bold text-brand-amber">Excluded</dt><dd className="mt-1 text-2xl font-bold tabular-nums text-ink">{preview.excludedCount}</dd></div>
                </dl>
                {preview.checkedAt && <p className="text-xs text-muted-copy">Checked {formatPreviewTime(preview.checkedAt)}</p>}

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

                <p className="rounded-xl border border-blue-200 bg-info-soft p-4 text-sm leading-6 text-copy">This approval covers the displayed recipients, message, and queue timing. It expires {formatPreviewTime(preview.approvalExpiresAt)}. SMS delivery is currently simulated.</p>
                <label className="flex min-h-12 cursor-pointer items-start gap-3 rounded-xl border border-line bg-white p-4 text-sm leading-6 text-copy"><input type="checkbox" checked={reviewed} disabled={Boolean(busy) || uncertain} onChange={(event) => setReviewed(event.target.checked)} className="mt-1 size-5 shrink-0 accent-brand-blue" /><span>I reviewed the recipients, message, delivery time, and official-event details.</span></label>

                {error && <div role="alert" className="rounded-xl border border-red-200 bg-danger-soft p-4 text-sm font-semibold text-brand-red">{error}</div>}
                <button type="button" onClick={confirmReminder} disabled={!reviewed || preview.recipientCount === 0 || Boolean(busy)} className="ga-btn-primary w-full">{busy === 'confirm' ? <LoadingLabel>Confirming reminders...</LoadingLabel> : uncertain ? 'Retry same confirmation' : `Confirm and queue ${preview.recipientCount} reminder${preview.recipientCount === 1 ? '' : 's'}`}</button>
              </div>
            )}

            {view === 'recovery' && (
              <div className="space-y-4 py-4">
                <span aria-hidden="true" className="grid size-12 place-items-center rounded-xl border border-blue-200 bg-info-soft text-brand-blue"><Icon name="info" className="size-6" /></span>
                <div><p className="text-xs font-bold uppercase tracking-[0.1em] text-brand-blue">Confirmation pending</p><h3 className="mt-2 text-xl font-bold text-ink">Recover your confirmation</h3></div>
                <p className="text-sm leading-6 text-copy">A previous confirmation did not finish on this screen. Recover its result before starting another task. This uses the original approval to prevent duplicate records.</p>
                {recovery && <dl className="space-y-3 rounded-xl border border-line bg-white p-4 text-sm"><div><dt className="text-muted-copy">Approved action</dt><dd className="mt-1 break-words font-bold text-ink">{recovery.kind === 'distribution' ? recovery.request.title : 'Queue distribution reminders'}</dd></div><div><dt className="text-muted-copy">Confirmation reference</dt><dd className="mt-1 break-all font-mono text-xs text-copy">{recovery.approvalId}</dd></div></dl>}
                {error && <p role="alert" className="rounded-xl border border-red-200 bg-danger-soft p-4 text-sm text-brand-red">{error}</p>}
                {recovery ? (
                  <button type="button" onClick={recoverConfirmation} disabled={Boolean(busy)} className="ga-btn-primary w-full">{busy ? <LoadingLabel>Recovering result...</LoadingLabel> : 'Recover previous confirmation'}</button>
                ) : (
                  <><p className="text-sm text-muted-copy">Review distribution or delivery records before preparing another request if the previous approval is unavailable.</p><button type="button" onClick={resetWorkflow} className="ga-btn-secondary w-full">Back to assistant</button></>
                )}
              </div>
            )}

            {view === 'success' && result && (
              <div className="flex min-h-full flex-col justify-center py-6 text-center">
                <span aria-hidden="true" className="mx-auto grid size-16 place-items-center rounded-full bg-success-soft text-brand-green"><Icon name="check" className="size-8" strokeWidth={2.4} /></span>
                <p className="mt-5 text-xs font-bold uppercase tracking-[0.1em] text-brand-green">{result.kind === 'distribution' ? 'Draft created' : 'Reminder approved'}</p>
                <h3 className="mt-2 text-2xl font-bold text-ink">{result.kind === 'distribution' ? result.distribution.title : `${result.queuedCount} reminder${result.queuedCount === 1 ? '' : 's'} queued`}</h3>
                <p className="mt-2 break-all text-xs text-muted-copy">Reference: {result.kind === 'distribution' ? result.distribution.distributionId : result.approvalId}</p>
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
