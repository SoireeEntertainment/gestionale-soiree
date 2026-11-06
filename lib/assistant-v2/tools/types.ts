import type { z } from 'zod'
import type { ToolPermissionKey } from '@/lib/assistant-v2/permissions'
import type {
  AssistantAuthContext,
  ToolHandlerResult,
  ToolKind,
  ToolPreview,
  ToolRisk,
} from '@/lib/assistant-v2/types'

export type ToolExecutionContext = {
  auth: AssistantAuthContext
  threadId: string
  /** Riferimenti conversazionali del thread. */
  memory: {
    lastClientId?: string | null
    lastClientName?: string | null
    lastWorkId?: string | null
    lastTaskId?: string | null
    lastUserId?: string | null
  }
}

export type AssistantToolDefinition<TSchema extends z.ZodTypeAny = z.ZodTypeAny> = {
  name: string
  description: string
  kind: ToolKind
  risk: ToolRisk
  requiresConfirmation: boolean
  permission: ToolPermissionKey
  inputSchema: TSchema
  /** Esegue lettura o prepara pending per scrittura. */
  execute: (input: z.infer<TSchema>, ctx: ToolExecutionContext) => Promise<ToolHandlerResult>
  /** Esegue la mutazione dopo conferma (solo write). */
  commit?: (input: z.infer<TSchema>, ctx: ToolExecutionContext) => Promise<ToolHandlerResult>
  buildPreview?: (input: z.infer<TSchema>, ctx: ToolExecutionContext) => Promise<ToolPreview> | ToolPreview
}
