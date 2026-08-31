import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import ClaimSignaturePad from '../components/claims/ClaimSignaturePad.jsx'
import DashboardShell from '../components/layout/DashboardShell.jsx'
import { ConfirmationDialog } from '../components/ui/confirmation-dialog.jsx'
import { Icon } from '../components/ui/icon.jsx'
import { Skeleton } from '../components/ui/skeleton.jsx'
import { LoadingLabel } from '../components/ui/spinner.jsx'
import {
  deleteBiometricEnrollment,
  getAuthErrorMessage,
  isSessionExpiredError,
  recordBiometricConsent,
  requestBeneficiaryList,
  requestBiometricAttempts,
  requestBiometricConsents,
  requestBiometricStatus,
  requestDistributionList,
  requestDistributionSchedules,
  revokeBiometricConsent,
  saveBiometricEnrollment,
  submitClaimSignature,
  verifyBiometricClaim,
} from '../auth/staffAuth.js'

const attemptResults = ['', 'MATCHED', 'NO_MATCH', 'LIVENESS_FAILED', 'CONSENT_INVALID', 'PROFILE_UNAVAILABLE', 'DUPLICATE', 'PROCESSOR_ERROR']
const acceptedCaptureTypes = new Set(['image/jpeg', 'image/jpg', 'image/pjpeg', 'image/jfif', 'image/png', 'image/x-png', 'image/webp'])
const dateFormatter = new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Manila' })
const minimumRetentionDate = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)
const defaultRetentionDate = (() => { const date = new Date(); date.setFullYear(date.getFullYear() + 1); return date.toISOString().slice(0, 10) })()

const humanize = (value = '') => value.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase())
const personName = (person) => [person?.firstName, person?.middleName, person?.lastName].filter(Boolean).join(' ')
const displayDate = (value) => value ? dateFormatter.format(new Date(value)) : 'Not recorded'
function captureFile(form) {
  const file = new FormData(form).get('faceCapture')
  if (!(file instanceof File) || file.size === 0) throw new Error('Choose or capture one clear face image.')
  if (file.size > 5 * 1024 * 1024) throw new Error('The biometric capture must be 5 MB or smaller.')
  if (!acceptedCaptureTypes.has(file.type.toLowerCase()) && !/\.(jpe?g|jfif|png|webp)$/i.test(file.name)) {
    throw new Error('Use a JPG, JPEG, JFIF, PNG, or WebP image.')
  }
  return file
}

