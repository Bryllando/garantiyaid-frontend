import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { downloadBeneficiaryDocument, getAuthErrorMessage, isSessionExpiredError } from '../../auth/staffAuth.js'
import { Icon } from '../ui/icon.jsx'
import { LoadingLabel } from '../ui/spinner.jsx'

export default function BeneficiaryDocumentPreview({ document: item, beneficiaryId, token, onClose, onSessionExpired }) {
  const dialogRef = useRef(null)
  const [file, setFile] = useState(null)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    const opener = document.activeElement
    dialogRef.current.showModal()
    return () => opener?.isConnected && opener.focus()
  }, [])
  useEffect(() => {
    const controller = new AbortController()
    let url
    downloadBeneficiaryDocument(token, beneficiaryId, item.documentId, { signal: controller.signal })
      .then(blob => {
        if (controller.signal.aborted) return
        if (!['application/pdf', 'image/jpeg', 'image/png'].includes(blob.type)) throw new Error('This file cannot be previewed. Close this preview and use Download to inspect it.')
        url = URL.createObjectURL(blob)
        setFile({ url, type: blob.type })
      })
      .catch(failure => {
        if (controller.signal.aborted) return
        if (isSessionExpiredError(failure)) onSessionExpired()
        else setError(getAuthErrorMessage(failure))
      })
    return () => { controller.abort(); if (url) URL.revokeObjectURL(url) }
  }, [token, beneficiaryId, item.documentId, retry, onSessionExpired])
  return createPortal(<dialog ref={dialogRef} onClose={onClose} aria-labelledby="document-preview-title" aria-describedby="document-preview-name" className="m-auto flex h-[min(52rem,calc(100dvh-1rem))] max-h-[calc(100dvh-1rem)] w-[min(64rem,calc(100%-1rem))] flex-col overflow-hidden rounded-lg border border-line bg-white p-0 text-ink shadow-lg backdrop:bg-slate-950/55">
    <header className="flex shrink-0 items-start justify-between gap-3 border-b border-line px-4 py-4 sm:px-6"><div className="min-w-0"><h2 id="document-preview-title" className="flex items-center gap-2 text-lg font-semibold"><Icon name="eye" className="size-5 shrink-0 text-brand-blue" />Document preview</h2><p id="document-preview-name" className="mt-1 text-sm text-copy [overflow-wrap:anywhere]">{item.originalFileName}</p><p className="mt-1 text-xs text-muted-copy">{item.documentName || item.documentType.replaceAll('_', ' ')} · {item.reviewStatus.toLowerCase().replaceAll('_', ' ')}</p></div><button type="button" onClick={() => dialogRef.current.close()} aria-label="Close document preview" className="grid size-11 shrink-0 place-items-center rounded-lg border border-line text-copy hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-brand-blue"><Icon name="close" /></button></header>
    <div className="min-h-0 flex-1 overflow-auto bg-slate-100" aria-busy={!file && !error}>
      {error ? <div className="m-4 rounded-lg border border-red-200 bg-white p-5"><p role="alert" className="text-sm leading-6 text-brand-red">{error}</p><button type="button" onClick={() => { setFile(null); setError(''); setRetry(value => value + 1) }} className="ga-btn-secondary mt-4"><Icon name="reset" className="size-4" />Try preview again</button></div> : !file ? <p role="status" className="p-6 text-sm text-copy"><LoadingLabel>Loading uploaded document...</LoadingLabel></p> : file.type === 'application/pdf' ? <iframe title={`Uploaded document: ${item.originalFileName}`} src={file.url} className="h-full min-h-64 w-full border-0" referrerPolicy="no-referrer" /> : <img src={file.url} alt={`Uploaded document: ${item.originalFileName}`} className="mx-auto block h-auto max-w-full" />}
    </div>
    <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3 sm:px-6"><p className="max-w-lg text-xs leading-5 text-muted-copy">Previewing does not accept the document. If the PDF does not display, use Download.</p><a href={file?.url} download={item.originalFileName} aria-disabled={!file} tabIndex={file ? 0 : -1} onClick={event => { if (!file) event.preventDefault() }} className={`ga-btn-secondary ${file ? '' : 'pointer-events-none opacity-50'}`}><Icon name="download" className="size-4" />Download file</a></footer>
  </dialog>, document.body)
}
