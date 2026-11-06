import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth-dev'
import { prisma } from '@/lib/prisma'
import { ASSISTANT_V2_LIMITS, isAssistantV2Enabled } from '@/lib/assistant-v2/config'
import { runAssistantV2Turn } from '@/lib/assistant-v2/engine/run-turn'
import {
  cancelAssistantV2Action,
  confirmAssistantV2Action,
} from '@/lib/assistant-v2/engine/confirm'
import {
  beginAssistantRequest,
  checkAssistantRateLimit,
  endAssistantRequest,
} from '@/lib/assistant-v2/rate-limit'
import type { AssistantV2Response } from '@/lib/assistant-v2/types'
import type { Prisma } from '@prisma/client'

export const runtime = 'nodejs'
export const maxDuration = 60

function metadataFromResponse(response: AssistantV2Response): Prisma.InputJsonValue {
  return {
    version: 2,
    mode: response.mode,
    pendingConfirmationId: response.pendingConfirmationId ?? null,
    cards: response.cards ?? [],
    toolTrace: response.toolTrace ?? [],
    assistantBadge:
      response.mode === 'needs_confirmation'
        ? 'needs_confirmation'
        : response.mode === 'action_result'
          ? 'action_done'
          : response.mode === 'clarification'
            ? 'info'
            : undefined,
  } as Prisma.InputJsonValue
}

export async function POST(req: Request) {
  if (!isAssistantV2Enabled()) {
    return NextResponse.json({ error: 'Assistente V2 non abilitato' }, { status: 404 })
  }

  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
  }

  const rate = checkAssistantRateLimit(user.id)
  if (!rate.ok) {
    return NextResponse.json({ error: rate.error }, { status: 429 })
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
  const confirmPendingId = body.confirmPendingId?.trim() || null
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

  beginAssistantRequest(user.id)
  try {
    if (cancelPendingId) {
      await prisma.chatMessage.create({
        data: { threadId, role: 'user', content: rawMessage || 'Annulla' },
      })
      const response = await cancelAssistantV2Action({
        user,
        threadId,
        pendingId: cancelPendingId,
      })
      await prisma.chatMessage.create({
        data: {
          threadId,
          role: 'assistant',
          content: response.reply,
          metadata: metadataFromResponse(response),
        },
      })
      await prisma.chatThread.update({ where: { id: threadId }, data: { updatedAt: new Date() } })
      return NextResponse.json(response)
    }

    if (confirmPendingId) {
      await prisma.chatMessage.create({
        data: { threadId, role: 'user', content: rawMessage || 'Conferma azione' },
      })
      const response = await confirmAssistantV2Action({
        user,
        threadId,
        pendingId: confirmPendingId,
      })
      await prisma.chatMessage.create({
        data: {
          threadId,
          role: 'assistant',
          content: response.reply,
          metadata: metadataFromResponse(response),
        },
      })
      await prisma.chatThread.update({ where: { id: threadId }, data: { updatedAt: new Date() } })
      return NextResponse.json(response)
    }

    if (!rawMessage) {
      return NextResponse.json({ error: 'Messaggio vuoto' }, { status: 400 })
    }
    if (rawMessage.length > ASSISTANT_V2_LIMITS.maxMessageChars) {
      return NextResponse.json({ error: 'Messaggio troppo lungo' }, { status: 400 })
    }

    // Non confermare da testo libero ambiguo ("ok"): solo pulsanti Conferma.

    await prisma.chatMessage.create({
      data: { threadId, role: 'user', content: rawMessage },
    })
    await prisma.chatThread.update({ where: { id: threadId }, data: { updatedAt: new Date() } })

    const response = await runAssistantV2Turn({
      user,
      threadId,
      userMessage: rawMessage,
      abortSignal: req.signal,
    })

    if (thread.title === 'Nuova chat') {
      const title = (response.suggestedThreadTitle || rawMessage).slice(0, 80)
      await prisma.chatThread.update({ where: { id: threadId }, data: { title } })
    }

    await prisma.chatMessage.create({
      data: {
        threadId,
        role: 'assistant',
        content: response.reply,
        metadata: metadataFromResponse(response),
      },
    })

    return NextResponse.json(response)
  } finally {
    endAssistantRequest(user.id)
  }
}
