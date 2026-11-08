import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import ClaimSignaturePad from '../components/claims/ClaimSignaturePad.jsx'
import BiometricDuplicateReview from '../components/biometrics/BiometricDuplicateReview.jsx'
import BiometricAttemptReview from '../components/biometrics/BiometricAttemptReview.jsx'
import { biometricAttemptGuidance, biometricHistoryHref, followUpStatuses, readBiometricFollowUps } from '../utils/biometricFollowUp.js'
import BeneficiaryWorkflowNav from '../components/beneficiaries/BeneficiaryWorkflowNav.jsx'
import DashboardShell from '../components/layout/DashboardShell.jsx'
import { ConfirmationDialog } from '../components/ui/confirmation-dialog.jsx'
import { Icon } from '../components/ui/icon.jsx'
import { Skeleton } from '../components/ui/skeleton.jsx'
import { LoadingLabel } from '../components/ui/spinner.jsx'
import { verificationLabels } from '../utils/claimVerification.js'
import {
  deleteBiometricEnrollment,
  getAuthErrorMessage,
  isSessionExpiredError,
  recordBiometricConsent,
  requestBeneficiary,
  requestBeneficiaryList,
  requestBiometricAttempts,
  requestBiometricConsents,
  requestBiometricStatus,
  requestDistribution,
  requestAllDistributions,
  requestDistributionClaim,
  requestDistributionClaims,
  requestAllDistributionSchedules,
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

function savedVerification(claim) {
  if (!claim) return null
  const complete = ['VERIFIED', 'CLAIMED'].includes(claim.claimStatus)
  const reviewRequired = ['VOIDED', 'REJECTED'].includes(claim.claimStatus) || claim.isDuplicateFlag
    || (claim.claimStatus === 'PENDING' && claim.distribution?.status && claim.distribution.status !== 'OPEN')
  if (!complete && !reviewRequired && !claim.biometricVerified) return null
  return {
    claim, beneficiaryName: personName(claim.beneficiary), verificationComplete: complete, reviewRequired,
    nextRequiredVerification: complete || reviewRequired ? null
      : claim.verificationMethod === 'BIOMETRIC_AND_SIGNATURE' && !claim.signatureVerified ? 'SIGNATURE'
        : claim.verificationMethod === 'QR_AND_BIOMETRIC' && !claim.qrVerified ? 'QR' : null,
  }
}

async function loadSavedVerification(token, distributionId, beneficiaryId) {
  let page = 1
  let data
  do {
    data = await requestDistributionClaims(token, distributionId, { search: beneficiaryId, page, pageSize: 100 })
    const claim = data.claims.find((item) => item.beneficiaryId === beneficiaryId)
    if (claim) return savedVerification(claim)
  } while (page++ < data.pagination.totalPages)
  return null
}
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
  const tone = ['ACTIVE', 'ENROLLED', 'MATCHED', 'CLEARED'].includes(value)
    ? 'ga-status-success'
    : ['REVOKED', 'DECLINED', 'EXPIRED', 'DUPLICATE_BLOCKED', 'NO_MATCH', 'LIVENESS_FAILED', 'CONSENT_INVALID', 'DUPLICATE', 'PROCESSOR_ERROR'].includes(value)
      ? 'ga-status-danger'
      : ['SCHEDULED', 'CHECKED_IN', 'PROFILE_UNAVAILABLE', 'PENDING_DUPLICATE_REVIEW'].includes(value)
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

function CaptureField({ id, help, purpose = 'verification', disabled = false }) {
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
    <fieldset disabled={disabled} aria-describedby={`${id}-help ${id}-status`} className="min-w-0">
      <legend className="ga-label">{purpose === 'enrollment' ? 'Reference photo for enrollment' : 'New photo for this claim'}</legend>
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
          <button type="button" onClick={() => inputRef.current?.click()} className="ga-btn-secondary min-h-11 border-slate-600 bg-slate-800 text-white hover:bg-slate-700">{captureState === 'captured' ? 'Choose another photo' : 'Upload instead'}</button>
        </div>
      </div>
      <input ref={inputRef} id={id} name="faceCapture" type="file" tabIndex={-1} aria-label="Beneficiary face image" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.jfif,.png,.webp" capture="user" onChange={chooseFile} className="sr-only" />
      <canvas ref={canvasRef} className="hidden" aria-hidden="true" />
      <p id={`${id}-help`} className="mt-2 text-xs leading-5 text-muted-copy">{help} Live or uploaded JPG, PNG, or WebP; maximum 5 MB.</p>
      <p id={`${id}-status`} aria-live="polite" className="mt-2 text-sm font-semibold text-brand-blue">{captureState === 'captured' ? purpose === 'enrollment' ? 'Photo captured. Use Save face profile below to enroll it.' : 'Photo captured. Use Verify beneficiary identity below to check this claim.' : ''}</p>
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
            ['Duplicate screening', 'New templates are compared only with active, consented profiles before claim use.'],
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
  const canCapture = role === 'BARANGAY_FACILITATOR'
  const canVerify = canCapture || role === 'DSWD_STAFF'
  const canReenroll = role === 'SYSTEM_ADMIN' || canCapture
  const canReviewDuplicates = role === 'SYSTEM_ADMIN' || role === 'DSWD_STAFF'
  const [view, setView] = useState(() => {
    const requested = new URLSearchParams(window.location.search).get('view')
    if (requested === 'verify' && canVerify) return 'verify'
    if (requested === 'duplicates' && canReviewDuplicates) return 'duplicates'
    if (requested === 'history') return 'history'
    return 'enrollment'
  })
  const [beneficiaries, setBeneficiaries] = useState([])
  const [beneficiaryQuery, setBeneficiaryQuery] = useState({ search: '', page: 1 })
  const [beneficiaryReload, setBeneficiaryReload] = useState(0)
  const [beneficiaryResult, setBeneficiaryResult] = useState(null)
  const beneficiaryKey = `${beneficiaryQuery.search}/${beneficiaryQuery.page}/${beneficiaryReload}`
  const currentBeneficiaries = beneficiaryResult?.key === beneficiaryKey ? beneficiaryResult : null
  const [distributions, setDistributions] = useState([])
  const [beneficiaryId, setBeneficiaryId] = useState(() => new URLSearchParams(window.location.search).get('beneficiary') ?? '')
  const [distributionId, setDistributionId] = useState(() => new URLSearchParams(window.location.search).get('distribution') ?? '')
  const [linkedDistributionId] = useState(distributionId)
  const [consents, setConsents] = useState([])
  const [profile, setProfile] = useState(null)
  const [enrollmentError, setEnrollmentError] = useState(null)
  const enrollmentSubmittingRef = useRef(false)
  const [processing, setProcessing] = useState(null)
  const [schedules, setSchedules] = useState([])
  const [scheduleResult, setScheduleResult] = useState(null)
  const [scheduleReload, setScheduleReload] = useState(0)
  const scheduleKey = `${distributionId}/${scheduleReload}`
  const isLoadingSchedules = Boolean(distributionId) && scheduleResult?.key !== scheduleKey
  const scheduleError = scheduleResult?.key === scheduleKey ? scheduleResult.error : ''
  const [attemptData, setAttemptData] = useState(null)
  const [attemptError, setAttemptError] = useState('')
  const [attemptPage, setAttemptPage] = useState(() => { const value = Number(new URLSearchParams(window.location.search).get('page')); return Number.isSafeInteger(value) && value > 0 ? value : 1 })
  const [reviewAttemptId, setReviewAttemptId] = useState(() => role === 'SYSTEM_ADMIN' ? new URLSearchParams(window.location.search).get('attempt') || '' : '')
  const [reviewBeneficiaryId] = useState(() => new URLSearchParams(window.location.search).get('reviewBeneficiary') || '')
  const [attemptResult, setAttemptResult] = useState(() => { const result = new URLSearchParams(window.location.search).get('result'); return attemptResults.includes(result) ? result : '' })
  const [verificationResult, setVerificationResult] = useState(null)
  const [verificationError, setVerificationError] = useState(null)
  const [claimRead, setClaimRead] = useState(null)
  const [claimReload, setClaimReload] = useState(0)
  const claimKey = `${distributionId}/${beneficiaryId}/${claimReload}`
  const loadingClaim = Boolean(distributionId && beneficiaryId) && claimRead?.key !== claimKey
  const claimError = claimRead?.key === claimKey ? claimRead.error : ''
  const [signatureRequest, setSignatureRequest] = useState(null)
  const retryingSignature = Boolean(signatureRequest && signatureRequest.claimId === verificationResult?.claim?.claimId)
  const [isLoading, setIsLoading] = useState(true)
  const [workspaceError, setWorkspaceError] = useState('')
  const [workspaceReload, setWorkspaceReload] = useState(0)
  const [profileResult, setProfileResult] = useState(null)
  const [isLoadingAttempts, setIsLoadingAttempts] = useState(Boolean(distributionId))
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [reloadProfile, setReloadProfile] = useState(0)
  const profileKey = `${beneficiaryId}/${reloadProfile}`
  const isLoadingProfile = Boolean(beneficiaryId) && profileResult?.key !== profileKey
  const profileError = profileResult?.key === profileKey ? profileResult.error : ''
  const [reloadAttempts, setReloadAttempts] = useState(0)
  const [dialogAction, setDialogAction] = useState(null)

  const handleError = useCallback((error) => {
    if (isSessionExpiredError(error)) return onSessionExpired()
    toast.error(getAuthErrorMessage(error))
  }, [onSessionExpired])

  useEffect(() => {
    const url = new URL(window.location.href)
    url.searchParams.set('view', view)
    for (const [key, value] of Object.entries({ distribution: distributionId, beneficiary: beneficiaryId, result: view === 'history' ? attemptResult : '', page: view === 'history' && attemptPage > 1 ? String(attemptPage) : '', attempt: view === 'history' ? reviewAttemptId : '', reviewBeneficiary: view === 'history' && reviewAttemptId ? reviewBeneficiaryId : '' })) {
      if (value) url.searchParams.set(key, value)
      else url.searchParams.delete(key)
    }
    window.history.replaceState({}, '', url)
  }, [attemptPage, attemptResult, beneficiaryId, distributionId, reviewAttemptId, reviewBeneficiaryId, view])

  useEffect(() => {
    let active = true
    requestAllDistributions(session.accessToken)
      .then(async (items) => {
        if (linkedDistributionId && !items.some((item) => item.distributionId === linkedDistributionId)) {
          items = [await requestDistribution(session.accessToken, linkedDistributionId), ...items]
        }
        if (!active) return
        setDistributions(items)
        setWorkspaceError('')
      })
      .catch((error) => { if (active) { setWorkspaceError(getAuthErrorMessage(error)); if (isSessionExpiredError(error)) onSessionExpired() } })
      .finally(() => { if (active) setIsLoading(false) })
    return () => { active = false }
  }, [linkedDistributionId, onSessionExpired, session.accessToken, workspaceReload])

  useEffect(() => {
    let active = true
    requestBeneficiaryList(session.accessToken, { ...beneficiaryQuery, pageSize: 20, status: 'ACTIVE' })
      .then((data) => {
        if (!active) return
        if (beneficiaryQuery.page > Math.max(1, data.pagination.totalPages)) {
          setBeneficiaryQuery({ ...beneficiaryQuery, page: Math.max(1, data.pagination.totalPages) })
          return
        }
        setBeneficiaries(data.beneficiaries)
        setBeneficiaryResult({ key: beneficiaryKey, data })
      })
      .catch((error) => { if (active) { setBeneficiaryResult({ key: beneficiaryKey, error: getAuthErrorMessage(error) }); if (isSessionExpiredError(error)) onSessionExpired() } })
    return () => { active = false }
  }, [beneficiaryKey, beneficiaryQuery, onSessionExpired, session.accessToken])

  useEffect(() => {
    if (!beneficiaryId || view !== 'enrollment') return undefined
    let active = true
    Promise.all([
      requestBeneficiary(session.accessToken, beneficiaryId),
      requestBiometricConsents(session.accessToken, beneficiaryId, { page: 1, pageSize: 20 }),
      requestBiometricStatus(session.accessToken, beneficiaryId),
    ])
      .then(([beneficiary, consentData, statusData]) => {
        if (!active) return
        setConsents(consentData.consents)
        setProfile(statusData.biometricProfile)
        setProcessing(statusData.processing)
        setProfileResult({ key: profileKey, beneficiary })
      })
      .catch((error) => { if (active) { setProfileResult({ key: profileKey, error: getAuthErrorMessage(error) }); if (isSessionExpiredError(error)) onSessionExpired() } })
    return () => { active = false }
  }, [beneficiaryId, onSessionExpired, profileKey, session.accessToken, view])

  useEffect(() => {
    if (!distributionId || !beneficiaryId || view !== 'verify') return undefined
    let active = true
    loadSavedVerification(session.accessToken, distributionId, beneficiaryId)
      .then((result) => { if (active) { setVerificationResult(result); setClaimRead({ key: claimKey }); if (result) setVerificationError(null) } })
      .catch((error) => { if (active) { setClaimRead({ key: claimKey, error: getAuthErrorMessage(error) }); if (isSessionExpiredError(error)) onSessionExpired() } })
    return () => { active = false }
  }, [beneficiaryId, claimKey, distributionId, onSessionExpired, session.accessToken, view])

  useEffect(() => {
    if (!distributionId || view !== 'verify') return undefined
    let active = true
    requestAllDistributionSchedules(session.accessToken, distributionId)
      .then((rows) => { if (active) { setSchedules(rows); setScheduleResult({ key: scheduleKey }) } })
      .catch((error) => { if (active) { setSchedules([]); setScheduleResult({ key: scheduleKey, error: getAuthErrorMessage(error) }); if (isSessionExpiredError(error)) onSessionExpired() } })
    return () => { active = false }
  }, [distributionId, onSessionExpired, scheduleKey, session.accessToken, view])

  useEffect(() => {
    if (!distributionId || reviewAttemptId) return undefined
    let active = true
    requestBiometricAttempts(session.accessToken, distributionId, { page: attemptPage, pageSize: 20, result: attemptResult })
      .then((data) => { if (active) { setAttemptData(data); setAttemptError('') } })
      .catch((error) => { if (active) { setAttemptData(null); setAttemptError(getAuthErrorMessage(error)); if (isSessionExpiredError(error)) onSessionExpired() } })
      .finally(() => { if (active) setIsLoadingAttempts(false) })
    return () => { active = false }
  }, [attemptPage, attemptResult, distributionId, onSessionExpired, reloadAttempts, reviewAttemptId, session.accessToken])

  async function submitConsent(event) {
    event.preventDefault()
    if (isLoadingProfile || profileError || isSubmitting) return
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
    if (isLoadingProfile || profileError || isSubmitting || enrollmentSubmittingRef.current) return
    const form = event.currentTarget
    setEnrollmentError(null)
    try {
      const file = captureFile(form)
      const activeConsent = consents.find((consent) => consent.consentStatus === 'ACTIVE')
      if (!activeConsent) throw new Error('Record active biometric consent before enrollment.')
      enrollmentSubmittingRef.current = true
      setIsSubmitting(true)
      const reenroll = Boolean(profile?.biometricId)
      const result = await saveBiometricEnrollment(session.accessToken, beneficiaryId, file, activeConsent.consentId, reenroll)
      if (result.duplicateReview?.required) {
        toast.warning('Possible duplicate sent for authorized review.', { description: 'The template is encrypted and held from claim use. No unrelated beneficiary details were disclosed.' })
      } else {
        toast.success(reenroll ? 'Biometric profile replaced securely.' : 'Biometric enrollment complete.', { description: `Liveness and duplicate screening passed. Processor: ${humanize(result.processing.processorMode)}.` })
      }
      form.reset()
      setReloadProfile((value) => value + 1)
    } catch (error) {
      if (isSessionExpiredError(error)) return onSessionExpired()
      setEnrollmentError({ beneficiaryId, code: error.code, message: getAuthErrorMessage(error) })
    } finally { enrollmentSubmittingRef.current = false; setIsSubmitting(false) }
  }

  async function submitVerification(event) {
    event.preventDefault()
    if (loadingClaim || claimError || isSubmitting) return
    const form = event.currentTarget
    const selectedSchedule = form.elements.beneficiaryId.value
    setVerificationError(null)
    try {
      const file = captureFile(form)
      setIsSubmitting(true)
      const result = await verifyBiometricClaim(session.accessToken, distributionId, selectedSchedule, file)
      const beneficiaryName = personName(schedules.find((schedule) => schedule.beneficiaryId === selectedSchedule)?.beneficiary)
      setVerificationResult({ ...result, beneficiaryName })
      if (result.verificationComplete) setSchedules((current) => current.filter((schedule) => schedule.beneficiaryId !== selectedSchedule))
      toast.success(result.verificationComplete ? 'Identity verification complete.' : 'Face verified successfully.', { description: result.nextRequiredVerification === 'SIGNATURE' ? 'Collect the beneficiary signature to complete verification.' : result.nextRequiredVerification ? `${humanize(result.nextRequiredVerification)} verification is still required.` : 'Release or wallet credit is still a separate step.' })
      form.reset()
      setReloadAttempts((value) => value + 1)
    } catch (error) {
      setVerificationResult(null)
      if (isSessionExpiredError(error)) return onSessionExpired()
      setVerificationError({ code: error.code, message: getAuthErrorMessage(error) })
      if (!error.status || error.status >= 500 || error.code === 'DUPLICATE_CLAIM') setClaimReload((value) => value + 1)
      setReloadAttempts((value) => value + 1)
    } finally { setIsSubmitting(false) }
  }

  async function completeSignature(signature) {
    if (isSubmitting) return
    const request = retryingSignature ? signatureRequest : { signature, key: crypto.randomUUID(), claimId: verificationResult.claim.claimId }
    setSignatureRequest(request)
    setVerificationError(null)
    setIsSubmitting(true)
    try {
      const result = await submitClaimSignature(session.accessToken, distributionId, request.claimId, request.signature, request.key)
      setVerificationResult((current) => ({ ...result, beneficiaryName: current.beneficiaryName }))
      setSchedules((current) => current.filter((schedule) => schedule.beneficiaryId !== result.claim.beneficiaryId))
      setSignatureRequest(null)
      toast.success('Face and signature verification complete.', { description: 'Encrypted signature evidence and the staff attestation were added to the audit trail.' })
    } catch (error) {
      if (isSessionExpiredError(error)) return onSessionExpired()
      try {
        const claim = await requestDistributionClaim(session.accessToken, distributionId, request.claimId)
        const saved = savedVerification(claim)
        if (claim.signatureVerified || saved?.reviewRequired) {
          setVerificationResult(saved)
          setSignatureRequest(null)
          return
        }
      } catch (readError) { if (isSessionExpiredError(readError)) return onSessionExpired() }
      if (error.status === 400 || error.status === 422) {
        setSignatureRequest(null)
        setVerificationError({ code: error.code, message: getAuthErrorMessage(error) })
      } else {
        setVerificationError({ message: 'The saved signature could not be confirmed. Retry the same signature request; it will not create a second signature.' })
      }
    } finally { setIsSubmitting(false) }
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

  function reviewAttempt(attempt) {
    setReviewAttemptId('')
    if (attempt.result === 'DUPLICATE' && attempt.claimId) {
      onNavigate(`/claim-accountability?distribution=${encodeURIComponent(distributionId)}&claim=${encodeURIComponent(attempt.claimId)}&receipt=manual`)
      return
    } else if (attempt.result === 'DUPLICATE' && canReviewDuplicates) {
      setView('duplicates')
    } else {
      setBeneficiaryId(attempt.beneficiaryId)
      setConsents([])
      setProfile(null)
      setProcessing(null)
      setReloadProfile((value) => value + 1)
      setView('enrollment')
    }
    requestAnimationFrame(() => document.querySelector('[aria-label="Biometric work areas"]')?.scrollIntoView({ block: 'start' }))
  }

  function openAttemptReview(attempt) {
    const href = biometricHistoryHref({ distributionId, result: attemptResult, page: attemptPage })
    onNavigate(`${href}&attempt=${encodeURIComponent(attempt.attemptId)}&reviewBeneficiary=${encodeURIComponent(attempt.beneficiaryId)}`)
  }

  function switchVerificationWorkspace(nextView) {
    setEnrollmentError(null)
    setVerificationError(null)
    setVerificationResult(null)
    setSignatureRequest(null)
    if (nextView === 'enrollment') setReloadProfile((value) => value + 1)
    else setClaimReload((value) => value + 1)
    setView(nextView)
    requestAnimationFrame(() => document.querySelector('[aria-label="Biometric work areas"] [aria-selected="true"]')?.focus())
  }

  const reviewingAttempt = view === 'history' && Boolean(reviewAttemptId) && role === 'SYSTEM_ADMIN'
  const selectedBeneficiary = profileResult?.beneficiary?.beneficiaryId === beneficiaryId ? profileResult.beneficiary : beneficiaries.find((item) => item.beneficiaryId === beneficiaryId)
  const selectedDistribution = distributions.find((item) => item.distributionId === distributionId)
  const activeConsent = consents.find((consent) => consent.consentStatus === 'ACTIVE')
  const verificationDistributions = distributions.filter((item) => item.status === 'OPEN' && item.verificationRequirement !== 'QR')
  const claimCandidates = schedules.filter((schedule) => ['SCHEDULED', 'CHECKED_IN'].includes(schedule.status) && !['VERIFIED', 'CLAIMED', 'VOIDED', 'REJECTED'].includes(schedule.claim?.claimStatus))
  const tabs = [
    ['enrollment', canCapture ? 'Consent & enrollment' : 'Profiles & consent'],
    ...(canVerify ? [['verify', 'Claim verification']] : []),
    ...(canReviewDuplicates ? [['duplicates', 'Duplicate review']] : []),
    ['history', 'Attempt history'],
  ]

  return (
    <DashboardShell breadcrumbs={['Operations', 'Identity assurance', 'Biometric identity']} currentPath="/biometrics" onLogout={onLogout} onNavigate={onNavigate} pageTitle="Biometric identity" showAssistant={view === 'enrollment'} user={session.user}>
      <header className="ga-page-header flex flex-col gap-5 border-b border-line pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div><p className="ga-eyebrow">{reviewingAttempt ? 'Biometric records' : 'Consent-led identity assurance'}</p><h1 className="ga-page-title">{reviewingAttempt ? 'Review biometric attempt' : role === 'SYSTEM_ADMIN' ? 'Biometric records' : 'Biometric identity'}</h1>{!reviewingAttempt && <p className="ga-page-copy">{role === 'SYSTEM_ADMIN' ? 'Review consent and existing face profiles, resolve duplicate exceptions, and inspect attempt history. Re-enrollment is available for an existing profile.' : 'Review consent and biometric records. Enrollment and live claim checks appear according to your role.'}</p>}</div>
      </header>

      {role === 'SYSTEM_ADMIN' && !reviewingAttempt && <BeneficiaryWorkflowNav currentPath="/biometrics" onNavigate={onNavigate} />}

      {!reviewingAttempt && <div className="mt-6 border-b border-line" role="tablist" aria-label="Biometric work areas">
        <div className="flex flex-wrap gap-1">
          {tabs.map(([id, label]) => <button key={id} type="button" role="tab" disabled={isSubmitting} aria-selected={view === id} onClick={() => { setView(id); setReviewAttemptId(''); setEnrollmentError(null) }} className={`min-h-12 border-b-2 px-4 text-sm font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand-blue ${view === id ? 'border-brand-blue text-brand-blue' : 'border-transparent text-muted-copy hover:border-slate-300 hover:text-ink'}`}>{label}</button>)}
        </div>
      </div>}

      {isLoading ? <WorkspaceSkeleton /> : workspaceError ? <section role="alert" className="ga-card mt-6 p-5"><h2 className="ga-section-heading">Biometric workspace could not be loaded</h2><p className="mt-2 text-sm leading-6 text-copy">{workspaceError}</p><button type="button" onClick={() => { setIsLoading(true); setWorkspaceReload((value) => value + 1) }} className="ga-btn-secondary mt-4">Retry workspace</button></section> : view === 'enrollment' ? (
        <EnrollmentWorkspace enrollmentError={enrollmentError?.beneficiaryId === beneficiaryId ? enrollmentError : null} onReturnVerification={canVerify && beneficiaryId && selectedDistribution?.status === 'OPEN' && selectedDistribution.verificationRequirement !== 'QR' ? () => switchVerificationWorkspace('verify') : undefined} beneficiaryQuery={beneficiaryQuery} onQuery={setBeneficiaryQuery} beneficiaryResult={currentBeneficiaries} onRetryBeneficiaries={() => setBeneficiaryReload((value) => value + 1)} profileError={profileError} onRetryProfile={() => { setEnrollmentError(null); setReloadProfile((value) => value + 1) }} beneficiaries={currentBeneficiaries?.data?.beneficiaries || []} beneficiaryId={beneficiaryId} setBeneficiaryId={(value) => { setBeneficiaryId(value); setConsents([]); setProfile(null); setProcessing(null); setEnrollmentError(null) }} selectedBeneficiary={selectedBeneficiary} consents={consents} profile={profile} processing={processing} activeConsent={activeConsent} canCapture={canCapture} canReenroll={canReenroll} isLoadingProfile={isLoadingProfile} isSubmitting={isSubmitting} onConsent={submitConsent} onEnrollment={submitEnrollment} onRevoke={(consentId) => setDialogAction({ type: 'revoke', consentId })} onDelete={() => setDialogAction({ type: 'delete' })} isAdmin={role === 'SYSTEM_ADMIN'} />
      ) : view === 'verify' ? (
        <VerificationWorkspace onManageEnrollment={() => switchVerificationWorkspace('enrollment')} loadingClaim={loadingClaim} claimError={claimError} onRetryClaim={() => setClaimReload((value) => value + 1)} retrySignature={retryingSignature} role={role} onNavigate={onNavigate} verificationError={verificationError} scheduleError={scheduleError} loadingSchedules={isLoadingSchedules} onRetrySchedules={() => setScheduleReload((value) => value + 1)} distributions={verificationDistributions} distributionId={distributionId} setDistributionId={(value) => { setDistributionId(value); setBeneficiaryId(''); setSchedules([]); setAttemptData(null); setAttemptPage(1); setIsLoadingAttempts(Boolean(value)); setVerificationResult(null); setVerificationError(null) }} beneficiaryId={beneficiaryId} setBeneficiaryId={(value) => { setBeneficiaryId(value); setVerificationResult(null); setSignatureRequest(null); setVerificationError(null) }} selectedDistribution={selectedDistribution} candidates={claimCandidates} isSubmitting={isSubmitting} result={verificationResult} onSubmit={submitVerification} onSignature={completeSignature} onReset={() => { setVerificationResult(null); setSignatureRequest(null); setVerificationError(null); setBeneficiaryId('') }} processing={verificationResult?.biometricVerification ?? processing} />
      ) : view === 'duplicates' ? (
        <BiometricDuplicateReview session={session} onSessionExpired={onSessionExpired} />
      ) : reviewAttemptId && role === 'SYSTEM_ADMIN' ? (
        <BiometricAttemptReview key={`${distributionId}:${reviewAttemptId}`} session={session} distributionId={distributionId} beneficiaryId={reviewBeneficiaryId} attemptId={reviewAttemptId} returnHref={biometricHistoryHref({ distributionId, result: attemptResult, page: attemptPage })} onNavigate={onNavigate} onOpenAttempt={openAttemptReview} onSessionExpired={onSessionExpired} />
      ) : (
        <AttemptHistory session={session} onOpenAttempt={role === 'SYSTEM_ADMIN' ? openAttemptReview : undefined} error={attemptError} onRetry={() => { setIsLoadingAttempts(true); setReloadAttempts((value) => value + 1) }} onReview={reviewAttempt} canReviewDuplicates={canReviewDuplicates} distributions={distributions} distributionId={distributionId} setDistributionId={(value) => { setDistributionId(value); setBeneficiaryId(''); setSchedules([]); setAttemptData(null); setAttemptPage(1); setIsLoadingAttempts(Boolean(value)); setVerificationResult(null); setVerificationError(null) }} resultFilter={attemptResult} setResultFilter={(value) => { setAttemptResult(value); setAttemptPage(1); setIsLoadingAttempts(Boolean(distributionId)) }} data={attemptData} isLoading={isLoadingAttempts} page={attemptPage} setPage={(value) => { setAttemptPage(value); setIsLoadingAttempts(true) }} beneficiaries={beneficiaries} />
      )}

      <ConfirmationDialog open={Boolean(dialogAction)} destructive actionLabel={dialogAction?.type === 'delete' ? 'Delete biometric template' : 'Revoke consent'} title={dialogAction?.type === 'delete' ? 'Permanently delete this biometric template?' : 'Revoke active biometric consent?'} description={dialogAction?.type === 'delete' ? 'This encrypted template cannot be recovered. The beneficiary must consent and enroll again before biometric verification can be used.' : 'The current biometric profile will be revoked immediately and claim verification will be blocked until new consent and enrollment are completed.'} onCancel={() => setDialogAction(null)} onConfirm={confirmDialog} />
    </DashboardShell>
  )
}

function EnrollmentWorkspace({ enrollmentError, onReturnVerification, beneficiaryQuery, onQuery, beneficiaryResult, onRetryBeneficiaries, profileError, onRetryProfile, beneficiaries, beneficiaryId, setBeneficiaryId, selectedBeneficiary, consents, profile, processing, activeConsent, canCapture, canReenroll, isLoadingProfile, isSubmitting, onConsent, onEnrollment, onRevoke, onDelete, isAdmin }) {
  const [search, setSearch] = useState(beneficiaryQuery.search)
  const searchRef = useRef(null)
  const enrollmentErrorRef = useRef(null)
  useEffect(() => { if (enrollmentError) enrollmentErrorRef.current?.focus() }, [enrollmentError])
  const options = beneficiaryId && !beneficiaries.some((item) => item.beneficiaryId === beneficiaryId)
    ? [selectedBeneficiary || { beneficiaryId, firstName: 'Selected beneficiary' }, ...beneficiaries] : beneficiaries
  const progress = profile?.biometricStatus === 'ENROLLED' ? 3 : activeConsent ? 2 : beneficiaryId ? 1 : 0
  const duplicateHold = ['PENDING_DUPLICATE_REVIEW', 'DUPLICATE_BLOCKED'].includes(profile?.biometricStatus)
  const profileReady = !isLoadingProfile && !profileError && profile?.biometricStatus === 'ENROLLED' && Boolean(activeConsent)
  return (
    <div className="mt-6 grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(22rem,0.75fr)]">
      <div className="space-y-5">
        {onReturnVerification && <section className="ga-card border-l-2 border-l-brand-blue p-5 sm:p-6" aria-label="Return to claim verification">
          <div className="flex items-start gap-3"><Icon name="biometrics" className="mt-1 size-5 shrink-0 text-brand-blue" /><div><h2 className="ga-section-heading">{profileReady ? 'Face profile ready for the claim check' : 'Enroll a reference profile before the claim check'}</h2><p className="mt-2 text-sm leading-6 text-copy">{profileReady ? 'The reference profile and active consent are saved. Return to the same event and take a new live photo to verify this visit.' : canCapture && activeConsent ? 'Consent is already active. Take one reference photo below and use Save face profile. Then return to this event for the claim-day photo.' : canCapture ? 'Record consent and enroll the selected beneficiary below. Then return to the same event for a new live photo.' : 'The assigned Barangay Facilitator must record consent and enroll the selected beneficiary. Then return to the same event for a new live photo.'} Enrollment does not verify or release a claim.</p></div></div>
          <button type="button" disabled={isSubmitting || isLoadingProfile || Boolean(profileError)} onClick={onReturnVerification} className="ga-btn-secondary mt-4">Return to claim verification<Icon name="arrowRight" className="size-4" /></button>
        </section>}
        <section className="ga-card p-5 sm:p-6" aria-labelledby="beneficiary-selection-heading">
          <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="ga-eyebrow">Step 1</p><h2 id="beneficiary-selection-heading" className="mt-1 ga-section-heading">Select beneficiary</h2><p className="mt-2 text-sm leading-6 text-muted-copy">Only active records within your authorized data scope are listed.</p></div>{selectedBeneficiary && <StatusBadge value={selectedBeneficiary.status} />}</div>
          <form aria-label="Search beneficiaries" onSubmit={(event) => { event.preventDefault(); onQuery({ search: search.trim(), page: 1 }) }} className="mt-5">
            <label htmlFor="biometric-beneficiary-search" className="ga-label">Find beneficiary by name</label>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <div className="relative min-w-0 flex-1 basis-48"><Icon name="search" className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-copy" /><input ref={searchRef} id="biometric-beneficiary-search" type="search" placeholder="Enter beneficiary name" autoComplete="off" maxLength={100} disabled={isSubmitting} value={search} onChange={(event) => setSearch(event.target.value)} className="ga-input pl-11" /></div>
              <button type="submit" disabled={isSubmitting} className="ga-btn-primary"><Icon name="search" className="size-4" />Search beneficiaries</button>
              {beneficiaryQuery.search && <button type="button" disabled={isSubmitting} onClick={() => { setSearch(''); onQuery({ search: '', page: 1 }); searchRef.current?.focus() }} className="ga-btn-secondary"><Icon name="close" className="size-4" />Clear search</button>}
            </div>
          </form>
          <label htmlFor="biometric-beneficiary" className="ga-label mt-5">Beneficiary record</label>
          <select id="biometric-beneficiary" disabled={isSubmitting || !beneficiaryResult || Boolean(beneficiaryResult.error)} value={beneficiaryId} onChange={(event) => setBeneficiaryId(event.target.value)} className="ga-input mt-2"><option value="">Select an active beneficiary</option>{options.map((beneficiary) => <option key={beneficiary.beneficiaryId} value={beneficiary.beneficiaryId}>{personName(beneficiary)} — {beneficiary.barangay?.barangayName ?? 'Assigned barangay'}</option>)}</select>
          {!beneficiaryResult ? <p role="status" className="mt-3 text-sm"><LoadingLabel>Loading beneficiaries...</LoadingLabel></p> : beneficiaryResult.error ? <div role="alert" className="mt-3 text-sm leading-6"><p>{beneficiaryResult.error}</p><button type="button" onClick={onRetryBeneficiaries} className="ga-btn-secondary mt-2">Retry beneficiary list</button></div> : <><p className="mt-3 text-sm text-copy">{beneficiaryResult.data.pagination.total} matching {beneficiaryResult.data.pagination.total === 1 ? 'beneficiary' : 'beneficiaries'}. {beneficiaries.length ? 'Choose a record above. Your selected record stays available while browsing.' : 'Try another name or clear the search.'}</p>{beneficiaryResult.data.pagination.totalPages > 1 && <nav aria-label="Beneficiary result pages" className="mt-3 flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-muted-copy">Page {beneficiaryQuery.page} of {beneficiaryResult.data.pagination.totalPages}</p><div className="flex gap-2"><button type="button" disabled={isSubmitting || beneficiaryQuery.page === 1} onClick={() => onQuery({ ...beneficiaryQuery, page: beneficiaryQuery.page - 1 })} className="ga-btn-secondary">Previous beneficiaries</button><button type="button" disabled={isSubmitting || beneficiaryQuery.page >= beneficiaryResult.data.pagination.totalPages} onClick={() => onQuery({ ...beneficiaryQuery, page: beneficiaryQuery.page + 1 })} className="ga-btn-secondary">Next beneficiaries</button></div></nav>}</>}
          {selectedBeneficiary && <dl className="mt-5 grid gap-4 rounded-lg border border-line bg-slate-50 p-4 text-sm sm:grid-cols-3"><Info label="Staff reference" value={selectedBeneficiary.beneficiaryId.slice(0, 8).toUpperCase()} /><Info label="Birth date" value={new Date(selectedBeneficiary.birthDate).toLocaleDateString('en-PH', { dateStyle: 'medium', timeZone: 'Asia/Manila' })} /><Info label="Barangay" value={selectedBeneficiary.barangay?.barangayName ?? 'Assigned scope'} /></dl>}
        </section>

        {!beneficiaryId ? <section className="ga-card flex items-start gap-4 p-5 sm:p-6"><span className="grid size-11 shrink-0 place-items-center rounded-lg bg-info-soft text-brand-blue"><Icon name="profile" /></span><div className="min-w-0"><h2 className="ga-section-heading">Choose a beneficiary to begin</h2><p className="mt-2 max-w-xl text-sm leading-6 text-copy">Search by name above, then select a beneficiary record to review consent and face-profile status.</p><p className="mt-2 text-xs leading-5 text-muted-copy">Only status and biometric metadata are shown. Face images and templates are not displayed.</p></div></section> : isLoadingProfile ? <div className="ga-card p-6" role="status" aria-label="Loading beneficiary biometric status"><Skeleton className="h-8 w-56" /><Skeleton className="mt-5 h-40 w-full" /><Skeleton className="mt-5 h-56 w-full" /></div> : profileError ? <section role="alert" className="ga-card border-l-2 border-brand-amber p-5"><h2 className="ga-section-heading">Unable to load profile</h2><p className="mt-2 text-sm leading-6">{profileError}</p><p className="mt-2 text-sm leading-6">Consent and enrollment changes are unavailable until the saved record is loaded.</p><button type="button" onClick={onRetryProfile} className="ga-btn-secondary mt-4">Retry profile</button></section> : <>
          <section className="ga-card p-5 sm:p-6" aria-labelledby="consent-heading">
            <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="ga-eyebrow">Step 2</p><h2 id="consent-heading" className="mt-1 ga-section-heading">Informed consent</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-copy">Explain the purpose, retention period, voluntary choice, and revocation process before recording the beneficiary's decision.</p></div>{activeConsent ? <StatusBadge value="ACTIVE" /> : <StatusBadge value={consents[0]?.consentStatus ?? 'NOT_RECORDED'} />}</div>
            {activeConsent && <div className="mt-5 flex flex-col gap-4 rounded-lg border border-emerald-200 bg-success-soft p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-bold text-ink">Active consent {activeConsent.consentVersion}</p><p className="mt-1 text-sm text-copy">Retained until {displayDate(activeConsent.retentionUntil)}</p></div><button type="button" onClick={() => onRevoke(activeConsent.consentId)} className="ga-btn-secondary shrink-0 border-red-200 text-brand-red hover:bg-danger-soft">Revoke consent</button></div>}
            <details open={!activeConsent} className="mt-5"><summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold text-brand-blue">{activeConsent ? 'Change consent decision' : 'Record beneficiary decision'}</summary><form onSubmit={onConsent} className="rounded-lg border border-line bg-slate-50 p-4 sm:p-5">
              <fieldset className="min-w-0"><legend className="ga-label">Beneficiary decision</legend><div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="flex min-h-14 cursor-pointer items-center gap-3 rounded-lg border border-line bg-white px-4 hover:border-brand-blue"><input type="radio" name="consentDecision" value="GRANTED" required className="size-4 accent-brand-blue" /><span><strong className="block text-sm text-ink">Consent granted</strong><span className="text-xs text-muted-copy">Enrollment may proceed.</span></span></label><label className="flex min-h-14 cursor-pointer items-center gap-3 rounded-lg border border-line bg-white px-4 hover:border-brand-blue"><input type="radio" name="consentDecision" value="DECLINED" required className="size-4 accent-brand-blue" /><span><strong className="block text-sm text-ink">Consent declined</strong><span className="text-xs text-muted-copy">Enrollment stays blocked.</span></span></label></div></fieldset>
              <div className="mt-4"><label htmlFor="biometric-retention" className="ga-label">Decision record retention until</label><input id="biometric-retention" name="retentionUntil" type="date" min={minimumRetentionDate} defaultValue={defaultRetentionDate} required className="ga-input mt-2" /><p className="mt-2 text-xs text-muted-copy">Consent notice v1.0. Recording a new decision revokes any previous active consent and profile.</p></div>
              <button type="submit" disabled={isSubmitting} className="ga-btn-primary mt-5 w-full sm:w-auto">{isSubmitting ? <LoadingLabel>Recording decision...</LoadingLabel> : 'Record consent decision'}</button>
            </form></details>
          </section>

          <section className="ga-card p-5 sm:p-6" aria-labelledby="capture-heading">
            <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="ga-eyebrow">Step 3</p><h2 id="capture-heading" className="mt-1 ga-section-heading">Protected face enrollment</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-copy">Use a current, well-lit, front-facing capture with one person visible and no face obstruction.</p></div><StatusBadge value={profile?.biometricStatus ?? 'NOT_ENROLLED'} /></div>
            {!(canCapture || (canReenroll && profile?.biometricId)) ? <p className="mt-5 rounded-lg border border-blue-200 bg-info-soft p-4 text-sm leading-6 text-copy"><strong className="text-ink">Enrollment is assigned to facilitators.</strong> You can review the status and consent; administrators may re-enroll an existing profile.</p> : duplicateHold ? <div className={`mt-5 rounded-xl border p-5 ${profile.biometricStatus === 'DUPLICATE_BLOCKED' ? 'border-red-200 bg-danger-soft' : 'border-amber-200 bg-warning-soft'}`}><p className={`font-extrabold ${profile.biometricStatus === 'DUPLICATE_BLOCKED' ? 'text-brand-red' : 'text-brand-amber'}`}>{profile.biometricStatus === 'DUPLICATE_BLOCKED' ? 'Duplicate profile confirmed' : 'Authorized review pending'}</p><p className="mt-2 text-sm leading-6 text-copy">{profile.biometricStatus === 'DUPLICATE_BLOCKED' ? 'This template cannot be used for claims. A System Administrator must resolve the beneficiary record before any new enrollment.' : 'The similarity scan found another active profile above the configured threshold. Claim verification and replacement are paused while authorized staff review the records.'}</p><p className="mt-3 text-xs font-semibold text-muted-copy">For privacy, facilitators are not shown the matching person or barangay.</p>{isAdmin && <button type="button" onClick={onDelete} disabled={isSubmitting} className="ga-btn-secondary mt-4 border-red-200 text-brand-red hover:bg-danger-soft">Delete held template</button>}</div> : !activeConsent ? <p className="mt-5 rounded-lg border border-amber-200 bg-warning-soft p-4 text-sm leading-6 text-copy"><strong className="text-ink">Enrollment locked:</strong> record active consent above before capturing biometric data.</p> : <form onSubmit={onEnrollment} className="mt-5">{enrollmentError && <div ref={enrollmentErrorRef} tabIndex={-1} role="alert" className="mb-4 rounded-lg border border-amber-200 bg-warning-soft p-4 text-sm leading-6 focus-visible:outline-2 focus-visible:outline-brand-blue"><p className="font-bold text-ink">Face profile was not confirmed</p><p className="mt-1">{enrollmentError.message}</p>{enrollmentError.code === 'BIOMETRIC_SERVICE_UNAVAILABLE' && <p className="mt-2">Your captured photo is still on this screen. Once the service is ready, use Retry saving face profile below. Taking another photo will not fix a service outage.</p>}</div>}<CaptureField id="enrollment-face-capture" purpose="enrollment" disabled={isSubmitting} help="Take one clear reference photo, review it, then save the face profile below." />{isSubmitting && <p role="status" className="mt-3 text-sm leading-6 text-copy">The face service is checking this photo. Keep this page open; no new capture is needed while it processes.</p>}<div className="mt-5 flex flex-col gap-3 sm:flex-row"><button type="submit" disabled={isSubmitting} className="ga-btn-primary flex-1">{isSubmitting ? <LoadingLabel>Saving face profile...</LoadingLabel> : enrollmentError?.code === 'BIOMETRIC_SERVICE_UNAVAILABLE' ? 'Retry saving face profile' : profile?.biometricId ? 'Replace face profile' : 'Save face profile'}</button>{isAdmin && profile?.biometricId && <button type="button" onClick={onDelete} disabled={isSubmitting} className="ga-btn-secondary border-red-200 text-brand-red hover:bg-danger-soft">Delete template</button>}</div></form>}
            {profile?.biometricId && <dl className="mt-5 grid gap-4 border-t border-line pt-5 text-sm sm:grid-cols-3"><Info label="Enrolled" value={displayDate(profile.createdAt)} /><Info label="Successful checks" value={profile.verificationCount ?? 0} /><Info label="Last verified" value={displayDate(profile.lastVerifiedAt)} /></dl>}
          </section>
        </>}
      </div>

      <aside className="space-y-5">
        {!profileError && !isLoadingProfile && <StepList heading={isAdmin ? "Profile checklist" : "Enrollment progress"} steps={[
          { label: 'Beneficiary selected', complete: progress >= 1 },
          { label: 'Consent recorded', complete: progress >= 2 },
          { label: 'Face profile cleared for claims', complete: progress >= 3 },
        ]} />}
        <PrivacyAssurance processing={profileError || isLoadingProfile ? null : processing} />
      </aside>
    </div>
  )
}

function VerificationWorkspace({ onManageEnrollment, loadingClaim, claimError, onRetryClaim, retrySignature, role, onNavigate, verificationError, scheduleError, loadingSchedules, onRetrySchedules, distributions, distributionId, setDistributionId, beneficiaryId, setBeneficiaryId, selectedDistribution, candidates, isSubmitting, result, onSubmit, onSignature, onReset, processing }) {
  const awaitingSignature = result?.nextRequiredVerification === 'SIGNATURE'
  const requiresSignature = selectedDistribution?.verificationRequirement === 'BIOMETRIC_AND_SIGNATURE'
  const eventAvailable = distributions.some((item) => item.distributionId === distributionId)
  const needsEnrollment = ['BIOMETRIC_PROFILE_REQUIRED', 'BIOMETRIC_CONSENT_INVALID'].includes(verificationError?.code)
  return (
    <div className="mt-6 grid items-start gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(20rem,0.65fr)]">
      <section className="ga-card overflow-hidden" aria-labelledby="claim-verification-heading">
        <header className="border-b border-line p-5 sm:p-6">
          <p className="ga-eyebrow">On-site verification</p>
          <h2 id="claim-verification-heading" className="mt-1 ga-section-heading">Verify the beneficiary</h2>
          <p className="mt-2 text-sm leading-6 text-muted-copy">Choose the open distribution and scheduled person, then take a live photo.</p>
        </header>

        <div className="p-5 sm:p-6">
          {verificationError && <div role="alert" className="mb-4 border-l-2 border-brand-amber bg-warning-soft p-4 text-sm leading-6"><p className="font-bold">{needsEnrollment ? 'Consent and an enrolled face profile are required' : retrySignature ? 'Signature confirmation unavailable' : 'Identity verification was not confirmed'}</p><p>{verificationError.message}</p>{needsEnrollment && <><p className="mt-2">This photo checks the current visit against a previously enrolled profile; it does not create that profile. {role === 'BARANGAY_FACILITATOR' ? 'Review consent, enroll the beneficiary, then return here for a new live photo.' : 'Ask the assigned Barangay Facilitator to review consent and enroll the beneficiary, then return here for a new live photo.'} Your selected event and beneficiary will stay selected. The claim remains pending and no handover is recorded.</p><button type="button" disabled={isSubmitting} onClick={onManageEnrollment} className="ga-btn-secondary mt-3"><Icon name="profile" className="size-4" />Review consent &amp; enrollment</button></>}</div>}
          {distributionId && !eventAvailable && <p role="status" className="mt-2 text-sm text-brand-amber">This event is unavailable for biometric verification. Select an open event that requires a face check.</p>}
          {loadingClaim && <p role="status" className="mb-4 text-sm"><LoadingLabel>Checking saved verification...</LoadingLabel></p>}
          {claimError && <div role="alert" className="mb-4 border-l-2 border-brand-amber bg-warning-soft p-4 text-sm leading-6"><p className="font-bold">Saved verification could not be loaded</p><p>{claimError}</p><p className="mt-2">Check the saved record before repeating an identity check.</p><button type="button" onClick={onRetryClaim} className="ga-btn-secondary mt-3">Retry saved verification</button></div>}
          {!loadingClaim && !claimError && result?.reviewRequired ? <section className="border-l-2 border-brand-amber bg-warning-soft p-5"><h3 className="font-bold">Review the existing claim</h3><p className="mt-2 text-sm leading-6">{result.beneficiaryName} has a recorded claim that cannot continue through verification. Review its status and event before taking further action.</p><a href={`/claim-accountability?distribution=${encodeURIComponent(distributionId)}&claim=${encodeURIComponent(result.claim.claimId)}`} onClick={(event) => { event.preventDefault(); onNavigate(event.currentTarget.getAttribute('href')) }} className="ga-btn-secondary mt-4">Open claim record</a><button type="button" onClick={onReset} className="ga-btn-secondary mt-3 w-full">Verify next beneficiary</button></section> : !loadingClaim && !claimError && result?.claim && !awaitingSignature ? (
            <section role="status" aria-live="polite" className="rounded-xl border border-emerald-200 bg-success-soft p-5 sm:p-6">
              <span aria-hidden="true" className="grid size-12 place-items-center rounded-full bg-brand-green text-white"><Icon name="check" className="size-6" strokeWidth={2.6} /></span>
              <h3 className="mt-4 text-xl font-bold text-ink">{result.verificationComplete ? 'Claim verification complete' : 'Face check recorded'}</h3>
              <p className="mt-2 text-sm leading-6 text-copy">{result.claim.verificationMethod === 'BIOMETRIC_AND_SIGNATURE' ? 'The face match, signature, and staff confirmation were secured.' : 'The identity check passed and the attempt was audited.'}</p>
              <dl className="mt-5 grid gap-4 border-t border-emerald-200 pt-5 text-sm sm:grid-cols-2">
                <Info label="Beneficiary" value={result.beneficiaryName} />
                <Info label="Verification" value={humanize(result.claim.verificationMethod)} />
              </dl>
              <p className="mt-4 text-sm leading-6 text-copy">{result.claim.claimStatus === 'CLAIMED' ? 'Assistance release or wallet credit is already recorded. Open the claim to review its receipt and history.' : result.nextRequiredVerification === 'QR' ? 'QR validation is still required before this claim can proceed.' : selectedDistribution?.deliveryMode === 'PHYSICAL_GOODS' ? 'Verification is recorded. The assigned Barangay staff must record the physical handover separately.' : 'Verification is recorded. DSWD must review and record the simulated wallet credit separately.'}</p>
              <a href={result.nextRequiredVerification === 'QR' ? `${role === 'DSWD_STAFF' ? '/dswd/verify-claims' : '/facilitator/qr-verification'}?distribution=${encodeURIComponent(distributionId)}` : `/claim-accountability?distribution=${encodeURIComponent(distributionId)}&claim=${encodeURIComponent(result.claim.claimId)}`} onClick={(event) => { event.preventDefault(); onNavigate(event.currentTarget.getAttribute('href')) }} className="ga-btn-primary mt-5 w-full sm:w-auto">{result.nextRequiredVerification === 'QR' ? 'Continue to QR verification' : 'Open verified claim'}</a>
              <button type="button" onClick={onReset} className="ga-btn-secondary mt-3 w-full">Verify next beneficiary</button>
            </section>
          ) : !loadingClaim && !claimError && awaitingSignature ? (
            <ClaimSignaturePad key={result.claim.claimId} beneficiaryName={result.beneficiaryName} busy={isSubmitting} retrying={retrySignature} onSubmit={onSignature} />
          ) : (
            <form onSubmit={onSubmit} className="space-y-5">
              <div>
                <label htmlFor="biometric-distribution" className="ga-label">Open distribution</label>
                <select id="biometric-distribution" disabled={isSubmitting} value={distributionId} onChange={(event) => setDistributionId(event.target.value)} required className="ga-input mt-2">
                  <option value="">Select a distribution</option>
                  {distributions.map((distribution) => <option key={distribution.distributionId} value={distribution.distributionId}>{distribution.title} — {distribution.distributionDate}</option>)}
                </select>
                {distributions.length === 0 && <p className="mt-2 text-sm text-muted-copy">No open biometric distribution is available in your scope.</p>}
              </div>

              {selectedDistribution && (
                <dl className="grid gap-4 rounded-xl border border-line bg-slate-50 p-4 text-sm sm:grid-cols-3">
                  <Info label="Method" value={verificationLabels[selectedDistribution.verificationRequirement] || humanize(selectedDistribution.verificationRequirement)} />
                  <Info label="Location" value={selectedDistribution.location} />
                  <Info label="Service time" value={`${selectedDistribution.startTime}–${selectedDistribution.endTime}`} />
                </dl>
              )}

              {selectedDistribution?.verificationRequirement === 'QR_OR_BIOMETRIC' && <div className="border-l-2 border-brand-blue bg-info-soft p-4 text-sm leading-6"><p>Complete a face match OR use the beneficiary’s valid QR credential. Only one method is needed.</p><button type="button" disabled={isSubmitting} onClick={() => onNavigate(`${role === 'DSWD_STAFF' ? '/dswd/verify-claims' : '/facilitator/qr-verification'}?distribution=${encodeURIComponent(distributionId)}`)} className="ga-btn-secondary mt-3"><Icon name="qr" className="size-4" />Use QR instead</button></div>}

              <div>
                <label htmlFor="biometric-candidate" className="ga-label">Scheduled beneficiary</label>
                <select id="biometric-candidate" name="beneficiaryId" required disabled={isSubmitting || loadingSchedules || !eventAvailable || Boolean(scheduleError)} value={beneficiaryId} onChange={(event) => setBeneficiaryId(event.target.value)} className="ga-input mt-2">
                  <option value="">Select a beneficiary</option>
                  {candidates.map((schedule) => <option key={schedule.scheduleId} value={schedule.beneficiaryId}>Queue {schedule.queueNumber} — {personName(schedule.beneficiary)} ({humanize(schedule.status)})</option>)}
                </select>
                {distributionId && !loadingSchedules && !scheduleError && candidates.length === 0 && <p className="mt-2 text-sm text-muted-copy">No scheduled or checked-in beneficiary is ready for verification.</p>}
              </div>

              {loadingSchedules && <p role="status" className="text-sm text-copy"><LoadingLabel>Loading scheduled beneficiaries...</LoadingLabel></p>}
              {scheduleError && <div role="alert" className="border-l-2 border-brand-amber bg-warning-soft p-4 text-sm leading-6"><p className="font-bold">Scheduled beneficiaries could not be loaded</p><p>{scheduleError}</p><button type="button" onClick={onRetrySchedules} className="ga-btn-secondary mt-3">Retry schedules</button></div>}
              <CaptureField key={`${distributionId}:${beneficiaryId}`} id="verification-face-capture" disabled={isSubmitting || loadingClaim || Boolean(claimError) || loadingSchedules || Boolean(scheduleError) || !eventAvailable || !beneficiaryId || needsEnrollment} help="Confirm the beneficiary is present and agrees to the live identity check." />

              <p className="flex gap-3 rounded-lg border border-amber-200 bg-warning-soft p-4 text-sm leading-6 text-copy">
                <Icon name="info" className="mt-0.5 size-5 shrink-0 text-brand-amber" />
                <span><strong className="text-ink">Before capture:</strong> compare the selected schedule with the official beneficiary record.</span>
              </p>

              <button type="submit" disabled={isSubmitting || loadingClaim || Boolean(claimError) || loadingSchedules || Boolean(scheduleError) || !eventAvailable || !beneficiaryId || needsEnrollment || !candidates.some((item) => item.beneficiaryId === beneficiaryId)} className="ga-btn-primary w-full">
                {isSubmitting ? <LoadingLabel>Checking liveness and face match...</LoadingLabel> : requiresSignature ? 'Verify face and continue to signature' : 'Verify beneficiary identity'}
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

function AttemptFollowUp({ attempt, canReviewDuplicates, onReview, onOpenAttempt, savedDraft }) {
  return <><p className="text-sm leading-6 text-copy">{biometricAttemptGuidance(attempt)}</p><div className="mt-1 flex flex-wrap gap-x-4">{onOpenAttempt && <button type="button" onClick={() => onOpenAttempt(attempt)} className="ga-admin-link">Review attempt</button>}{attempt.result !== 'MATCHED' && <button type="button" onClick={() => onReview(attempt)} className="ga-admin-link">{attempt.result === 'DUPLICATE' ? attempt.claimId ? 'Review existing claim' : canReviewDuplicates ? 'Review possible duplicate' : 'Review beneficiary profile' : 'Review beneficiary profile'}</button>}</div>{savedDraft && <p className="mt-2 text-xs font-semibold text-copy">Review draft: {followUpStatuses[savedDraft.status]} (not submitted)</p>}<details className="mt-1"><summary className="min-h-11 cursor-pointer py-3 text-xs font-semibold text-muted-copy focus-visible:outline-2 focus-visible:outline-brand-blue">Verification details</summary><p className="pb-2 text-xs leading-5 text-muted-copy">Match score: {attempt.matchScore ?? 'Not run'}<br />Liveness score: {attempt.livenessScore ?? 'Not run'}</p></details></>
}

function AttemptHistory({ session, onOpenAttempt, onReview, canReviewDuplicates, distributions, distributionId, setDistributionId, resultFilter, setResultFilter, data, isLoading, error, onRetry, page, setPage, beneficiaries }) {
  const [draftState] = useState(() => {
    if (!onOpenAttempt) return { cases: {} }
    try { return { cases: readBiometricFollowUps(sessionStorage, session.user) } }
    catch { return { cases: {}, error: 'Local review drafts could not be read. Open an attempt to review the details.' } }
  })
  const nameById = new Map(beneficiaries.map((beneficiary) => [beneficiary.beneficiaryId, personName(beneficiary)]))
  return <div className="mt-6 space-y-5">
    {draftState.error && <p role="alert" className="rounded-lg border border-amber-200 bg-warning-soft p-4 text-sm text-copy">{draftState.error}</p>}
    <section className="ga-card p-5 sm:p-6"><h2 className="ga-section-heading">Biometric verification attempts</h2><p className="mt-2 text-sm leading-6 text-muted-copy">Check what happened, then follow the appropriate next step. A failed face match alone does not establish identity misuse. Each retry creates a separate attempt record.</p>
      <div className="mt-5 grid gap-3 md:grid-cols-2"><div><label htmlFor="attempt-distribution" className="ga-label">Distribution</label><select id="attempt-distribution" value={distributionId} onChange={(event) => setDistributionId(event.target.value)} className="ga-input mt-2"><option value="">Select a distribution</option>{distributions.map((distribution) => <option key={distribution.distributionId} value={distribution.distributionId}>{distribution.title} - {distribution.distributionDate}</option>)}</select></div><div><label htmlFor="attempt-result" className="ga-label">Result</label><select id="attempt-result" value={resultFilter} onChange={(event) => setResultFilter(event.target.value)} disabled={!distributionId} className="ga-input mt-2">{attemptResults.map((result) => <option key={result || 'ALL'} value={result}>{result ? humanize(result) : 'All results'}</option>)}</select></div></div>
    </section>
    {!distributionId ? <section className="ga-card p-8"><h2 className="ga-section-heading">Select a distribution</h2><p className="mt-2 text-sm text-muted-copy">Review attempts for one event at a time.</p></section> : isLoading ? <div className="ga-card p-5" role="status" aria-label="Loading biometric attempts"><Skeleton className="h-36 w-full" /></div> : error ? <section className="ga-card p-5" role="alert"><h2 className="font-bold">Attempt history could not be loaded</h2><p className="mt-2 text-sm text-copy">{error}</p><button type="button" onClick={onRetry} className="ga-btn-secondary mt-4">Try again</button></section> : <section className="ga-card overflow-hidden" aria-labelledby="attempt-table-heading">
      <div className="border-b border-line px-5 py-4"><h2 id="attempt-table-heading" className="ga-section-heading">Recorded attempts</h2><p className="mt-1 text-sm text-muted-copy">{data?.pagination.total ?? 0} matching attempts</p></div>
      {!data?.attempts.length ? <div className="p-8"><h3 className="font-bold">No verification attempts found</h3><p className="mt-2 text-sm text-muted-copy">No recorded attempt matches this event and result filter.</p></div> : <>
        <div className="hidden lg:block"><table className="w-full text-left text-sm"><thead className="border-b border-line bg-slate-50 text-xs text-muted-copy"><tr><th scope="col" className="px-5 py-3">Beneficiary / recorded</th><th scope="col" className="px-5 py-3">Result</th><th scope="col" className="w-1/2 px-5 py-3">What to do next</th></tr></thead><tbody className="divide-y divide-line">{data.attempts.map((attempt) => <tr key={attempt.attemptId} className="align-top"><td className="px-5 py-4"><p className="font-semibold">{nameById.get(attempt.beneficiaryId) ?? 'Beneficiary record'}</p><p className="mt-1 text-xs text-muted-copy">Record {attempt.beneficiaryId.slice(0, 8)}</p><p className="mt-2 text-xs leading-5 text-copy">{displayDate(attempt.createdAt)}</p></td><td className="px-5 py-4"><StatusBadge value={attempt.result} /></td><td className="px-5 py-4"><AttemptFollowUp attempt={attempt} canReviewDuplicates={canReviewDuplicates} onReview={onReview} onOpenAttempt={onOpenAttempt} savedDraft={draftState.cases[`${distributionId}:${attempt.attemptId}`]?.saved} /></td></tr>)}</tbody></table></div>
        <ul className="divide-y divide-line lg:hidden">{data.attempts.map((attempt) => <li key={attempt.attemptId} className="p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-semibold">{nameById.get(attempt.beneficiaryId) ?? 'Beneficiary record'}</h3><p className="mt-1 text-xs text-muted-copy">Record {attempt.beneficiaryId.slice(0, 8)}</p></div><StatusBadge value={attempt.result} /></div><p className="my-3 text-xs text-muted-copy">{displayDate(attempt.createdAt)}</p><AttemptFollowUp attempt={attempt} canReviewDuplicates={canReviewDuplicates} onReview={onReview} onOpenAttempt={onOpenAttempt} savedDraft={draftState.cases[`${distributionId}:${attempt.attemptId}`]?.saved} /></li>)}</ul>
      </>}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-4"><p className="text-sm text-muted-copy">Page {data?.pagination.page ?? 1} of {Math.max(data?.pagination.totalPages ?? 1, 1)}</p><div className="flex gap-2"><button type="button" onClick={() => setPage((value) => value - 1)} disabled={page <= 1} className="ga-btn-secondary min-h-11 px-4 text-sm">Previous</button><button type="button" onClick={() => setPage((value) => value + 1)} disabled={page >= (data?.pagination.totalPages ?? 1)} className="ga-btn-secondary min-h-11 px-4 text-sm">Next</button></div></div>
    </section>}
  </div>
}

function Info({ label, value }) {
  return <div><dt className="text-xs font-bold uppercase tracking-[0.08em] text-muted-copy">{label}</dt><dd className="mt-1 font-bold text-ink">{value ?? 'Not recorded'}</dd></div>
}

export default BiometricIdentityPage
