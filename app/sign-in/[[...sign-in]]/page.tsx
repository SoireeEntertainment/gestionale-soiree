import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getAuthUserId } from '@/lib/auth-dev'

export default async function SignInPage() {
  const userId = await getAuthUserId()
  if (userId) redirect('/dashboard')

  return (
    <div className="min-h-screen bg-dark flex items-center justify-center p-6">
      <div className="max-w-sm w-full text-center">
        <h1 className="text-2xl font-bold text-white mb-2">Accedi</h1>
        <p className="text-white/70 mb-6 text-sm">
          Configura Clerk per l&apos;autenticazione oppure usa la modalità sviluppo.
        </p>
        <Link
          href="/dashboard"
          className="inline-block px-6 py-3 rounded-md font-medium bg-accent text-dark hover:bg-accent/90"
        >
          Vai alla Dashboard (dev)
        </Link>
      </div>
    </div>
  )
}
