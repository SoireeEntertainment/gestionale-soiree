import {
  addDaysLocal,
  dbDateToDateOnly,
  formatDateOnly,
  parseDateOnly,
  todayDateOnlyRome,
} from '@/lib/timeline-dates'

export const DAILY_TASK_TYPES = ['GENERAL', 'CONTACT_CLIENT'] as const
export type DailyTaskType = (typeof DAILY_TASK_TYPES)[number]

export const DAILY_TASK_STATUSES = ['OPEN', 'DONE'] as const
export type DailyTaskStatus = (typeof DAILY_TASK_STATUSES)[number]

export type ClientUniverseStatus = 'red' | 'green' | 'neutral'

export type DailyTaskDTO = {
  id: string
  title: string
  type: DailyTaskType
  status: DailyTaskStatus
  dueDate: string
  notes: string | null
  userId: string
  clientId: string | null
  clientName: string | null
  completedAt: string | null
  lastContactedAt: string | null
  nextReactivateAt: string | null
  createdAt: string
  updatedAt: string
}

export type UniverseClientNode = {
  clientId: string
  clientName: string
  status: ClientUniverseStatus
  taskId: string | null
  lastContactedAt: string | null
  nextReactivateAt: string | null
  dueDate: string | null
}

/** Risultato tipizzato di deleteDailyTask: non usare throw per casi applicativi attesi. */
export type DeleteDailyTaskCode = 'UNAUTHORIZED' | 'TASK_NOT_FOUND' | 'DELETE_FAILED'

export type DeleteDailyTaskResult =
  | {
      success: true
      taskId: string
      type: DailyTaskType
      clientId: string | null
      alreadyDeleted?: boolean
    }
  | {
      success: false
      code: DeleteDailyTaskCode
      message: string
    }

export const BOARD_EASE = 'cubic-bezier(0.22, 1, 0.36, 1)'

export function isDailyTaskType(value: string): value is DailyTaskType {
  return (DAILY_TASK_TYPES as readonly string[]).includes(value)
}

export function isDailyTaskStatus(value: string): value is DailyTaskStatus {
  return (DAILY_TASK_STATUSES as readonly string[]).includes(value)
}

export function toDateOnly(value: Date | string | null | undefined): string | null {
  if (value == null) return null
  if (typeof value === 'string') {
    const t = value.trim()
    if (!t) return null
    return t.slice(0, 10)
  }
  return dbDateToDateOnly(value)
}

/**
 * Lazy reactivation: CONTACT_CLIENT DONE con nextReactivateAt <= oggi → torna OPEN.
 */
export function shouldReactivateContactTask(task: {
  type: string
  status: string
  nextReactivateAt: Date | string | null
}, today = todayDateOnlyRome()): boolean {
  if (task.type !== 'CONTACT_CLIENT') return false
  if (task.status !== 'DONE') return false
  const next = toDateOnly(task.nextReactivateAt)
  if (!next) return false
  return next <= today
}

export function getEffectiveTaskStatus(
  task: { type: string; status: string; nextReactivateAt: Date | string | null },
  today = todayDateOnlyRome()
): DailyTaskStatus {
  if (shouldReactivateContactTask(task, today)) return 'OPEN'
  return isDailyTaskStatus(task.status) ? task.status : 'OPEN'
}

/**
 * Universo: rosso = da sentire (OPEN), verde = sentito in attesa di riattivazione, neutro = nessun tracker.
 */
export function getContactUniverseStatus(
  task: {
    type: string
    status: string
    nextReactivateAt: Date | string | null
  } | null,
  today = todayDateOnlyRome()
): ClientUniverseStatus {
  if (!task || task.type !== 'CONTACT_CLIENT') return 'neutral'
  return getEffectiveTaskStatus(task, today) === 'OPEN' ? 'red' : 'green'
}

/**
 * Ordinamento lista: scadenza cronologica decrescente (più recente/futura in alto),
 * poi titolo ASC, poi id. Le aperte scadute restano evidenti via UI urgenza.
 * Nota: per “più urgenti sopra” usare sortDailyTasksByUrgency.
 */
export function sortDailyTasksByDueDateDesc<
  T extends { dueDate: string | Date; title?: string; id?: string },
>(tasks: T[]): T[] {
  return [...tasks].sort((a, b) => {
    const aKey = toDateOnly(a.dueDate) ?? ''
    const bKey = toDateOnly(b.dueDate) ?? ''
    if (aKey !== bKey) return aKey < bKey ? 1 : -1
    const titleCmp = (a.title ?? '').localeCompare(b.title ?? '', 'it', { sensitivity: 'base' })
    if (titleCmp !== 0) return titleCmp
    return (a.id ?? '').localeCompare(b.id ?? '')
  })
}

/** Più urgenti sopra: scadute → oggi → future → senza (non usato di default). */
export function sortDailyTasksByUrgency<
  T extends { dueDate: string | Date; title?: string; id?: string },
>(tasks: T[], today = todayDateOnlyRome()): T[] {
  return [...tasks].sort((a, b) => {
    const aKey = toDateOnly(a.dueDate)
    const bKey = toDateOnly(b.dueDate)
    if (aKey == null && bKey == null) {
      return (a.title ?? '').localeCompare(b.title ?? '', 'it', { sensitivity: 'base' })
    }
    if (aKey == null) return 1
    if (bKey == null) return -1
    if (aKey !== bKey) return aKey < bKey ? -1 : 1
    const titleCmp = (a.title ?? '').localeCompare(b.title ?? '', 'it', { sensitivity: 'base' })
    if (titleCmp !== 0) return titleCmp
    return (a.id ?? '').localeCompare(b.id ?? '')
  })
}

