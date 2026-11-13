'use server'

import { revalidatePath } from 'next/cache'
import { getCurrentUser } from '@/lib/auth-dev'
import { prisma } from '@/lib/prisma'
import {
  createTelegramLinkSession,
  getTelegramLinkStatus,
  unlinkTelegram,
} from '@/lib/telegram/linking'

export async function getMyTelegramStatus() {
  const user = await getCurrentUser()
  if (!user) throw new Error('Non autorizzato')
  return getTelegramLinkStatus(user.id)
}

export async function startTelegramLink() {
  const user = await getCurrentUser()
  if (!user) throw new Error('Non autorizzato')
  if (!(await prisma.user.findFirst({ where: { id: user.id, isActive: true } }))) {
    throw new Error('Utente non attivo')
  }
  const session = await createTelegramLinkSession(user.id)
  revalidatePath('/profilo')
  return session
}

export async function disconnectTelegram() {
  const user = await getCurrentUser()
  if (!user) throw new Error('Non autorizzato')
  await unlinkTelegram(user.id)
  revalidatePath('/profilo')
}

export async function updateTelegramDigestPrefs(input: {
  enabled: boolean
  hour: number
  minute?: number
  days: number[]
}) {
  const user = await getCurrentUser()
  if (!user) throw new Error('Non autorizzato')

  const hour = Math.max(0, Math.min(23, Math.floor(input.hour)))
  const minute = Math.max(0, Math.min(59, Math.floor(input.minute ?? 0)))
  const days = Array.from(new Set(input.days.filter((d) => d >= 1 && d <= 7)))

  await prisma.userPreference.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      telegramDigestEnabled: input.enabled,
      telegramDigestHour: hour,
      telegramDigestMinute: minute,
      telegramDigestDays: days.length ? days : [1, 2, 3, 4, 5],
    },
    update: {
      telegramDigestEnabled: input.enabled,
      telegramDigestHour: hour,
      telegramDigestMinute: minute,
      telegramDigestDays: days.length ? days : [1, 2, 3, 4, 5],
    },
  })
  revalidatePath('/profilo')
}
