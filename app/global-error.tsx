'use client'

import { useEffect } from 'react'

export default function GlobalError({
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
    <html lang="it">
      <body style={{ margin: 0, background: '#0c0e11', color: '#fff', fontFamily: 'sans-serif', padding: 24, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <h1 style={{ fontSize: '1.25rem', marginBottom: 8 }}>Errore</h1>
          <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14, marginBottom: 24 }}>
            Ricarica la pagina o torna alla home.
          </p>
          <button
            onClick={() => reset()}
            style={{ padding: '8px 16px', borderRadius: 6, background: '#10f9c7', color: '#0c0e11', border: 'none', cursor: 'pointer', fontWeight: 500 }}
          >
            Riprova
          </button>
          <a
            href="/"
            style={{ display: 'inline-block', marginLeft: 12, padding: '8px 16px', borderRadius: 6, border: '1px solid #10f9c7', color: '#10f9c7', textDecoration: 'none', fontWeight: 500 }}
          >
            Home
          </a>
        </div>
      </body>
    </html>
  )
}
