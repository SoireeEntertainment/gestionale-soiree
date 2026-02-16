'use server'

import { revalidatePath } from 'next/cache'
import { getCurrentUser } from '@/lib/auth-dev'
import { prisma } from '@/lib/prisma'

const defaults = {
  notifyDeadline24h: true,
  notifyDeadline48h: false,
  notifyInReview: true,
  notifyWaitingClient: true,
  timezone: 'Europe/Rome',
}

export async function getMyPreferences(userId: string) {
  const user = await getCurrentUser()
  if (!user || user.id !== userId) throw new Error('Non autorizzato')

  try {
    const prefs = await prisma.userPreference.findUnique({
      where: { userId },
    })
    return {
      notifyDeadline24h: prefs?.notifyDeadline24h ?? defaults.notifyDeadline24h,
      notifyDeadline48h: prefs?.notifyDeadline48h ?? defaults.notifyDeadline48h,
      notifyInReview: prefs?.notifyInReview ?? defaults.notifyInReview,
      notifyWaitingClient: prefs?.notifyWaitingClient ?? defaults.notifyWaitingClient,
      timezone: prefs?.timezone ?? defaults.timezone,
    }
  } catch {
    return { ...defaults }
  }
}

export async function updatePreferences(
  userId: string,
  data: {
    notifyDeadline24h?: boolean
    notifyDeadline48h?: boolean
    notifyInReview?: boolean
    notifyWaitingClient?: boolean
    timezone?: string
  }
) {
  const user = await getCurrentUser()
  if (!user || user.id !== userId) throw new Error('Non autorizzato')

  await prisma.userPreference.upsert({
    where: { userId },
    create: { userId, ...defaults, ...data },
    update: data,
  })

  revalidatePath('/profilo')
}
