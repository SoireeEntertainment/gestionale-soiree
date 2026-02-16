'use client'

import { useEffect } from 'react'
import Link from 'next/link'

export default function PedPageError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('PED error:', error)
  }, [error])

  return (
    <div className="min-h-screen bg-dark flex items-center justify-center p-6">
      <div className="text-center max-w-lg">
        <h1 className="text-xl font-bold text-white mb-2">Errore nel caricamento del PED</h1>
        <p className="text-white/70 text-sm mb-2 font-mono break-all">
          {error.message}
        </p>
        <p className="text-white/50 text-xs mb-6">
          Controlla la console del server (terminale) per i dettagli.
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
            Dashboard
          </Link>
        </div>
      </div>
    </div>
  )
}