export type TaskDueUrgency = 'overdue' | 'today' | 'soon' | 'later'

export function getTaskDueUrgency(dueDate: string | Date, today = todayDateOnlyRome()): TaskDueUrgency {
  const key = toDateOnly(dueDate)
  if (!key) return 'later'
  if (key < today) return 'overdue'
  if (key === today) return 'today'
  const todayMs = Date.parse(`${today}T12:00:00.000Z`)
  const dueMs = Date.parse(`${key}T12:00:00.000Z`)
  const days = Math.round((dueMs - todayMs) / (24 * 60 * 60 * 1000))
  if (days <= 3) return 'soon'
  return 'later'
}

export function addCalendarDaysToDateOnly(dateOnly: string, days: number): string {
  return formatDateOnly(addDaysLocal(parseDateOnly(dateOnly), days))
}

export function defaultNextReactivateDate(fromDate = todayDateOnlyRome()): string {
  return addCalendarDaysToDateOnly(fromDate, 7)
}

export function quickReactivateDate(
  kind: 'tomorrow' | 'next_week' | 'next_month',
  fromDate = todayDateOnlyRome()
): string {
  if (kind === 'tomorrow') return addCalendarDaysToDateOnly(fromDate, 1)
  if (kind === 'next_week') return addCalendarDaysToDateOnly(fromDate, 7)
  const d = parseDateOnly(fromDate)
  d.setMonth(d.getMonth() + 1)
  return formatDateOnly(d)
}

/**
 * Prossima riattivazione rispetto al contatto effettivo.
 * La scelta esplicita dell'utente prevale; altrimenti default = +7 giorni dal contatto.
 */
export function resolveNextReactivateAt(
  contactDate: string,
  explicit?: string | null
): string {
  const chosen = explicit?.trim() || null
  if (chosen) {
    assertReactivateAfterContact(contactDate, chosen)
    return chosen
  }
  return defaultNextReactivateDate(contactDate)
}

export function assertReactivateAfterContact(
  contactDate: string,
  nextReactivateAt: string
): void {
  const contact = toDateOnly(contactDate)
  const next = toDateOnly(nextReactivateAt)
  if (!contact || !next) throw new Error('Date di riattivazione non valide')
  if (next <= contact) {
    throw new Error('La prossima riattivazione deve essere successiva alla data del contatto')
  }
}

export function contactTaskTitle(clientName: string): string {
  return `Sentire ${clientName}`
}

/**
 * Per il form modifica: evita di proporre nextReactivateAt <= ultimo contatto
 * (date legacy incoerenti). Non altera i dati DB finché l'utente non salva.
 */
export function sanitizeNextReactivateForForm(input: {
  lastContactedAt: string | null
  nextReactivateAt: string | null
  today?: string
}): string {
  const today = input.today ?? todayDateOnlyRome()
  const anchor = input.lastContactedAt ?? today
  if (!input.nextReactivateAt || input.nextReactivateAt <= anchor) {
    return defaultNextReactivateDate(anchor)
  }
  return input.nextReactivateAt
}

/** Nodi universo mostrati per “pagina” nell’orbita (resto via ricerca/paginazione). */
export const UNIVERSE_ORBIT_PAGE_SIZE = 24

export function paginateUniverseNodes<T>(
  nodes: T[],
  page: number,
  pageSize = UNIVERSE_ORBIT_PAGE_SIZE
): { pageNodes: T[]; page: number; totalPages: number } {
  const totalPages = Math.max(1, Math.ceil(nodes.length / pageSize))
  const safePage = Math.min(Math.max(0, page), totalPages - 1)
  const start = safePage * pageSize
  return {
    pageNodes: nodes.slice(start, start + pageSize),
    page: safePage,
    totalPages,
  }
}

export function filterUniverseNodesByQuery(
  nodes: UniverseClientNode[],
  query: string
): UniverseClientNode[] {
  const q = query.trim().toLowerCase()
  if (!q) return nodes
  return nodes.filter((n) => n.clientName.toLowerCase().includes(q))
}

export function applyTaskToUniverseNode(
  node: UniverseClientNode,
  task: Pick<
    DailyTaskDTO,
    'id' | 'clientId' | 'status' | 'lastContactedAt' | 'nextReactivateAt' | 'dueDate' | 'type'
  >,
  today = todayDateOnlyRome()
): UniverseClientNode {
  if (task.type !== 'CONTACT_CLIENT' || task.clientId !== node.clientId) return node
  return {
    ...node,
    status: getContactUniverseStatus(
      {
        type: task.type,
        status: task.status,
        nextReactivateAt: task.nextReactivateAt,
      },
      today
    ),
    taskId: task.id,
    lastContactedAt: task.lastContactedAt,
    nextReactivateAt: task.nextReactivateAt,
    dueDate: task.dueDate,
  }
}

/**
 * Dopo eliminazione CONTACT_CLIENT: il cliente resta nell’Universo senza tracker (grigio).
 * Non inventa date di contatto non più disponibili.
 */
export function clearContactTrackerFromUniverseNode(
  node: UniverseClientNode,
  taskId?: string | null
): UniverseClientNode {
  if (taskId && node.taskId && node.taskId !== taskId) return node
  return {
    ...node,
    status: 'neutral',
    taskId: null,
    lastContactedAt: null,
    nextReactivateAt: null,
    dueDate: null,
  }
}
