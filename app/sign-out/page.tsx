'use client'

import dynamic from 'next/dynamic'

const SignOutClient = dynamic(
  () => import('./sign-out-client').then((m) => ({ default: m.SignOutClient })),
  { ssr: false }
)

export default function SignOutPage() {
  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ backgroundColor: 'var(--dark, #0c0e11)', color: '#fff' }}
    >
      <p className="text-white/70">Disconnessione in corso...</p>
      <SignOutClient />
    </div>
  )
}
