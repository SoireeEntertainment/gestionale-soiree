'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@clerk/nextjs'

function RedirectToDev() {
  const router = useRouter()
  useEffect(() => {
    router.replace('/dev-users')
  }, [router])
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--dark, #0c0e11)', color: '#fff' }}>
      <p className="text-white/70">Caricamento...</p>
    </div>
  )
}

function HomeRedirectWithClerk() {
  const router = useRouter()
  const { isSignedIn, isLoaded } = useAuth()
  useEffect(() => {
    if (!isLoaded) return
    router.replace(isSignedIn ? '/dashboard' : '/sign-in')
  }, [isLoaded, isSignedIn, router])
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--dark, #0c0e11)', color: '#fff' }}>
      <p className="text-white/70">Caricamento...</p>
    </div>
  )
}

export function HomeRedirect({ clerkConfigured }: { clerkConfigured: boolean }) {
  if (!clerkConfigured) return <RedirectToDev />
  return <HomeRedirectWithClerk />
}
