'use client'

import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { AssistantPanel } from '@/components/assistant/assistant-panel'
import { useAssistantUiStore } from '@/lib/stores/assistant-ui-store'

export function AssistantDrawer() {
  const isOpen = useAssistantUiStore((s) => s.isOpen)
  const closeAssistant = useAssistantUiStore((s) => s.closeAssistant)

  return (
    <DialogPrimitive.Root open={isOpen} onOpenChange={(open) => !open && closeAssistant()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[100] bg-black/60" />
        <DialogPrimitive.Content
          className="fixed z-[101] inset-y-0 right-0 flex h-full w-full max-h-full max-w-full flex-col border-l border-accent/20 bg-dark shadow-2xl outline-none sm:max-w-md"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <DialogPrimitive.Title className="sr-only">Assistente interno Soirëe</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            Chat con l&apos;assistente per cercare e modificare dati del gestionale. Le azioni di scrittura
            richiedono conferma.
          </DialogPrimitive.Description>

          <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-3 py-2">
            <span className="text-sm font-semibold text-white">Assistente</span>
            <DialogPrimitive.Close
              type="button"
              className="rounded-md p-2 text-white/70 transition-colors hover:bg-white/10 hover:text-white focus:outline-none focus:ring-2 focus:ring-accent"
              aria-label="Chiudi assistente"
            >
              <X className="h-5 w-5" />
            </DialogPrimitive.Close>
          </div>
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <AssistantPanel embedded />
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
