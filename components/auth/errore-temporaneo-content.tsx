'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

export function ErroreTemporaneoContent() {
  const router = useRouter()
  const [retrying, setRetrying] = useState(false)

  const handleRetry = () => {
    setRetrying(true)
    router.refresh()
    // Torna alla dashboard: la sessione Clerk resta attiva
    window.location.href = '/dashboard'
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-6"
      style={{ backgroundColor: 'var(--dark, #0c0e11)', color: '#fff' }}
    >
      <div className="max-w-md w-full text-center">
        <h1 className="text-2xl font-bold text-white mb-3">Errore temporaneo</h1>
        <p className="text-white/70 text-sm mb-6">
          Si è verificato un problema momentaneo nel caricamento del tuo profilo. La sessione è ancora
          attiva: riprova senza effettuare di nuovo l’accesso.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            type="button"
            onClick={handleRetry}
            disabled={retrying}
            className="px-4 py-2 rounded-md font-medium bg-accent text-dark hover:bg-accent/90 disabled:opacity-60"
          >
            {retrying ? 'Riprovo…' : 'Riprova'}
          </button>
          <Link
            href="/dashboard"
            className="px-4 py-2 rounded-md font-medium bg-white/10 text-white border border-white/20 hover:bg-white/20 inline-block"
          >
            Torna alla dashboard
          </Link>
        </div>
      </div>
    </div>
  )
}
