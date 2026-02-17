'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { UserRole } from '@/lib/auth-dev'

const isClerkConfigured = !!(
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY &&
  process.env.CLERK_SECRET_KEY
)

let UserButton: any = () => (
  <div className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center text-accent text-sm">
    Dev
  </div>
)
if (typeof window !== 'undefined' && isClerkConfigured) {
  try {
    const Clerk = require('@clerk/nextjs')
    UserButton = Clerk.UserButton
  } catch (e) {
    // Clerk non disponibile
  }
}

const allNavItems = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/clients', label: 'Clienti' },
  { href: '/categories', label: 'Categorie' },
  { href: '/works', label: 'Lavori' },
  { href: '/preventivi', label: 'Preventivi' },
  { href: '/ped', label: 'PED' },
  { href: '/calendar', label: 'Calendario' },
  { href: '/profilo', label: 'Area operativa' },
]

/** Per Agenti: solo Clienti e Preventivi (solo lettura). PED non visibile. */
const agenteNavItems = [
  { href: '/clients', label: 'Clienti' },
  { href: '/preventivi', label: 'Preventivi' },
  { href: '/profilo', label: 'Area operativa' },
]

export function Navbar({
  role = null,
  showDevSwitcher = false,
  currentUserName = null,
}: {
  role?: UserRole | null
  showDevSwitcher?: boolean
  currentUserName?: string | null
}) {
  const pathname = usePathname()
  const navItems = role === 'AGENTE' ? agenteNavItems : allNavItems
  const homeHref = role === 'AGENTE' ? '/clients' : '/dashboard'

  return (
    <nav
      className="bg-dark border-b border-accent/20"
      style={{
        backgroundColor: 'var(--dark, #0c0e11)',
        borderBottom: '1px solid rgba(16, 249, 199, 0.2)',
        padding: '1rem 1.5rem',
      }}
    >
      <div className="w-[90vw] max-w-[90vw] mx-auto px-6 py-4">
        <div className="flex items-center justify-between" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
          <div className="flex items-center space-x-8" style={{ display: 'flex', alignItems: 'center', gap: '2rem' }}>
            <Link href={homeHref} className="text-xl font-bold text-white" style={{ color: '#fff', textDecoration: 'none', fontSize: '1.25rem', fontWeight: 700 }}>
              Soirëe Studio
            </Link>
            <div className="flex space-x-4" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              {navItems.map((item) => {
                const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                      isActive ? 'bg-accent/20 text-accent' : 'text-white/70 hover:text-white hover:bg-white/5'
                    }`}
                    style={{
                      color: isActive ? 'var(--accent, #10f9c7)' : 'rgba(255,255,255,0.8)',
                      textDecoration: 'none',
                      padding: '0.5rem 0.75rem',
                      borderRadius: '0.375rem',
                      fontSize: '0.875rem',
                      backgroundColor: isActive ? 'rgba(16, 249, 199, 0.2)' : 'transparent',
                    }}
                  >
                    {item.label}
                  </Link>
                )
              })}
              {isClerkConfigured ? (
                <Link
                  href="/sign-out"
                  className="px-3 py-2 rounded-md text-sm font-medium text-white/70 hover:text-white hover:bg-white/5 transition-colors"
                  style={{ color: 'rgba(255,255,255,0.8)', textDecoration: 'none' }}
                >
                  Esci
                </Link>
              ) : (
                <Link
                  href="/dev-users"
                  className="px-3 py-2 rounded-md text-sm font-medium text-white/70 hover:text-white hover:bg-white/5"
                  style={{ color: 'rgba(255,255,255,0.8)', textDecoration: 'none' }}
                >
                  Esci
                </Link>
              )}
            </div>
          </div>
          <div className="flex items-center gap-4" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            {showDevSwitcher && (
              <Link
                href="/dev-users"
                className="text-sm text-white/70 hover:text-accent"
                title="Cambia utente (solo sviluppo)"
                style={{ color: 'rgba(255,255,255,0.8)', textDecoration: 'none', fontSize: '0.875rem' }}
              >
                {currentUserName ? `Accesso: ${currentUserName}` : 'Cambia utente'}
              </Link>
            )}
            <UserButton afterSignOutUrl="/sign-in" />
          </div>
        </div>
      </div>
    </nav>
  )
}
