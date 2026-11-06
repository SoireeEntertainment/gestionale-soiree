import { z } from 'zod'
import { getDashboardTaskStats, getDashboardWorkStats } from '@/app/actions/dashboard'
import { todayDateOnlyRome } from '@/lib/assistant-v2/dates'
import { defineTool, requireAdmin, resolveUserOrSelf } from '@/lib/assistant-v2/tools/helpers'
import { MAX_LAVORI_TOTALI } from '@/lib/dashboard-types'
import { prisma } from '@/lib/prisma'
import { addDaysLocal, dateOnlyToDbDate, formatDateOnly, parseDateOnly } from '@/lib/timeline-dates'

/** Stessi stati "attivi" usati da getDashboardWorkStats. */
const ACTIVE_WORK_STATUSES = ['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'WAITING_CLIENT', 'PAUSED']

const getDashboardStats = defineTool({
  name: 'get_dashboard_stats',
  description:
    'Panoramica agenzia (solo admin): clienti, lavori attivi/scaduti per stato, preventivi in attesa, rinnovi in scadenza a 30 giorni, più task PED di oggi e carico lavori dell’utente corrente.',
  kind: 'read',
  risk: 'low',
  requiresConfirmation: false,
  permission: 'dashboard_read',
  inputSchema: z.object({}),
  execute: async (_input, ctx) => {
    const denied = requireAdmin(ctx)
    if (denied) return denied

    const today = todayDateOnlyRome()
    const todayDb = dateOnlyToDbDate(today)
    const in30 = new Date(`${formatDateOnly(addDaysLocal(parseDateOnly(today), 30))}T23:59:59.999Z`)

    const [
      clients,
      activeByStatus,
      overdueWorks,
      pendingPreventivi,
      renewalsSoon,
      renewalsOverdue,
      myTasks,
      myWorks,
    ] = await Promise.all([
      prisma.client.count(),
      prisma.work.groupBy({
        by: ['status'],
        where: { status: { notIn: ['DONE', 'CANCELED'] } },
        _count: { _all: true },
      }),
      prisma.work.count({
        where: { status: { notIn: ['DONE', 'CANCELED'] }, deadline: { lt: todayDb } },
      }),
      prisma.preventivo.count({ where: { status: { in: ['BOZZA', 'INVIATO'] } } }),
      prisma.clientRenewal.count({
        where: {
          status: { notIn: ['COMPLETATO', 'ANNULLATO'] },
          renewalDate: { gte: new Date(`${today}T00:00:00.000Z`), lte: in30 },
        },
      }),
      prisma.clientRenewal.count({
        where: {
          status: { notIn: ['COMPLETATO', 'ANNULLATO'] },
          renewalDate: { lt: new Date(`${today}T00:00:00.000Z`) },
        },
      }),
      getDashboardTaskStats(ctx.auth.currentUserId),
      getDashboardWorkStats(ctx.auth.currentUserId),
    ])

    const worksByStatus: Record<string, number> = {}
    let activeWorks = 0
    for (const g of activeByStatus) {
      worksByStatus[g.status] = g._count._all
      activeWorks += g._count._all
    }

    return {
      ok: true,
      summary: `${clients} clienti, ${activeWorks} lavori attivi (${overdueWorks} scaduti), ${pendingPreventivi} preventivi in attesa, ${renewalsSoon} rinnovi nei prossimi 30 giorni${renewalsOverdue ? ` e ${renewalsOverdue} già scaduti` : ''}.`,
      data: {
        clients,
        works: { active: activeWorks, overdue: overdueWorks, byStatus: worksByStatus },
        preventiviPending: pendingPreventivi,
        renewals: { next30Days: renewalsSoon, overdue: renewalsOverdue },
        me: {
          pedToday: { total: myTasks.total, byType: myTasks.byType },
          works: myWorks,
        },
      },
      href: '/dashboard',
      entityType: 'Dashboard',
      quickLinks: [{ label: 'Apri Dashboard', href: '/dashboard' }],
    }
  },
})

const getUserWorkload = defineTool({
  name: 'get_user_workload',
  description:
    'Carico di lavoro di una persona (default: utente corrente): lavori attivi per categoria, saturazione sulla capacità, lavori scaduti e contenuti PED di oggi.',
  kind: 'read',
  risk: 'low',
  requiresConfirmation: false,
  permission: 'dashboard_read',
  inputSchema: z.object({
    userName: z.string().optional().describe('Nome della persona; vuoto = utente corrente'),
  }),
  execute: async (input, ctx) => {
    const denied = requireAdmin(ctx)
    if (denied) return denied
    const user = await resolveUserOrSelf(ctx, input.userName)
    if (user.ok === false) return user

    const today = todayDateOnlyRome()
    const todayDb = dateOnlyToDbDate(today)
    const isSelf = user.id === ctx.auth.currentUserId

    // Le azioni dashboard accettano solo l'utente corrente: per gli altri stessa logica in sola lettura.
    const workStats = isSelf
      ? await getDashboardWorkStats(user.id)
      : await (async () => {
          const works = await prisma.work.findMany({
            where: { assignedToUserId: user.id, status: { in: ACTIVE_WORK_STATUSES } },
            select: { category: { select: { name: true } } },
          })
          const map: Record<string, number> = {}
          for (const w of works) {
            const n = w.category?.name ?? 'Senza categoria'
            map[n] = (map[n] ?? 0) + 1
          }
          const saturationPct = Math.min(100, Math.round((works.length / MAX_LAVORI_TOTALI) * 100))
          return {
            total: works.length,
            byCategory: Object.entries(map)
              .map(([categoryName, count]) => ({ categoryName, count }))
              .sort((a, b) => b.count - a.count),
            capacity: {
              max: MAX_LAVORI_TOTALI,
              current: works.length,
              saturationPct,
              isOverloaded: saturationPct >= 90,
            },
          }
        })()

    const taskStats = isSelf
      ? await getDashboardTaskStats(user.id)
      : await (async () => {
          const items = await prisma.pedItem.findMany({
            where: {
              OR: [{ ownerId: user.id }, { assignedToUserId: user.id }],
              date: { gte: new Date(`${today}T00:00:00.000Z`), lte: new Date(`${today}T23:59:59.999Z`) },
            },
            select: { type: true },
          })
          const byType: Record<string, number> = {}
          for (const i of items) byType[i.type ?? 'OTHER'] = (byType[i.type ?? 'OTHER'] ?? 0) + 1
          return { total: items.length, byType, periodLabel: 'oggi' }
        })()

    const overdue = await prisma.work.count({
      where: {
        status: { notIn: ['DONE', 'CANCELED'] },
        deadline: { lt: todayDb },
        OR: [{ assignedToUserId: user.id }, { assignees: { some: { userId: user.id } } }],
      },
    })

    const { capacity } = workStats
    return {
      ok: true,
      summary: `${user.name}: ${workStats.total} lavori attivi (saturazione ${capacity.saturationPct}%${capacity.isOverloaded ? ', sovraccarico' : ''}), ${overdue} scaduti, ${taskStats.total} contenuti PED oggi.`,
      data: {
        user: { id: user.id, name: user.name },
        works: workStats,
        overdueWorks: overdue,
        pedToday: { total: taskStats.total, byType: taskStats.byType },
      },
      href: `/works/person/${user.id}`,
      entityType: 'User',
      entityId: user.id,
      quickLinks: [{ label: `Lavori di ${user.name}`, href: `/works/person/${user.id}` }],
    }
  },
})

export const dashboardTools = [getDashboardStats, getUserWorkload]
