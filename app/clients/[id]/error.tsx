'use client'

import { useEffect } from 'react'
import Link from 'next/link'

export default function ClientDetailError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="min-h-screen bg-dark p-6">
      <div className="w-[90vw] max-w-[90vw] mx-auto flex flex-col items-center justify-center min-h-[60vh] text-center">
        <h1 className="text-xl font-bold text-white mb-2">Errore nel caricamento del cliente</h1>
        <p className="text-white/70 text-sm mb-6">
          La scheda cliente non è disponibile. Riprova o torna alla lista.
        </p>
        <div className="flex gap-3 justify-center flex-wrap">
          <button
            onClick={reset}
            className="px-4 py-2 rounded-md font-medium bg-accent text-dark hover:bg-accent/90"
          >
            Riprova
          </button>
          <Link
            href="/clients"
            className="px-4 py-2 rounded-md font-medium border border-accent text-accent hover:bg-accent/10"
          >
            ← Torna ai clienti
          </Link>
        </div>
      </div>
    </div>
  )
}
