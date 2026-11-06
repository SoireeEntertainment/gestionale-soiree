import type { AssistantAuthContext, ToolKind } from '@/lib/assistant-v2/types'

export type ToolPermissionKey =
  | 'daily_tasks'
  | 'contact_client'
  | 'clients_read'
  | 'clients_write'
  | 'works_read'
  | 'works_write'
  | 'ped_read'
  | 'ped_write'
  | 'shootings_read'
  | 'shootings_write'
  | 'renewals_read'
  | 'renewals_write'
  | 'preventivi_read'
  | 'preventivi_write'
  | 'categories_read'
  | 'dashboard_read'

export function canUseToolPermission(
  auth: AssistantAuthContext,
  permission: ToolPermissionKey,
  kind: ToolKind
): boolean {
  const p = auth.permissions

  switch (permission) {
    case 'daily_tasks':
    case 'contact_client':
      return p.canManageOwnDailyTasks
    case 'clients_read':
      return p.canReadAssignedClients || p.canReadAllClients
    case 'clients_write':
      return kind === 'write' && p.canWritePlatform
    case 'works_read':
      return auth.role === 'ADMIN'
    case 'works_write':
      return p.canManageWorks
    case 'ped_read':
      return auth.role === 'ADMIN'
    case 'ped_write':
      return p.canManagePed
    case 'shootings_read':
      return auth.role === 'ADMIN' || p.canReadAssignedClients
    case 'shootings_write':
      return p.canManageShootings
    case 'renewals_read':
      return auth.role === 'ADMIN' || p.canReadAssignedClients
    case 'renewals_write':
      return p.canManageRenewals
    case 'preventivi_read':
      return p.canReadPreventivi
    case 'preventivi_write':
      return p.canWritePreventivi
    case 'categories_read':
      return true
    case 'dashboard_read':
      return p.canReadDashboard
    default:
      return false
  }
}

export function denyMessage(permission: ToolPermissionKey): string {
  return `Non sei autorizzato a usare questa funzione (${permission}).`
}
