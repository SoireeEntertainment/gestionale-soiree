import type { Prisma } from '@prisma/client'
import { z } from 'zod'
import { ASSISTANT_V2_LIMITS } from '@/lib/assistant-v2/config'
import { createPendingAction } from '@/lib/assistant-v2/confirmation/service'
import { formatDateItFromYmd, resolveItalianDatePhrase } from '@/lib/assistant-v2/dates'
import { assertClientAccess, resolveClientByName } from '@/lib/assistant-v2/resolve-client'
import { resolveUserByName } from '@/lib/assistant-v2/resolve-user'
import type { AssistantToolDefinition, ToolExecutionContext } from '@/lib/assistant-v2/tools/types'
import type {
  AssistantAuthContext,
  ToolErrorResult,
  ToolHandlerResult,
  ToolPreview,
} from '@/lib/assistant-v2/types'
import { prisma } from '@/lib/prisma'
import { dbDateToDateOnly } from '@/lib/timeline-dates'
import { getWorkStatusMeta } from '@/lib/work-status'

export const MAX_ITEMS = ASSISTANT_V2_LIMITS.maxResultItems

/* -------------------------------------------------------------------------- */
/* Definizione tool tipizzata                                                  */
/* -------------------------------------------------------------------------- */

type ToolDefinitionInput<T extends z.ZodTypeAny, P> = Omit<AssistantToolDefinition<T>, 'commit'> & {
  /**
   * Riceve il PAYLOAD salvato nel pending (non l'input del modello).
   * Gli errori lanciati dalle server action vengono convertiti in ToolErrorResult.
   */
  commit?: (payload: P, ctx: ToolExecutionContext) => Promise<ToolHandlerResult>
}

/** Mantiene input/payload tipizzati nei moduli e restituisce la forma generica del registry. */
export function defineTool<T extends z.ZodTypeAny, P = Record<string, unknown>>(
  def: ToolDefinitionInput<T, P>
): AssistantToolDefinition {
  const { commit, ...rest } = def
  return {
    ...rest,
    ...(commit
      ? {
          commit: (payload: unknown, ctx: ToolExecutionContext) =>
            commitSafe(() => commit(payload as P, ctx)),
        }
      : {}),
  } as AssistantToolDefinition
}

