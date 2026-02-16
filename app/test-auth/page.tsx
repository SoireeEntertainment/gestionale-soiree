import { requireAuth } from '@/lib/auth-dev'

export default async function TestAuthPage() {
  const user = await requireAuth()
  return (
    <div className="min-h-screen bg-dark p-8">
      <div className="max-w-md mx-auto text-center">
        <h1 className="text-xl font-bold text-accent mb-2">Auth OK</h1>
        <p className="text-white/80">Utente: {user.name} ({user.role})</p>
        <a href="/dashboard" className="text-accent underline mt-4 inline-block">
          Vai alla Dashboard
        </a>
      </div>
    </div>
  )
}
