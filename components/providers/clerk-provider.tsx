'use client'

import { useState, useEffect } from 'react'

export function ClerkProviderWrapper({ children }: { children: React.ReactNode }) {
  const [Provider, setProvider] = useState<React.ComponentType<{ children: React.ReactNode }>>(() => ({ children }: { children: React.ReactNode }) => <>{children}</>)

  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
    if (!key) return
    import('@clerk/nextjs')
      .then((Clerk) => setProvider(() => Clerk.ClerkProvider))
      .catch(() => {})
  }, [])

  return <Provider>{children}</Provider>
}