export async function commitSafe(fn: () => Promise<ToolHandlerResult>): Promise<ToolHandlerResult> {
  try {
    return await fn()
  } catch (err) {
    if (err instanceof z.ZodError) {
      return { ok: false, error: err.issues[0]?.message ?? 'Dati non validi.' }
    }
    return {
      ok: false,
      error: err instanceof Error && err.message.trim() ? err.message : 'Operazione non riuscita.',
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Pending / conferma                                                          */
/* -------------------------------------------------------------------------- */

export async function queueWrite(
  ctx: ToolExecutionContext,
  toolName: string,
  payload: Record<string, unknown>,
  preview: ToolPreview
): Promise<ToolHandlerResult> {
  const pending = await createPendingAction({
    userId: ctx.auth.currentUserId,
    threadId: ctx.threadId,
    toolName,
    payload,
    preview,
  })
  return {
    ok: true,
    needsConfirmation: true,
    pendingId: pending.pendingId,
    toolName,
    preview,
    payload,
  }
}

/* -------------------------------------------------------------------------- */
/* Scoping accesso                                                             */
/* -------------------------------------------------------------------------- */

/** Stesso criterio di resolveClientByName: ADMIN vede tutto, AGENTE solo clienti assegnati. */
export function clientAccessFilter(auth: AssistantAuthContext): Prisma.ClientWhereInput {
  if (auth.permissions.canReadAllClients) return {}
  return {
    OR: [
      { assignedToUserId: auth.currentUserId },
      { assignees: { some: { userId: auth.currentUserId } } },
    ],
  }
}

export function requireAdmin(ctx: ToolExecutionContext): ToolErrorResult | null {
  if (ctx.auth.role !== 'ADMIN') {
    return { ok: false, error: 'Questa informazione è disponibile solo agli amministratori.' }
  }
  return null
}

/* -------------------------------------------------------------------------- */
/* Risoluzione entità (mai ID inventati)                                       */
/* -------------------------------------------------------------------------- */

export type ResolvedClient = { ok: true; id: string; name: string }

/**
 * Risolve un cliente per nome.
 * Memoria thread solo se `useMemory: true` (riferimento contestuale esplicito).
 * Default: non eredita silenziosamente l’ultimo cliente.
 * Non accetta mai un clientId dal modello.
 */
export async function resolveClient(
  ctx: ToolExecutionContext,
  clientName?: string | null,
  opts: { useMemory?: boolean } = {}
): Promise<ResolvedClient | ToolErrorResult> {
  const useMemory = opts.useMemory === true
  if (!clientName?.trim()) {
    const memId = ctx.memory.lastClientId
    if (useMemory && memId) {
      const c = await assertClientAccess(ctx.auth, memId)
      if (c) return { ok: true, id: c.id, name: c.name }
    }
    return { ok: false, error: 'Di quale cliente parli?', clarify: true }
  }

  const match = await resolveClientByName(ctx.auth, clientName)
  if (match.status === 'found') return { ok: true, id: match.id, name: match.name }
  if (match.status === 'ambiguous') {
    return {
      ok: false,
      error: `Ho trovato più clienti per "${clientName}". Quale intendi?`,
      clarify: true,
      choices: match.choices,
    }
  }
  return { ok: false, error: `Cliente "${clientName}" non trovato.`, clarify: true }
}

export type ResolvedUser = { ok: true; id: string; name: string }

export async function resolveUser(userName: string): Promise<ResolvedUser | ToolErrorResult> {
  const match = await resolveUserByName(userName)
  if (match.status === 'found') return { ok: true, id: match.id, name: match.name }
  if (match.status === 'ambiguous') {
    return {
      ok: false,
      error: `Ho trovato più utenti per "${userName}". Quale intendi?`,
      clarify: true,
      choices: match.choices,
    }
  }
  return { ok: false, error: `Utente "${userName}" non trovato.`, clarify: true }
}

/** Utente indicato per nome oppure l'utente corrente. */
export async function resolveUserOrSelf(
  ctx: ToolExecutionContext,
  userName?: string | null
): Promise<ResolvedUser | ToolErrorResult> {
  if (!userName?.trim()) {
    return { ok: true, id: ctx.auth.currentUserId, name: ctx.auth.user.name }
  }
  return resolveUser(userName)
}

export type ResolvedDate = { ok: true; date: string }

export function resolveDate(phrase: string): ResolvedDate | ToolErrorResult {
  const r = resolveItalianDatePhrase(phrase)
  if (!r.date) {
    return {
      ok: false,
      error: `Non ho capito la data "${phrase}". Specifica ad esempio "domani", "venerdì" o "20 novembre".`,
      clarify: true,
    }
  }
  return { ok: true, date: r.date }
}

export type ResolvedCategory = { ok: true; id: string; name: string }

export async function resolveCategory(name: string): Promise<ResolvedCategory | ToolErrorResult> {
  const q = name.trim()
  if (!q) return { ok: false, error: 'Quale categoria?', clarify: true }
  const rows = await prisma.category.findMany({
    where: { name: { contains: q, mode: 'insensitive' } },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
    take: 8,
  })
  if (rows.length === 0) return { ok: false, error: `Categoria "${name}" non trovata.`, clarify: true }
  const exact = rows.filter((r) => r.name.toLowerCase() === q.toLowerCase())
  if (exact.length === 1) return { ok: true, id: exact[0].id, name: exact[0].name }
  if (rows.length === 1) return { ok: true, id: rows[0].id, name: rows[0].name }
  return {
    ok: false,
    error: `Più categorie corrispondono a "${name}". Quale intendi?`,
    clarify: true,
    choices: rows.map((r) => ({ id: r.id, label: r.name })),
  }
}

/* -------------------------------------------------------------------------- */
/* Lavori                                                                      */
/* -------------------------------------------------------------------------- */

export type WorkRef = {
  id: string
  title: string
  status: string
  deadline: string | null
  clientId: string
  clientName: string
  assignedToUserId: string | null
  assignees: { id: string; name: string }[]
}

export type WorkScope = 'active' | 'done' | 'any'

function workChoiceLabel(w: WorkRef): string {
  const meta = getWorkStatusMeta(w.status)
  const due = w.deadline ? `, scad. ${formatDateItFromYmd(w.deadline)}` : ''
  return `${w.title} — ${w.clientName} (${meta.label}${due})`
}

/**
 * Trova un lavoro per titolo (e/o cliente) rispettando lo scoping clienti.
 * Senza query usa il lavoro del thread (memoria). Ambiguità → choices.
 */
export async function resolveWork(
  ctx: ToolExecutionContext,
  input: { workQuery?: string | null; clientName?: string | null; scope?: WorkScope }
): Promise<{ ok: true; work: WorkRef } | ToolErrorResult> {
  const scope = input.scope ?? 'any'
  const q = input.workQuery?.trim() || ''

  let clientId: string | undefined
  if (input.clientName?.trim()) {
    const c = await resolveClient(ctx, input.clientName, { useMemory: false })
    if (c.ok === false) return c
    clientId = c.id
  }

  const select = {
    id: true,
    title: true,
    status: true,
    deadline: true,
    clientId: true,
    assignedToUserId: true,
    client: { select: { name: true } },
    assignedTo: { select: { id: true, name: true } },
    assignees: { select: { user: { select: { id: true, name: true } } } },
  } satisfies Prisma.WorkSelect

  type Row = Prisma.WorkGetPayload<{ select: typeof select }>

  const toRef = (r: Row): WorkRef => {
    const map = new Map<string, string>()
    if (r.assignedTo) map.set(r.assignedTo.id, r.assignedTo.name)
    for (const a of r.assignees) map.set(a.user.id, a.user.name)
    return {
      id: r.id,
      title: r.title,
      status: r.status,
      deadline: r.deadline ? dbDateToDateOnly(r.deadline) : null,
      clientId: r.clientId,
      clientName: r.client.name,
      assignedToUserId: r.assignedToUserId,
      assignees: [...map.entries()].map(([id, name]) => ({ id, name })),
    }
  }

  const statusWhere: Prisma.WorkWhereInput =
    scope === 'active'
      ? { status: { notIn: ['DONE', 'CANCELED'] } }
      : scope === 'done'
        ? { status: 'DONE' }
        : {}

  // Nessuna query né cliente: usa il lavoro del thread
  if (!q && !clientId) {
    const memId = ctx.memory.lastWorkId
    if (!memId) return { ok: false, error: 'Quale lavoro intendi? Indicami il titolo.', clarify: true }
    const row = await prisma.work.findFirst({
      where: { id: memId, client: clientAccessFilter(ctx.auth), ...statusWhere },
      select,
    })
    if (!row) return { ok: false, error: 'Non trovo il lavoro di cui parlavamo. Indicami il titolo.', clarify: true }
    return { ok: true, work: toRef(row) }
  }

  const rows = await prisma.work.findMany({
    where: {
      ...(q ? { title: { contains: q, mode: 'insensitive' as const } } : {}),
      ...(clientId ? { clientId } : {}),
      client: clientAccessFilter(ctx.auth),
      ...statusWhere,
    },
    select,
    orderBy: [{ deadline: { sort: 'asc', nulls: 'last' } }, { title: 'asc' }],
    take: 10,
  })
  if (rows.length === 0) {
    return { ok: false, error: `Nessun lavoro trovato${q ? ` per "${q}"` : ''}.`, clarify: true }
  }
  const refs = rows.map(toRef)
  if (refs.length === 1) return { ok: true, work: refs[0] }
  const exact = q ? refs.filter((w) => w.title.toLowerCase() === q.toLowerCase()) : []
  if (exact.length === 1) return { ok: true, work: exact[0] }
  return {
    ok: false,
    error: 'Più lavori corrispondono. Quale intendi?',
    clarify: true,
    choices: refs.map((w) => ({ id: w.id, label: workChoiceLabel(w) })),
  }
}

export function workStatusLabel(status: string): string {
  return getWorkStatusMeta(status).label
}
