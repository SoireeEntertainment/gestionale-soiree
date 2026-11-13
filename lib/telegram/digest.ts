import { prisma } from '@/lib/prisma'
import { todayDateOnlyRome, formatDateItFromYmd } from '@/lib/assistant-v2/dates'
import { getEffectiveLabel, PED_LABEL_CONFIG } from '@/lib/pedLabels'
import { toDateString } from '@/lib/ped-utils'
import { sendTelegramMessage, telegramLog } from '@/lib/telegram/bot-api'
import { isTelegramAssistantEnabled } from '@/lib/telegram/config'
import { appBaseUrl } from '@/lib/telegram/config'

/** Giorno ISO 1–7 in Europe/Rome. */
export function romeWeekday(now = new Date()): number {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Rome',
    weekday: 'short',
  })
  const map: Record<string, number> = {
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
    Sun: 7,
  }
  return map[fmt.format(now)] ?? 1
}

export function romeHourMinute(now = new Date()): { hour: number; minute: number; dateKey: string } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Rome',
    hour: '2-digit',
    minute: '2-digit',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour12: false,
  }).formatToParts(now)
  const get = (t: string) => parts.find((p) => p.type === t)?.value || '0'
  return {
    hour: Number(get('hour')),
    minute: Number(get('minute')),
    dateKey: `${get('year')}-${get('month')}-${get('day')}`,
  }
}

function labelText(label: string): string {
  return (PED_LABEL_CONFIG as Record<string, { label?: string }>)[label]?.label ?? label
}

export async function buildDailyDigestForUser(userId: string): Promise<string> {
  const today = todayDateOnlyRome()
  const dayStart = new Date(`${today}T00:00:00.000Z`)
  const dayEnd = new Date(`${today}T23:59:59.999Z`)

  const [pedItems, tasks, works] = await Promise.all([
    prisma.pedItem.findMany({
      where: {
        date: { gte: dayStart, lte: dayEnd },
        OR: [{ ownerId: userId }, { assignedToUserId: userId }],
      },
      include: {
        client: { select: { name: true } },
        assignedTo: { select: { name: true } },
      },
      orderBy: [{ date: 'asc' }, { sortOrder: 'asc' }],
      take: 40,
    }),
    prisma.dailyTask.findMany({
      where: {
        userId,
        status: 'OPEN',
        dueDate: { lte: dayEnd },
      },
      include: { client: { select: { name: true } } },
      orderBy: { dueDate: 'asc' },
      take: 30,
    }),
    prisma.work.findMany({
      where: {
        deadline: { gte: dayStart, lte: dayEnd },
        status: { not: 'DONE' },
        OR: [{ assignedToUserId: userId }, { assignees: { some: { userId } } }],
      },
      include: { client: { select: { name: true } } },
      take: 20,
    }),
  ])

  const done = pedItems.filter((i) => i.status === 'DONE')
  const open = pedItems.filter((i) => i.status !== 'DONE')

  const lines: string[] = [
    `Buongiorno! Ecco le tue attività di oggi (${formatDateItFromYmd(today)}).`,
    '',
    '📰 PED editoriale',
  ]

  if (!pedItems.length) {
    lines.push('Nessun contenuto PED per oggi.')
  } else {
    for (const i of open) {
      const lab = labelText(getEffectiveLabel(i))
      lines.push(
        `• ${i.client.name} — ${i.title} (${i.type}) — ${lab}${
          i.assignedTo?.name ? ` — ${i.assignedTo.name}` : ''
        }`
      )
    }
    if (done.length) {
      lines.push(`Completati oggi: ${done.length}`)
    }
  }

  lines.push('', '✅ Task giornaliere')
  if (!tasks.length) {
    lines.push('Nessuna task aperta in scadenza oggi o precedente.')
  } else {
    for (const t of tasks) {
      const due = toDateString(new Date(t.dueDate))
      lines.push(
        `• ${t.title}${t.client ? ` — ${t.client.name}` : ''} (scad. ${formatDateItFromYmd(due)})`
      )
    }
  }

  if (works.length) {
    lines.push('', '🛠️ Lavori in scadenza oggi')
    for (const w of works) {
      lines.push(`• ${w.client.name} — ${w.title} (${w.status})`)
    }
  }

  lines.push('', `🔗 ${appBaseUrl()}/profilo`)
  return lines.join('\n')
}

export async function runTelegramDailyDigests(now = new Date()): Promise<{
  sent: number
  skipped: number
}> {
  if (!isTelegramAssistantEnabled()) return { sent: 0, skipped: 0 }

  const { hour, minute, dateKey } = romeHourMinute(now)
  const weekday = romeWeekday(now)

  const prefs = await prisma.userPreference.findMany({
    where: { telegramDigestEnabled: true },
    include: {
      user: {
        select: {
          id: true,
          isActive: true,
          telegramConnection: { select: { telegramChatId: true } },
        },
      },
    },
  })

  let sent = 0
  let skipped = 0

  for (const p of prefs) {
    if (!p.user.isActive || !p.user.telegramConnection) {
      skipped++
      continue
    }
    if (!p.telegramDigestDays.includes(weekday)) {
      skipped++
      continue
    }
    if (p.telegramDigestLastSent === dateKey) {
      skipped++
      continue
    }
    // Finestra rispetto all'ora Europe/Rome (cron Hobby ≈ orario UTC con drift)
    const { TELEGRAM_LIMITS } = await import('@/lib/telegram/config')
    const targetMin = p.telegramDigestHour * 60 + p.telegramDigestMinute
    const nowMin = hour * 60 + minute
    if (Math.abs(nowMin - targetMin) > TELEGRAM_LIMITS.digestCronToleranceMin) {
      skipped++
      continue
    }

    try {
      const text = await buildDailyDigestForUser(p.user.id)
      const res = await sendTelegramMessage({
        chatId: p.user.telegramConnection.telegramChatId,
        text,
      })
      if (res.ok) {
        await prisma.userPreference.update({
          where: { id: p.id },
          data: { telegramDigestLastSent: dateKey },
        })
        sent++
      } else {
        telegramLog('digest_send_failed', { userId: p.user.id, description: res.description })
        skipped++
      }
    } catch (e) {
      telegramLog('digest_error', {
        userId: p.user.id,
        message: e instanceof Error ? e.message : 'unknown',
      })
      skipped++
    }
  }

  return { sent, skipped }
}
