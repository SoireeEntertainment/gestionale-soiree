import { prisma } from '@/lib/prisma'
import type { CurrentUser } from '@/lib/auth-dev'
import { TELEGRAM_ENV, TELEGRAM_LIMITS, appBaseUrl } from '@/lib/telegram/config'
import { generateLinkToken, hashLinkToken } from '@/lib/telegram/security'

export type TelegramLinkStatus = {
  linked: boolean
  telegramUsername: string | null
  linkedAt: string | null
  deepLinkUrl: string | null
  botConfigured: boolean
}

function botDeepLink(token: string): string | null {
  const username = TELEGRAM_ENV.botUsername()
  if (!username) return null
  const clean = username.replace(/^@/, '')
  return `https://t.me/${clean}?start=${encodeURIComponent(token)}`
}

export async function getTelegramLinkStatus(userId: string): Promise<TelegramLinkStatus> {
  const conn = await prisma.telegramConnection.findUnique({
    where: { userId },
    select: { telegramUsername: true, linkedAt: true },
  })
  return {
    linked: !!conn,
    telegramUsername: conn?.telegramUsername ?? null,
    linkedAt: conn?.linkedAt?.toISOString() ?? null,
    deepLinkUrl: null,
    botConfigured: !!(TELEGRAM_ENV.botToken() && TELEGRAM_ENV.botUsername()),
  }
}

/** Genera token monouso e deep link (raw token solo in risposta, hash in DB). */
export async function createTelegramLinkSession(userId: string): Promise<{
  deepLinkUrl: string
  expiresAt: string
}> {
  if (!TELEGRAM_ENV.botUsername()) {
    throw new Error('Bot Telegram non configurato (TELEGRAM_BOT_USERNAME).')
  }
  const raw = generateLinkToken()
  const tokenHash = hashLinkToken(raw)
  const expiresAt = new Date(Date.now() + TELEGRAM_LIMITS.linkTokenTtlMs)

  await prisma.telegramLinkToken.create({
    data: { userId, tokenHash, expiresAt },
  })

  const deepLinkUrl = botDeepLink(raw)
  if (!deepLinkUrl) throw new Error('Impossibile creare deep link Telegram.')
  return { deepLinkUrl, expiresAt: expiresAt.toISOString() }
}

export async function unlinkTelegram(userId: string): Promise<void> {
  await prisma.telegramConnection.deleteMany({ where: { userId } })
}

export async function resolveUserFromTelegram(telegramUserId: string): Promise<{
  user: CurrentUser
  chatId: string
  connectionId: string
} | null> {
  const conn = await prisma.telegramConnection.findUnique({
    where: { telegramUserId: String(telegramUserId) },
    include: {
      user: {
        select: { id: true, name: true, email: true, role: true, isActive: true, clerkId: true },
      },
    },
  })
  if (!conn) return null
  if (!conn.user.isActive) return null
  const role = conn.user.role === 'AGENTE' ? 'AGENTE' : 'ADMIN'
  return {
    connectionId: conn.id,
    chatId: conn.telegramChatId,
    user: {
      id: conn.user.id,
      userId: conn.user.clerkId || conn.user.id,
      name: conn.user.name,
      email: conn.user.email,
      role,
    },
  }
}

/**
 * Completa il linking da /start <token>.
 * Usa l'ID Telegram verificato dal webhook, non username/email dal messaggio.
 */
export async function consumeTelegramLinkToken(input: {
  rawToken: string
  telegramUserId: string
  telegramChatId: string
  telegramUsername?: string | null
}): Promise<{ ok: true; userName: string } | { ok: false; error: string }> {
  const tokenHash = hashLinkToken(input.rawToken)
  const row = await prisma.telegramLinkToken.findUnique({ where: { tokenHash } })
  if (!row || row.consumedAt) {
    return { ok: false, error: 'Link non valido o già usato. Genera un nuovo collegamento dal Profilo.' }
  }
  if (row.expiresAt.getTime() < Date.now()) {
    return { ok: false, error: 'Link scaduto. Genera un nuovo collegamento dal Profilo.' }
  }

  const user = await prisma.user.findUnique({
    where: { id: row.userId },
    select: { id: true, name: true, isActive: true },
  })
  if (!user || !user.isActive) {
    return { ok: false, error: 'Utente non attivo nel gestionale.' }
  }

  const byTg = await prisma.telegramConnection.findUnique({
    where: { telegramUserId: input.telegramUserId },
  })
  if (byTg && byTg.userId !== user.id) {
    return {
      ok: false,
      error: 'Questo account Telegram è già collegato a un altro utente del gestionale.',
    }
  }

  const byUser = await prisma.telegramConnection.findUnique({ where: { userId: user.id } })
  if (byUser && byUser.telegramUserId !== input.telegramUserId) {
    return {
      ok: false,
      error: 'Il tuo account gestionale è già collegato a un altro Telegram. Scollegalo prima dal Profilo.',
    }
  }

  await prisma.$transaction(async (tx) => {
    const claimed = await tx.telegramLinkToken.updateMany({
      where: { id: row.id, consumedAt: null },
      data: { consumedAt: new Date() },
    })
    if (claimed.count !== 1) throw new Error('token_race')

    await tx.telegramConnection.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        telegramUserId: input.telegramUserId,
        telegramChatId: input.telegramChatId,
        telegramUsername: input.telegramUsername || null,
      },
      update: {
        telegramUserId: input.telegramUserId,
        telegramChatId: input.telegramChatId,
        telegramUsername: input.telegramUsername || null,
        linkedAt: new Date(),
      },
    })
  })

  return { ok: true, userName: user.name }
}

export function profileTelegramUrl(): string {
  return `${appBaseUrl()}/profilo`
}
