'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/** Usato solo in modalità sviluppo (Clerk non configurato). */
function RedirectToDev() {
  const router = useRouter()
  useEffect(() => {
    router.replace('/dev-users')
  }, [router])
  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ backgroundColor: 'var(--dark, #0c0e11)', color: '#fff' }}
    >
      <p className="text-white/70">Caricamento...</p>
    </div>
  )
}

/**
 * Con Clerk attivo il redirect home è gestito in `app/page.tsx` (server).
 * Questo componente resta solo per la modalità senza Clerk.
 */
export function HomeRedirect({ clerkConfigured }: { clerkConfigured: boolean }) {
  if (!clerkConfigured) return <RedirectToDev />
  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ backgroundColor: 'var(--dark, #0c0e11)', color: '#fff' }}
    >
      <p className="text-white/70">Caricamento...</p>
    </div>
  )
}
