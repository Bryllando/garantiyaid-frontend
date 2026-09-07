import { useEffect, useRef, useState } from 'react'
import { animate } from 'animejs'
import { createPublicChatbotSession, submitPublicChatbotMessage } from '../../auth/staffAuth.js'
import { Icon } from '../ui/icon.jsx'
import { Spinner } from '../ui/spinner.jsx'

const COPY = {
  en: {
    label: 'English',
    welcome: 'Hello. I can give general guidance about documents, programs, distribution, enrollment, and the claim process.',
    prompts: ['What documents may be required?', 'How does the claim process work?', 'I need staff assistance'],
    placeholder: 'Ask a general assistance question...',
  },
  fil: {
    label: 'Filipino',
    welcome: 'Kumusta. Makapagbibigay ako ng pangkalahatang gabay tungkol sa dokumento, programa, distribusyon, enrollment, at pag-claim.',
    prompts: ['Anong dokumento ang maaaring kailanganin?', 'Paano ang proseso ng pag-claim?', 'Kailangan ko ng tulong ng staff'],
    placeholder: 'Magtanong tungkol sa pangkalahatang serbisyo...',
  },
  ceb: {
    label: 'Cebuano',
    welcome: 'Kumusta. Makahatag ko og kinatibuk-ang giya bahin sa dokumento, programa, distribution, enrollment, ug claim process.',
    prompts: ['Unsang dokumento ang posibleng kinahanglan?', 'Unsaon ang claim process?', 'Kinahanglan ko og tabang sa staff'],
    placeholder: 'Pangutana bahin sa kinatibuk-ang serbisyo...',
  },
}

