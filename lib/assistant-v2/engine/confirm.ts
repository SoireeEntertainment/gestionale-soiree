import {
  cancelPendingAction,
  claimPendingAction,
  markPendingExecuted,
  verifyPayloadHash,
} from '@/lib/assistant-v2/confirmation/service'
import { buildAssistantAuthContext } from '@/lib/assistant-v2/auth-context'
import { getToolByName } from '@/lib/assistant-v2/tools/registry'
import { canUseToolPermission } from '@/lib/assistant-v2/permissions'
import { logAssistantV2Action, assistantV2Log } from '@/lib/assistant-v2/logging'
import { memoryPatchFromToolResult, patchThreadV2Memory } from '@/lib/assistant-v2/memory/thread'
import type { AssistantV2Response } from '@/lib/assistant-v2/types'
import type { CurrentUser } from '@/lib/auth-dev'

export async function confirmAssistantV2Action(input: {
  user: CurrentUser
  threadId: string
  pendingId: string
}): Promise<AssistantV2Response> {
  const auth = buildAssistantAuthContext(input.user)
  const claimed = await claimPendingAction({
    pendingId: input.pendingId,
    userId: auth.currentUserId,
    threadId: input.threadId,
  })
  if (!claimed.ok) {
    return {
      reply: claimed.error,
      mode: 'clarification',
      threadId: input.threadId,
    }
  }

  const row = claimed.row
  const tool = getToolByName(row.toolName)
  if (!tool || !tool.commit) {
    return {
      reply: 'Strumento non più disponibile per questa conferma.',
      mode: 'clarification',
      threadId: input.threadId,
    }
  }

  if (!canUseToolPermission(auth, tool.permission, tool.kind)) {
    return {
      reply: 'Non sei autorizzato a eseguire questa operazione.',
      mode: 'clarification',
      threadId: input.threadId,
    }
  }

  const payload = row.payload as Record<string, unknown>
  if (!verifyPayloadHash(row.toolName, payload, row.payloadHash)) {
    return {
      reply: 'Il payload approvato non corrisponde. Operazione bloccata per sicurezza.',
      mode: 'clarification',
      threadId: input.threadId,
    }
  }

  try {
    const result = await tool.commit(payload, {
      auth,
      threadId: input.threadId,
      memory: {},
    })
    await markPendingExecuted(row.id, result)
    await logAssistantV2Action({
      userId: auth.currentUserId,
      threadId: input.threadId,
      actionType: row.toolName,
      entityType: ('entityType' in result && result.entityType) || 'Unknown',
      entityId: ('entityId' in result && result.entityId) || null,
      payload,
      result,
      status: result.ok ? 'success' : 'failed',
    })

    if (result.ok) {
      const patch = memoryPatchFromToolResult(row.toolName, result)
      if (Object.keys(patch).length) await patchThreadV2Memory(input.threadId, patch)
    }

    const summary =
      result.ok && 'summary' in result
        ? result.summary
        : !result.ok && 'error' in result
          ? result.error
          : 'Operazione completata.'

    return {
      reply: summary,
      mode: 'action_result',
      threadId: input.threadId,
      cards: [
        {
          type: 'result',
          title: result.ok ? 'Operazione completata' : 'Operazione non riuscita',
          summary,
          href: result.ok && 'href' in result ? result.href : undefined,
          success: result.ok,
        },
      ],
    }
  } catch (e) {
    assistantV2Log('confirm_error', {
      tool: row.toolName,
      message: e instanceof Error ? e.message : 'unknown',
    })
    await logAssistantV2Action({
      userId: auth.currentUserId,
      threadId: input.threadId,
      actionType: row.toolName,
      entityType: 'Error',
      payload,
      result: { error: 'commit_failed' },
      status: 'failed',
    })
    return {
      reply: 'Operazione non riuscita. Riprova o verifica i dati.',
      mode: 'action_result',
      threadId: input.threadId,
      cards: [
        {
          type: 'result',
          title: 'Operazione non riuscita',
          summary: 'Si è verificato un errore durante l’esecuzione.',
          success: false,
        },
      ],
    }
  }
}

export async function cancelAssistantV2Action(input: {
  user: CurrentUser
  threadId: string
  pendingId: string
}): Promise<AssistantV2Response> {
  const res = await cancelPendingAction({
    pendingId: input.pendingId,
    userId: input.user.id,
    threadId: input.threadId,
  })
  if (!res.ok) {
    return { reply: res.error, mode: 'clarification', threadId: input.threadId }
  }
  return {
    reply: 'Operazione annullata.',
    mode: 'answer',
    threadId: input.threadId,
  }
}
