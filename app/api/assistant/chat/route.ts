import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth-dev'
import { prisma } from '@/lib/prisma'
import {
  processAssistantMessage,
  confirmPendingAction,
  cancelPendingAssistantAction,
} from '@/lib/assistant/orchestrator'
import type { Prisma } from '@prisma/client'
import { patchThreadAssistantContext } from '@/lib/assistant/thread-context'
import type { AssistantChatResponse } from '@/lib/assistant/types'

export const runtime = 'nodejs'
export const maxDuration = 60

const CONFIRM_REGEX = /^(sì|si|ok|confermo|va bene|yes)\b/i

async function findLatestPendingId(threadId: string): Promise<string | null> {
  const rows = await prisma.chatMessage.findMany({
    where: { threadId, role: 'assistant' },
    orderBy: { createdAt: 'desc' },
    take: 12,
    select: { metadata: true },
  })
  for (const r of rows) {
    const m = r.metadata as Record<string, unknown> | null
    if (m && typeof m.pendingConfirmationId === 'string') {
      return m.pendingConfirmationId
    }
  }
  return null
}

function assistantUiBadge(mode: AssistantChatResponse['mode'], success?: boolean): string | undefined {
  if (mode === 'needs_confirmation') return 'needs_confirmation'
  if (mode === 'action_result') return success ? 'action_done' : 'action_failed'
  if (mode === 'clarification') return 'info'
  return undefined
}

async function persistAssistantSideEffects(
  threadId: string,
  response: AssistantChatResponse,
  threadTitleBefore: string
) {
  if (response.threadContextUpdate) {
    await patchThreadAssistantContext(threadId, response.threadContextUpdate)
  }
  const t = response.suggestedThreadTitle?.trim()
  if (threadTitleBefore === 'Nuova chat' && t) {
    await prisma.chatThread.update({
      where: { id: threadId },
      data: { title: t.slice(0, 80) },
    })
  }
}

