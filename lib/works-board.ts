import type { WorkStatus } from '@/lib/work-status'
import { WORK_STATUS_META } from '@/lib/work-status'

/** Team operativo mostrato sulla board Lavori (ordine colonne). */
export const WORKS_BOARD_TEAM = [
  {
    key: 'cristian',
    label: 'Cristian',
    emails: ['cristian.palazzolo@soiree.it'] as const,
    nameHints: ['Cristian Palazzolo', 'Cristian'] as const,
  },
  {
    key: 'davide',
    label: 'Davide',
    emails: ['davide@soiree.it'] as const,
    nameHints: ['Davide Piccolo', 'Davide'] as const,
  },
  {
    key: 'daniele',
    label: 'Daniele',
    emails: ['daniele@soiree.it'] as const,
    nameHints: ['Daniele Mirante', 'Daniele'] as const,
  },
  {
    key: 'enrico',
    label: 'Enrico',
    emails: ['enrico@soiree.it'] as const,
    nameHints: ['Enrico Cairoli', 'Enrico'] as const,
  },
] as const

export type WorksBoardTeamKey = (typeof WORKS_BOARD_TEAM)[number]['key']

/** Colonne stato nella board persona (ordine UI richiesto). */
export const WORKS_STATUS_BOARD_COLUMNS: WorkStatus[] = [
  'TODO',
  'IN_REVIEW',
  'IN_PROGRESS',
  'WAITING_CLIENT',
  'PAUSED',
  'DONE',
]

export function getWorksStatusBoardLabel(status: WorkStatus): string {
  return WORK_STATUS_META[status].label
}

export type BoardWorkCard = {
  id: string
  title: string
  status: string
  deadline: string | null
  clientId: string
  clientName: string
  categoryId: string
  categoryName: string
  assignedToUserId: string | null
  assigneeUserIds: string[]
  isOverdue: boolean
}

function deadlineMs(deadline: string | Date | null | undefined): number | null {
  if (!deadline) return null
  const value = deadline instanceof Date ? deadline : new Date(deadline)
  const ms = value.getTime()
  return Number.isNaN(ms) ? null : ms
}

/** Ordina per scadenza crescente; senza scadenza in fondo. */
export function sortBoardWorksByDeadline<T extends { deadline?: string | Date | null; title?: string }>(
  works: T[]
): T[] {
  return [...works].sort((a, b) => {
    const aMs = deadlineMs(a.deadline)
    const bMs = deadlineMs(b.deadline)
    if (aMs == null && bMs == null) {
      return (a.title ?? '').localeCompare(b.title ?? '', 'it', { sensitivity: 'base' })
    }
    if (aMs == null) return 1
    if (bMs == null) return -1
    if (aMs !== bMs) return aMs - bMs
    return (a.title ?? '').localeCompare(b.title ?? '', 'it', { sensitivity: 'base' })
  })
}

export function matchBoardTeamUser(
  users: Array<{ id: string; name: string; email: string; isActive?: boolean }>
): Array<{ key: WorksBoardTeamKey; label: string; userId: string; name: string; email: string }> {
  const active = users.filter((u) => u.isActive !== false)
  const used = new Set<string>()
  const columns: Array<{
    key: WorksBoardTeamKey
    label: string
    userId: string
    name: string
    email: string
  }> = []

  for (const member of WORKS_BOARD_TEAM) {
    const byEmail = active.find(
      (u) =>
        !used.has(u.id) &&
        member.emails.some((email) => u.email.trim().toLowerCase() === email.toLowerCase())
    )
    const byName =
      byEmail ??
      active.find(
        (u) =>
          !used.has(u.id) &&
          member.nameHints.some((hint) => u.name.trim().toLowerCase() === hint.toLowerCase())
      ) ??
      active.find(
        (u) =>
          !used.has(u.id) &&
          member.nameHints.some((hint) =>
            u.name.trim().toLowerCase().includes(hint.toLowerCase())
          )
      )

    if (!byName) continue
    used.add(byName.id)
    columns.push({
      key: member.key,
      label: member.label,
      userId: byName.id,
      name: byName.name,
      email: byName.email,
    })
  }

  return columns
}

export const BOARD_EASE = 'cubic-bezier(0.22, 1, 0.36, 1)'
