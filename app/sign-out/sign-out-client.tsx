'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useClerk } from '@clerk/nextjs'

export function SignOutClient() {
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