export async function POST(req: Request) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
  }

  let body: {
    threadId?: string | null
    message?: string
    confirmPendingId?: string | null
    cancelPendingId?: string | null
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON non valido' }, { status: 400 })
  }

  let threadId = body.threadId ?? null
  const rawMessage = typeof body.message === 'string' ? body.message.trim() : ''
  let confirmPendingId = body.confirmPendingId?.trim() || null
  const cancelPendingId = body.cancelPendingId?.trim() || null

  if (!threadId) {
    const t = await prisma.chatThread.create({
      data: { userId: user.id, title: 'Nuova chat' },
    })
    threadId = t.id
  }

  const thread = await prisma.chatThread.findFirst({
    where: { id: threadId, userId: user.id },
  })
  if (!thread) {
    return NextResponse.json({ error: 'Thread non trovato' }, { status: 404 })
  }

  if (cancelPendingId) {
    await prisma.chatMessage.create({
      data: {
        threadId,
        role: 'user',
        content: rawMessage || 'Annulla',
      },
    })

    const response = await cancelPendingAssistantAction({
      user,
      threadId,
      pendingConfirmationId: cancelPendingId,
    })

    await persistAssistantSideEffects(threadId, response, thread.title)

    await prisma.chatMessage.create({
      data: {
        threadId,
        role: 'assistant',
        content: response.reply,
        metadata: {
          mode: response.mode,
          assistantBadge: assistantUiBadge(response.mode),
        } as object,
      },
    })

    await prisma.chatThread.update({
      where: { id: threadId },
      data: { updatedAt: new Date() },
    })

    return NextResponse.json({ threadId, ...response })
  }

  if (confirmPendingId) {
    await prisma.chatMessage.create({
      data: {
        threadId,
        role: 'user',
        content: rawMessage || 'Conferma azione',
      },
    })

    const response = await confirmPendingAction({
      user,
      threadId,
      pendingConfirmationId: confirmPendingId,
    })

    await persistAssistantSideEffects(threadId, response, thread.title)

    await prisma.chatMessage.create({
      data: {
        threadId,
        role: 'assistant',
        content: response.reply,
        metadata:
          response.result != null
            ? ({
                result: response.result,
                mode: response.mode,
                assistantBadge: assistantUiBadge(response.mode, response.result.success),
              } as object)
            : ({ mode: response.mode, assistantBadge: assistantUiBadge(response.mode) } as object),
      },
    })

    await prisma.chatThread.update({
      where: { id: threadId },
      data: {
        updatedAt: new Date(),
      },
    })

    return NextResponse.json({ threadId, ...response })
  }

  if (!rawMessage) {
    return NextResponse.json({ error: 'Messaggio vuoto' }, { status: 400 })
  }

  if (CONFIRM_REGEX.test(rawMessage)) {
    const pending = await findLatestPendingId(threadId)
    if (pending) {
      await prisma.chatMessage.create({
        data: { threadId, role: 'user', content: rawMessage },
      })
      const response = await confirmPendingAction({
        user,
        threadId,
        pendingConfirmationId: pending,
      })
      await persistAssistantSideEffects(threadId, response, thread.title)
      await prisma.chatMessage.create({
        data: {
          threadId,
          role: 'assistant',
          content: response.reply,
          metadata:
            response.result != null
              ? ({
                  result: response.result,
                  mode: response.mode,
                  assistantBadge: assistantUiBadge(response.mode, response.result.success),
                } as object)
              : ({ mode: response.mode, assistantBadge: assistantUiBadge(response.mode) } as object),
        },
      })
      await prisma.chatThread.update({ where: { id: threadId }, data: { updatedAt: new Date() } })
      return NextResponse.json({ threadId, ...response })
    }
  }

  await prisma.chatMessage.create({
    data: { threadId, role: 'user', content: rawMessage },
  })

  await prisma.chatThread.update({ where: { id: threadId }, data: { updatedAt: new Date() } })

  let response: AssistantChatResponse
  try {
    response = await processAssistantMessage({ user, threadId, userMessage: rawMessage })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Errore elaborazione'
    response = {
      reply: `Si è verificato un errore: ${msg}`,
      mode: 'clarification' as const,
    }
  }

  await persistAssistantSideEffects(threadId, response, thread.title)

  if (thread.title === 'Nuova chat' && !response.suggestedThreadTitle?.trim()) {
    const short = rawMessage.slice(0, 48) + (rawMessage.length > 48 ? '…' : '')
    await prisma.chatThread.update({
      where: { id: threadId },
      data: { title: short || 'Chat assistente' },
    })
  }

  const badge = assistantUiBadge(
    response.mode,
    response.result?.success
  )
  const meta =
    response.mode === 'needs_confirmation' && response.confirmationMeta
      ? ({
          ...(response.confirmationMeta as object),
          assistantBadge: badge,
          ...(response.readQuickLinks?.length ? { quickLinks: response.readQuickLinks } : {}),
        } as object)
      : response.result != null
        ? ({
            mode: response.mode,
            result: response.result,
            assistantBadge: badge,
            ...(response.readQuickLinks?.length ? { quickLinks: response.readQuickLinks } : {}),
          } as object)
        : ({
            mode: response.mode,
            assistantBadge: badge,
            ...(response.readQuickLinks?.length ? { quickLinks: response.readQuickLinks } : {}),
          } as object)

  await prisma.chatMessage.create({
    data: {
      threadId,
      role: 'assistant',
      content: response.reply,
      metadata: meta as Prisma.InputJsonValue,
    },
  })

  return NextResponse.json({
    threadId,
    reply: response.reply,
    mode: response.mode,
    proposedAction: response.proposedAction,
    result: response.result,
    pendingConfirmationId: response.pendingConfirmationId,
    readQuickLinks: response.readQuickLinks,
  })
}
