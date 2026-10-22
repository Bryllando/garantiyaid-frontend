import { lazy, Suspense, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react'
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
import { useAssistantHistory } from './use-assistant-history.js'
import AssistantHistory, { HistorySaveStatus } from './AssistantHistory.jsx'
import './staff-assistant.css'

const AssistantMessage = lazy(() => import('./AssistantMessage.js'))

const DEFAULT_MESSAGE = 'GarantiyAid Notice: {beneficiary}, scheduled ka sa {distribution} sa {date}, {time}, sa {location}. Queue #{queue}. Dal-a ang QR credential ug valid ID. Dili transferable ang notice.'

const LANGUAGE_LABELS = { en: 'English', fil: 'Filipino', ceb: 'Cebuano' }

const roleExperience = {
  SYSTEM_ADMIN: {
    greeting: {
      en: 'Ask how to use GarantiyAid, prepare a distribution draft, or write a reminder. You review each task before confirming it.',
      fil: 'Magtanong tungkol sa GarantiyAid, maghanda ng distribution draft, o gumawa ng paalala. Susuriin mo muna ang bawat gawain bago kumpirmahin.',
      ceb: 'Pangutana bahin sa GarantiyAid, pag-andam og distribution draft, o paghimo og reminder. Imong i-review ang matag task sa dili pa kumpirmahon.',
    },
  },
  DSWD_STAFF: {
    greeting: {
      en: 'Ask how to use your DSWD tools or prepare a reminder for scheduled beneficiaries. You review reminders before confirming them.',
      fil: 'Magtanong tungkol sa mga gawain ng DSWD o maghanda ng paalala para sa mga nakaiskedyul na benepisyaryo. Suriin muna bago kumpirmahin.',
      ceb: 'Pangutana bahin sa DSWD tools o pag-andam og reminder para sa naka-schedule nga beneficiaries. I-review una sa dili pa kumpirmahon.',
    },
  },
  BARANGAY_FACILITATOR: {
    greeting: {
      en: 'I can prepare reminders only for scheduled beneficiaries in your assigned Barangay.',
      fil: 'Makapaghanda ako ng reminder para lamang sa scheduled beneficiaries sa iyong Barangay.',
      ceb: 'Makahimo ko og reminder para ra sa scheduled beneficiaries sa imong Barangay.',
    },
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
    <div className="ga-assistant-feedback" role="group" aria-label="Was this helpful?">
      <button type="button" disabled={busy || status === 'saved'} onClick={() => onRate('HELPFUL')} aria-label="Helpful" title="Helpful" className="ga-assistant-copy"><Icon name="thumbsUp" className="size-4" /></button>
      <button type="button" disabled={busy || status === 'saved'} onClick={() => onRate('NEEDS_IMPROVEMENT')} aria-label="Needs improvement" title="Needs improvement" className="ga-assistant-copy"><Icon name="thumbsUp" className="size-4 rotate-180" /></button>
      {status && <p role="status" className={`text-xs ${status === 'saved' ? 'text-brand-green' : 'text-brand-red'}`}>{status === 'saved' ? 'Thanks for your feedback.' : status}</p>}
    </div>
  )
}

function StaffAiAssistant({ active = false, compact = false, onExpand, onCompact, onMinimize, accessToken, onNavigate, onSessionExpired, user, historyHandle }) {
  const { history, store: historyStore, conversation, setMessages, setChatInput, setLanguage } = useAssistantHistory({ user, accessToken, active, onSessionExpired })
  useImperativeHandle(historyHandle, () => ({ hasUnsaved: historyStore.hasUnsaved, flush: historyStore.flush }), [historyStore])
  const { activeId } = history
  const { messages, input: chatInput, language } = conversation
  const [historyOpen, setHistoryOpen] = useState(false)
  const [restoredTask, setRestoredTask] = useState(Boolean(conversation.unfinished))
  const [copyStatus, setCopyStatus] = useState(null)
  const [showLatest, setShowLatest] = useState(false)
  const [recovery, setRecovery] = useState(() => pendingConfirmation(user?.userId))
  const [view, setView] = useState(() => pendingConfirmation(user?.userId) ? 'recovery' : 'home')
  const [streamingText, setStreamingText] = useState('')
  const [chatStatus, setChatStatus] = useState('thinking')
  const [lastIntent, setLastIntent] = useState('GUIDANCE')
  const [feedbackBusy, setFeedbackBusy] = useState(false)
  const [feedbackStatus, setFeedbackStatus] = useState('')
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
  const [chatNotice, setChatNotice] = useState('')
  const [result, setResult] = useState(null)
  const [pendingTask, setPendingTask] = useState(null)
  const [editingDetail, setEditingDetail] = useState('')
  const [detailError, setDetailError] = useState('')
  const [guidedReminder, setGuidedReminder] = useState(false)
  const [uncertain, setUncertain] = useState(false)
  const submittingRef = useRef(false)
  const contentRef = useRef(null)
  const readingRef = useRef(null)
  const readingPositionRef = useRef({ top: 0, following: true })
  const panelRef = useRef(null)
  const backdropRef = useRef(null)
  const transitionBoundsRef = useRef(null)
  const exitCleanupRef = useRef(null)
  const inputRef = useRef(null)
  const historyButtonRef = useRef(null)
  const historyRef = useRef(null)
  const chatRequestRef = useRef(null)
  const lookupRunRef = useRef(0)
  const experience = roleExperience[user?.role] ?? roleExperience.BARANGAY_FACILITATOR
  const selectedDistribution = distributions.find((row) => row.distributionId === form.distributionId)
  const taskInProgress = Boolean(pendingTask || recovery || !['home', 'success'].includes(view))
  const conversationLocked = Boolean(busy || feedbackBusy || taskInProgress || history.working || !history.ready)
  const previousTaskRef = useRef(false)

  const visibleDistributions = useMemo(() => distributions.filter((row) => ['DRAFT', 'OPEN'].includes(row.status)), [distributions])

  useLayoutEffect(() => {
    const panel = panelRef.current
    const from = transitionBoundsRef.current
    transitionBoundsRef.current = null
    if (!active || !panel) return
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    if (reducedMotion.matches) return
    const to = panel.getBoundingClientRect()
    const radius = getComputedStyle(panel).borderRadius
    let animation
    if (from && to.width && to.height) {
      panel.dataset.animating = 'true'
      // Isolate layout to this panel so the real surface and readable content move together.
      animation = panel.animate([
        { left: `${from.left}px`, top: `${from.top}px`, width: `${from.width}px`, height: `${from.height}px`, borderRadius: from.radius },
        { left: `${to.left}px`, top: `${to.top}px`, width: `${to.width}px`, height: `${to.height}px`, borderRadius: radius },
      ], { duration: compact ? 260 : 300, fill: 'both', easing: 'cubic-bezier(.22, 1, .36, 1)' })
    } else {
      const travel = Math.max(0, Math.min(8, window.innerHeight - to.bottom - 1))
      animation = panel.animate([{ transform: `translateY(${travel}px)` }, { transform: 'none' }], { duration: 160, easing: 'ease-out' })
    }
    const stop = () => {
      animation.onfinish = null
      animation.cancel()
      delete panel.dataset.animating
    }
    animation.onfinish = stop
    reducedMotion.addEventListener('change', stop)
    window.addEventListener('resize', stop)
    return () => {
      stop()
      reducedMotion.removeEventListener('change', stop)
      window.removeEventListener('resize', stop)
    }
  }, [active, compact])

  useLayoutEffect(() => () => exitCleanupRef.current?.(), [active, compact])

  function rememberWindowBounds() {
    const bounds = panelRef.current.getBoundingClientRect()
    transitionBoundsRef.current = { left: bounds.left, top: bounds.top, width: bounds.width, height: bounds.height, radius: getComputedStyle(panelRef.current).borderRadius }
  }

  function resizeConversation() {
    if (exitCleanupRef.current) return
    rememberWindowBounds()
    if (compact) onExpand?.()
    else onCompact?.()
  }

  function minimizeConversation() {
    if (exitCleanupRef.current) return
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    if (reducedMotion.matches) { onMinimize?.(); return }
    const panel = panelRef.current
    const travel = compact ? Math.max(0, Math.min(8, window.innerHeight - panel.getBoundingClientRect().bottom - 1)) : 0
    panel.inert = true
    const timing = { duration: 160, fill: 'forwards', easing: 'ease-in-out' }
    // Clear the chat text before revealing the page to avoid overlapping readable layers.
    const surfaceFade = [{ opacity: 1 }, { opacity: 1, offset: .4 }, { opacity: 0 }]
    const animations = [
      panel.animate(surfaceFade, timing),
      panel.animate([{ transform: 'none' }, { transform: `translateY(${travel}px)` }], timing),
      backdropRef.current.animate(surfaceFade, timing),
      ...[...panel.children].map((child) => child.animate([{ opacity: 1 }, { opacity: 0, offset: .4 }, { opacity: 0 }], timing)),
    ]
    let finished = false
    function finish() {
      if (finished) return
      finished = true
      animations.forEach((animation) => animation.finish())
      // Hold the final frame until React hides the panel; cancelling here flashes it open.
      onMinimize?.()
    }
    animations[0].onfinish = finish
    reducedMotion.addEventListener('change', finish)
    window.addEventListener('resize', finish)
    exitCleanupRef.current = () => {
      finished = true
      animations.forEach((animation) => { animation.onfinish = null; animation.cancel() })
      panel.inert = false
      exitCleanupRef.current = null
      reducedMotion.removeEventListener('change', finish)
      window.removeEventListener('resize', finish)
    }
  }

  useEffect(() => {
    if (!active) return
    const frame = requestAnimationFrame(() => {
      const panel = panelRef.current
      if (panel && !panel.contains(document.activeElement)) panel.focus({ preventScroll: true })
    })
    return () => cancelAnimationFrame(frame)
  }, [active, compact])

  useEffect(() => {
    if (!active) return
    const media = window.matchMedia('(max-width: 639px)')
    let restore = () => {}
    function syncMobileDialog() {
      restore()
      const panel = panelRef.current
      const modal = compact && media.matches
      if (compact) panel.setAttribute('aria-modal', String(modal))
      else panel.removeAttribute('aria-modal')
      if (compact && !modal) { restore = () => {}; return }
      const background = modal ? [...document.querySelectorAll('#staff-navigation, .ga-staff-header')].map((element) => [element, element.inert]) : []
      const dashboard = document.getElementById('dashboard-content')
      const overflow = document.body.style.overflow
      background.forEach(([element]) => { element.inert = true })
      if (modal) dashboard.inert = true
      document.body.style.overflow = 'hidden'
      function keepFocusInside(event) {
        if (panel.querySelector('dialog[open]')) return
        if (event.key !== 'Tab') return
        const controls = [...panel.querySelectorAll('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), a[href], [tabindex="0"]')].filter((element) => element.getClientRects().length > 0)
        const first = controls[0], last = controls.at(-1)
        if (event.shiftKey && (document.activeElement === first || document.activeElement === panel)) { event.preventDefault(); last?.focus() }
        else if (!event.shiftKey && (document.activeElement === last || document.activeElement === panel)) { event.preventDefault(); first?.focus() }
      }
      if (modal) panel.addEventListener('keydown', keepFocusInside)
      restore = () => {
        background.forEach(([element, inert]) => { element.inert = inert })
        if (modal) dashboard.inert = dashboard.getAttribute('aria-hidden') === 'true'
        document.body.style.overflow = overflow
        panel.removeEventListener('keydown', keepFocusInside)
        panel.removeAttribute('aria-modal')
      }
    }
    syncMobileDialog()
    media.addEventListener('change', syncMobileDialog)
    return () => { restore(); media.removeEventListener('change', syncMobileDialog) }
  }, [active, compact])

  useEffect(() => {
    if (taskInProgress || previousTaskRef.current) historyStore.change({ unfinished: taskInProgress })
    previousTaskRef.current = taskInProgress
  }, [historyStore, taskInProgress])

  useLayoutEffect(() => {
    const input = inputRef.current
    if (!active || !input) return
    function fitInput() {
      if (!input.clientWidth) return
      input.style.height = '0px'
      input.style.height = `${Math.min(144, input.scrollHeight)}px`
    }
    fitInput()
    let width = input.clientWidth
    let frame
    const observer = new ResizeObserver(() => {
      if (input.clientWidth !== width) {
        width = input.clientWidth
        cancelAnimationFrame(frame)
        frame = requestAnimationFrame(fitInput)
      }
    })
    observer.observe(input)
    return () => { observer.disconnect(); cancelAnimationFrame(frame) }
  }, [active, chatInput, view, historyOpen])

  useEffect(() => {
    if (active && historyOpen) historyRef.current?.querySelector('input')?.focus()
  }, [active, historyOpen])

  useLayoutEffect(() => {
    const content = contentRef.current
    if (!active || view !== 'home') return
    function restoreReadingPosition() {
      if (!content.clientHeight) return
      const position = readingPositionRef.current
      content.scrollTop = position.following ? (messages.length ? content.scrollHeight : 0) : position.top
      setShowLatest(!position.following && content.scrollHeight - content.scrollTop - content.clientHeight >= 48)
    }
    restoreReadingPosition()
    let frame
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(restoreReadingPosition)
    })
    observer.observe(content)
    observer.observe(readingRef.current)
    return () => { observer.disconnect(); cancelAnimationFrame(frame) }
  }, [active, historyOpen, messages, streamingText, view])

  function rememberReadingPosition() {
    const content = contentRef.current
    if (!content.clientHeight || !active || view !== 'home' || panelRef.current.dataset.animating === 'true') return
    const following = content.scrollHeight - content.scrollTop - content.clientHeight < 48
    readingPositionRef.current = { top: content.scrollTop, following }
    setShowLatest(!following)
  }

  function jumpToLatest() {
    readingPositionRef.current.following = true
    const content = contentRef.current
    content.scrollTop = content.scrollHeight
    setShowLatest(false)
    inputRef.current?.focus({ preventScroll: true })
  }

  useEffect(() => {
    if (!copyStatus) return
    const timer = setTimeout(() => setCopyStatus(null), 3000)
    return () => clearTimeout(timer)
  }, [copyStatus])

  useEffect(() => {
    if (!active || view === 'home') return
    const heading = contentRef.current?.querySelector('[data-assistant-task] h3')
    if (!heading) return
    heading.tabIndex = -1
    contentRef.current.scrollTop += heading.parentElement.getBoundingClientRect().top - contentRef.current.getBoundingClientRect().top - 16
    heading.focus({ preventScroll: true })
  }, [active, view])

  useEffect(() => () => {
    lookupRunRef.current += 1
    chatRequestRef.current?.abort()
    chatRequestRef.current = null
  }, [accessToken])

  function closeHistory() {
    setHistoryOpen(false)
    requestAnimationFrame(() => historyButtonRef.current?.focus())
  }

  async function selectConversation(conversation) {
    if (conversationLocked) return
    const selected = await historyStore.select(conversation.id)
    if (!selected) return
    finishSwitch(selected)
  }

  function finishSwitch(selected) {
    readingPositionRef.current = { top: 0, following: true }
    setShowLatest(false)
    setRestoredTask(Boolean(selected.unfinished))
    setCopyStatus(null)
    setLastIntent('GUIDANCE')
    resetWorkflow()
    setHistoryOpen(false)
    requestAnimationFrame(() => inputRef.current?.focus())
  }

  async function startConversation() {
    if (conversationLocked) return
    const selected = await historyStore.start()
    if (selected) finishSwitch(selected)
  }

  async function copyReply(content, index) {
    try {
      await navigator.clipboard.writeText(content)
      setCopyStatus({ index, copied: true, text: 'Reply copied.' })
    } catch { setCopyStatus({ index, copied: false, text: 'Unable to copy. Select the reply text and copy it manually.' }) }
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
      taskMessage(`${data.queuedCount} reminder(s) queued. Reference: ${data.approvalId}. Open SMS delivery to review the result.`)
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
      taskMessage(outcome.kind === 'distribution' ? `Distribution draft created: ${outcome.distribution.title}. Reference: ${outcome.distribution.distributionId}.` : `${outcome.queuedCount} reminder(s) queued. Reference: ${outcome.approvalId}.`)
      setView('success')
    } catch (requestError) {
      if (requestError.status === 401) onSessionExpired?.()
      setError(uncertainConfirmation(requestError) ? retryConfirmationMessage : requestError.message)
      if (!uncertainConfirmation(requestError)) rememberConfirmation(null)
    } finally { submittingRef.current = false; setBusy('') }
  }

  function navigate(path) {
    onNavigate?.(path)
  }

  function taskMessage(content) {
    readingPositionRef.current.following = true
    setShowLatest(false)
    setMessages((current) => [...current, { role: 'assistant', content, local: true }])
  }

  function keepTaskDetails(update) {
    setPendingTask(update.task)
    setDetailError(update.error)
    if (!update.error) setEditingDetail('')
    taskMessage(update.error || taskReply(update.task, language))
  }

  function beginTask(kind, content = '') {
    if (!history.ready || history.working) return
    if (pendingTask) return taskMessage(translated(detailCopy.switch, language))
    if (kind === 'distributionDraft' && user?.role !== 'SYSTEM_ADMIN') return
    setRestoredTask(false)
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
    if (!history.ready || history.working || !content || busy || chatRequestRef.current) return
    readingPositionRef.current.following = true
    setShowLatest(false)
    const classifiedIntent = messageIntent(content, user?.role)
    const guidanceDuringTask = pendingTask && isTaskQuestion(content)
    const intent = guidanceDuringTask && !['greeting', 'schedule', 'delivery', 'beneficiary', 'help'].includes(classifiedIntent) ? 'help' : classifiedIntent
    setMessages((current) => [...current, { role: 'user', content, local: Boolean(pendingTask || ['reminder', 'distributionDraft'].includes(intent)) }])
    setLastIntent(intent.replace(/([A-Z])/g, '_$1').toUpperCase())
    setFeedbackStatus('')
    setChatInput('')
    setError('')
    setChatNotice('')
    if (pendingTask) {
      if (isTaskCancellation(content)) return cancelTask()
      if (intent === 'cancel') return taskMessage(routingReplies.cancel[language])
      if (['reminder', 'distributionDraft'].includes(intent) && intent !== pendingTask.kind) return taskMessage(translated(detailCopy.switch, language))
      if (!guidanceDuringTask) return keepTaskDetails(collectTaskDetails(pendingTask, content, { key: editingDetail || nextTaskField(pendingTask)?.key, initial: intent === pendingTask.kind }))
    }
    if (routingReplies[intent]) {
      setMessages((current) => [...current, { role: 'assistant', content: routingReplies[intent][language] }])
      return
    }
    if (intent === 'reminder' || intent === 'distributionDraft') return beginTask(intent, content)
    setBusy('chat')
    setError('')
    setStreamingText('')
    setChatStatus('thinking')
    const controller = new AbortController()
    chatRequestRef.current = controller
    let partialReply = ''
    try {
      const data = await requestStaffAssistantMessage(accessToken, {
        language,
        intent: intent.toUpperCase(),
        messageText: content,
        history: messages.filter((message) => !message.local).slice(-6).map((message) => ({ role: message.role, content: message.content.slice(0, 1000) })),
      }, {
        signal: controller.signal,
        onText: (text) => { if (chatRequestRef.current === controller) { partialReply = text; setStreamingText(text) } },
        onStatus: (status) => { if (chatRequestRef.current === controller) setChatStatus(status) },
      })
      if (chatRequestRef.current !== controller) return
      setMessages((current) => [...current, { role: 'assistant', content: data.messageText }])
    } catch (requestError) {
      if (chatRequestRef.current !== controller) return
      if (requestError.status === 401) onSessionExpired?.()
      if (partialReply) setMessages((current) => [...current, { role: 'assistant', content: `${partialReply}\n\n*This reply was interrupted before completion.*`, local: true }])
      if (controller.signal.aborted) setChatNotice('Response stopped. You can send another message.')
      else setError(requestError.name === 'TimeoutError' ? 'The answer took too long. Please try again.' : requestError.message || 'GarantiyAid AI could not answer. Please try again.')
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
    setChatNotice('')
  }

  const languageControl = <>
    <label htmlFor="staff-ai-language" className="sr-only">Assistant language</label>
    <select id="staff-ai-language" value={language} disabled={!history.ready || history.working || Boolean(busy)} onChange={(event) => setLanguage(event.target.value)} className="ga-assistant-language">
      {Object.entries(LANGUAGE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
    </select>
  </>

  return (
    <>
    <div ref={backdropRef} hidden={!active || !compact} aria-hidden="true" className="ga-assistant-backdrop" />
    <section id="garantiyaid-ai-panel" hidden={!active} ref={panelRef} role={compact ? 'dialog' : 'main'} tabIndex={-1} data-route-focus={compact ? undefined : true} style={active ? undefined : { display: 'none' }} aria-labelledby="garantiyaid-ai-title" className="ga-assistant-workspace" data-compact={compact} data-history-open={historyOpen} onKeyDown={(event) => { if (event.key === 'Escape' && !event.defaultPrevented) { event.preventDefault(); if (historyOpen) closeHistory(); else minimizeConversation() } }}>
      <header className="ga-assistant-heading">
        <div className="ga-assistant-identity">
          <img src="/GarantiyAid-AI-logo.svg" alt="" width="36" height="36" />
          <div className="min-w-0"><h1 id="garantiyaid-ai-title" className="text-xl font-semibold text-ink">Staff Assistant</h1>
          <p className="ga-assistant-role">{STAFF_ROLE_LABELS[user?.role] ?? 'Authorized staff'}</p></div>
        </div>
        <div className="ga-assistant-toolbar">
          {view !== 'home' && languageControl}
          <button type="button" onClick={startConversation} disabled={conversationLocked} aria-label="New chat" title={conversationLocked ? 'Finish or cancel the current task before starting a new conversation.' : 'New chat'} className="ga-assistant-tool"><Icon name="pen" /><span className="ga-assistant-tool-label">New chat</span></button>
          <button ref={historyButtonRef} type="button" onClick={() => historyOpen ? closeHistory() : setHistoryOpen(true)} aria-label="History" title="Conversation history" aria-controls="staff-assistant-history" aria-expanded={historyOpen} className="ga-assistant-tool"><Icon name="clock" /><span className="ga-assistant-tool-label">History</span></button>
          <button type="button" onClick={resizeConversation} aria-label={compact ? 'Expand conversation' : 'Use compact window'} title={compact ? 'Expand conversation' : 'Use compact window'} className="ga-assistant-tool ga-assistant-icon-tool"><Icon name={compact ? 'expand' : 'compact'} /></button>
          <button type="button" onClick={minimizeConversation} aria-label="Minimize conversation" title="Minimize to chat button" className="ga-assistant-tool"><Icon name="minimize" /><span className="ga-assistant-tool-label">Minimize</span></button>
        </div>
      </header>

      <div className="ga-assistant-body">
        <div className="ga-assistant-main">
          <div ref={contentRef} onScroll={rememberReadingPosition} data-assistant-content data-empty={messages.length === 0 && view === 'home'} className="ga-assistant-content">
            <div ref={readingRef} className="ga-assistant-reading">
              {messages.length === 0 && view === 'home' && <div className="ga-assistant-welcome">
                <span className="ga-assistant-welcome-mark"><img src="/GarantiyAid-AI-logo.svg" alt="" width="48" height="48" /></span>
                <h2 className="mt-5 text-2xl font-semibold text-ink">{language === 'en' ? 'How can I help with your work?' : language === 'fil' ? 'Paano ako makatutulong sa iyong gawain?' : 'Unsa akong ikatabang sa imong trabaho?'}</h2>
                <p className="mt-3 max-w-2xl text-base leading-7 text-copy">{experience.greeting[language]}</p>
                <div className="ga-assistant-suggestions mt-6 grid gap-3 sm:grid-cols-2">
                  {user?.role === 'SYSTEM_ADMIN' && <button type="button" onClick={() => beginTask('distributionDraft')} className="ga-assistant-suggestion"><Icon name="calendar" /><span><strong>Prepare a distribution draft</strong><small>Provide the program, place, and schedule.</small></span><Icon name="chevronRight" className="size-4" /></button>}
                  <button type="button" onClick={() => beginTask('reminder')} className="ga-assistant-suggestion"><Icon name="smsDelivery" /><span><strong>Prepare a reminder</strong><small>Choose the event, recipients, and message.</small></span><Icon name="chevronRight" className="size-4" /></button>
                </div>
              </div>}

              {(restoredTask || conversation.unfinished && !taskInProgress) && !recovery && <p role="status" className="mb-6 border-l-2 border-brand-blue bg-info-soft p-3 text-sm leading-6 text-copy">Your conversation was restored. The unfinished task needs to be prepared again. Check the official records before submitting a new request.</p>}
              <div className="space-y-7" aria-label="Conversation">
                {messages.map((message, index) => (
                  <article key={`${activeId}-${index}`} className={message.role === 'user' ? 'ga-assistant-user-message' : 'ga-assistant-reply'} aria-label={message.role === 'user' ? 'Your message' : 'Assistant reply'}>
                    {message.role === 'user' ? <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{message.content}</p> : <>
                      <p className="ga-assistant-reply-author"><img src="/GarantiyAid-AI-logo.svg" alt="" width="22" height="22" />GarantiyAid</p>
                      <Suspense fallback={<p className="whitespace-pre-wrap break-words">{message.content}</p>}><AssistantMessage content={message.content} /></Suspense>
                      <div className="ga-assistant-reply-actions">
                        <button type="button" onClick={() => copyReply(message.content, index)} className="ga-assistant-copy" aria-label={`Copy reply ${index + 1}`} title={copyStatus?.index === index && copyStatus.copied ? 'Copied' : 'Copy reply'}><Icon name={copyStatus?.index === index && copyStatus.copied ? 'check' : 'copy'} className="size-4" /></button>
                        {index === messages.length - 1 && !pendingTask && view === 'home' && <AssistantFeedback busy={feedbackBusy || Boolean(busy)} status={feedbackStatus} onRate={submitFeedback} />}
                        {copyStatus?.index === index && <p role="status" className={copyStatus.copied ? 'text-xs text-muted-copy' : 'w-full text-xs text-brand-red'}>{copyStatus.text}</p>}
                      </div>
                    </>}
                  </article>
                ))}
                {busy === 'chat' && <div className="ga-assistant-reply">
                  <p className="ga-assistant-reply-author"><img src="/GarantiyAid-AI-logo.svg" alt="" width="22" height="22" />GarantiyAid</p>
                  {streamingText && <div aria-live="off"><Suspense fallback={<p className="whitespace-pre-wrap break-words">{streamingText}</p>}><AssistantMessage content={streamingText} /></Suspense></div>}
                  <p role="status" className="mt-2 text-sm text-muted-copy"><LoadingLabel>{streamingText ? 'Writing reply...' : chatStatus === 'retrying' ? 'Still working on your answer...' : 'Preparing your answer...'}</LoadingLabel></p>
                </div>}
              </div>
              <p role="status" className="sr-only">{active && busy !== 'chat' && messages.at(-1)?.role === 'assistant' ? messages.at(-1).content : ''}</p>
              {view === 'home' && chatNotice && <p role="status" className="mt-4 text-sm text-muted-copy">{chatNotice}</p>}
              {view === 'home' && error && <p role="alert" className="mt-4 border-l-2 border-brand-red bg-danger-soft p-3 text-sm text-brand-red">{error}</p>}
              {view === 'home' && pendingTask && <div className="mt-6"><AssistantTaskDetails task={pendingTask} editing={editingDetail} onEdit={(key) => { setEditingDetail(key); setDetailError('') }} onSave={(key, value) => keepTaskDetails(setTaskValue(pendingTask, key, value))} onCancel={cancelTask} onPreview={previewTask} language={language} error={detailError} busy={Boolean(busy)} /></div>}
              {view !== 'home' && <div data-assistant-task className="ga-assistant-task">
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
                  taskMessage(`Distribution draft created: ${distribution.title}. Reference: ${distribution.distributionId}. Review it in Distribution events before proceeding.`)
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
              <div className="flex flex-col py-4 text-left">
                <span aria-hidden="true" className="grid size-11 place-items-center rounded-md bg-success-soft text-brand-green"><Icon name="check" className="size-8" strokeWidth={2.4} /></span>
                <p className="mt-5 text-xs font-bold uppercase tracking-[0.1em] text-brand-green">{result.kind === 'distribution' ? 'Draft created' : 'Reminder approved'}</p>
                <h3 className="mt-2 text-2xl font-bold text-ink">{result.kind === 'distribution' ? result.distribution.title : `${result.queuedCount} reminder${result.queuedCount === 1 ? '' : 's'} queued`}</h3>
                <p className="mt-2 break-all text-xs text-muted-copy">Reference: {result.kind === 'distribution' ? result.distribution.distributionId : result.approvalId}</p>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-copy">{result.kind === 'distribution' ? 'The event remains a draft. Review it in Distribution setup before allocating beneficiaries, generating schedules, sending notices, or opening field operations.' : 'The existing notification worker will process the approved records. Current environment: simulated SMS only, so no real phone received a text.'}</p>
                <div className="mt-5 text-left"><AssistantFeedback busy={feedbackBusy} status={feedbackStatus} onRate={submitFeedback} /></div>
                <div className="mt-6 grid gap-3">
                  <button type="button" onClick={() => navigate(result.kind === 'distribution' ? '/distributions/manage' : '/notifications')} className="ga-btn-primary w-full">{result.kind === 'distribution' ? 'Review distribution draft' : 'Review delivery records'}</button>
                  <button type="button" onClick={resetWorkflow} className="ga-btn-secondary w-full">Back to assistant</button>
                </div>
              </div>
            )}
              </div>}
            </div>
          </div>

          {view === 'home' && <div className="ga-assistant-composer">
            {showLatest && <button type="button" onClick={jumpToLatest} className="ga-assistant-latest"><Icon name="chevronDown" className="size-4" />Jump to latest</button>}
            <form onSubmit={sendChat} className="ga-assistant-reading">
              <label htmlFor="garantiyaid-ai-message" className="sr-only">Message Staff Assistant</label>
              <div className="ga-assistant-input">
                <textarea ref={inputRef} id="garantiyaid-ai-message" rows="1" maxLength="300" value={chatInput} disabled={!history.ready || history.working || Boolean(busy) && busy !== 'chat'} onChange={(event) => setChatInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.form?.requestSubmit() } }} placeholder={language === 'ceb' ? 'Isulat ang imong pangutana...' : language === 'fil' ? 'Isulat ang iyong tanong...' : 'Ask anything about your work...'} aria-describedby="assistant-input-help assistant-input-limit" />
                <div className="ga-assistant-composer-options">
                  {languageControl}
                  <span id="assistant-input-limit" className={chatInput.length >= 240 ? 'ga-assistant-input-limit' : 'sr-only'}>{chatInput.length}/300<span className="sr-only"> characters</span></span>
                  {busy === 'chat' ? <button type="button" onClick={() => chatRequestRef.current?.abort()} aria-label="Stop generating answer" className="ga-assistant-send">Stop</button> : <button type="submit" disabled={!history.ready || history.working || !chatInput.trim() || Boolean(busy)} aria-label="Send message" className="ga-assistant-send"><Icon name="arrowRight" className="size-5 -rotate-90" /></button>}
                </div>
              </div>
              <HistorySaveStatus history={history} store={historyStore} />
              <p id="assistant-input-help" className="ga-assistant-input-help">Review AI guidance. Keep passwords and personal records private.</p>
            </form>
          </div>}
        </div>

        <AssistantHistory historyRef={historyRef} open={historyOpen} history={history} store={historyStore} locked={Boolean(busy || feedbackBusy || taskInProgress)} onClose={closeHistory} onSelect={selectConversation} onReset={() => { setRestoredTask(false); setCopyStatus(null); setLastIntent('GUIDANCE'); resetWorkflow() }} />
      </div>
    </section>
    </>
  )
}

export default StaffAiAssistant
