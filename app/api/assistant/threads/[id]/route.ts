import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth-dev'
import { prisma } from '@/lib/prisma'

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

  const { id } = await ctx.params
  const thread = await prisma.chatThread.findFirst({
    where: { id, userId: user.id },
    select: { id: true, title: true, createdAt: true, updatedAt: true },
  })
  if (!thread) return NextResponse.json({ error: 'Non trovato' }, { status: 404 })

  const messages = await prisma.chatMessage.findMany({
    where: { threadId: id },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      role: true,
      content: true,
      createdAt: true,
      metadata: true,
    },
  })

  const safeMessages = messages.map((m) => {
    const meta = m.metadata as Record<string, unknown> | null
    const pendingId =
      meta && typeof meta.pendingConfirmationId === 'string' ? meta.pendingConfirmationId : undefined
    return {
      id: m.id,
      role: m.role,
      content: m.content,
      createdAt: m.createdAt,
      pendingConfirmationId: pendingId,
      mode: typeof meta?.mode === 'string' ? meta.mode : undefined,
      assistantBadge: typeof meta?.assistantBadge === 'string' ? meta.assistantBadge : undefined,
      result: meta?.result as { href?: string; success?: boolean; summary?: string } | undefined,
      quickLinks: Array.isArray(meta?.quickLinks)
        ? (meta.quickLinks as { label: string; href: string }[])
        : undefined,
    }
  })

  return NextResponse.json({ thread, messages: safeMessages })
}

/** Elimina thread e messaggi (cascade). AssistantActionLog.threadId viene messo a null (SetNull). */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

  const { id } = await ctx.params
  const deleted = await prisma.chatThread.deleteMany({
    where: { id, userId: user.id },
  })
  if (deleted.count === 0) {
    return NextResponse.json({ error: 'Thread non trovato' }, { status: 404 })
  }
  return NextResponse.json({ ok: true })
}
