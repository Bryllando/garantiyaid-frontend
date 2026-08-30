import { useEffect, useRef, useState } from 'react'
import { Icon } from '../ui/icon.jsx'
import { LoadingLabel } from '../ui/spinner.jsx'

function canvasPoint(canvas, event) {
  const bounds = canvas.getBoundingClientRect()
  return {
    x: (event.clientX - bounds.left) * canvas.width / bounds.width,
    y: (event.clientY - bounds.top) * canvas.height / bounds.height,
  }
}

function paintCanvas(canvas) {
  const context = canvas.getContext('2d')
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.strokeStyle = '#0f172a'
  context.lineWidth = 5
  context.lineCap = 'round'
  context.lineJoin = 'round'
  return context
}

function typedSignatureImage(name) {
  const canvas = document.createElement('canvas')
  canvas.width = 900
  canvas.height = 300
  const context = paintCanvas(canvas)
  context.fillStyle = '#0f172a'
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.font = 'italic 58px Georgia, serif'
  context.fillText(name, canvas.width / 2, canvas.height / 2, canvas.width - 100)
  return canvas.toDataURL('image/png')
}

const normalizedName = (value) => value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-PH')

export default function ClaimSignaturePad({ beneficiaryName, busy, onSubmit }) {
  const canvasRef = useRef(null)
  const drawingRef = useRef(false)
  const pointsRef = useRef(0)
  const [method, setMethod] = useState('DRAWN')
  const [pointCount, setPointCount] = useState(0)
  const [typedName, setTypedName] = useState('')
  const [attestation, setAttestation] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (method === 'DRAWN' && canvasRef.current) paintCanvas(canvasRef.current)
  }, [method])

  function resetDrawing() {
    if (canvasRef.current) paintCanvas(canvasRef.current)
    pointsRef.current = 0
    setPointCount(0)
    setError('')
  }

  function startDrawing(event) {
    const canvas = canvasRef.current
    event.preventDefault()
    canvas.setPointerCapture(event.pointerId)
    const point = canvasPoint(canvas, event)
    const context = canvas.getContext('2d')
    context.beginPath()
    context.moveTo(point.x, point.y)
    drawingRef.current = true
    pointsRef.current += 1
  }

  function continueDrawing(event) {
    if (!drawingRef.current) return
    event.preventDefault()
    const point = canvasPoint(canvasRef.current, event)
    const context = canvasRef.current.getContext('2d')
    context.lineTo(point.x, point.y)
    context.stroke()
    pointsRef.current += 1
  }

  function stopDrawing(event) {
    if (!drawingRef.current) return
    drawingRef.current = false
    if (canvasRef.current.hasPointerCapture(event.pointerId)) canvasRef.current.releasePointerCapture(event.pointerId)
    setPointCount(pointsRef.current)
  }

  async function submit(event) {
    event.preventDefault()
    setError('')
    if (!attestation) return setError('Confirm that the beneficiary signed in your presence.')
    if (method === 'DRAWN' && pointCount < 8) return setError('Ask the beneficiary to provide a complete signature, then try again.')
    if (method === 'TYPED' && normalizedName(typedName) !== normalizedName(beneficiaryName)) {
      return setError(`Type the beneficiary's full legal name exactly as shown: ${beneficiaryName}`)
    }
    const signatureDataUrl = method === 'DRAWN'
      ? canvasRef.current.toDataURL('image/png')
      : typedSignatureImage(typedName.trim())
    await onSubmit({
      signatureDataUrl,
      signatureMethod: method,
      ...(method === 'DRAWN' ? { pointCount } : { typedName: typedName.trim() }),
      attestation: true,
    })
  }

  return (
    <section className="mt-6 overflow-hidden rounded-2xl border border-blue-200 bg-white shadow-sm" aria-labelledby="signature-heading">
      <div className="flex flex-col gap-4 border-b border-blue-100 bg-info-soft p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3"><span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-blue text-white"><Icon name="pen" /></span><div><p className="ga-eyebrow">Final identity step</p><h3 id="signature-heading" className="mt-1 text-xl font-extrabold text-ink">Collect beneficiary signature</h3><p className="mt-1 text-sm leading-6 text-copy">Face matched successfully. The claim remains pending until this acknowledgment is secured.</p></div></div>
        <span className="inline-flex w-fit items-center gap-2 rounded-full border border-emerald-200 bg-white px-3 py-1.5 text-xs font-bold text-brand-green"><Icon name="security" />Face verified</span>
      </div>

      <form onSubmit={submit} className="p-5 sm:p-6" aria-busy={busy}>
        <div className="rounded-xl border border-line bg-slate-50 p-4"><p className="text-xs font-bold uppercase tracking-[0.08em] text-muted-copy">Beneficiary</p><p className="mt-1 text-lg font-extrabold text-ink">{beneficiaryName}</p></div>

        <fieldset className="mt-5"><legend className="ga-label">Signature method</legend><div className="mt-2 grid gap-3 sm:grid-cols-2">{[
          ['DRAWN', 'Draw signature', 'Best for touchscreens, mouse, or stylus.'],
          ['TYPED', 'Typed acknowledgment', 'Accessible keyboard alternative.'],
        ].map(([value, label, description]) => <button key={value} type="button" aria-pressed={method === value} onClick={() => { if (value === method) return; pointsRef.current = 0; setPointCount(0); setTypedName(''); setMethod(value); setError('') }} className={`min-h-20 cursor-pointer rounded-xl border p-4 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue ${method === value ? 'border-brand-blue bg-info-soft ring-2 ring-blue-100' : 'border-line bg-white hover:border-blue-200'}`}><span className="block font-extrabold text-ink">{label}</span><span className="mt-1 block text-sm leading-5 text-muted-copy">{description}</span></button>)}</div></fieldset>

        {method === 'DRAWN' ? <div className="mt-5"><div className="flex items-end justify-between gap-3"><div><p id="signature-canvas-label" className="ga-label">Sign inside the box</p><p id="signature-canvas-help" className="mt-1 text-xs leading-5 text-muted-copy">Use a finger, stylus, or mouse. The ink appears live and stays on this device until submitted.</p></div><button type="button" onClick={resetDrawing} className="ga-btn-secondary min-h-11 shrink-0 px-3 text-sm"><Icon name="reset" />Clear</button></div><canvas ref={canvasRef} width="900" height="300" onPointerDown={startDrawing} onPointerMove={continueDrawing} onPointerUp={stopDrawing} onPointerCancel={stopDrawing} aria-labelledby="signature-canvas-label" aria-describedby="signature-canvas-help" className="mt-3 block aspect-[3/1] min-h-44 w-full cursor-crosshair touch-none rounded-xl border-2 border-dashed border-slate-300 bg-white shadow-inner focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue" /></div> : <div className="mt-5"><label htmlFor="typed-signature" className="ga-label">Type full legal name</label><input id="typed-signature" value={typedName} onChange={(event) => { setTypedName(event.target.value); setError('') }} autoComplete="off" maxLength="200" placeholder={beneficiaryName} className="ga-input mt-2 text-lg font-semibold" /><p className="mt-2 text-xs leading-5 text-muted-copy">The name must exactly match the beneficiary record. It will be rendered as protected signature evidence.</p></div>}

        <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-xl border border-line bg-slate-50 p-4"><input type="checkbox" checked={attestation} onChange={(event) => { setAttestation(event.target.checked); setError('') }} className="mt-1 size-5 shrink-0 accent-brand-blue" /><span><span className="block font-bold text-ink">I confirm this acknowledgment was made by the beneficiary in my presence.</span><span className="mt-1 block text-xs leading-5 text-muted-copy">Your staff account, timestamp, device context, and evidence hash will be recorded in the audit trail.</span></span></label>

        {error && <p role="alert" className="mt-4 rounded-lg border border-amber-200 bg-warning-soft p-3 text-sm font-semibold leading-6 text-copy">{error}</p>}
        <button type="submit" disabled={busy || !attestation} className="ga-btn-primary mt-5 w-full">{busy ? <LoadingLabel>Encrypting and securing signature...</LoadingLabel> : <><Icon name="security" />Secure signature and verify claim</>}</button>
        <p className="mt-3 text-center text-xs leading-5 text-muted-copy">The signature image is encrypted at rest and is not returned in API responses.</p>
      </form>
    </section>
  )
}
