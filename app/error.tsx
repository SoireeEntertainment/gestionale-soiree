'use client'

import { useEffect } from 'react'
import Link from 'next/link'

export default function Error({
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
    <div className="min-h-screen bg-dark flex items-center justify-center p-6">
      <div className="text-center max-w-lg">
        <h1 className="text-xl font-bold text-white mb-2">Si è verificato un errore</h1>
        <p className="text-white/70 text-sm font-mono mb-4 break-all">
          {error.message}
        </p>
        <div className="flex gap-3 justify-center flex-wrap">
          <button
            onClick={reset}
            className="px-4 py-2 rounded-md font-medium bg-accent text-dark hover:bg-accent/90"
          >
            Riprova
          </button>
          <Link
            href="/dev-users"
            className="px-4 py-2 rounded-md font-medium border border-accent text-accent hover:bg-accent/10"
          >
            Accedi con un utente
          </Link>
          <Link
            href="/clients"
            className="px-4 py-2 rounded-md font-medium border border-accent text-accent hover:bg-accent/10"
          >
            Clienti
          </Link>
        </div>
      </div>
    </div>
  )
}