function BeneficiaryHelpChat() {
  const [open, setOpen] = useState(false)
  const [language, setLanguage] = useState('ceb')
  const [credential, setCredential] = useState(null)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [externalAiUsed, setExternalAiUsed] = useState(false)
  const launcherRef = useRef(null)
  const panelRef = useRef(null)
  const closeRef = useRef(null)
  const endRef = useRef(null)
  const copy = COPY[language]

  useEffect(() => {
    if (!open) return undefined
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches && panelRef.current) {
      animate(panelRef.current, { opacity: [0, 1], y: [20, 0], scale: [0.96, 1], duration: 420, ease: 'outExpo' })
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

  useEffect(() => { endRef.current?.scrollIntoView({ block: 'nearest' }) }, [messages, notice])

  function toggle() {
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches && launcherRef.current) {
      animate(launcherRef.current, { scale: [1, 0.88, 1.08, 1], rotate: [0, -7, 7, 0], duration: 560, ease: 'outExpo' })
    }
    setOpen((current) => !current)
  }

  function close() {
    setOpen(false)
    requestAnimationFrame(() => launcherRef.current?.focus())
  }

  function newChat() {
    setCredential(null)
    setMessages([])
    setInput('')
    setNotice('')
    setError('')
    setExternalAiUsed(false)
  }

  async function send(event, suggestedMessage) {
    event?.preventDefault()
    const messageText = (suggestedMessage ?? input).trim()
    if (!messageText || busy) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      let activeCredential = credential
      if (!activeCredential) {
        const created = await createPublicChatbotSession(language)
        activeCredential = { sessionId: created.session.sessionId, sessionToken: created.sessionToken }
        setCredential(activeCredential)
      }
      const data = await submitPublicChatbotMessage(activeCredential.sessionId, activeCredential.sessionToken, messageText)
      setMessages((current) => [...current, data.userMessage, data.botMessage])
      setExternalAiUsed((current) => current || data.externalAiUsed === true)
      setInput('')
      if (data.inputRedacted) setNotice('Sensitive-looking information was removed before your message was saved.')
      else if (data.escalatedNow) setNotice('This question was referred for safe staff follow-up. Do not add personal identifiers here.')
    } catch (requestError) {
      setError(requestError.message || 'The help assistant could not be reached. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      {open && (
        <section id="beneficiary-help-panel" ref={panelRef} role="dialog" aria-modal="false" aria-labelledby="beneficiary-help-title" className="fixed inset-x-3 bottom-3 top-[5.5rem] z-[60] flex flex-col overflow-hidden rounded-2xl border border-line bg-white shadow-lg sm:inset-x-auto sm:bottom-6 sm:right-6 sm:top-auto sm:h-[min(42rem,calc(100dvh-7rem))] sm:w-[min(28rem,calc(100vw-3rem))]">
          <header className="shrink-0 border-b border-blue-900/20 bg-brand-navy px-4 py-4 text-white">
            <div className="flex items-center gap-3">
              <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-white shadow-sm"><img src="/GarantiyAid-AI-logo.svg" alt="" width="64" height="64" className="size-10" /></span>
              <div className="min-w-0 flex-1"><h2 id="beneficiary-help-title" className="truncate text-base font-bold">GarantiyAid Help</h2><p className="mt-0.5 truncate text-xs text-blue-100">Public guidance · No personal-record access</p></div>
              <button ref={closeRef} type="button" onClick={close} aria-label="Close beneficiary help" className="grid size-11 shrink-0 place-items-center rounded-lg text-blue-100 hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"><Icon name="close" /></button>
            </div>
          </header>

          <div className="flex-1 overflow-y-auto bg-page p-4" aria-live="polite">
            <div className="rounded-xl border border-amber-200 bg-warning-soft p-4 text-sm leading-6 text-copy">
              <p className="flex items-start gap-2 font-bold text-brand-amber"><Icon name="info" className="mt-0.5 size-4 shrink-0" />General guidance only</p>
              <p className="mt-1">This assistant cannot check personal applications, schedules, claims, or eligibility. Never enter passwords, OTP/TOTP codes, QR credentials, biometric data, full ID numbers, or complete contact details.</p>
            </div>

            <div className="mt-4 flex items-center justify-between gap-3">
              <label htmlFor="beneficiary-help-language" className="text-sm font-bold text-ink">Language</label>
              <select id="beneficiary-help-language" value={language} disabled={messages.length > 0} onChange={(event) => setLanguage(event.target.value)} className="ga-input min-h-11 max-w-40 py-2 text-sm">
                {Object.entries(COPY).map(([value, item]) => <option key={value} value={value}>{item.label}</option>)}
              </select>
            </div>

            <div className="mt-4 flex items-start gap-3">
              <img src="/GarantiyAid-AI-logo.svg" alt="" width="64" height="64" className="mt-1 size-8 shrink-0" />
              <p className="max-w-[85%] rounded-2xl rounded-tl-md border border-line bg-white px-4 py-3 text-sm leading-6 text-copy shadow-sm">{copy.welcome}</p>
            </div>

            {messages.map((message) => (
              <div key={message.messageId} className={`mt-3 flex ${message.senderType === 'USER' ? 'justify-end' : 'items-start gap-3'}`}>
                {message.senderType !== 'USER' && <img src="/GarantiyAid-AI-logo.svg" alt="" width="64" height="64" className="mt-1 size-8 shrink-0" />}
                <p className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-6 ${message.senderType === 'USER' ? 'rounded-br-md bg-brand-blue text-white' : 'rounded-tl-md border border-line bg-white text-copy shadow-sm'}`}>{message.messageText}</p>
              </div>
            ))}

            {messages.length === 0 && <div className="mt-5 grid gap-2"><p className="text-xs font-bold uppercase tracking-[0.1em] text-muted-copy">Suggested questions</p>{copy.prompts.map((prompt) => <button key={prompt} type="button" onClick={() => void send(null, prompt)} className="min-h-12 rounded-xl border border-line bg-white px-4 text-left text-sm font-bold text-brand-blue hover:border-blue-200 hover:bg-info-soft focus-visible:outline-2 focus-visible:outline-brand-blue">{prompt}</button>)}</div>}
            {notice && <p role="status" className="mt-4 rounded-xl border border-blue-200 bg-info-soft p-3 text-sm font-semibold text-copy">{notice}</p>}
            {error && <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-danger-soft p-3 text-sm font-semibold text-brand-red">{error}</p>}
            <div ref={endRef} />
          </div>

          <form onSubmit={send} className="shrink-0 border-t border-line bg-white p-3">
            <label htmlFor="beneficiary-help-message" className="sr-only">Ask GarantiyAid Help</label>
            <div className="flex items-end gap-2 rounded-xl border border-slate-300 p-1.5 focus-within:border-brand-blue focus-within:ring-2 focus-within:ring-blue-100">
              <textarea id="beneficiary-help-message" rows="1" maxLength="1000" value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit() } }} placeholder={copy.placeholder} className="max-h-28 min-h-11 min-w-0 flex-1 resize-none bg-transparent px-3 py-2.5 text-base text-ink outline-none placeholder:text-slate-400" />
              <button type="submit" disabled={busy || !input.trim()} aria-label={busy ? 'Sending question' : 'Send question'} className="grid size-11 shrink-0 place-items-center rounded-lg bg-brand-blue text-white hover:bg-brand-blue-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue disabled:opacity-40">{busy ? <Spinner aria-hidden="true" /> : <Icon name="arrowRight" />}</button>
            </div>
            <div className="mt-2 flex items-center justify-between gap-3 text-[0.6875rem] text-muted-copy"><span>{externalAiUsed ? 'AI-assisted wording · No personal records shared' : 'Controlled knowledge · Safe fallback active'}</span>{messages.length > 0 && <button type="button" onClick={newChat} className="min-h-11 rounded-lg px-2 font-bold text-brand-blue hover:bg-info-soft focus-visible:outline-2 focus-visible:outline-brand-blue">New chat</button>}</div>
          </form>
        </section>
      )}

      <button ref={launcherRef} type="button" onClick={toggle} tabIndex={open ? -1 : 0} aria-label={open ? 'Close beneficiary help' : 'Open beneficiary help'} aria-expanded={open} aria-controls="beneficiary-help-panel" className={`fixed bottom-5 right-5 z-[61] grid size-16 place-items-center rounded-full border-2 border-white bg-brand-navy shadow-lg transition-[box-shadow,transform] hover:-translate-y-1 hover:shadow-xl focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-brand-blue motion-reduce:transform-none sm:bottom-7 sm:right-7 ${open ? 'pointer-events-none scale-90 opacity-0' : ''}`}>
        <img src="/GarantiyAid-AI-logo.svg" alt="" width="64" height="64" className="size-14" />
        <span className="sr-only">Beneficiary help assistant</span>
      </button>
    </>
  )
}

export default BeneficiaryHelpChat
