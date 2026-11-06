import { prisma } from '@/lib/prisma'
import { redactDeep } from '@/lib/assistant-v2/redact'

export async function logAssistantV2Action(input: {
  userId: string
  threadId?: string | null
  actionType: string
  entityType: string
  entityId?: string | null
  payload: unknown
  result?: unknown
  status: 'success' | 'failed' | 'needs_confirmation'
}) {
  try {
    await prisma.assistantActionLog.create({
      data: {
        userId: input.userId,
        threadId: input.threadId ?? null,
        actionType: input.actionType,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        input: redactDeep(input.payload) as object,
        result: input.result != null ? (redactDeep(input.result) as object) : undefined,
        status: input.status,
      },
    })
  } catch (e) {
    console.error('[assistant-v2] log failed', e instanceof Error ? e.message : e)
  }
}

export function assistantV2Log(event: string, data?: Record<string, unknown>) {
  if (process.env.NODE_ENV === 'production') {
    console.info(JSON.stringify({ scope: 'assistant-v2', event, ...redactDeep(data ?? {}) }))
  } else {
    console.log(`[assistant-v2] ${event}`, data ? redactDeep(data) : '')
  }
}
