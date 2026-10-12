'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { UserRole } from '@/lib/auth-dev'
import {
  getDesktopNavItems,
  getHomeHref,
  isNavItemActive,
} from '@/components/layout/navigation-config'
import { MobileBottomNav } from '@/components/layout/mobile-bottom-nav'

// Solo NEXT_PUBLIC_ è disponibile sul client; per il link Esci basta la publishable key
const isClerkConfigured = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY

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
  const navItems = getDesktopNavItems(role)
  const homeHref = getHomeHref(role)
  const initial = currentUserName?.trim()?.[0]?.toUpperCase() ?? (isClerkConfigured ? '?' : 'D')

  return (
    <>
      {/* Top bar mobile minimale */}
      <header
        className="md:hidden sticky top-0 z-30 border-b border-accent/20 bg-dark/95 backdrop-blur-md"
        style={{
          paddingTop: 'env(safe-area-inset-top)',
          backgroundColor: 'rgba(12, 14, 17, 0.95)',
        }}
      >
        <div className="flex h-[56px] items-center justify-between px-4">
          <Link
            href={homeHref}
            className="text-lg font-bold text-white tracking-tight"
            style={{ color: '#fff', textDecoration: 'none' }}
          >
            Soirëe Studio
          </Link>
          <div className="flex items-center gap-2">
            {showDevSwitcher && (
              <Link
                href="/dev-users"
                className="text-xs text-white/60 hover:text-accent"
                title="Cambia utente"
              >
                Dev
              </Link>
            )}
            <div
              className="flex h-9 w-9 items-center justify-center rounded-full bg-accent/20 text-sm font-medium text-accent"
              title={currentUserName ?? (isClerkConfigured ? 'Utente' : 'Dev')}
              aria-label={currentUserName ? `Utente ${currentUserName}` : 'Utente'}
            >
              {initial}
            </div>
          </div>
        </div>
      </header>

      {/* Navbar desktop invariata nella struttura/layout */}
      <nav
        className="hidden md:block bg-dark border-b border-accent/20"
        style={{
          backgroundColor: 'var(--dark, #0c0e11)',
          borderBottom: '1px solid rgba(16, 249, 199, 0.2)',
          padding: '1rem 1.5rem',
        }}
      >
        <div className="w-[90vw] max-w-[90vw] mx-auto px-6 py-4">
          <div
            className="flex items-center justify-between"
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '1rem',
            }}
          >
            <div
              className="flex items-center space-x-8"
              style={{ display: 'flex', alignItems: 'center', gap: '2rem' }}
            >
              <Link
                href={homeHref}
                className="text-xl font-bold text-white"
                style={{
                  color: '#fff',
                  textDecoration: 'none',
                  fontSize: '1.25rem',
                  fontWeight: 700,
                }}
              >
                Soirëe Studio
              </Link>
              <div
                className="flex space-x-4"
                style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}
              >
                {navItems.map((item) => {
                  const isActive = isNavItemActive(pathname, item.href)
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                        isActive
                          ? 'bg-accent/20 text-accent'
                          : 'text-white/70 hover:text-white hover:bg-white/5'
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
            <div
              className="flex items-center gap-4"
              style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}
            >
              {showDevSwitcher && (
                <Link
                  href="/dev-users"
                  className="text-sm text-white/70 hover:text-accent"
                  title="Cambia utente (solo sviluppo)"
                  style={{
                    color: 'rgba(255,255,255,0.8)',
                    textDecoration: 'none',
                    fontSize: '0.875rem',
                  }}
                >
                  {currentUserName ? `Accesso: ${currentUserName}` : 'Cambia utente'}
                </Link>
              )}
              <div
                className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center text-accent text-sm font-medium"
                title={currentUserName ?? (isClerkConfigured ? 'Utente' : 'Dev')}
                style={{ minWidth: '2rem', minHeight: '2rem' }}
              >
                {initial}
              </div>
            </div>
          </div>
        </div>
      </nav>

      <MobileBottomNav role={role} currentUserName={currentUserName} />
    </>
  )
}
