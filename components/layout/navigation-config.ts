import type { LucideIcon } from 'lucide-react'
import {
  LayoutDashboard,
  Users,
  BriefcaseBusiness,
  CalendarDays,
  FileText,
  Tags,
  UserRound,
  Ellipsis,
} from 'lucide-react'
import type { UserRole } from '@/lib/auth-dev'

export type NavItemId =
  | 'dashboard'
  | 'clients'
  | 'categories'
  | 'works'
  | 'preventivi'
  | 'ped'
  | 'profilo'
  | 'altro'

export type NavItemConfig = {
  id: NavItemId
  href: string
  label: string
  icon: LucideIcon
  /** Se assente, visibile a tutti i ruoli autenticati. */
  roles?: UserRole[]
}

/** Voce primaria desktop / source of truth per i link di sezione. */
export const PRIMARY_NAV_ITEMS: NavItemConfig[] = [
  { id: 'dashboard', href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['ADMIN'] },
  { id: 'clients', href: '/clients', label: 'Clienti', icon: Users },
  { id: 'categories', href: '/categories', label: 'Categorie', icon: Tags, roles: ['ADMIN'] },
  { id: 'works', href: '/works', label: 'Lavori', icon: BriefcaseBusiness, roles: ['ADMIN'] },
  { id: 'preventivi', href: '/preventivi', label: 'Preventivi', icon: FileText },
  { id: 'ped', href: '/ped', label: 'PED', icon: CalendarDays, roles: ['ADMIN'] },
  { id: 'profilo', href: '/profilo', label: 'Area operativa', icon: UserRound },
]

/** Destinazioni bottom nav ADMIN (5 slot, ultima = Altro). */
export const ADMIN_BOTTOM_NAV_ITEMS: NavItemConfig[] = [
  { id: 'dashboard', href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'clients', href: '/clients', label: 'Clienti', icon: Users },
  { id: 'works', href: '/works', label: 'Lavori', icon: BriefcaseBusiness },
  { id: 'ped', href: '/ped', label: 'PED', icon: CalendarDays },
  { id: 'altro', href: '#altro', label: 'Altro', icon: Ellipsis },
]

/** Destinazioni bottom nav AGENTE. */
export const AGENTE_BOTTOM_NAV_ITEMS: NavItemConfig[] = [
  { id: 'clients', href: '/clients', label: 'Clienti', icon: Users },
  { id: 'preventivi', href: '/preventivi', label: 'Preventivi', icon: FileText },
  { id: 'profilo', href: '/profilo', label: 'Area operativa', icon: UserRound },
  { id: 'altro', href: '#altro', label: 'Altro', icon: Ellipsis },
]

/** Sezioni secondarie nel foglio "Altro" (ADMIN). */
export const ADMIN_MORE_MENU_ITEMS: NavItemConfig[] = [
  { id: 'preventivi', href: '/preventivi', label: 'Preventivi', icon: FileText },
  { id: 'categories', href: '/categories', label: 'Categorie', icon: Tags },
  { id: 'profilo', href: '/profilo', label: 'Area operativa', icon: UserRound },
]

export function getDesktopNavItems(role: UserRole | null | undefined): NavItemConfig[] {
  if (role === 'AGENTE') {
    return PRIMARY_NAV_ITEMS.filter((item) => !item.roles || item.roles.includes('AGENTE'))
  }
  return PRIMARY_NAV_ITEMS.filter((item) => !item.roles || item.roles.includes('ADMIN'))
}

export function getBottomNavItems(role: UserRole | null | undefined): NavItemConfig[] {
  return role === 'AGENTE' ? AGENTE_BOTTOM_NAV_ITEMS : ADMIN_BOTTOM_NAV_ITEMS
}

export function getMoreMenuItems(role: UserRole | null | undefined): NavItemConfig[] {
  if (role === 'AGENTE') return []
  return ADMIN_MORE_MENU_ITEMS
}

export function getHomeHref(role: UserRole | null | undefined): string {
  return role === 'AGENTE' ? '/clients' : '/dashboard'
}

export function isNavItemActive(pathname: string, href: string): boolean {
  if (href === '#altro') return false
  if (pathname === href) return true
  if (href === '/dashboard') return false
  return pathname.startsWith(href)
}
