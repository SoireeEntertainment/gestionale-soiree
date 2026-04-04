'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { MessageCircle, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAssistantUiStore } from '@/lib/stores/assistant-ui-store'
import { AssistantDrawer } from '@/components/assistant/assistant-drawer'

export function AssistantFloatingHost() {
  const pathname = usePathname()
  const isOpen = useAssistantUiStore((s) => s.isOpen)
  const toggleAssistant = useAssistantUiStore((s) => s.toggleAssistant)
  const hideFab = pathname === '/assistente'
  const closeAssistant = useAssistantUiStore((s) => s.closeAssistant)

  useEffect(() => {
    if (pathname === '/assistente') closeAssistant()
  }, [pathname, closeAssistant])

  return (
    <>
      <AssistantDrawer />
      {!hideFab ? (
        <button
          type="button"
          onClick={() => toggleAssistant()}
          title={isOpen ? 'Chiudi assistente' : 'Assistente'}
          aria-label={isOpen ? 'Chiudi assistente' : 'Apri assistente'}
          className={cn(
            'fixed bottom-6 right-6 z-[102] flex h-14 w-14 items-center justify-center rounded-full',
            'bg-accent text-dark shadow-lg transition-transform hover:scale-105',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-dark'
          )}
        >
          {isOpen ? (
            <X className="h-6 w-6" strokeWidth={2.5} aria-hidden />
          ) : (
            <MessageCircle className="h-6 w-6" strokeWidth={2} aria-hidden />
          )}
        </button>
      ) : null}
    </>
  )
}
