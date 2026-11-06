import type { CurrentUser } from '@/lib/auth-dev'

export type AssistantRole = 'ADMIN' | 'AGENTE'

export type ToolRisk = 'low' | 'medium' | 'high' | 'destructive'
export type ToolKind = 'read' | 'write'

export type AssistantAuthContext = {
  currentUserId: string
  role: AssistantRole
  permissions: {
    canWritePlatform: boolean
    canManageOwnDailyTasks: boolean
    canReadAssignedClients: boolean
    canReadAllClients: boolean
    canManageWorks: boolean
    canManagePed: boolean
    canManageShootings: boolean
    canManageRenewals: boolean
    canReadPreventivi: boolean
    canWritePreventivi: boolean
    canReadDashboard: boolean
    canReadCredentials: boolean
  }
  user: CurrentUser
}

export type ToolPreviewField = { label: string; value: string }

export type ToolPreview = {
  title: string
  summary: string
  fields?: ToolPreviewField[]
  href?: string
  entityType?: string
  risk?: ToolRisk
}

export type ToolSuccessResult = {
  ok: true
  summary: string
  data?: unknown
  href?: string
  entityType?: string
  entityId?: string
  quickLinks?: { label: string; href: string }[]
}

export type ToolErrorResult = {
  ok: false
  error: string
  code?: string
  clarify?: boolean
  choices?: { id: string; label: string }[]
}

export type ToolNeedsConfirmation = {
  ok: true
  needsConfirmation: true
  pendingId: string
  toolName: string
  preview: ToolPreview
  payload: Record<string, unknown>
}

export type ToolHandlerResult = ToolSuccessResult | ToolErrorResult | ToolNeedsConfirmation

export type AssistantV2Card =
  | {
      type: 'confirmation'
      pendingId: string
      toolName: string
      preview: ToolPreview
    }
  | {
      type: 'result'
      title: string
      summary: string
      href?: string
      success: boolean
    }
  | {
      type: 'choices'
      prompt: string
      choices: { id: string; label: string }[]
    }
  | {
      type: 'list'
      title: string
      items: { label: string; href?: string; meta?: string }[]
    }

export type AssistantV2Response = {
  reply: string
  mode: 'answer' | 'needs_confirmation' | 'action_result' | 'clarification'
  threadId: string
  pendingConfirmationId?: string
  cards?: AssistantV2Card[]
  toolTrace?: { name: string; ok: boolean; summary?: string }[]
  suggestedThreadTitle?: string | null
  usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number }
}

export type ThreadMemoryRefs = {
  lastClientId?: string | null
  lastClientName?: string | null
  lastWorkId?: string | null
  lastWorkTitle?: string | null
  lastTaskId?: string | null
  lastTaskTitle?: string | null
  lastUserId?: string | null
  lastUserName?: string | null
  lastSearchSummary?: string | null
}
