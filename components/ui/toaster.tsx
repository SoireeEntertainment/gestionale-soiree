'use client'

import { useEffect } from 'react'
import * as Toast from '@radix-ui/react-toast'
import { useToastStore, type ToastItem } from '@/lib/stores/toast-store'
import { cn } from '@/lib/utils'

const AUTO_DISMISS_MS: Record<Exclude<ToastItem['type'], 'loading'>, number> = {
  success: 3200,
  error: 5000,
  info: 3200,
}

function ToastViewport() {
  const toasts = useToastStore((s) => s.toasts)
  const dismissToast = useToastStore((s) => s.dismissToast)

  return (
    <Toast.Provider swipeDirection="right">
      {toasts.map((t) => (
        <ToastItemView key={t.id} toast={t} onDismiss={() => dismissToast(t.id)} />
      ))}
      <Toast.Viewport className="fixed bottom-4 right-4 z-[100] flex max-h-screen w-full max-w-sm flex-col gap-2 outline-none" />
    </Toast.Provider>
  )
}

function ToastItemView({ toast, onDismiss }: { toast: ToastItem; onDismiss: () => void }) {
  useEffect(() => {
    // I toast "loading" restano finché dismissToast esplicito (es. fine request).
    if (toast.type === 'loading') return
    const ms = AUTO_DISMISS_MS[toast.type]
    const timer = setTimeout(onDismiss, ms)
    return () => clearTimeout(timer)
  }, [toast.id, toast.type, onDismiss])

  return (
    <Toast.Root
      open
      onOpenChange={(open) => {
        if (!open) onDismiss()
      }}
      className={cn(
        'rounded-lg border px-4 py-3 text-sm shadow-lg backdrop-blur-sm',
        'data-[state=open]:animate-in data-[state=closed]:animate-out',
        toast.type === 'success' && 'border-emerald-500/30 bg-emerald-950/90 text-emerald-100',
        toast.type === 'error' && 'border-red-500/30 bg-red-950/90 text-red-100',
        toast.type === 'info' && 'border-white/15 bg-dark/95 text-white/90',
        toast.type === 'loading' && 'border-accent/30 bg-dark/95 text-accent'
      )}
    >
      <Toast.Title className="font-medium leading-snug">{toast.message}</Toast.Title>
    </Toast.Root>
  )
}

export function Toaster() {
  return <ToastViewport />
}