function StatusBadge({ value }) {
  const tone = ['ACTIVE', 'ENROLLED', 'MATCHED'].includes(value)
    ? 'ga-status-success'
    : ['REVOKED', 'DECLINED', 'EXPIRED', 'NO_MATCH', 'LIVENESS_FAILED', 'CONSENT_INVALID', 'DUPLICATE', 'PROCESSOR_ERROR'].includes(value)
      ? 'ga-status-danger'
      : ['SCHEDULED', 'CHECKED_IN', 'PROFILE_UNAVAILABLE'].includes(value)
        ? 'ga-status-warning'
        : 'border-line bg-slate-100 text-copy'
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${tone}`}>{humanize(value)}</span>
}

function WorkspaceSkeleton() {
  return (
    <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(22rem,0.75fr)]" role="status" aria-label="Loading biometric workspace" aria-busy="true">
      <div className="ga-card p-6"><Skeleton className="h-12 w-full" /><Skeleton className="mt-5 h-28 w-full" /><Skeleton className="mt-5 h-72 w-full" /></div>
      <div className="space-y-5"><Skeleton className="h-52 rounded-xl" /><Skeleton className="h-64 rounded-xl" /></div>
    </div>
  )
}

function CaptureField({ id, help }) {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const inputRef = useRef(null)
  const streamRef = useRef(null)
  const cameraRequestRef = useRef(0)
  const previewUrlRef = useRef('')
  const [captureState, setCaptureState] = useState('idle')
  const [previewUrl, setPreviewUrl] = useState('')
  const [cameraReady, setCameraReady] = useState(false)
  const [error, setError] = useState('')

  const stopCamera = useCallback(() => {
    cameraRequestRef.current += 1
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    setCameraReady(false)
  }, [])

  const replacePreview = useCallback((url = '') => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
    previewUrlRef.current = url
    setPreviewUrl(url)
    setCaptureState(url ? 'captured' : 'idle')
  }, [])

  const resetCapture = useCallback(() => {
    stopCamera()
    replacePreview()
    if (inputRef.current) inputRef.current.value = ''
    setError('')
  }, [replacePreview, stopCamera])

  useEffect(() => {
    const form = inputRef.current?.form
    form?.addEventListener('reset', resetCapture)
    return () => {
      form?.removeEventListener('reset', resetCapture)
      stopCamera()
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
    }
  }, [resetCapture, stopCamera])

  async function startCamera() {
    setError('')
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Live camera is unavailable here. Open the app through HTTPS or localhost, or upload a current photo instead.')
      return
    }
    stopCamera()
    const requestId = cameraRequestRef.current
    try {
      replacePreview()
      setCaptureState('live')
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 960 } },
      })
      if (requestId !== cameraRequestRef.current || !videoRef.current) {
        stream.getTracks().forEach((track) => track.stop())
        return
      }
      streamRef.current = stream
      videoRef.current.srcObject = stream
    } catch (cameraError) {
      if (requestId !== cameraRequestRef.current) return
      setCaptureState('idle')
      setError(cameraError?.name === 'NotAllowedError'
        ? 'Camera access was blocked. Allow camera permission in the browser, then try again, or upload a current photo.'
        : 'The camera could not be opened. Check that another app is not using it, then try again or upload a photo.')
    }
  }

  function captureFrame() {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video?.videoWidth || !canvas) {
      setError('The camera is still preparing. Keep the face centered and try again in a moment.')
      return
    }
    const scale = Math.min(1, 1280 / video.videoWidth, 960 / video.videoHeight)
    canvas.width = Math.round(video.videoWidth * scale)
    canvas.height = Math.round(video.videoHeight * scale)
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height)
    canvas.toBlob((blob) => {
      if (!blob || !inputRef.current) {
        setError('The live photo could not be captured. Please try again or upload a photo.')
        return
      }
      const file = new File([blob], 'live-face-capture.jpg', { type: 'image/jpeg', lastModified: Date.now() })
      const transfer = new DataTransfer()
      transfer.items.add(file)
      inputRef.current.files = transfer.files
      replacePreview(URL.createObjectURL(file))
      stopCamera()
      setError('')
    }, 'image/jpeg', 0.9)
  }

  function chooseFile(event) {
    const file = event.target.files?.[0]
    stopCamera()
    if (!file) return replacePreview()
    if (file.size > 5 * 1024 * 1024) {
      event.target.value = ''
      replacePreview()
      setError('The selected image is larger than 5 MB. Choose a smaller image.')
      return
    }
    replacePreview(URL.createObjectURL(file))
    setError('')
  }

  return (
    <fieldset aria-describedby={`${id}-help ${id}-status`}>
      <legend className="ga-label">Live face capture</legend>
      <div className="mt-2 overflow-hidden rounded-xl border border-line bg-slate-950 shadow-inner">
        <div className="relative aspect-[4/3] min-h-64 w-full overflow-hidden sm:min-h-80">
          {captureState === 'captured' && previewUrl
            ? <img src={previewUrl} alt="Captured beneficiary face preview" className="h-full w-full object-cover" />
            : <video ref={videoRef} autoPlay muted playsInline onCanPlay={() => setCameraReady(true)} className={`h-full w-full scale-x-[-1] object-cover ${captureState === 'live' ? 'block' : 'hidden'}`} />}
          {captureState === 'idle' && <div className="absolute inset-0 grid place-items-center px-6 text-center text-white"><div><span aria-hidden="true" className="mx-auto grid size-16 place-items-center rounded-full border border-white/20 bg-white/10 text-3xl">●</span><p className="mt-4 text-lg font-bold">Ready for a live identity photo</p><p className="mt-2 max-w-md text-sm leading-6 text-slate-300">Start the front camera and position one beneficiary inside the guide.</p></div></div>}
          {captureState === 'live' && <div aria-hidden="true" className="pointer-events-none absolute inset-[10%] rounded-[45%] border-2 border-dashed border-white/80 shadow-[0_0_0_999px_rgba(2,6,23,0.3)]" />}
          <span className="absolute left-3 top-3 rounded-full bg-slate-950/75 px-3 py-1.5 text-xs font-bold text-white backdrop-blur">{captureState === 'live' ? 'LIVE CAMERA' : captureState === 'captured' ? 'PHOTO CAPTURED' : 'CAMERA OFF'}</span>
        </div>
        <div className="flex flex-col gap-3 border-t border-white/10 bg-slate-900 p-4 sm:flex-row">
          {captureState === 'live'
            ? <button type="button" onClick={captureFrame} disabled={!cameraReady} className="ga-btn-primary min-h-11 flex-1 disabled:cursor-not-allowed disabled:opacity-60">{cameraReady ? 'Capture live photo' : 'Preparing camera…'}</button>
            : <button type="button" onClick={startCamera} className="ga-btn-primary min-h-11 flex-1">{captureState === 'captured' ? 'Retake live photo' : 'Start live camera'}</button>}
          {captureState === 'live' && <button type="button" onClick={resetCapture} className="ga-btn-secondary min-h-11 border-slate-600 bg-slate-800 text-white hover:bg-slate-700">Cancel</button>}
          <label htmlFor={id} className="ga-btn-secondary min-h-11 cursor-pointer border-slate-600 bg-slate-800 text-center text-white hover:bg-slate-700">{captureState === 'captured' ? 'Choose another photo' : 'Upload instead'}</label>
        </div>
      </div>
      <input ref={inputRef} id={id} name="faceCapture" type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.jfif,.png,.webp" capture="user" onChange={chooseFile} className="sr-only" />
      <canvas ref={canvasRef} className="hidden" aria-hidden="true" />
      <p id={`${id}-help`} className="mt-2 text-xs leading-5 text-muted-copy">{help} Live or uploaded JPG, PNG, or WebP; maximum 5 MB.</p>
      <p id={`${id}-status`} aria-live="polite" className="mt-2 text-sm font-semibold text-brand-green">{captureState === 'captured' ? 'Photo ready for AI liveness and face matching.' : ''}</p>
      {error && <p role="alert" className="mt-2 rounded-lg border border-red-200 bg-danger-soft p-3 text-sm font-semibold text-brand-red">{error}</p>}
    </fieldset>
  )
}

function PrivacyAssurance({ processing }) {
  return (
    <details className="ga-disclosure group">
      <summary>
        <span className="flex items-center gap-3"><Icon name="security" className="size-5 text-brand-blue" />Privacy and biometric security</span>
        <Icon name="chevronDown" className="size-4 text-muted-copy transition-transform group-open:rotate-180" />
      </summary>
      <div className="border-t border-line p-5">
        <ul className="space-y-4 text-sm leading-6 text-copy">
          {[
            ['Raw image cleared', 'The live capture buffer is removed after processing.'],
            ['Template encrypted', 'The derived face template is protected and never returned here.'],
            ['Actions audited', 'Consent, enrollment, verification, and deletion are recorded.'],
          ].map(([title, description]) => (
            <li key={title} className="flex gap-3">
              <span aria-hidden="true" className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-success-soft text-brand-green"><Icon name="check" className="size-3.5" strokeWidth={2.5} /></span>
              <span><strong className="text-ink">{title}.</strong> {description}</span>
            </li>
          ))}
        </ul>
        {processing?.simulatedProcessor && <p className="mt-5 rounded-lg border border-amber-200 bg-warning-soft p-4 text-sm leading-6 text-copy"><strong className="text-brand-amber">Capstone test mode:</strong> scores are simulated and are not production identity assurance.</p>}
        {processing && !processing.simulatedProcessor && <p className="mt-5 rounded-lg border border-emerald-200 bg-success-soft p-4 text-sm leading-6 text-copy"><strong className="text-brand-green">AI recognition configured:</strong> {processing.model ?? 'ArcFace'} with anti-spoofing protection.</p>}
      </div>
    </details>
  )
}

function StepList({ heading, steps }) {
  const completed = steps.filter((step) => step.complete).length
  return (
    <section className="ga-card p-5" aria-label={`${heading}: ${completed} of ${steps.length} complete`}>
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-lg font-bold text-ink">{heading}</h2>
        <span className="text-sm font-bold tabular-nums text-brand-blue">{completed}/{steps.length}</span>
      </div>
      <ol className="mt-5 space-y-4 text-sm">
        {steps.map((step, index) => (
          <li key={step.label} className="flex items-center gap-3">
            <span aria-hidden="true" className={`grid size-8 shrink-0 place-items-center rounded-full text-xs font-bold ${step.complete ? 'bg-brand-green text-white' : 'border border-line bg-slate-50 text-muted-copy'}`}>
              {step.complete ? <Icon name="check" className="size-4" strokeWidth={2.5} /> : index + 1}
            </span>
            <span className={step.complete ? 'font-bold text-ink' : 'text-muted-copy'}>{step.label}</span>
          </li>
        ))}
      </ol>
    </section>
  )
}

function CaptureChecklist() {
  return (
    <details className="ga-disclosure group">
      <summary>
        <span className="flex items-center gap-3"><Icon name="camera" className="size-5 text-brand-blue" />Capture checklist</span>
        <Icon name="chevronDown" className="size-4 text-muted-copy transition-transform group-open:rotate-180" />
      </summary>
      <ul className="border-t border-line px-5 py-4 text-sm leading-6 text-copy">
        {['One person centered in the frame', 'Even lighting and full face visible', 'No mask, sunglasses, blur, or screen replay'].map((item) => <li key={item} className="flex gap-3 py-1.5"><Icon name="check" className="mt-1 size-4 shrink-0 text-brand-green" strokeWidth={2.4} />{item}</li>)}
      </ul>
    </details>
  )
}

function BiometricIdentityPage({ session, onLogout, onNavigate, onSessionExpired }) {
  const role = session.user.role
  const canCapture = role === 'SYSTEM_ADMIN' || role === 'BARANGAY_FACILITATOR'
  const [view, setView] = useState(() => new URLSearchParams(window.location.search).get('view') === 'verify' && canCapture ? 'verify' : 'enrollment')
  const [beneficiaries, setBeneficiaries] = useState([])
  const [distributions, setDistributions] = useState([])
  const [beneficiaryId, setBeneficiaryId] = useState(() => new URLSearchParams(window.location.search).get('beneficiary') ?? '')
  const [distributionId, setDistributionId] = useState(() => new URLSearchParams(window.location.search).get('distribution') ?? '')
  const [consents, setConsents] = useState([])
  const [profile, setProfile] = useState(null)
  const [processing, setProcessing] = useState(null)
  const [schedules, setSchedules] = useState([])
  const [attemptData, setAttemptData] = useState(null)
  const [attemptPage, setAttemptPage] = useState(1)
  const [attemptResult, setAttemptResult] = useState('')
  const [verificationResult, setVerificationResult] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingProfile, setIsLoadingProfile] = useState(Boolean(beneficiaryId))
  const [isLoadingAttempts, setIsLoadingAttempts] = useState(Boolean(distributionId))
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [reloadProfile, setReloadProfile] = useState(0)
  const [reloadAttempts, setReloadAttempts] = useState(0)
  const [dialogAction, setDialogAction] = useState(null)

  const handleError = useCallback((error) => {
    if (isSessionExpiredError(error)) return onSessionExpired()
    toast.error(getAuthErrorMessage(error))
  }, [onSessionExpired])

  useEffect(() => {
    let active = true
    Promise.all([
      requestBeneficiaryList(session.accessToken, { page: 1, pageSize: 100, status: 'ACTIVE' }),
      requestDistributionList(session.accessToken, { page: 1, pageSize: 100 }),
    ])
      .then(([beneficiaryData, distributionData]) => {
        if (!active) return
        setBeneficiaries(beneficiaryData.beneficiaries)
        setDistributions(distributionData.distributions)
      })
      .catch(handleError)
      .finally(() => { if (active) setIsLoading(false) })
    return () => { active = false }
  }, [handleError, session.accessToken])

  useEffect(() => {
    if (!beneficiaryId) return undefined
    let active = true
    Promise.all([
      requestBiometricConsents(session.accessToken, beneficiaryId, { page: 1, pageSize: 20 }),
      requestBiometricStatus(session.accessToken, beneficiaryId),
    ])
      .then(([consentData, statusData]) => {
        if (!active) return
        setConsents(consentData.consents)
        setProfile(statusData.biometricProfile)
        setProcessing(statusData.processing)
      })
      .catch(handleError)
      .finally(() => { if (active) setIsLoadingProfile(false) })
    return () => { active = false }
  }, [beneficiaryId, handleError, reloadProfile, session.accessToken])

  useEffect(() => {
    if (!distributionId) return undefined
    let active = true
    requestDistributionSchedules(session.accessToken, distributionId)
      .then((data) => { if (active) setSchedules(data.schedules) })
      .catch(handleError)
    return () => { active = false }
  }, [distributionId, handleError, session.accessToken])

  useEffect(() => {
    if (!distributionId) return undefined
    let active = true
    requestBiometricAttempts(session.accessToken, distributionId, { page: attemptPage, pageSize: 20, result: attemptResult })
      .then((data) => { if (active) setAttemptData(data) })
      .catch(handleError)
      .finally(() => { if (active) setIsLoadingAttempts(false) })
    return () => { active = false }
  }, [attemptPage, attemptResult, distributionId, handleError, reloadAttempts, session.accessToken])

  async function submitConsent(event) {
    event.preventDefault()
    const form = event.currentTarget
    const formData = new FormData(form)
    const consentGiven = formData.get('consentDecision') === 'GRANTED'
    const retentionUntil = new Date(`${formData.get('retentionUntil')}T23:59:59+08:00`).toISOString()
    setIsSubmitting(true)
    try {
      await recordBiometricConsent(session.accessToken, beneficiaryId, { consentVersion: 'v1.0', consentGiven, retentionUntil })
      toast.success(consentGiven ? 'Biometric consent recorded.' : 'Declined consent decision recorded.', { description: consentGiven ? 'The beneficiary may now proceed to protected enrollment.' : 'Biometric enrollment remains blocked.' })
      form.reset()
      setReloadProfile((value) => value + 1)
    } catch (error) { handleError(error) } finally { setIsSubmitting(false) }
  }

  async function submitEnrollment(event) {
    event.preventDefault()
    const form = event.currentTarget
    try {
      const file = captureFile(form)
      const activeConsent = consents.find((consent) => consent.consentStatus === 'ACTIVE')
      if (!activeConsent) throw new Error('Record active biometric consent before enrollment.')
      setIsSubmitting(true)
      const reenroll = Boolean(profile?.biometricId)
      const result = await saveBiometricEnrollment(session.accessToken, beneficiaryId, file, activeConsent.consentId, reenroll)
      toast.success(reenroll ? 'Biometric profile replaced securely.' : 'Biometric enrollment complete.', { description: `Liveness check passed. Processor: ${humanize(result.processing.processorMode)}.` })
      form.reset()
      setReloadProfile((value) => value + 1)
    } catch (error) { handleError(error) } finally { setIsSubmitting(false) }
  }

  async function submitVerification(event) {
    event.preventDefault()
    const form = event.currentTarget
    const selectedSchedule = form.elements.beneficiaryId.value
    try {
      const file = captureFile(form)
      setIsSubmitting(true)
      const result = await verifyBiometricClaim(session.accessToken, distributionId, selectedSchedule, file)
      const beneficiaryName = personName(schedules.find((schedule) => schedule.beneficiaryId === selectedSchedule)?.beneficiary)
      setVerificationResult({ ...result, beneficiaryName })
      if (result.verificationComplete) setSchedules((current) => current.filter((schedule) => schedule.beneficiaryId !== selectedSchedule))
      toast.success(result.verificationComplete ? 'Identity verified and claim completed.' : 'Face verified successfully.', { description: result.nextRequiredVerification === 'SIGNATURE' ? 'Collect the beneficiary signature to complete this claim.' : result.nextRequiredVerification ? `${humanize(result.nextRequiredVerification)} verification is still required.` : 'The result was recorded in the audit trail.' })
      form.reset()
      setReloadAttempts((value) => value + 1)
    } catch (error) {
      setVerificationResult(null)
      handleError(error)
      setReloadAttempts((value) => value + 1)
    } finally { setIsSubmitting(false) }
  }

  async function completeSignature(signature) {
    setIsSubmitting(true)
    try {
      const result = await submitClaimSignature(session.accessToken, distributionId, verificationResult.claim.claimId, signature)
      setVerificationResult((current) => ({ ...result, beneficiaryName: current.beneficiaryName }))
      setSchedules((current) => current.filter((schedule) => schedule.beneficiaryId !== result.claim.beneficiaryId))
      toast.success('Face and signature verification complete.', { description: 'Encrypted signature evidence and the staff attestation were added to the audit trail.' })
    } catch (error) { handleError(error) } finally { setIsSubmitting(false) }
  }

  async function confirmDialog() {
    try {
      if (dialogAction?.type === 'revoke') {
        await revokeBiometricConsent(session.accessToken, beneficiaryId, dialogAction.consentId)
        toast.success('Biometric consent revoked.', { description: 'Verification is blocked until new consent and enrollment are completed.' })
      } else if (dialogAction?.type === 'delete') {
        await deleteBiometricEnrollment(session.accessToken, beneficiaryId)
        toast.success('Biometric template permanently deleted.')
      }
      setDialogAction(null)
      setReloadProfile((value) => value + 1)
    } catch (error) { handleError(error); throw error }
  }

  const selectedBeneficiary = beneficiaries.find((item) => item.beneficiaryId === beneficiaryId)
  const selectedDistribution = distributions.find((item) => item.distributionId === distributionId)
  const activeConsent = consents.find((consent) => consent.consentStatus === 'ACTIVE')
  const verificationDistributions = distributions.filter((item) => item.status === 'OPEN' && item.verificationRequirement !== 'QR')
  const claimCandidates = schedules.filter((schedule) => ['SCHEDULED', 'CHECKED_IN'].includes(schedule.status))
  const tabs = [
    ['enrollment', 'Consent & enrollment'],
    ...(canCapture ? [['verify', 'Claim verification']] : []),
    ['history', 'Attempt history'],
  ]

  return (
    <DashboardShell breadcrumbs={['Operations', 'Identity assurance', 'Biometric identity']} currentPath="/biometrics" onLogout={onLogout} onNavigate={onNavigate} pageTitle="Biometric identity" user={session.user}>
      <header className="flex flex-col gap-5 border-b border-line pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div><p className="ga-eyebrow">Consent-led identity assurance</p><h1 className="ga-page-title">Biometric enrollment and verification</h1><p className="ga-page-copy">Record informed consent, protect biometric enrollment, and verify eligible aid claims within your assigned role.</p></div>
        <span className="inline-flex w-fit items-center gap-2 rounded-full border border-emerald-200 bg-success-soft px-4 py-2 text-sm font-bold text-brand-green"><span aria-hidden="true" className="size-2 rounded-full bg-emerald-500" /> Audited secure workflow</span>
      </header>

      <div className="mt-6 overflow-x-auto border-b border-line" role="tablist" aria-label="Biometric work areas">
        <div className="flex min-w-max gap-1">
          {tabs.map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={view === id} onClick={() => setView(id)} className={`min-h-12 border-b-2 px-4 text-sm font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand-blue ${view === id ? 'border-brand-blue text-brand-blue' : 'border-transparent text-muted-copy hover:border-slate-300 hover:text-ink'}`}>{label}</button>)}
        </div>
      </div>

      {isLoading ? <WorkspaceSkeleton /> : view === 'enrollment' ? (
        <EnrollmentWorkspace beneficiaries={beneficiaries} beneficiaryId={beneficiaryId} setBeneficiaryId={(value) => { setBeneficiaryId(value); setConsents([]); setProfile(null); setProcessing(null); setIsLoadingProfile(Boolean(value)) }} selectedBeneficiary={selectedBeneficiary} consents={consents} profile={profile} processing={processing} activeConsent={activeConsent} canCapture={canCapture} isLoadingProfile={isLoadingProfile} isSubmitting={isSubmitting} onConsent={submitConsent} onEnrollment={submitEnrollment} onRevoke={(consentId) => setDialogAction({ type: 'revoke', consentId })} onDelete={() => setDialogAction({ type: 'delete' })} isAdmin={role === 'SYSTEM_ADMIN'} />
      ) : view === 'verify' ? (
        <VerificationWorkspace distributions={verificationDistributions} distributionId={distributionId} setDistributionId={(value) => { setDistributionId(value); setBeneficiaryId(''); setSchedules([]); setAttemptData(null); setAttemptPage(1); setIsLoadingAttempts(Boolean(value)); setVerificationResult(null) }} beneficiaryId={beneficiaryId} setBeneficiaryId={setBeneficiaryId} selectedDistribution={selectedDistribution} candidates={claimCandidates} isSubmitting={isSubmitting} result={verificationResult} onSubmit={submitVerification} onSignature={completeSignature} onReset={() => setVerificationResult(null)} processing={verificationResult?.biometricVerification ?? processing} />
      ) : (
        <AttemptHistory distributions={distributions} distributionId={distributionId} setDistributionId={(value) => { setDistributionId(value); setSchedules([]); setAttemptData(null); setAttemptPage(1); setIsLoadingAttempts(Boolean(value)) }} resultFilter={attemptResult} setResultFilter={(value) => { setAttemptResult(value); setAttemptPage(1); setIsLoadingAttempts(Boolean(distributionId)) }} data={attemptData} isLoading={isLoadingAttempts} page={attemptPage} setPage={(value) => { setAttemptPage(value); setIsLoadingAttempts(true) }} beneficiaries={beneficiaries} />
      )}

      <ConfirmationDialog open={Boolean(dialogAction)} destructive actionLabel={dialogAction?.type === 'delete' ? 'Delete biometric template' : 'Revoke consent'} title={dialogAction?.type === 'delete' ? 'Permanently delete this biometric template?' : 'Revoke active biometric consent?'} description={dialogAction?.type === 'delete' ? 'This encrypted template cannot be recovered. The beneficiary must consent and enroll again before biometric verification can be used.' : 'The current biometric profile will be revoked immediately and claim verification will be blocked until new consent and enrollment are completed.'} onCancel={() => setDialogAction(null)} onConfirm={confirmDialog} />
    </DashboardShell>
  )
}

function EnrollmentWorkspace({ beneficiaries, beneficiaryId, setBeneficiaryId, selectedBeneficiary, consents, profile, processing, activeConsent, canCapture, isLoadingProfile, isSubmitting, onConsent, onEnrollment, onRevoke, onDelete, isAdmin }) {
  const progress = profile?.biometricStatus === 'ENROLLED' ? 3 : activeConsent ? 2 : beneficiaryId ? 1 : 0
  return (
    <div className="mt-6 grid items-start gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(22rem,0.75fr)]">
      <div className="space-y-5">
        <section className="ga-card p-5 sm:p-6" aria-labelledby="beneficiary-selection-heading">
          <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="ga-eyebrow">Step 1</p><h2 id="beneficiary-selection-heading" className="mt-1 ga-section-heading">Select beneficiary</h2><p className="mt-2 text-sm leading-6 text-muted-copy">Only active records within your authorized data scope are listed.</p></div>{selectedBeneficiary && <StatusBadge value={selectedBeneficiary.status} />}</div>
          <label htmlFor="biometric-beneficiary" className="ga-label mt-5">Beneficiary record</label>
          <select id="biometric-beneficiary" value={beneficiaryId} onChange={(event) => setBeneficiaryId(event.target.value)} className="ga-input mt-2"><option value="">Select an active beneficiary</option>{beneficiaries.map((beneficiary) => <option key={beneficiary.beneficiaryId} value={beneficiary.beneficiaryId}>{personName(beneficiary)} — {beneficiary.barangay?.barangayName ?? 'Assigned barangay'}</option>)}</select>
          {selectedBeneficiary && <dl className="mt-5 grid gap-4 rounded-lg border border-line bg-slate-50 p-4 text-sm sm:grid-cols-3"><Info label="Staff reference" value={selectedBeneficiary.beneficiaryId.slice(0, 8).toUpperCase()} /><Info label="Birth date" value={new Date(selectedBeneficiary.birthDate).toLocaleDateString('en-PH', { dateStyle: 'medium', timeZone: 'Asia/Manila' })} /><Info label="Barangay" value={selectedBeneficiary.barangay?.barangayName ?? 'Assigned scope'} /></dl>}
        </section>

        {!beneficiaryId ? <section className="ga-card border-dashed p-10 text-center"><span aria-hidden="true" className="mx-auto grid size-12 place-items-center rounded-full bg-info-soft text-xl font-black text-brand-blue">1</span><h2 className="mt-4 ga-section-heading">Choose a beneficiary to begin</h2><p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-muted-copy">Consent status and biometric metadata will appear here. No image or biometric template is exposed.</p></section> : isLoadingProfile ? <div className="ga-card p-6" role="status" aria-label="Loading beneficiary biometric status"><Skeleton className="h-8 w-56" /><Skeleton className="mt-5 h-40 w-full" /><Skeleton className="mt-5 h-56 w-full" /></div> : <>
          <section className="ga-card p-5 sm:p-6" aria-labelledby="consent-heading">
            <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="ga-eyebrow">Step 2</p><h2 id="consent-heading" className="mt-1 ga-section-heading">Informed consent</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-copy">Explain the purpose, retention period, voluntary choice, and revocation process before recording the beneficiary's decision.</p></div>{activeConsent ? <StatusBadge value="ACTIVE" /> : <StatusBadge value={consents[0]?.consentStatus ?? 'NOT_RECORDED'} />}</div>
            {activeConsent && <div className="mt-5 flex flex-col gap-4 rounded-lg border border-emerald-200 bg-success-soft p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-bold text-ink">Active consent {activeConsent.consentVersion}</p><p className="mt-1 text-sm text-copy">Retained until {displayDate(activeConsent.retentionUntil)}</p></div><button type="button" onClick={() => onRevoke(activeConsent.consentId)} className="ga-btn-secondary shrink-0 border-red-200 text-brand-red hover:bg-danger-soft">Revoke consent</button></div>}
            <form onSubmit={onConsent} className="mt-5 rounded-lg border border-line bg-slate-50 p-4 sm:p-5">
              <fieldset><legend className="ga-label">Beneficiary decision</legend><div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="flex min-h-14 cursor-pointer items-center gap-3 rounded-lg border border-line bg-white px-4 hover:border-brand-blue"><input type="radio" name="consentDecision" value="GRANTED" required className="size-4 accent-brand-blue" /><span><strong className="block text-sm text-ink">Consent granted</strong><span className="text-xs text-muted-copy">Enrollment may proceed.</span></span></label><label className="flex min-h-14 cursor-pointer items-center gap-3 rounded-lg border border-line bg-white px-4 hover:border-brand-blue"><input type="radio" name="consentDecision" value="DECLINED" required className="size-4 accent-brand-blue" /><span><strong className="block text-sm text-ink">Consent declined</strong><span className="text-xs text-muted-copy">Enrollment stays blocked.</span></span></label></div></fieldset>
              <div className="mt-4"><label htmlFor="biometric-retention" className="ga-label">Decision record retention until</label><input id="biometric-retention" name="retentionUntil" type="date" min={minimumRetentionDate} defaultValue={defaultRetentionDate} required className="ga-input mt-2" /><p className="mt-2 text-xs text-muted-copy">Consent notice v1.0. Recording a new decision revokes any previous active consent and profile.</p></div>
              <button type="submit" disabled={isSubmitting} className="ga-btn-primary mt-5 w-full sm:w-auto">{isSubmitting ? <LoadingLabel>Recording decision...</LoadingLabel> : 'Record consent decision'}</button>
            </form>
          </section>

          <section className="ga-card p-5 sm:p-6" aria-labelledby="capture-heading">
            <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="ga-eyebrow">Step 3</p><h2 id="capture-heading" className="mt-1 ga-section-heading">Protected face enrollment</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-copy">Use a current, well-lit, front-facing capture with one person visible and no face obstruction.</p></div><StatusBadge value={profile?.biometricStatus ?? 'NOT_ENROLLED'} /></div>
            {!canCapture ? <p className="mt-5 rounded-lg border border-blue-200 bg-info-soft p-4 text-sm leading-6 text-copy"><strong className="text-ink">DSWD oversight access:</strong> you can record consent and review metadata. A System Administrator or assigned Barangay Facilitator must complete the physical capture.</p> : !activeConsent ? <p className="mt-5 rounded-lg border border-amber-200 bg-warning-soft p-4 text-sm leading-6 text-copy"><strong className="text-ink">Enrollment locked:</strong> record active consent above before capturing biometric data.</p> : <form onSubmit={onEnrollment} className="mt-5"><CaptureField id="enrollment-face-capture" help="Use the device camera or select a verified capture." /><div className="mt-5 flex flex-col gap-3 sm:flex-row"><button type="submit" disabled={isSubmitting} className="ga-btn-primary flex-1">{isSubmitting ? <LoadingLabel>Running liveness check...</LoadingLabel> : profile?.biometricId ? 'Replace biometric profile' : 'Enroll biometric profile'}</button>{isAdmin && profile?.biometricId && <button type="button" onClick={onDelete} disabled={isSubmitting} className="ga-btn-secondary border-red-200 text-brand-red hover:bg-danger-soft">Delete template</button>}</div></form>}
            {profile?.biometricId && <dl className="mt-5 grid gap-4 border-t border-line pt-5 text-sm sm:grid-cols-3"><Info label="Enrolled" value={displayDate(profile.createdAt)} /><Info label="Successful checks" value={profile.verificationCount ?? 0} /><Info label="Last verified" value={displayDate(profile.lastVerifiedAt)} /></dl>}
          </section>
        </>}
      </div>

      <aside className="space-y-5">
        <StepList heading="Enrollment progress" steps={[
          { label: 'Beneficiary selected', complete: progress >= 1 },
          { label: 'Consent recorded', complete: progress >= 2 },
          { label: 'Face profile enrolled', complete: progress >= 3 },
        ]} />
        <PrivacyAssurance processing={processing} />
      </aside>
    </div>
  )
}

function VerificationWorkspace({ distributions, distributionId, setDistributionId, beneficiaryId, setBeneficiaryId, selectedDistribution, candidates, isSubmitting, result, onSubmit, onSignature, onReset, processing }) {
  const awaitingSignature = result?.nextRequiredVerification === 'SIGNATURE'
  const requiresSignature = selectedDistribution?.verificationRequirement === 'BIOMETRIC_AND_SIGNATURE'
  return (
    <div className="mt-6 grid items-start gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(20rem,0.65fr)]">
      <section className="ga-card overflow-hidden" aria-labelledby="claim-verification-heading">
        <header className="border-b border-line p-5 sm:p-6">
          <p className="ga-eyebrow">On-site verification</p>
          <h2 id="claim-verification-heading" className="mt-1 ga-section-heading">Verify the beneficiary</h2>
          <p className="mt-2 text-sm leading-6 text-muted-copy">Choose the open distribution and scheduled person, then take a live photo.</p>
        </header>

        <div className="p-5 sm:p-6">
          {result?.verificationComplete ? (
            <section role="status" aria-live="polite" className="rounded-xl border border-emerald-200 bg-success-soft p-5 sm:p-6">
              <span aria-hidden="true" className="grid size-12 place-items-center rounded-full bg-brand-green text-white"><Icon name="check" className="size-6" strokeWidth={2.6} /></span>
              <h3 className="mt-4 text-xl font-bold text-ink">Claim verification complete</h3>
              <p className="mt-2 text-sm leading-6 text-copy">{result.claim.verificationMethod === 'BIOMETRIC_AND_SIGNATURE' ? 'The face match, signature, and staff confirmation were secured.' : 'The identity check passed and the attempt was audited.'}</p>
              <dl className="mt-5 grid gap-4 border-t border-emerald-200 pt-5 text-sm sm:grid-cols-2">
                <Info label="Beneficiary" value={result.beneficiaryName} />
                <Info label="Verification" value={humanize(result.claim.verificationMethod)} />
              </dl>
              <button type="button" onClick={onReset} className="ga-btn-primary mt-5 w-full sm:w-auto">Verify next beneficiary</button>
            </section>
          ) : awaitingSignature ? (
            <ClaimSignaturePad beneficiaryName={result.beneficiaryName} busy={isSubmitting} onSubmit={onSignature} />
          ) : (
            <form onSubmit={onSubmit} className="space-y-5">
              <div>
                <label htmlFor="biometric-distribution" className="ga-label">Open distribution</label>
                <select id="biometric-distribution" value={distributionId} onChange={(event) => setDistributionId(event.target.value)} required className="ga-input mt-2">
                  <option value="">Select a distribution</option>
                  {distributions.map((distribution) => <option key={distribution.distributionId} value={distribution.distributionId}>{distribution.title} — {distribution.distributionDate}</option>)}
                </select>
                {distributions.length === 0 && <p className="mt-2 text-sm text-muted-copy">No open biometric distribution is available in your scope.</p>}
              </div>

              {selectedDistribution && (
                <dl className="grid gap-4 rounded-xl border border-line bg-slate-50 p-4 text-sm sm:grid-cols-3">
                  <Info label="Method" value={humanize(selectedDistribution.verificationRequirement)} />
                  <Info label="Location" value={selectedDistribution.location} />
                  <Info label="Service time" value={`${selectedDistribution.startTime}–${selectedDistribution.endTime}`} />
                </dl>
              )}

              <div>
                <label htmlFor="biometric-candidate" className="ga-label">Scheduled beneficiary</label>
                <select id="biometric-candidate" name="beneficiaryId" required disabled={!distributionId} value={beneficiaryId} onChange={(event) => setBeneficiaryId(event.target.value)} className="ga-input mt-2">
                  <option value="">Select a beneficiary</option>
                  {candidates.map((schedule) => <option key={schedule.scheduleId} value={schedule.beneficiaryId}>Queue {schedule.queueNumber} — {personName(schedule.beneficiary)} ({humanize(schedule.status)})</option>)}
                </select>
                {distributionId && candidates.length === 0 && <p className="mt-2 text-sm text-muted-copy">No scheduled or checked-in beneficiary is ready for verification.</p>}
              </div>

              <CaptureField id="verification-face-capture" help="Confirm the beneficiary is present and agrees to the live identity check." />

              <p className="flex gap-3 rounded-lg border border-amber-200 bg-warning-soft p-4 text-sm leading-6 text-copy">
                <Icon name="info" className="mt-0.5 size-5 shrink-0 text-brand-amber" />
                <span><strong className="text-ink">Before capture:</strong> compare the selected schedule with the official beneficiary record.</span>
              </p>

              <button type="submit" disabled={isSubmitting || !distributionId || candidates.length === 0} className="ga-btn-primary w-full">
                {isSubmitting ? <LoadingLabel>Checking liveness and face match...</LoadingLabel> : requiresSignature ? 'Verify face and continue to signature' : 'Verify identity and complete claim'}
              </button>
            </form>
          )}
        </div>
      </section>

      <aside className="space-y-4">
        {requiresSignature && <StepList heading="Claim progress" steps={[
          { label: 'Distribution selected', complete: true },
          { label: 'Face matched', complete: awaitingSignature || result?.verificationComplete },
          { label: 'Signature secured', complete: result?.verificationComplete },
        ]} />}
        <CaptureChecklist />
        <PrivacyAssurance processing={processing} />
      </aside>
    </div>
  )
}

function AttemptHistory({ distributions, distributionId, setDistributionId, resultFilter, setResultFilter, data, isLoading, page, setPage, beneficiaries }) {
  const nameById = new Map(beneficiaries.map((beneficiary) => [beneficiary.beneficiaryId, personName(beneficiary)]))
  return (
    <div className="mt-6 space-y-5">
      <section className="ga-card p-5 sm:p-6"><div><p className="ga-eyebrow">Audited outcomes</p><h2 className="mt-1 ga-section-heading">Biometric verification attempts</h2><p className="mt-2 text-sm leading-6 text-muted-copy">Review result metadata without exposing face captures or biometric templates.</p></div><div className="mt-5 grid gap-3 md:grid-cols-2"><div><label htmlFor="attempt-distribution" className="ga-label">Distribution</label><select id="attempt-distribution" value={distributionId} onChange={(event) => setDistributionId(event.target.value)} className="ga-input mt-2"><option value="">Select a distribution</option>{distributions.map((distribution) => <option key={distribution.distributionId} value={distribution.distributionId}>{distribution.title} — {distribution.distributionDate}</option>)}</select></div><div><label htmlFor="attempt-result" className="ga-label">Result</label><select id="attempt-result" value={resultFilter} onChange={(event) => setResultFilter(event.target.value)} disabled={!distributionId} className="ga-input mt-2">{attemptResults.map((result) => <option key={result || 'ALL'} value={result}>{result ? humanize(result) : 'All results'}</option>)}</select></div></div></section>
      {!distributionId ? <section className="ga-card border-dashed p-10 text-center"><span aria-hidden="true" className="mx-auto grid size-12 place-items-center rounded-full bg-info-soft text-xl font-black text-brand-blue">i</span><h2 className="mt-4 ga-section-heading">Select a distribution</h2><p className="mt-2 text-sm text-muted-copy">Attempt history is scoped to one distribution event at a time.</p></section> : isLoading ? <div className="ga-card p-5" role="status" aria-label="Loading biometric attempts">{Array.from({ length: 5 }, (_, index) => <Skeleton key={index} className="mb-3 h-16 w-full last:mb-0" />)}</div> : <section className="ga-card overflow-hidden" aria-labelledby="attempt-table-heading"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4"><div><h2 id="attempt-table-heading" className="ga-section-heading">Recorded attempts</h2><p className="mt-1 text-sm text-muted-copy">{data?.pagination.total ?? 0} matching {(data?.pagination.total ?? 0) === 1 ? 'attempt' : 'attempts'}</p></div><span className="rounded-full border border-emerald-200 bg-success-soft px-3 py-1.5 text-xs font-bold text-brand-green">No raw captures stored</span></div>{data?.attempts.length === 0 ? <div className="p-10 text-center"><h3 className="font-bold text-ink">No verification attempts found</h3><p className="mt-2 text-sm text-muted-copy">Attempts will appear after biometric claim checks are submitted.</p></div> : <div className="overflow-x-auto"><table className="w-full min-w-[58rem] border-collapse text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-[0.08em] text-muted-copy"><tr><th className="px-5 py-3 font-bold">Beneficiary</th><th className="px-5 py-3 font-bold">Result</th><th className="px-5 py-3 font-bold">Match score</th><th className="px-5 py-3 font-bold">Liveness</th><th className="px-5 py-3 font-bold">Processor</th><th className="px-5 py-3 font-bold">Recorded</th></tr></thead><tbody className="divide-y divide-line">{data?.attempts.map((attempt) => <tr key={attempt.attemptId} className="hover:bg-slate-50"><td className="px-5 py-4"><p className="font-bold text-ink">{nameById.get(attempt.beneficiaryId) ?? 'Scoped beneficiary'}</p><p className="mt-1 font-mono text-xs text-muted-copy">{attempt.beneficiaryId.slice(0, 8)}</p></td><td className="px-5 py-4"><StatusBadge value={attempt.result} /></td><td className="px-5 py-4 tabular-nums text-copy">{attempt.matchScore ?? 'Not run'}</td><td className="px-5 py-4 tabular-nums text-copy">{attempt.livenessScore ?? 'Not run'}</td><td className="px-5 py-4 text-copy">{humanize(attempt.processor)}</td><td className="px-5 py-4 text-copy">{displayDate(attempt.createdAt)}</td></tr>)}</tbody></table></div>}<div className="flex items-center justify-between gap-4 border-t border-line px-5 py-4"><p className="text-sm text-muted-copy">Page {data?.pagination.page ?? 1} of {Math.max(data?.pagination.totalPages ?? 1, 1)}</p><div className="flex gap-2"><button type="button" onClick={() => setPage((value) => value - 1)} disabled={page <= 1} className="ga-btn-secondary min-h-10 px-4 text-sm">Previous</button><button type="button" onClick={() => setPage((value) => value + 1)} disabled={page >= (data?.pagination.totalPages ?? 1)} className="ga-btn-secondary min-h-10 px-4 text-sm">Next</button></div></div></section>}
    </div>
  )
}

function Info({ label, value }) {
  return <div><dt className="text-xs font-bold uppercase tracking-[0.08em] text-muted-copy">{label}</dt><dd className="mt-1 font-bold text-ink">{value ?? 'Not recorded'}</dd></div>
}

export default BiometricIdentityPage
