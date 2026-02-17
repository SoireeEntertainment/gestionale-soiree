'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { SignIn, useAuth } from '@clerk/nextjs'
import { useEffect } from 'react'

const clerkConfigured =
  typeof window !== 'undefined' &&
  !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY

const darkAppearance = {
  baseTheme: undefined,
  variables: {
    colorBackground: '#0c0e11',
    colorInputBackground: '#1a1d23',
    colorInputText: '#fff',
    colorText: '#fff',
    colorTextSecondary: 'rgba(255,255,255,0.7)',
  },
  elements: {
    rootBox: 'w-full max-w-md',
    card: 'bg-[#1a1d23] shadow-xl',
  },
}

export function SignInForm() {
  const router = useRouter()
  const { isSignedIn, isLoaded } = useAuth()

  // Redirect a dashboard solo se isSignedIn resta true per 400ms (evita loop dopo logout / incognito)
  useEffect(() => {
    if (!isLoaded || !isSignedIn) return
    const t = setTimeout(() => router.replace('/dashboard'), 400)
    return () => clearTimeout(t)
  }, [isLoaded, isSignedIn, router])

  if (clerkConfigured) {
    if (!isLoaded || isSignedIn) {
      return (
        <div className="flex items-center justify-center min-h-screen bg-dark">
          <p className="text-white/70">Caricamento...</p>
        </div>
      )
    }
    return (
      <div className="flex items-center justify-center min-h-screen bg-dark py-12">
        <SignIn
          fallbackRedirectUrl="/dashboard"
          forceRedirectUrl="/dashboard"
          appearance={darkAppearance}
        />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-dark flex items-center justify-center p-6">
      <div className="max-w-sm w-full text-center">
        <h1 className="text-2xl font-bold text-white mb-2">Accedi</h1>
        <p className="text-white/70 mb-6 text-sm">
          Configura Clerk (variabili d&apos;ambiente) per l&apos;autenticazione
          oppure usa la modalità sviluppo.
        </p>
        <Link
          href="/dev-users"
          className="inline-block px-6 py-3 rounded-md font-medium bg-accent text-dark hover:bg-accent/90"
        >
          Accedi in modalità sviluppo
        </Link>
      </div>
    </div>
  )
}
