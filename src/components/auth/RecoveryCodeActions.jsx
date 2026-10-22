import { useEffect, useRef, useState } from 'react'
import { Icon } from '../ui/icon.jsx'
import { downloadRecoveryFile, recoveryCodePdf, recoveryCodePrintDocument, recoveryCodeText } from './recovery-code-export.js'

export default function RecoveryCodeActions({ codes }) {
  const [feedback, setFeedback] = useState('')
  const [busy, setBusy] = useState(false)
  const printFrame = useRef(null)

  useEffect(() => () => printFrame.current?.remove(), [])

  async function download(format) {
    setBusy(true)
    setFeedback('')
    try {
      const blob = format === 'pdf' ? await recoveryCodePdf(codes) : new Blob([recoveryCodeText(codes)], { type: 'text/plain;charset=utf-8' })
      downloadRecoveryFile(blob, format)
      setFeedback(`${format === 'pdf' ? 'PDF' : 'Text file'} download started. Check your downloads before continuing.`)
    } catch {
      setFeedback('Download could not start. Try again, or copy the codes instead.')
    } finally {
      setBusy(false)
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(recoveryCodeText(codes))
      setFeedback('All recovery codes copied.')
    } catch {
      setFeedback('Copy is unavailable. Select and copy the codes manually.')
    }
  }

  function print() {
    try {
      const html = recoveryCodePrintDocument(codes)
      const trigger = document.activeElement
      printFrame.current?.remove()
      const frame = document.createElement('iframe')
      frame.title = 'Recovery codes print document'
      frame.setAttribute('aria-hidden', 'true')
      frame.style.cssText = 'position:fixed;width:0;height:0;border:0;'
      frame.onload = () => {
        try {
          frame.contentWindow.addEventListener('afterprint', () => setTimeout(() => {
            const restoreFocus = document.activeElement === frame || document.activeElement === document.body
            frame.remove()
            if (restoreFocus && trigger?.isConnected) trigger.focus({ preventScroll: true })
          }, 0), { once: true })
          frame.contentWindow.focus()
          frame.contentWindow.print()
        } catch {
          frame.remove()
          setFeedback('Printing is unavailable. Download the PDF and print it from your PDF viewer.')
        }
      }
      frame.srcdoc = html
      printFrame.current = frame
      // Keep the frame inside the active dialog so modal focus rules do not block printing.
      const container = document.querySelector('dialog[open]') || document.body
      container.append(frame)
      setFeedback('Print dialog requested. To save a file directly, choose Download PDF.')
    } catch {
      setFeedback('Printing could not start. Try Download PDF instead.')
    }
  }

  return (
    <div data-recovery-actions className="mt-5 border-t border-amber-200 pt-4">
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={() => download('pdf')} disabled={busy} aria-busy={busy} className="ga-btn-primary col-span-2 min-h-11 gap-2 px-3 text-sm min-[380px]:col-span-1"><Icon name="download" className="size-4 shrink-0" />{busy ? 'Preparing…' : 'Download PDF'}</button>
        <button type="button" onClick={print} className="ga-btn-secondary col-span-2 min-h-11 gap-2 px-3 text-sm min-[380px]:col-span-1"><Icon name="printer" className="size-4 shrink-0" />Print</button>
        <button type="button" onClick={copy} className="min-h-11 rounded-lg px-2 text-xs font-semibold text-copy hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue sm:text-sm">Copy all</button>
        <button type="button" onClick={() => download('txt')} disabled={busy} className="min-h-11 rounded-lg px-2 text-xs font-semibold text-copy hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue disabled:opacity-50 sm:text-sm">Download .txt</button>
      </div>
      <p role="status" className="mt-2 min-h-5 text-center text-xs leading-5 text-copy">{feedback || 'Save a PDF directly, or choose Print for a paper copy.'}</p>
    </div>
  )
}
