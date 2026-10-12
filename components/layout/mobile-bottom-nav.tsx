'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LogOut } from 'lucide-react'
import type { UserRole } from '@/lib/auth-dev'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  getBottomNavItems,
  getMoreMenuItems,
  isNavItemActive,
} from '@/components/layout/navigation-config'
import { cn } from '@/lib/utils'

const isClerkConfigured = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY

export function MobileBottomNav({
  role = null,
  currentUserName = null,
}: {
  role?: UserRole | null
  currentUserName?: string | null
}) {
  const pathname = usePathname()
  const [moreOpen, setMoreOpen] = useState(false)
  const items = getBottomNavItems(role)
  const moreItems = getMoreMenuItems(role)
  const signOutHref = isClerkConfigured ? '/sign-out' : '/dev-users'
  const roleLabel = role === 'AGENTE' ? 'Agente' : role === 'ADMIN' ? 'Admin' : 'Utente'

  const isAltroRouteActive =
    role !== 'AGENTE' && moreItems.some((item) => isNavItemActive(pathname, item.href))

  return (
    <>
      <nav
        aria-label="Navigazione principale"
        className={cn(
          'md:hidden fixed z-40',
          'left-3 right-3',
          'flex items-stretch justify-around gap-0.5',
          'rounded-[22px] border border-accent/20',
          'bg-[#0a0c0f]/95 backdrop-blur-md',
          'shadow-[0_8px_32px_rgba(0,0,0,0.45)]',
          'px-1.5 py-1.5'
        )}
        style={{
          bottom: 'max(10px, env(safe-area-inset-bottom))',
          height: '72px',
        }}
      >
        {items.map((item) => {
          const Icon = item.icon
          const isAltro = item.id === 'altro'
          const active = isAltro
            ? moreOpen || isAltroRouteActive
            : isNavItemActive(pathname, item.href)

          if (isAltro) {
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setMoreOpen(true)}
                aria-label="Altro"
                aria-expanded={moreOpen}
                aria-haspopup="dialog"
                className={cn(
                  'flex min-h-[44px] min-w-[44px] flex-1 flex-col items-center justify-center gap-0.5 rounded-2xl px-1 transition-colors duration-150',
                  active ? 'bg-accent/10 text-accent' : 'text-white/55 hover:text-white/80'
                )}
              >
                <Icon className="h-[21px] w-[21px]" strokeWidth={active ? 2.25 : 1.75} aria-hidden />
                <span className={cn('text-[10px] font-medium leading-none', active && 'text-accent')}>
                  {item.label}
                </span>
              </button>
            )
          }

          return (
            <Link
              key={item.id}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex min-h-[44px] min-w-[44px] flex-1 flex-col items-center justify-center gap-0.5 rounded-2xl px-1 transition-colors duration-150',
                active ? 'bg-accent/10 text-accent' : 'text-white/55 hover:text-white/80'
              )}
            >
              <Icon className="h-[21px] w-[21px]" strokeWidth={active ? 2.25 : 1.75} aria-hidden />
              <span className={cn('text-[10px] font-medium leading-none', active && 'text-accent')}>
                {item.label}
              </span>
            </Link>
          )
        })}
      </nav>

      <Dialog open={moreOpen} onOpenChange={setMoreOpen}>
        <DialogContent
          className={cn(
            'fixed inset-x-0 bottom-0 left-0 top-auto z-50 flex max-h-[min(85dvh,640px)] w-full max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-t-2xl rounded-b-none border border-accent/20 border-b-0 bg-dark p-0',
            'data-[state=open]:slide-in-from-bottom data-[state=closed]:slide-out-to-bottom',
            'md:hidden'
          )}
          overlayClassName="md:hidden"
        >
          <div
            className="px-5 pb-4 pt-3"
            style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/20" aria-hidden />
            <DialogHeader className="mb-4 text-left">
              <DialogTitle className="text-base text-white">
                {currentUserName?.trim() || 'Menu'}
              </DialogTitle>
              <DialogDescription className="text-sm text-white/55">
                {roleLabel} · sezioni aggiuntive
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col gap-1">
              {moreItems.map((item) => {
                const Icon = item.icon
                const active = isNavItemActive(pathname, item.href)
                return (
                  <Link
                    key={item.id}
                    href={item.href}
                    onClick={() => setMoreOpen(false)}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'flex min-h-[48px] items-center gap-3 rounded-xl px-3 text-[15px] transition-colors',
                      active
                        ? 'bg-accent/10 text-accent'
                        : 'text-white/85 hover:bg-white/5'
                    )}
                  >
                    <Icon className="h-5 w-5 shrink-0" aria-hidden />
                    <span className="min-w-0 break-words">{item.label}</span>
                  </Link>
                )
              })}

              {role === 'AGENTE' && (
                <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-3 text-sm text-white/70">
                  <p className="font-medium text-white/90">{currentUserName?.trim() || 'Utente'}</p>
                  <p className="mt-0.5 text-white/50">{roleLabel}</p>
                </div>
              )}

              <Link
                href={signOutHref}
                onClick={() => setMoreOpen(false)}
                className="mt-2 flex min-h-[48px] items-center gap-3 rounded-xl px-3 text-[15px] text-red-300 hover:bg-red-500/10"
              >
                <LogOut className="h-5 w-5 shrink-0" aria-hidden />
                Esci
              </Link>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
