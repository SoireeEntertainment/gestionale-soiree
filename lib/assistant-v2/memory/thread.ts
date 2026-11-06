import { prisma } from '@/lib/prisma'
import type { ThreadMemoryRefs } from '@/lib/assistant-v2/types'
import { ASSISTANT_V2_LIMITS } from '@/lib/assistant-v2/config'

type StoredContext = {
  v2Memory?: ThreadMemoryRefs
  [key: string]: unknown
}

export async function loadThreadV2Memory(threadId: string): Promise<ThreadMemoryRefs> {
  const thread = await prisma.chatThread.findUnique({
    where: { id: threadId },
    select: { assistantContext: true },
  })
  const ctx = (thread?.assistantContext ?? {}) as StoredContext
  return ctx.v2Memory ?? {}
}

export async function patchThreadV2Memory(
  threadId: string,
  patch: Partial<ThreadMemoryRefs>
): Promise<void> {
  const thread = await prisma.chatThread.findUnique({
    where: { id: threadId },
    select: { assistantContext: true },
  })
  const prev = (thread?.assistantContext ?? {}) as StoredContext
  const next: StoredContext = {
    ...prev,
    v2Memory: { ...(prev.v2Memory ?? {}), ...patch },
  }
  await prisma.chatThread.update({
    where: { id: threadId },
    data: { assistantContext: next as object },
  })
}

export async function loadRecentMessagesForLlm(threadId: string) {
  const rows = await prisma.chatMessage.findMany({
    where: { threadId, role: { in: ['user', 'assistant'] } },
    orderBy: { createdAt: 'desc' },
    take: ASSISTANT_V2_LIMITS.historyMessages,
    select: { role: true, content: true },
  })
  return rows.reverse().map((m) => ({
    role: m.role as 'user' | 'assistant',
    content: m.content.slice(0, 2000),
  }))
}

export function memoryPatchFromToolResult(
  toolName: string,
  result: { ok: boolean; data?: unknown; entityId?: string; summary?: string }
): Partial<ThreadMemoryRefs> {
  if (!result.ok) return {}
  const data = (result.data ?? {}) as Record<string, unknown>
  const patch: Partial<ThreadMemoryRefs> = {}

  if (toolName.includes('client') || data.clientId || data.clientName) {
    if (typeof data.clientId === 'string') patch.lastClientId = data.clientId
    if (typeof data.clientName === 'string') patch.lastClientName = data.clientName
    if (typeof data.name === 'string' && toolName.includes('client')) {
      patch.lastClientName = data.name
      if (typeof data.id === 'string') patch.lastClientId = data.id
    }
  }
  if (toolName.includes('work')) {
    if (typeof data.id === 'string') patch.lastWorkId = data.id
    if (typeof data.title === 'string') patch.lastWorkTitle = data.title
    if (result.entityId) patch.lastWorkId = result.entityId
  }
  if (toolName.includes('task') || toolName.includes('contact')) {
    if (typeof data.id === 'string') patch.lastTaskId = data.id
    if (typeof data.title === 'string') patch.lastTaskTitle = data.title
    if (result.entityId) patch.lastTaskId = result.entityId
  }
  if (result.summary) patch.lastSearchSummary = result.summary.slice(0, 200)
  return patch
}
