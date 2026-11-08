import { Icon } from './icon.jsx'

export default function ImportTemplateGuide({ title, fields, excelFile, onDownload, disabled }) {
  return <section aria-label={title} className="rounded border border-line bg-white">
    <div className="flex flex-col items-start justify-between gap-3 p-4 sm:flex-row sm:items-center">
      <div className="min-w-0"><h3 className="font-semibold">{title}</h3><p className="mt-1 text-sm leading-6 text-copy">Enter one record per row from row 6. Required fields have an asterisk (*); formats and examples sit below each heading.</p></div>
    </div>
    <div className="flex flex-wrap gap-3 px-4 pb-4">
      <a href={`${import.meta.env.BASE_URL}import-templates/${excelFile}`} download={excelFile} aria-disabled={disabled || undefined} onClick={event => { if (disabled) event.preventDefault() }} className="ga-btn-primary"><Icon name="download" />Download Excel template</a>
      <button type="button" disabled={disabled} onClick={onDownload} className="ga-btn-secondary">Download CSV template</button>
      <dl className="grid basis-full gap-3 border-t border-line pt-3 text-sm sm:grid-cols-2">
        <div><dt className="font-semibold">Excel (.xlsx)</dt><dd className="mt-1 text-xs leading-5 text-copy">Best for filling in manually. Keeps column widths, dropdowns and a separate Guide tab.</dd></div>
        <div><dt className="font-semibold">CSV (.csv)</dt><dd className="mt-1 text-xs leading-5 text-copy">Plain-text rows and columns. Includes field hints, but has no colors, dropdowns or extra tabs.</dd></div>
      </dl>
    </div>
    <details className="border-t border-line">
      <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-brand-blue focus-visible:outline-2 focus-visible:outline-brand-blue">Column guide and examples</summary>
      <dl className="divide-y divide-line px-4">{fields.map(([label, requirement, example]) => <div key={label} className="grid gap-1 py-3 text-sm sm:grid-cols-[10rem_1fr]">
        <dt className="font-semibold">{label}</dt><dd className="min-w-0 leading-6 text-copy"><p>{requirement}</p>{example && <p className="break-words text-xs">Example: <span className="font-medium text-ink">{example}</span></p>}</dd>
      </div>)}</dl>
      <p className="border-t border-line px-4 py-3 text-xs leading-5 text-copy">Examples stay in the guide and are not imported. Keep codes, phone numbers and IDs as Text. Save Excel templates as .xlsx, or CSV templates as CSV UTF-8.</p>
    </details>
  </section>
}
