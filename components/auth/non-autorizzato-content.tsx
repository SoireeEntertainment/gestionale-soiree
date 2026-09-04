'use client'

import { useClerk, useAuth } from '@clerk/nextjs'
import { useState } from 'react'

export function NonAutorizzatoContent() {
  const { isLoaded } = useAuth()
  const { signOut } = useClerk()
  const [signingOut, setSigningOut] = useState(false)

  const handleRealSignOut = async () => {
    if (signingOut || !isLoaded) return
    setSigningOut(true)
    try {
      // Sempre signOut Clerk: un semplice link a /login lascerebbe cookie di sessione
      // obsoleti e potrebbe riattivare l'handshake in loop.
      await signOut({ redirectUrl: '/sign-in' })
    } catch (e) {
      console.error('[non-autorizzato] signOut failed', e)
      window.location.href = '/sign-in'
    } finally {
      setSigningOut(false)
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-6"
      style={{ backgroundColor: 'var(--dark, #0c0e11)', color: '#fff' }}
    >
      <div className="max-w-md w-full text-center">
        <h1 className="text-2xl font-bold text-white mb-3">Accesso non autorizzato</h1>
        <p className="text-white/70 text-sm mb-6">
          Il tuo account non risulta abilitato al gestionale. Se hai appena ricevuto l’invito, assicurati che la tua email sia stata aggiunta come utente nell’app. Per assistenza contatta l’amministratore.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            type="button"
            onClick={() => void handleRealSignOut()}
            disabled={signingOut || !isLoaded}
            className="px-4 py-2 rounded-md font-medium bg-white/10 text-white border border-white/20 hover:bg-white/20 disabled:opacity-60"
          >
            {signingOut ? 'Uscita in corso…' : 'Esci e accedi con un altro account'}
          </button>
          <button
            type="button"
            onClick={() => void handleRealSignOut()}
            disabled={signingOut || !isLoaded}
            className="px-4 py-2 rounded-md font-medium bg-accent text-dark hover:bg-accent/90 disabled:opacity-60"
          >
            Torna al login
          </button>
        </div>
      </div>
    </div>
  )
}
