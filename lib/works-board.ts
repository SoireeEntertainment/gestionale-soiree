import type { WorkStatus } from '@/lib/work-status'
import { WORK_STATUS_META } from '@/lib/work-status'
import { dbDateToDateOnly, todayDateOnlyRome } from '@/lib/timeline-dates'

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

/**
 * Colonne operative board persona.
 * DONE non è una colonna: i lavori completati sono in Archivio (dropzone dedicata).
 */
export const WORKS_STATUS_BOARD_COLUMNS: WorkStatus[] = [
  'TODO',
  'IN_REVIEW',
  'IN_PROGRESS',
  'WAITING_CLIENT',
  'PAUSED',
]

export const WORKS_DONE_DROP_ID = 'DONE' as const

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

export type ArchiveWorkCard = BoardWorkCard & {
  assigneeNames: string[]
}

export type DeadlineUrgency = 'overdue' | 'today' | 'soon' | 'later' | 'none'

/** Chiave date-only YYYY-MM-DD stabile (DB noon UTC / stringhe ISO). */
export function toDeadlineDateOnlyKey(
  deadline: string | Date | null | undefined
): string | null {
  if (deadline == null || deadline === '') return null
  if (typeof deadline === 'string') {
    const trimmed = deadline.trim()
    if (!trimmed) return null
    if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10)
    try {
      return dbDateToDateOnly(trimmed)
    } catch {
      return null
    }
  }
  if (Number.isNaN(deadline.getTime())) return null
  return dbDateToDateOnly(deadline)
}

export function computeIsOverdue(
  deadline: string | Date | null | undefined,
  status: string,
  today = todayDateOnlyRome()
): boolean {
  const key = toDeadlineDateOnlyKey(deadline)
  if (!key) return false
  if (status === 'DONE' || status === 'CANCELED') return false
  return key < today
}

/**
 * Urgenza consegna (date-only Europe/Rome).
 * overdue | today | soon (1–3 giorni) | later | none
 */
export function getDeadlineUrgency(
  deadline: string | Date | null | undefined,
  today = todayDateOnlyRome()
): DeadlineUrgency {
  const key = toDeadlineDateOnlyKey(deadline)
  if (!key) return 'none'
  if (key < today) return 'overdue'
  if (key === today) return 'today'
  const todayMs = Date.parse(`${today}T12:00:00.000Z`)
  const dueMs = Date.parse(`${key}T12:00:00.000Z`)
  const days = Math.round((dueMs - todayMs) / (24 * 60 * 60 * 1000))
  if (days >= 1 && days <= 3) return 'soon'
  return 'later'
}

export function getDeadlineDaysDelta(
  deadline: string | Date | null | undefined,
  today = todayDateOnlyRome()
): number | null {
  const key = toDeadlineDateOnlyKey(deadline)
  if (!key) return null
  const todayMs = Date.parse(`${today}T12:00:00.000Z`)
  const dueMs = Date.parse(`${key}T12:00:00.000Z`)
  return Math.round((dueMs - todayMs) / (24 * 60 * 60 * 1000))
}

/**
 * Ordina per urgenza: deadline ASC, null LAST;
 * a parità di data: titolo alfabetico ASC, poi id deterministico.
 */
export function sortBoardWorksByDeadline<
  T extends { deadline?: string | Date | null; title?: string; id?: string },
>(works: T[]): T[] {
  return [...works].sort((a, b) => {
    const aKey = toDeadlineDateOnlyKey(a.deadline)
    const bKey = toDeadlineDateOnlyKey(b.deadline)
    if (aKey == null && bKey == null) {
      const titleCmp = (a.title ?? '').localeCompare(b.title ?? '', 'it', { sensitivity: 'base' })
      if (titleCmp !== 0) return titleCmp
      return (a.id ?? '').localeCompare(b.id ?? '')
    }
    if (aKey == null) return 1
    if (bKey == null) return -1
    if (aKey !== bKey) return aKey < bKey ? -1 : 1
    const titleCmp = (a.title ?? '').localeCompare(b.title ?? '', 'it', { sensitivity: 'base' })
    if (titleCmp !== 0) return titleCmp
    return (a.id ?? '').localeCompare(b.id ?? '')
  })
}

/**
 * Archivio senza completedAt affidabile:
 * deadline DESC (null last), titolo ASC, id DESC.
 */
export function sortArchiveWorks<
  T extends { deadline?: string | Date | null; title?: string; id?: string },
>(works: T[]): T[] {
  return [...works].sort((a, b) => {
    const aKey = toDeadlineDateOnlyKey(a.deadline)
    const bKey = toDeadlineDateOnlyKey(b.deadline)
    if (aKey == null && bKey == null) {
      const titleCmp = (a.title ?? '').localeCompare(b.title ?? '', 'it', { sensitivity: 'base' })
      if (titleCmp !== 0) return titleCmp
      return (b.id ?? '').localeCompare(a.id ?? '')
    }
    if (aKey == null) return 1
    if (bKey == null) return -1
    if (aKey !== bKey) return aKey > bKey ? -1 : 1
    const titleCmp = (a.title ?? '').localeCompare(b.title ?? '', 'it', { sensitivity: 'base' })
    if (titleCmp !== 0) return titleCmp
    return (b.id ?? '').localeCompare(a.id ?? '')
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
