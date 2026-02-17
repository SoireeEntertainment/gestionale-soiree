'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useClerk } from '@clerk/nextjs'

function SignOutRedirect() {
  const { signOut } = useClerk()
  const router = useRouter()
  useEffect(() => {
    if (signOut) {
      signOut({ redirectUrl: '/sign-in' })
    } else {
      router.replace('/sign-in')
    }
  }, [signOut, router])
  return null
}

export default function SignOutPage() {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  if (!mounted) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ backgroundColor: 'var(--dark, #0c0e11)', color: '#fff' }}
      >
        <p className="text-white/70">Disconnessione in corso...</p>
      </div>
    )
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ backgroundColor: 'var(--dark, #0c0e11)', color: '#fff' }}
    >
      <p className="text-white/70">Disconnessione in corso...</p>
      <SignOutRedirect />
    </div>
  )
}
