import type { CurrentUser } from '@/lib/auth-dev'
import { canWrite } from '@/lib/auth-dev'
import type { AssistantAuthContext, AssistantRole } from '@/lib/assistant-v2/types'

/** Costruisce il contesto auth lato server. Il modello non può mai fornirlo. */
export function buildAssistantAuthContext(user: CurrentUser): AssistantAuthContext {
  const role = (user.role === 'AGENTE' ? 'AGENTE' : 'ADMIN') as AssistantRole
  const isAdmin = role === 'ADMIN'
  const writePlatform = canWrite(user)

  return {
    currentUserId: user.id,
    role,
    user,
    permissions: {
      canWritePlatform: writePlatform,
      canManageOwnDailyTasks: true,
      canReadAssignedClients: true,
      canReadAllClients: isAdmin,
      canManageWorks: writePlatform,
      canManagePed: writePlatform,
      canManageShootings: writePlatform,
      canManageRenewals: writePlatform,
      canReadPreventivi: true,
      canWritePreventivi: writePlatform,
      canReadDashboard: isAdmin,
      canReadCredentials: false, // mai esporre password via AI
    },
  }
}
