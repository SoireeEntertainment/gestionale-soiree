'use client'

import { useEffect, useRef } from 'react'
import { useAuth, useClerk } from '@clerk/nextjs'

/**
 * Logout ufficiale Clerk. Attende isLoaded per non raceare con l'init/handshake.
 */
export function SignOutClient() {
  const { isLoaded } = useAuth()
  const { signOut } = useClerk()
  const started = useRef(false)

  useEffect(() => {
    if (!isLoaded || started.current) return
    started.current = true
    void signOut({ redirectUrl: '/sign-in' }).catch((e) => {
      console.error('[sign-out] signOut failed', e)
      window.location.href = '/sign-in'
    })
  }, [isLoaded, signOut])

  return null
}
