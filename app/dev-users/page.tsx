import { redirect } from 'next/navigation'
import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { NavbarWithAuth } from '@/components/layout/navbar-with-auth'

const isClerkConfigured = !!(
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY &&
  process.env.CLERK_SECRET_KEY
)

export default async function DevUsersPage() {
  if (isClerkConfigured) redirect('/')

  let users: { id: string; name: string; email: string; role: string }[]
  try {
    users = await prisma.user.findMany({
      where: { isActive: true },
      orderBy: [{ role: 'asc' }, { name: 'asc' }],
    })
  } catch (err) {
    console.error('[dev-users]', err)
    return (
      <div className="min-h-screen bg-dark p-6 flex items-center justify-center">
        <div className="text-center max-w-lg">
          <h1 className="text-xl font-bold text-white mb-2">Errore di connessione</h1>
          <p className="text-white/70 text-sm font-mono mb-4 break-all">
            {err instanceof Error ? err.message : String(err)}
          </p>
          <p className="text-white/50 text-xs mb-6">
            Controlla che il database sia accessibile (file dev.db) e il terminale per i dettagli.
          </p>
          <Link href="/" className="text-accent hover:underline">
            ← Torna alla home
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-dark">
      <NavbarWithAuth />
      <div className="w-[90vw] max-w-[90vw] mx-auto p-6">
        <Link href="/" className="text-accent hover:underline mb-4 inline-block">
          ← Torna all’app
        </Link>
        <h1 className="text-2xl font-bold text-white mb-2">Cambia utente (solo sviluppo)</h1>
        <p className="text-white/70 text-sm mb-6">
          Scegli con quale account simulare l’accesso. In produzione si usa il login Clerk.
        </p>
        <ul className="space-y-3">
          {users.map((u) => (
            <li
              key={u.id}
              className="flex items-center justify-between gap-4 rounded-lg border border-accent/20 bg-white/5 px-4 py-3"
            >
              <div>
                <span className="text-white font-medium">{u.name}</span>
                <span className="text-white/60 text-sm ml-2">({u.email})</span>
                <span
                  className={`ml-2 text-xs px-2 py-0.5 rounded ${
                    u.role === 'ADMIN' ? 'bg-accent/20 text-accent' : 'bg-white/20 text-white/80'
                  }`}
                >
                  {u.role}
                </span>
              </div>
              <Link
                href={`/api/dev-users/set?userId=${encodeURIComponent(u.id)}`}
                className="px-3 py-1.5 text-sm rounded bg-accent text-dark hover:bg-accent/90 inline-block"
              >
                Accedi come
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
