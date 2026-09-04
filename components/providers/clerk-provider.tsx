'use client'

import { ClerkProvider } from '@clerk/nextjs'

const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY

/**
 * Configurazione Clerk centralizzata: un solo posto decide URL di sign-in/out
 * e redirect post-login, evitando race con redirect client sparsi.
 */
export function ClerkProviderWrapper({ children }: { children: React.ReactNode }) {
  if (!publishableKey) return <>{children}</>
  return (
    <ClerkProvider
      publishableKey={publishableKey}
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      afterSignOutUrl="/sign-in"
      signInFallbackRedirectUrl="/dashboard"
      signUpFallbackRedirectUrl="/dashboard"
    >
      {children}
    </ClerkProvider>
  )
}
