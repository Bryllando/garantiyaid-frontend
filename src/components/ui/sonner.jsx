import { Toaster as Sonner } from 'sonner'

export function Toaster() {
  return (
    <Sonner
      closeButton
      duration={4500}
      position="top-right"
      toastOptions={{
        classNames: {
          toast: 'font-sans !rounded-xl !border-line !bg-white !text-ink !shadow-lg',
          title: '!font-bold',
          description: '!text-muted-copy',
          actionButton: '!bg-brand-blue !text-white',
          cancelButton: '!bg-slate-100 !text-copy',
        },
      }}
    />
  )
}
