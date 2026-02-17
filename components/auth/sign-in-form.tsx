'use client'

import Link from 'next/link'
import { SignIn } from '@clerk/nextjs'

const clerkConfigured =
  typeof window !== 'undefined' &&
  !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY

export function SignInForm() {
  if (clerkConfigured) {
    return (
      <div className="flex items-center justify-center min-h-[70vh]">
        <SignIn fallbackRedirectUrl="/dashboard" />
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
