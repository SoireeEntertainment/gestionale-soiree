'use client'

import { useEffect } from 'react'
import dynamic from 'next/dynamic'
import { usePathname } from 'next/navigation'
import { MessageCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAssistantUiStore } from '@/lib/stores/assistant-ui-store'

const AssistantDrawer = dynamic(
  () => import('@/components/assistant/assistant-drawer').then((m) => ({ default: m.AssistantDrawer })),
  { ssr: false }
)

export function AssistantFloatingHost() {
  const pathname = usePathname()
  const isOpen = useAssistantUiStore((s) => s.isOpen)
  const openAssistant = useAssistantUiStore((s) => s.openAssistant)
  const closeAssistant = useAssistantUiStore((s) => s.closeAssistant)
  const hideFab = pathname === '/assistente'

  useEffect(() => {
    if (pathname === '/assistente') closeAssistant()
  }, [pathname, closeAssistant])

  const showFab = !hideFab && !isOpen

  return (
    <>
      {isOpen ? <AssistantDrawer /> : null}
      {showFab ? (
        <button
          type="button"
          onClick={() => openAssistant()}
          title="Assistente"
          aria-label="Apri assistente"
          className={cn(
            'fixed bottom-6 right-6 z-[102] flex h-14 w-14 items-center justify-center rounded-full',
            'bg-accent text-dark shadow-[0_8px_30px_rgba(16,249,199,0.35)] transition-transform hover:scale-[1.03] active:scale-[0.98]',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-[#0c0e11]'
          )}
        >
          <MessageCircle className="h-6 w-6" strokeWidth={2} aria-hidden />
        </button>
      ) : null}
    </>
  )
}
