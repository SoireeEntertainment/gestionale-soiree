'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import Link from 'next/link'

export default function PedError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[PED error boundary]', error)
  }, [error])

  return (
    <div className="min-h-screen bg-dark p-6 flex flex-col items-center justify-center gap-4">
      <h1 className="text-xl font-semibold text-white">Errore nel Piano Editoriale</h1>
      <p className="text-white/70 text-sm max-w-md text-center">
        Si è verificato un errore durante il caricamento della pagina PED. Puoi riprovare o tornare alla dashboard.
      </p>
      <div className="flex gap-3">
        <Button variant="secondary" onClick={reset}>
          Riprova
        </Button>
        <Link href="/dashboard">
          <Button variant="primary">Vai alla dashboard</Button>
        </Link>
      </div>
    </div>
  )
}
