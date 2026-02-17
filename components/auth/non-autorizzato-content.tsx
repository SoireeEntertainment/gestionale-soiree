'use client'

import Link from 'next/link'
import { SignOutButton } from '@clerk/nextjs'
import { useState, useEffect } from 'react'

export function NonAutorizzatoContent() {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

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
          {mounted ? (
            <SignOutButton signOutOptions={{ redirectUrl: '/sign-in' }}>
              <button
                type="button"
                className="px-4 py-2 rounded-md font-medium bg-white/10 text-white border border-white/20 hover:bg-white/20"
              >
                Esci e accedi con un altro account
              </button>
            </SignOutButton>
          ) : (
            <span className="px-4 py-2 rounded-md font-medium bg-white/10 text-white border border-white/20 opacity-80">
              Esci e accedi con un altro account
            </span>
          )}
          <Link
            href="/sign-in"
            className="px-4 py-2 rounded-md font-medium bg-accent text-dark hover:bg-accent/90 inline-block"
          >
            Torna al login
          </Link>
        </div>
      </div>
    </div>
  )
}
