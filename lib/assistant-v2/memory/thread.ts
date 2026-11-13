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

  if (data && typeof data === 'object') {
    const listKey = ['pedItems', 'tasks', 'works', 'items'].find((k) =>
      Array.isArray((data as Record<string, unknown>)[k])
    )
    if (listKey) {
      const arr = (data as Record<string, unknown>)[listKey] as Record<string, unknown>[]
      const kind =
        listKey === 'pedItems'
          ? ('ped' as const)
          : listKey === 'tasks'
            ? ('task' as const)
            : listKey === 'works'
              ? ('work' as const)
              : ('ped' as const)
      patch.lastListedItems = arr.slice(0, 20).map((row, i) => ({
        index: i + 1,
        kind,
        id: String(row.id ?? `idx-${i + 1}`),
        label: String(row.title ?? row.name ?? row.id ?? '—'),
        clientName: typeof row.clientName === 'string' ? row.clientName : undefined,
        date: typeof row.date === 'string' ? row.date : typeof row.dueDate === 'string' ? row.dueDate : undefined,
      }))
    }
  }
  return patch
}
