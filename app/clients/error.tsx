'use client'

import { useEffect } from 'react'
import Link from 'next/link'

export default function ClientsListError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[ClientsListError]', error)
  }, [error])

  return (
    <div className="min-h-screen bg-dark p-6">
      <div className="w-[90vw] max-w-[90vw] mx-auto flex flex-col items-center justify-center min-h-[60vh] text-center">
        <h1 className="text-xl font-bold text-white mb-2">Errore nel caricamento della lista clienti</h1>
        <p className="text-white/70 text-sm mb-6">
          La pagina Clienti non è disponibile. Riprova o torna alla home.
        </p>
        <div className="flex gap-3 justify-center flex-wrap">
          <button
            onClick={reset}
            className="px-4 py-2 rounded-md font-medium bg-accent text-dark hover:bg-accent/90"
          >
            Riprova
          </button>
          <Link
            href="/dashboard"
            className="px-4 py-2 rounded-md font-medium border border-accent text-accent hover:bg-accent/10"
          >
            ← Dashboard
          </Link>
        </div>
      </div>
    </div>
  )
}
