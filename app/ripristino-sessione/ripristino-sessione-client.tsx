'use client'

import { useEffect } from 'react'
import { AUTH_RECOVERY_PARAM } from '@/lib/auth-classification'

export function RipristinoSessioneClient({ nextPath }: { nextPath: string }) {
  useEffect(() => {
    const url = new URL(nextPath, window.location.origin)
    url.searchParams.set(AUTH_RECOVERY_PARAM, '1')
    window.location.replace(url.toString())
  }, [nextPath])

  return (
    <div
      className="min-h-screen flex items-center justify-center p-6"
      style={{ backgroundColor: 'var(--dark, #0c0e11)', color: '#fff' }}
    >
      <p className="text-white/70 text-sm">Ripristino della sessione…</p>
    </div>
  )
}
