'use client'

import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { AssistantPanel } from '@/components/assistant/assistant-panel'
import { useAssistantUiStore } from '@/lib/stores/assistant-ui-store'
import { cn } from '@/lib/utils'

export function AssistantDrawer() {
  const isOpen = useAssistantUiStore((s) => s.isOpen)
  const closeAssistant = useAssistantUiStore((s) => s.closeAssistant)

  return (
    <DialogPrimitive.Root open={isOpen} onOpenChange={(open) => !open && closeAssistant()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-[2px] transition-opacity duration-300 data-[state=open]:opacity-100 data-[state=closed]:opacity-0" />
        <DialogPrimitive.Content
          data-assistant-drawer-content
          className={cn(
            'fixed z-[101] flex flex-col overflow-hidden bg-[#0e1116] outline-none',
            'border border-white/[0.08] shadow-[0_25px_80px_-12px_rgba(0,0,0,0.7)]',
            // Mobile: quasi fullscreen sopra la bottom nav
            'inset-0 max-h-[100dvh] rounded-none border-0',
            'md:inset-auto md:bottom-6 md:right-6 md:left-auto md:top-auto',
            'md:h-[min(84vh,912px)] md:max-h-[88vh] md:w-[min(504px,calc(100vw-3rem))]',
            'md:rounded-2xl md:border'
          )}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <DialogPrimitive.Description className="sr-only">
            Chat con l&apos;assistente per cercare e modificare dati del gestionale. Le azioni di scrittura
            richiedono conferma.
          </DialogPrimitive.Description>

          <header className="shrink-0 border-b border-white/[0.06] px-4 pb-3 pt-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <DialogPrimitive.Title className="text-[15px] font-semibold tracking-tight text-white">
                  Assistente
                </DialogPrimitive.Title>
                <p className="mt-0.5 text-xs leading-relaxed text-white/45">Come posso aiutarti oggi?</p>
              </div>
              <DialogPrimitive.Close
                type="button"
                className="shrink-0 rounded-full p-2 text-white/45 transition-colors hover:bg-white/[0.06] hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
                aria-label="Chiudi assistente"
              >
                <X className="h-4 w-4" strokeWidth={2} />
              </DialogPrimitive.Close>
            </div>
          </header>

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <AssistantPanel embedded />
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
