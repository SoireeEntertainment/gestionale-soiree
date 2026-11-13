import type { WorkStatus } from '@/lib/work-status'
import {
  computeIsOverdue,
  sortBoardWorksByDeadline,
  WORKS_DONE_DROP_ID,
  type BoardWorkCard,
} from '@/lib/works-board'

/** Dropzone archivio sulla board persone (/works) — ID tipizzato, non collide con userId. */
export const WORKS_PERSON_BOARD_ARCHIVE_DROP_ID = 'board-drop:archive-done' as const

/** Stati selezionabili dal menu rapido della card (senza CANCELED). */
export const WORK_BOARD_QUICK_STATUSES: WorkStatus[] = [
  'TODO',
  'IN_REVIEW',
  'IN_PROGRESS',
  'WAITING_CLIENT',
  'PAUSED',
  'DONE',
]

export function isArchiveDropId(id: string | null | undefined): boolean {
  if (!id) return false
  return id === WORKS_DONE_DROP_ID || id === WORKS_PERSON_BOARD_ARCHIVE_DROP_ID
}

export function isQuickBoardStatus(status: string): status is WorkStatus {
  return (WORK_BOARD_QUICK_STATUSES as string[]).includes(status)
}

type PersonBoardLike = {
  columns: Array<{
    userId: string
    works: BoardWorkCard[]
    count: number
    [key: string]: unknown
  }>
  unassigned: BoardWorkCard[]
  activeCount: number
  archiveCount: number
}

/** Rimuove tutte le occorrenze di un workId dalla board persone (multi-assegnatario). */
export function removeWorkFromPersonBoard<T extends PersonBoardLike>(data: T, workId: string): T {
  const hadActive = data.columns.some((c) => c.works.some((w) => w.id === workId))
    || data.unassigned.some((w) => w.id === workId)

  const columns = data.columns.map((column) => {
    const works = column.works.filter((w) => w.id !== workId)
    return { ...column, works, count: works.length }
  })
  const unassigned = data.unassigned.filter((w) => w.id !== workId)

  return {
    ...data,
    columns,
    unassigned,
    activeCount: hadActive ? Math.max(0, data.activeCount - 1) : data.activeCount,
    archiveCount: data.archiveCount,
  }
}

/** Archivia (DONE): rimuove dalla board attiva e incrementa contatore archivio. */
export function archiveWorkOnPersonBoard<T extends PersonBoardLike>(data: T, workId: string): T {
  const removed = removeWorkFromPersonBoard(data, workId)
  const wasPresent =
    data.columns.some((c) => c.works.some((w) => w.id === workId))
    || data.unassigned.some((w) => w.id === workId)
  return {
    ...removed,
    archiveCount: wasPresent ? data.archiveCount + 1 : data.archiveCount,
  }
}

/** Aggiorna lo status su tutte le copie della card (board persone). DONE → archivia. */
export function applyStatusOnPersonBoard<T extends PersonBoardLike>(
  data: T,
  workId: string,
  nextStatus: string
): T {
  if (nextStatus === 'DONE') {
    return archiveWorkOnPersonBoard(data, workId)
  }

  const patch = (work: BoardWorkCard): BoardWorkCard =>
    work.id === workId
      ? {
          ...work,
          status: nextStatus,
          isOverdue: computeIsOverdue(work.deadline, nextStatus),
        }
      : work

  return {
    ...data,
    columns: data.columns.map((column) => {
      const works = sortBoardWorksByDeadline(column.works.map(patch))
      return { ...column, works, count: works.length }
    }),
    unassigned: sortBoardWorksByDeadline(data.unassigned.map(patch)),
  }
}

type StatusColumnLike = {
  status: WorkStatus
  works: BoardWorkCard[]
  count: number
}

/** Sposta / archivia su board per stato (persona). */
export function applyStatusOnStatusBoard<T extends StatusColumnLike>(
  columns: T[],
  workId: string,
  nextStatus: WorkStatus
): T[] {
  let moved: BoardWorkCard | null = null
  for (const column of columns) {
    const found = column.works.find((w) => w.id === workId)
    if (found) {
      moved = {
        ...found,
        status: nextStatus,
        isOverdue: computeIsOverdue(found.deadline, nextStatus),
      }
      break
    }
  }
  if (!moved) return columns

  const isArchive = nextStatus === 'DONE'
  return columns.map((column) => {
    const without = column.works.filter((w) => w.id !== workId)
    if (isArchive || column.status !== nextStatus) {
      return { ...column, works: without, count: without.length }
    }
    const works = sortBoardWorksByDeadline([...without, moved!])
    return { ...column, works, count: works.length }
  })
}

export function removeWorkFromStatusBoard<T extends StatusColumnLike>(
  columns: T[],
  workId: string
): T[] {
  return columns.map((column) => {
    const works = column.works.filter((w) => w.id !== workId)
    return { ...column, works, count: works.length }
  })
}
