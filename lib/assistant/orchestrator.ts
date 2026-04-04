import { randomUUID } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import type { CurrentUser } from '@/lib/auth-dev'
import { canWrite } from '@/lib/auth-dev'
import { buildAssistantLlmContext } from '@/lib/assistant/context'
import { callOpenAiChat } from '@/lib/assistant/openai'
import type { AssistantChatResponse, PendingConfirmationMetadata } from '@/lib/assistant/types'
import {
  executeAssistantAction,
  logAssistantAction,
  performAssistantUndo,
} from '@/lib/assistant/action-executor'
import {
  resolveSingleClient,
  findCategoryByNameHint,
  findWorksByClientCategoryOrTitle,
} from '@/lib/assistant/resolve-entities'
import {
  readPedTasksThisWeekForUser,
  readRenewalsDueWithinDays,
  readClientCredentialsForQuery,
  readPedTasksRemainingThisMonthForClient,
  readTopClientsByActiveWorks,
  readMyPedTasksToday,
  readClientsWithActiveCategoryWork,
} from '@/lib/assistant/read-handlers'
import { parseRuleBasedIntent, type RuleBasedIntent } from '@/lib/assistant/intent-parser'
import { parseDeadlineFlexible } from '@/lib/assistant/parse-it-date'
import { buildConversationMemoryBlock } from '@/lib/assistant/conversation-memory'
import { loadThreadAssistantContext } from '@/lib/assistant/thread-context'
import { tryParseFollowUpRule } from '@/lib/assistant/follow-up-parser'
import { suggestThreadTitleFromRule } from '@/lib/assistant/thread-title'
import { runAssistantTool, type ToolName } from '@/lib/assistant/tools-runner'
import {
  buildThreadContextAfterConfirmedAction,
  buildThreadContextForProposedAction,
  buildThreadContextAfterUndoSuccess,
} from '@/lib/assistant/context-patch'
import type {
  AssistantThreadContext,
  CreateClientDraft,
  CreateClientFlowState,
  PendingCreateWorkDraft,
  PendingWorkMissingClientState,
  PendingWorkCompletionState,
} from '@/lib/assistant/thread-context'
import { tryNormalizeGranularWorkIntent } from '@/lib/assistant/work-granular-normalize'
import { resolveWorkFromAssistantParams, resolveUserIdsFromLabelList } from '@/lib/assistant/work-resolve'
import type { ReadWorkResult } from '@/lib/assistant/work-read-handlers'
import {
  readQueryClientWorks,
  readQueryOverdueWorks,
  readQueryUserWorks,
  readQueryWorkload,
  readQueryWorkProgressByWorkId,
  readQueryWorkProgressPoint,
  readQueryWorksForNamedEntity,
  readQueryWorkSteps,
  readQueryWorkSummary,
} from '@/lib/assistant/work-read-handlers'
import type { WorkPeriod } from '@/lib/assistant/work-query-layer'
import {
  continueCreateClientFlow,
  findExistingClientByNormalizedName,
  formatDuplicateReply,
  isConfirmLikeMessage,
  isRejectLikeMessage,
  parseCreateClientRule,
  startCreateClientFlowFromRule,
  extractCreateClientFields,
} from '@/lib/assistant/create-client-flow'

async function checkCreateClientDuplicate(name: string): Promise<{ reply: string } | null> {
  const dup = await findExistingClientByNormalizedName(name)
  if (!dup) return null
  return { reply: formatDuplicateReply(dup) }
}

type NormalizeWriteIntentResult =
  | { ok: true; actionType: string; payload: Record<string, unknown> }
  | { ok: false; reply: string }
  | {
      ok: 'missing_client'
      missingClientName: string
      pendingWorkDraft: PendingCreateWorkDraft
    }

/** Completamento payload create_work quando il cliente è già noto (id). */
async function buildCreateWorkPayloadFromResolvedClient(
  client: { id: string; name: string },
  draft: PendingCreateWorkDraft
): Promise<
  | { ok: true; payload: Record<string, unknown> }
  | { ok: false; reply: string }
  | { ok: 'need_category' }
  | { ok: 'need_deadline'; reply: string }
> {
  const catHint = (draft.categoryNameHint?.trim() || draft.title?.trim() || '').trim()
  const cat = await findCategoryByNameHint(catHint || draft.title)
  if (!cat) return { ok: 'need_category' }

  const rawDl = draft.deadlineRaw?.trim() ?? ''
  let deadline: string | null = null
  if (rawDl) {
    deadline = normalizeDeadlineInput(rawDl)
    if (!deadline) {
      return {
        ok: 'need_deadline',
        reply: `Non ho capito la data "${rawDl}". Indica una data tipo 15 marzo o YYYY-MM-DD.`,
      }
    }
  }

  const assigneeNames = draft.assigneeNames?.trim() || ''
  let assigneeUserIds: string[] | undefined
  if (assigneeNames) {
    const ru = await resolveUserIdsFromLabelList(assigneeNames)
    if (!ru.ok) return { ok: false, reply: ru.reply }
    assigneeUserIds = ru.ids
  }
  const primaryAssignee = assigneeUserIds?.[0] ?? null

  return {
    ok: true,
    payload: {
      title: draft.title,
      clientId: client.id,
      categoryId: cat.id,
      description: draft.description,
      status: draft.status || undefined,
      priority: draft.priority || null,
      deadline,
      assignedToUserId: primaryAssignee,
      assigneeUserIds: assigneeUserIds && assigneeUserIds.length > 0 ? assigneeUserIds : undefined,
    },
  }
}

function pendingDraftToWriteParams(
  draft: PendingCreateWorkDraft,
  clientNameOrHint: string
): Record<string, unknown> {
  const p: Record<string, unknown> = {
    title: draft.title,
    clientName: clientNameOrHint,
    categoryName: draft.categoryNameHint,
    deadline: draft.deadlineRaw || '',
  }
  if (draft.description) p.description = draft.description
  if (draft.status) p.status = draft.status
  if (draft.priority) p.priority = draft.priority
  if (draft.assigneeNames) p.assigneeNames = draft.assigneeNames
  return p
}

const SYSTEM_PROMPT = `Sei l'assistente interno del gestionale Soirëe Studio. Rispondi SOLO con JSON valido, senza markdown.

Schema di output obbligatorio:
{
  "reply": "testo in italiano per l'utente",
  "intent": "read" | "write" | "clarify" | "chat",
  "tool_requests": null | [
    { "name": "search_clients" | "search_works" | "search_credentials" | "search_renewals" | "search_ped_tasks", "args": { "query": "string opzionale", "limit": number opzionale } }
  ],
  "read_intent": null | { "type": "ped_week_tasks", "userName": "string" } | { "type": "renewals_due", "days": number } | { "type": "active_works_for_user", "userName": "string" } | { "type": "client_credentials", "clientName": "string", "labelHint": "string", "revealSecrets": boolean } | { "type": "ped_month_remaining", "clientName": "string" } | { "type": "top_clients_active_works" } | { "type": "my_ped_today" } | { "type": "clients_active_category_work", "categoryHint": "string" } | { "type": "query_user_works", "userName": "string opzionale (io = utente corrente)", "period": "all"|"today"|"week"|"month"|"next7days", "overdueOnly": boolean } | { "type": "query_client_works", "clientName": "string", "period": "...", "overdueOnly": boolean } | { "type": "query_overdue_works", "userName": "string opzionale" } | { "type": "query_work_steps", "clientName": "string", "workTitleHint": "string", "missingOnly": boolean } | { "type": "query_work_progress", "clientName": "string", "workTitleHint": "string" } | { "type": "query_workload", "period": "week"|"month" } | { "type": "query_work_summary", "clientName": "string opzionale", "categoryHint": "string opzionale", "period": "week"|"today"|"month"|"next7days" opzionale },
  "write_intent": null | {
    "type": "create_client" | "create_client_credential" | "create_work" | "create_work_step" | "update_work" | "update_work_step" |
      "update_work_title" | "update_work_description" | "update_work_category" | "update_work_status" | "update_work_priority" | "update_work_deadline" |
      "assign_work_users" | "unassign_work_users" | "add_work_note" |
      "delete_work_step" | "reorder_work_steps" | "mark_work_step_done" | "mark_work_step_todo" |
      "create_ped_task" | "update_ped_task" | "create_client_renewal" | "update_client_renewal" | "update_client_credential",
    "params": { ... campi estratti dal messaggio utente, usa nomi cliente/categoria/lavoro come stringhe se non hai id }
  }
}

Regole:
- Se mancano informazioni essenziali, usa intent "clarify" e read_intent/write_intent null.
- tool_requests: usa SOLO se ti servono dati dal DB prima di rispondere (max 2 strumenti). Se il contesto conversazione già basta, lascia null.
- Per letture (read): imposta read_intent appropriato; reply può essere breve (es. "Ecco i dati richiesti.").
- Per "lavori attivi di [nome]": read_intent { "type": "active_works_for_user", "userName": "..." } oppure query_user_works (include assignazioni multiple e % step).
- Letture lavori: query_user_works, query_client_works, query_overdue_works, query_work_steps (missingOnly true/false), query_work_progress, query_workload, query_work_summary — usa nomi come stringhe; period: today|week|month|next7days|all.
- Per credenziali: read_intent con revealSecrets true SOLO se l'utente chiede esplicitamente password in chiaro / valori completi; altrimenti revealSecrets false.
- Per modifiche (write): imposta write_intent con type e params; NON dire di aver già eseguito l'azione.
- Per conversazione generica senza azione sul DB: intent "chat", read_intent e write_intent null.
- Date: preferisci formato YYYY-MM-DD nei params quando possibile; per "lunedì prossimo" passa la frase nella deadline e il sistema la interpreterà.
- Per create_work: title, clientName (o clientId), categoryName (o categoryId); opzionali description, deadline, assigneeNames (es. "Davide e Cristian"), status, priority.
- Per create_work_step: clientName, workTitleHint (o categoryName), stepTitle; oppure workId se noto; useImplicitLastWork "true" se l’utente continua sul lavoro appena citato.
- Per update_work: clientName, workTitleHint, e campi da cambiare (deadline, title, status, priority, description, categoryName, assigneeNames).
- Per azioni granulari su un lavoro: stessi identificativi (clientName + workTitleHint o categoryName, o workId). Esempi: update_work_title (title), update_work_description (description), update_work_category (categoryName), update_work_status (status), update_work_priority (priority), update_work_deadline (deadline), assign_work_users / unassign_work_users (assigneeNames o userNames), add_work_note (note), delete_work_step (stepTitle), reorder_work_steps (stepTitlesInOrder: array o stringa "A, B, C"), mark_work_step_done / mark_work_step_todo (stepTitle).
- Per create_client (nuovo cliente in anagrafica): params con name obbligatorio; opzionali contactName, email, phone, notes. NON usare per credenziali/login.
- Per create_client_credential: clientName, label (es. Instagram), username, password se forniti.
- Per create_ped_task: clientName, date (YYYY-MM-DD), title, type (es. POST, REEL), kind tipicamente CONTENT.
- Non inventare id: usa nomi; il sistema risolverà.
- Se hai già ricevuto "Risultati strumenti" nel messaggio utente, NON impostare tool_requests di nuovo.`

type LlmOut = {
  reply?: string
  intent?: string
  tool_requests?: { name?: string; args?: Record<string, unknown> }[] | null
  read_intent?: {
    type?: string
    userName?: string
    days?: number
    clientName?: string
    labelHint?: string
    revealSecrets?: boolean
    categoryHint?: string
    period?: string
    overdueOnly?: boolean
    missingOnly?: boolean
    workTitleHint?: string
  } | null
  write_intent?: { type?: string; params?: Record<string, unknown> } | null
}

function safeParseLlmJson(raw: string): LlmOut {
  try {
    return JSON.parse(raw) as LlmOut
  } catch {
    return { reply: 'Non sono riuscito a interpretare la risposta. Riprova con una frase più semplice.', intent: 'clarify' }
  }
}

function normalizeDeadlineInput(raw: string | undefined | null): string | null {
  if (!raw || typeof raw !== 'string') return null
  const t = raw.trim()
  if (!t) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t
  return parseDeadlineFlexible(t)
}

function readText(s: string): ReadWorkResult {
  return { text: s }
}

function mergeReadResponse(
  baseReply: string,
  factual: ReadWorkResult,
  suggestedThreadTitle: string | null
): AssistantChatResponse {
  return {
    reply: [baseReply, factual.text].filter(Boolean).join('\n\n'),
    mode: 'answer',
    threadContextUpdate: factual.threadContextUpdate,
    readQuickLinks: factual.readQuickLinks,
    suggestedThreadTitle,
  }
}

function normWorkPeriod(p: string | undefined): WorkPeriod | undefined {
  if (!p || p === 'all') return undefined
  if (p === 'today' || p === 'week' || p === 'month' || p === 'next7days') return p
  return undefined
}

async function runReadIntent(
  read: {
    type?: string
    userName?: string
    days?: number
    clientName?: string
    labelHint?: string
    revealSecrets?: boolean
    categoryHint?: string
    period?: string
    overdueOnly?: boolean
    missingOnly?: boolean
    workTitleHint?: string
  },
  opts?: { currentUserId?: string; currentUserName?: string }
): Promise<ReadWorkResult> {
  const uid = opts?.currentUserId ?? ''
  const uname = opts?.currentUserName ?? ''

  if (read.type === 'ped_week_tasks' && read.userName) {
    return readText(await readPedTasksThisWeekForUser(read.userName))
  }
  if (read.type === 'renewals_due') {
    const days = typeof read.days === 'number' && read.days > 0 ? read.days : 30
    return readText(await readRenewalsDueWithinDays(days))
  }
  if (read.type === 'active_works_for_user' && read.userName) {
    return readQueryUserWorks({
      userNameHint: read.userName,
      period: 'all',
      overdueOnly: false,
      currentUserId: uid,
      currentUserName: uname,
    })
  }
  if (read.type === 'client_credentials' && read.clientName && read.labelHint) {
    return readText(
      await readClientCredentialsForQuery(read.clientName, read.labelHint, {
        revealSecrets: read.revealSecrets === true,
      })
    )
  }
  if (read.type === 'ped_month_remaining' && read.clientName) {
    return readText(await readPedTasksRemainingThisMonthForClient(read.clientName))
  }
  if (read.type === 'top_clients_active_works') {
    return readText(await readTopClientsByActiveWorks(12))
  }
  if (read.type === 'my_ped_today' && opts?.currentUserId && opts?.currentUserName) {
    return readText(await readMyPedTasksToday(opts.currentUserId, opts.currentUserName))
  }
  if (read.type === 'clients_active_category_work' && read.categoryHint) {
    return readText(await readClientsWithActiveCategoryWork(read.categoryHint))
  }

  if (read.type === 'query_user_works') {
    return readQueryUserWorks({
      userNameHint: read.userName,
      period: normWorkPeriod(read.period) ?? 'all',
      overdueOnly: read.overdueOnly === true,
      currentUserId: uid,
      currentUserName: uname,
    })
  }
  if (read.type === 'query_client_works' && read.clientName) {
    return readQueryClientWorks({
      clientNameHint: read.clientName,
      period: normWorkPeriod(read.period) ?? 'all',
      overdueOnly: read.overdueOnly === true,
    })
  }
  if (read.type === 'query_overdue_works') {
    if (read.userName?.trim()) {
      const r = await readQueryUserWorks({
        userNameHint: read.userName,
        period: 'all',
        overdueOnly: true,
        currentUserId: uid,
        currentUserName: uname,
      })
      return r
    }
    return readQueryOverdueWorks({})
  }
  if (read.type === 'query_work_steps' && read.clientName && read.workTitleHint) {
    return readQueryWorkSteps({
      clientName: read.clientName,
      workTitleHint: read.workTitleHint,
      mode: read.missingOnly === false ? 'full' : 'missing',
    })
  }
  if (read.type === 'query_work_progress' && read.clientName && read.workTitleHint) {
    return readQueryWorkProgressPoint({
      clientName: read.clientName,
      workTitleHint: read.workTitleHint,
    })
  }
  if (read.type === 'query_workload') {
    const scope = read.period === 'month' ? 'month' : 'week'
    const label = scope === 'month' ? 'questo mese' : 'questa settimana'
    return readQueryWorkload({ periodLabel: label, scope })
  }
  if (read.type === 'query_work_summary') {
    return readQueryWorkSummary({
      clientName: read.clientName,
      categoryHint: read.categoryHint,
      period: normWorkPeriod(read.period),
    })
  }

  return readText('Richiesta di lettura non riconosciuta.')
}

async function runRuleBasedRead(
  rule: RuleBasedIntent,
  opts?: { currentUserId?: string; currentUserName?: string }
): Promise<ReadWorkResult | null> {
  const uid = opts?.currentUserId ?? ''
  const uname = opts?.currentUserName ?? ''

  switch (rule.kind) {
    case 'query_active_works':
      return readQueryUserWorks({
        userNameHint: rule.userName,
        period: 'all',
        overdueOnly: false,
        currentUserId: uid,
        currentUserName: uname,
      })
    case 'query_renewals':
      return readText(await readRenewalsDueWithinDays(rule.days))
    case 'query_client_credentials':
      return readText(
        await readClientCredentialsForQuery(rule.clientName, rule.labelHint, {
          revealSecrets: rule.revealSecrets,
        })
      )
    case 'query_ped_month_remaining':
      return readText(await readPedTasksRemainingThisMonthForClient(rule.clientName))
    case 'query_top_clients_active_works':
      return readText(await readTopClientsByActiveWorks(12))
    case 'query_my_ped_today':
      if (!opts?.currentUserId || !opts?.currentUserName) {
        return readText('Accedi come utente per vedere le tue task di oggi.')
      }
      return readText(await readMyPedTasksToday(opts.currentUserId, opts.currentUserName))
    case 'query_clients_active_category_work':
      return readText(await readClientsWithActiveCategoryWork(rule.categoryHint))

    case 'query_overdue_works':
      return readQueryOverdueWorks({})
    case 'query_workload': {
      const scope = rule.scope === 'month' ? 'month' : 'week'
      const label = scope === 'month' ? 'questo mese' : 'questa settimana'
      return readQueryWorkload({ periodLabel: label, scope })
    }
    case 'query_works_entity':
      return readQueryWorksForNamedEntity({
        name: rule.name,
        period: rule.period,
        overdueOnly: rule.overdueOnly,
        currentUserId: uid,
        currentUserName: uname,
      })
    case 'query_client_works_explicit':
      return readQueryClientWorks({
        clientNameHint: rule.clientName,
        period: rule.period,
        overdueOnly: rule.overdueOnly,
      })
    case 'query_user_works_assigned':
      return readQueryUserWorks({
        userNameHint: rule.userName,
        period: rule.period,
        overdueOnly: rule.overdueOnly,
        currentUserId: uid,
        currentUserName: uname,
      })
    case 'query_work_steps':
      return readQueryWorkSteps({
        clientName: rule.clientName,
        workTitleHint: rule.workHint,
        mode: rule.mode,
      })
    case 'query_work_progress':
      return readQueryWorkProgressPoint({
        clientName: rule.clientName,
        workTitleHint: rule.workHint,
      })
    case 'query_work_show':
      return readQueryWorkSteps({
        clientName: rule.clientName,
        workTitleHint: rule.workHint,
        mode: 'full',
      })
    case 'query_work_summary':
      return readQueryWorkSummary({
        clientName: rule.clientName,
        categoryHint: rule.categoryHint,
        period: rule.period,
      })
    case 'query_user_overdue_followup':
      return readQueryOverdueWorks({ userId: rule.userId, userNameForLabel: rule.userName })
    case 'query_work_progress_followup':
      return readQueryWorkProgressByWorkId(rule.workId)

    default:
      return null
  }
}

async function runLlmToolRequests(
  requests: { name?: string; args?: Record<string, unknown> }[]
): Promise<string> {
  const lines: string[] = []
  const allowed = new Set<string>([
    'search_clients',
    'search_works',
    'search_credentials',
    'search_renewals',
    'search_ped_tasks',
  ])
  let i = 0
  for (const r of requests.slice(0, 3)) {
    const name = r.name as ToolName | undefined
    if (!name || !allowed.has(name)) continue
    i += 1
    const out = await runAssistantTool(name, r.args ?? {})
    lines.push(`### ${i}. ${name}\n${out}`)
  }
  return lines.length ? lines.join('\n\n') : 'Nessun risultato dagli strumenti.'
}

function ruleIntentToWriteParams(rule: RuleBasedIntent): { type: string; params: Record<string, unknown> } | null {
  switch (rule.kind) {
    case 'add_client_credential':
      return {
        type: 'create_client_credential',
        params: {
          clientName: rule.clientName,
          label: rule.label,
          username: rule.username ?? '',
          password: rule.password ?? '',
        },
      }
    case 'create_work': {
      const title = (rule.title ?? rule.categoryName).trim()
      const deadline = rule.deadlineRaw ? normalizeDeadlineInput(rule.deadlineRaw) : null
      const params: Record<string, unknown> = {
        title,
        clientName: rule.clientName,
        categoryName: rule.categoryName,
        deadline: deadline ?? '',
      }
      if (rule.assigneeNames?.trim()) params.assigneeNames = rule.assigneeNames.trim()
      return { type: 'create_work', params }
    }
    case 'mark_work_step_done':
      return {
        type: 'mark_work_step_done',
        params: {
          clientName: rule.clientName,
          workTitleHint: rule.workHint,
          stepTitle: rule.stepTitle,
        },
      }
    case 'assign_work_users_rule':
      return {
        type: 'assign_work_users',
        params: { workId: rule.workId, assigneeNames: rule.assigneeNames },
      }
    case 'create_work_step_followup':
      return {
        type: 'create_work_step',
        params: { workId: rule.workId, stepTitle: rule.stepTitle },
      }
    case 'create_work_step':
      return {
        type: 'create_work_step',
        params: {
          clientName: rule.clientName,
          workTitleHint: rule.workHint,
          stepTitle: rule.stepTitle,
        },
      }
    case 'update_work': {
      const deadline = rule.deadlineRaw ? normalizeDeadlineInput(rule.deadlineRaw) : null
      return {
        type: 'update_work',
        params: {
          clientName: rule.clientName,
          workTitleHint: rule.workHint,
          deadline: deadline ?? '',
          title: rule.newTitle ?? '',
        },
      }
    }
    default:
      return null
  }
}

/** Normalizza write_intent in payload eseguibile o messaggio di chiarimento. */
async function normalizeWriteIntent(
  type: string,
  params: Record<string, unknown>,
  threadCtx: AssistantThreadContext | null
): Promise<NormalizeWriteIntentResult> {
  const str = (k: string) => (typeof params[k] === 'string' ? (params[k] as string).trim() : '')

  const granular = await tryNormalizeGranularWorkIntent(type, params, threadCtx)
  if (granular !== null) return granular

  switch (type) {
    case 'create_client': {
      const name = str('name') || str('clientName') || str('nome') || str('ragioneSociale')
      if (process.env.NODE_ENV !== 'production') {
        console.log('[assistant] normalizeWriteIntent create_client', { name, paramsKeys: Object.keys(params) })
      }
      if (!name) {
        return { ok: false, reply: 'Per creare un cliente serve almeno il nome (ragione sociale o nome commerciale).' }
      }
      const dupMsg = await checkCreateClientDuplicate(name)
      if (dupMsg) return { ok: false, reply: dupMsg.reply }
      return {
        ok: true,
        actionType: 'create_client',
        payload: {
          name,
          contactName: str('contactName') || str('referente') || null,
          email: str('email') || null,
          phone: str('phone') || str('telefono') || str('tel') || null,
          notes: str('notes') || str('note') || null,
        },
      }
    }

    case 'create_client_credential': {
      const clientHint = str('clientName') || str('client')
      const label = str('label') || 'Credenziale'
      if (!clientHint) return { ok: false, reply: 'Per quale cliente devo salvare le credenziali?' }
      const r = await resolveSingleClient(clientHint)
      if (!r) return { ok: false, reply: `Non ho trovato un cliente simile a "${clientHint}".` }
      if ('ambiguous' in r) {
        const names = r.ambiguous.map((c) => c.name).join(', ')
        return { ok: false, reply: `Ho trovato più clienti: ${names}. Quale intendi?` }
      }
      return {
        ok: true,
        actionType: 'create_client_credential',
        payload: {
          clientId: r.id,
          label,
          username: str('username') || null,
          password: str('password') || null,
          notes: str('notes') || null,
        },
      }
    }

    case 'create_work': {
      const clientHint = str('clientName') || str('client')
      const catHint = str('categoryName') || str('category')
      const title = str('title') || catHint || str('categoryName')
      if (!clientHint) return { ok: false, reply: 'Per quale cliente è il lavoro?' }
      if (!title) return { ok: false, reply: 'Che tipo di lavoro o titolo devo usare (es. Website, Social)?' }
      const pendingDraft: PendingCreateWorkDraft = {
        title,
        clientNameHint: clientHint,
        categoryNameHint: catHint || title,
        description: str('description') || null,
        status: str('status') || undefined,
        priority: str('priority') || null,
        deadlineRaw: str('deadline'),
        assigneeNames: str('assigneeNames') || str('assignedUsers') || str('assignees') || null,
      }
      const cr = await resolveSingleClient(clientHint)
      if (!cr) {
        return {
          ok: 'missing_client',
          missingClientName: clientHint,
          pendingWorkDraft: pendingDraft,
        }
      }
      if ('ambiguous' in cr) {
        return {
          ok: false,
          reply: `Ho trovato più clienti: ${cr.ambiguous.map((c) => c.name).join(', ')}. Quale intendi?`,
        }
      }
      const built = await buildCreateWorkPayloadFromResolvedClient(cr, pendingDraft)
      if (built.ok === false) return built
      if (built.ok === 'need_category') {
        return {
          ok: false,
          reply: `Non ho trovato una categoria simile a "${catHint || title}".`,
        }
      }
      if (built.ok === 'need_deadline') return { ok: false, reply: built.reply }
      return { ok: true, actionType: 'create_work', payload: built.payload }
    }

    case 'create_work_step': {
      const stepTitle = str('stepTitle') || str('title')
      if (!stepTitle) return { ok: false, reply: 'Che titolo deve avere lo step?' }
      const implicit = str('useImplicitLastWork') === 'true'
      const rw = await resolveWorkFromAssistantParams(params, threadCtx, { implicitLastWork: implicit })
      if (!rw.ok) {
        return {
          ok: false,
          reply: rw.reply.includes('servono') ? `${rw.reply} Poi indica il titolo dello step.` : rw.reply,
        }
      }
      return {
        ok: true,
        actionType: 'create_work_step',
        payload: { workId: rw.work.id, title: stepTitle },
      }
    }

    case 'update_work': {
      const implicit = str('useImplicitLastWork') === 'true'
      const rw = await resolveWorkFromAssistantParams(params, threadCtx, { implicitLastWork: implicit })
      if (!rw.ok) return rw
      const patch: Record<string, unknown> = { workId: rw.work.id }
      const rawDl = str('deadline')
      if (rawDl) {
        const norm = normalizeDeadlineInput(rawDl)
        if (!norm) {
          return {
            ok: false,
            reply: `Non ho capito la data "${rawDl}". Usa formato 20 marzo o YYYY-MM-DD.`,
          }
        }
        patch.deadline = norm
      }
      if (str('title')) patch.title = str('title')
      if (str('status')) patch.status = str('status')
      if (str('priority')) patch.priority = str('priority')
      if (str('description')) patch.description = str('description')
      const catNew = str('categoryName') || str('categoryId')
      if (str('categoryId')) {
        patch.categoryId = str('categoryId')
      } else if (catNew) {
        const c = await findCategoryByNameHint(catNew)
        if (!c) return { ok: false, reply: `Categoria non trovata per "${catNew}".` }
        patch.categoryId = c.id
      }
      const assigneeNames = str('assigneeNames') || str('assignedUsers')
      if (assigneeNames) {
        const ru = await resolveUserIdsFromLabelList(assigneeNames)
        if (!ru.ok) return { ok: false, reply: ru.reply }
        patch.assigneeUserIds = ru.ids
      }
      if (Object.keys(patch).length === 1) {
        return { ok: false, reply: 'Cosa vuoi modificare del lavoro (deadline, titolo, stato, priorità, descrizione, categoria, assegnatari)?' }
      }
      return { ok: true, actionType: 'update_work', payload: patch }
    }

    case 'create_ped_task': {
      const clientHint = str('clientName') || str('client')
      const date = str('date')
      const title = str('title')
      if (!clientHint || !date || !title) {
        return { ok: false, reply: 'Servono cliente, data (YYYY-MM-DD) e titolo della task PED.' }
      }
      const cr = await resolveSingleClient(clientHint)
      if (!cr || 'ambiguous' in cr) {
        return { ok: false, reply: 'Cliente non univoco o non trovato.' }
      }
      const typeRaw = (str('type') || 'POST').toUpperCase()
      const allowed = ['REEL', 'POST', 'STORY', 'CAROUSEL', 'ADV', 'SHOOTING', 'WEBSITE_TASK', 'GRAPHIC_TASK', 'COPY_TASK', 'MEETING', 'OTHER']
      const type = allowed.includes(typeRaw) ? typeRaw : 'POST'
      return {
        ok: true,
        actionType: 'create_ped_task',
        payload: {
          clientId: cr.id,
          date,
          kind: str('kind') === 'WORK_TASK' ? 'WORK_TASK' : 'CONTENT',
          type,
          title,
          description: str('description') || null,
        },
      }
    }

    case 'update_ped_task': {
      const pedItemId = str('pedItemId')
      if (!pedItemId) {
        return { ok: false, reply: 'Per aggiornare una task PED serve l’ID oppure usa la UI; in chat indica meglio la task.' }
      }
      const patch: Record<string, unknown> = { pedItemId }
      if (str('title')) patch.title = str('title')
      if (str('date')) patch.date = str('date')
      if (str('label')) patch.label = str('label')
      if (str('status')) patch.status = str('status')
      return { ok: true, actionType: 'update_ped_task', payload: patch }
    }

    case 'create_client_renewal': {
      const clientHint = str('clientName') || str('client')
      const serviceName = str('serviceName') || str('service')
      const renewalDate = str('renewalDate')
      if (!clientHint || !serviceName || !renewalDate) {
        return { ok: false, reply: 'Servono cliente, nome servizio e data rinnovo (YYYY-MM-DD).' }
      }
      const cr = await resolveSingleClient(clientHint)
      if (!cr || 'ambiguous' in cr) {
        return { ok: false, reply: 'Cliente non univoco o non trovato.' }
      }
      return {
        ok: true,
        actionType: 'create_client_renewal',
        payload: {
          clientId: cr.id,
          serviceName,
          renewalDate,
          billingDate: str('billingDate') || null,
          status: str('status') || undefined,
          notes: str('notes') || null,
        },
      }
    }

    case 'update_client_renewal': {
      const clientHint = str('clientName') || str('client')
      const serviceHint = str('serviceName') || str('service')
      if (!clientHint || !serviceHint) {
        return { ok: false, reply: 'Indica cliente e servizio del rinnovo da aggiornare.' }
      }
      const cr = await resolveSingleClient(clientHint)
      if (!cr || 'ambiguous' in cr) {
        return { ok: false, reply: 'Cliente non univoco o non trovato.' }
      }
      const ren = await prisma.clientRenewal.findFirst({
        where: {
          clientId: cr.id,
          serviceName: { contains: serviceHint, mode: 'insensitive' },
        },
      })
      if (!ren) return { ok: false, reply: 'Rinnovo non trovato per quel servizio.' }
      const renewalDate = str('renewalDate') || ren.renewalDate.toISOString().slice(0, 10)
      return {
        ok: true,
        actionType: 'update_client_renewal',
        payload: {
          renewalId: ren.id,
          clientId: cr.id,
          serviceName: ren.serviceName,
          renewalDate,
          billingDate: str('billingDate') || null,
          status: str('status') || ren.status,
          notes: str('notes') ?? ren.notes,
        },
      }
    }

    case 'update_client_credential': {
      const clientHint = str('clientName') || str('client')
      const labelHint = str('label') || str('credentialLabel')
      if (!clientHint || !labelHint) {
        return { ok: false, reply: 'Indica cliente e tipo/etichetta credenziale da aggiornare.' }
      }
      const cr = await resolveSingleClient(clientHint)
      if (!cr || 'ambiguous' in cr) {
        return { ok: false, reply: 'Cliente non univoco o non trovato.' }
      }
      const cred = await prisma.clientCredential.findFirst({
        where: {
          clientId: cr.id,
          label: { contains: labelHint, mode: 'insensitive' },
        },
      })
      if (!cred) return { ok: false, reply: 'Credenziale non trovata con quell’etichetta.' }
      return {
        ok: true,
        actionType: 'update_client_credential',
        payload: {
          credentialId: cred.id,
          clientId: cr.id,
          label: str('newLabel') || cred.label,
          username: str('username') || null,
          password: str('password') || null,
          notes: str('notes') || null,
        },
      }
    }

    case 'update_work_step': {
      const stepId = str('stepId')
      if (stepId) {
        return {
          ok: true,
          actionType: 'update_work_step',
          payload: {
            stepId,
            title: str('title') || undefined,
            status: str('status') || undefined,
          },
        }
      }
      const clientHint = str('clientName')
      const workHint = str('workTitleHint') || str('workTitle')
      const stepHint = str('stepTitle') || str('step')
      if (!clientHint || !workHint || !stepHint) {
        return { ok: false, reply: 'Per aggiornare uno step indica cliente, lavoro e titolo step (o stepId).' }
      }
      const cr = await resolveSingleClient(clientHint)
      if (!cr || 'ambiguous' in cr) return { ok: false, reply: 'Cliente non univoco.' }
      const works = await findWorksByClientCategoryOrTitle(cr.id, workHint)
      if (works.length !== 1) return { ok: false, reply: 'Lavoro non univoco o non trovato.' }
      const steps = await prisma.workStep.findMany({
        where: { workId: works[0].id, title: { contains: stepHint, mode: 'insensitive' } },
      })
      if (steps.length !== 1) {
        return { ok: false, reply: steps.length === 0 ? 'Step non trovato.' : 'Più step compatibili; sii più specifico.' }
      }
      return {
        ok: true,
        actionType: 'update_work_step',
        payload: {
          stepId: steps[0].id,
          title: str('newTitle') || undefined,
          status: str('status') || undefined,
        },
      }
    }

    default:
      return { ok: false, reply: `Azione "${type}" non ancora supportata dalla normalizzazione.` }
  }
}

function draftToCreateClientPayload(d: CreateClientDraft): Record<string, unknown> {
  const name = d.name?.trim()
  if (!name) throw new Error('Nome cliente mancante')
  return {
    name,
    contactName: d.contactName?.trim() || null,
    email: d.email?.trim() || null,
    phone: d.phone?.trim() || null,
    notes: d.notes?.trim() || null,
  }
}

function previewPayload(actionType: string, payload: Record<string, unknown>): string {
  if (actionType === 'create_client') {
    const name = typeof payload.name === 'string' ? payload.name : '?'
    const bits = [`nome: ${name}`]
    if (payload.contactName) bits.push(`referente: ${String(payload.contactName)}`)
    if (payload.email) bits.push(`email: ${String(payload.email)}`)
    if (payload.phone) bits.push(`tel: ${String(payload.phone)}`)
    if (payload.notes) bits.push('note: …')
    return `create_client (${bits.join(', ')})`
  }
  const redact = { ...payload }
  if ('password' in redact && redact.password) redact.password = '***'
  return `${actionType}: ${JSON.stringify(redact)}`
}

async function handleCreateClientFlowTurn(params: {
  user: CurrentUser
  threadId: string
  userMessage: string
  flow: CreateClientFlowState
  suggestedThreadTitle: string | null
  /** Dopo il cliente, riprendere questo create_work */
  pendingWorkAfterClient?: PendingCreateWorkDraft | null
  /** Toglie lo stato "cliente mancante per lavoro" */
  clearPendingMissingClient?: boolean
}): Promise<AssistantChatResponse> {
  const {
    user,
    threadId,
    userMessage,
    flow,
    suggestedThreadTitle,
    pendingWorkAfterClient: workAfterClient,
    clearPendingMissingClient,
  } = params

  const mergeWorkPending = (patch: Partial<AssistantThreadContext>): Partial<AssistantThreadContext> => {
    const out: Partial<AssistantThreadContext> = { ...patch }
    if (clearPendingMissingClient) {
      out.pendingWorkWithMissingClient = null
    }
    if (workAfterClient) {
      out.pendingWorkAfterClient = workAfterClient
    }
    return out
  }

  if (/^(annulla|lascia\s+stare|non\s+creare|stop)\b/i.test(userMessage.trim())) {
    if (process.env.NODE_ENV !== 'production') console.log('[assistant] create_client cancelled by user')
    return {
      reply: workAfterClient
        ? 'Ok, annullo: non creo il cliente e non procedo con il lavoro in sospeso.'
        : 'Ok, annullo la creazione del nuovo cliente.',
      mode: 'answer',
      threadContextUpdate: mergeWorkPending({
        createClientFlow: null,
        pendingWorkAfterClient: null,
        pendingWorkWithMissingClient: null,
        pendingWorkCompletion: null,
      }),
      suggestedThreadTitle,
    }
  }

  const cont = continueCreateClientFlow({ userMessage, flow })
  if (process.env.NODE_ENV !== 'production') {
    console.log('[assistant] create_client step', {
      kind: cont.kind,
      draft: cont.draft,
      extractedFields: cont.draft,
    })
  }

  const nameTrimmed = cont.draft.name?.trim()
  if (nameTrimmed) {
    const dup = await findExistingClientByNormalizedName(nameTrimmed)
    if (dup) {
      if (process.env.NODE_ENV !== 'production') {
        console.log('[assistant] create_client duplicate', { existing: dup.name })
      }
      return {
        reply: formatDuplicateReply(dup),
        mode: 'clarification',
        threadContextUpdate: mergeWorkPending({
          createClientFlow: null,
          pendingWorkAfterClient: null,
          pendingWorkWithMissingClient: null,
        }),
        suggestedThreadTitle,
      }
    }
  }

  if (cont.kind === 'needs_confirmation' && nameTrimmed) {
    const payload = draftToCreateClientPayload(cont.draft)
    const intro = `Sto per creare il cliente **${nameTrimmed}**${
      cont.draft.contactName?.trim() ? ` con referente **${cont.draft.contactName.trim()}**` : ''
    }.`
    const res = await buildNeedsConfirmationResponse({
      user,
      threadId,
      baseReply: intro,
      normalized: { actionType: 'create_client', payload },
      suggestedThreadTitle: cont.suggestedThreadTitle ?? suggestedThreadTitle,
    })
    return {
      ...res,
      threadContextUpdate: mergeWorkPending({
        ...(res.threadContextUpdate ?? {}),
        createClientFlow: null,
      }),
    }
  }

  if (cont.kind === 'clarify_name') {
    return {
      reply: cont.reply,
      mode: 'clarification',
      threadContextUpdate: mergeWorkPending({
        createClientFlow: {
          status: 'awaiting_details',
          draft: cont.draft,
          promptedForOptional: flow.promptedForOptional,
        },
      }),
      suggestedThreadTitle: cont.suggestedThreadTitle ?? suggestedThreadTitle,
    }
  }

  if (cont.kind === 'clarify_optional') {
    return {
      reply: cont.reply,
      mode: 'clarification',
      threadContextUpdate: mergeWorkPending({
        createClientFlow: {
          status: 'awaiting_details',
          draft: cont.draft,
          promptedForOptional: cont.promptedForOptional,
        },
      }),
      suggestedThreadTitle: cont.suggestedThreadTitle ?? suggestedThreadTitle,
    }
  }

  if (cont.kind === 'noop_details') {
    return {
      reply: cont.reply,
      mode: 'clarification',
      threadContextUpdate: mergeWorkPending({
        createClientFlow: {
          status: 'awaiting_details',
          draft: cont.draft,
          promptedForOptional: cont.promptedForOptional,
        },
      }),
      suggestedThreadTitle,
    }
  }

  throw new Error(`Unhandled create_client flow kind: ${(cont as { kind: string }).kind}`)
}

async function handlePendingWorkCompletionTurn(params: {
  user: CurrentUser
  threadId: string
  userMessage: string
  state: PendingWorkCompletionState
  suggestedThreadTitle: string | null
}): Promise<AssistantChatResponse> {
  const { user, threadId, userMessage, state, suggestedThreadTitle } = params
  const hint = userMessage.trim()
  if (!hint) {
    return {
      reply:
        state.reason === 'category'
          ? 'Indica il nome della categoria del lavoro (come nel gestionale, es. Website).'
          : 'Indica una scadenza chiara (es. 15 marzo o YYYY-MM-DD).',
      mode: 'clarification',
      suggestedThreadTitle,
    }
  }

  let draft = { ...state.baseDraft }
  if (state.reason === 'category') {
    draft = { ...draft, categoryNameHint: hint }
  } else {
    draft = { ...draft, deadlineRaw: hint }
  }

  const built = await buildCreateWorkPayloadFromResolvedClient(
    { id: state.clientId, name: state.clientName },
    draft
  )

  if (built.ok === 'need_category') {
    return {
      reply: `Non ho trovato una categoria simile a "${hint}". Prova con il nome esatto o un altro riferimento.`,
      mode: 'clarification',
      suggestedThreadTitle,
    }
  }
  if (built.ok === 'need_deadline') {
    return { reply: built.reply, mode: 'clarification', suggestedThreadTitle }
  }
  if (built.ok === false) {
    return { reply: built.reply, mode: 'clarification', suggestedThreadTitle }
  }

  const intro = `Cliente **${state.clientName}** creato. Ora confermiamo il lavoro **${draft.title}**.`
  const res = await buildNeedsConfirmationResponse({
    user,
    threadId,
    baseReply: intro,
    normalized: { actionType: 'create_work', payload: built.payload },
    suggestedThreadTitle,
  })
  return {
    ...res,
    threadContextUpdate: {
      ...(res.threadContextUpdate ?? {}),
      pendingWorkCompletion: null,
    },
  }
}

async function handlePendingMissingClientTurn(params: {
  user: CurrentUser
  threadId: string
  userMessage: string
  pending: PendingWorkMissingClientState
  threadCtx: AssistantThreadContext
  suggestedThreadTitle: string | null
}): Promise<AssistantChatResponse> {
  const { user, threadId, userMessage, pending, threadCtx, suggestedThreadTitle } = params

  if (isRejectLikeMessage(userMessage)) {
    return {
      reply: 'Va bene, non creo il cliente e non procedo con la creazione del lavoro.',
      mode: 'answer',
      threadContextUpdate: { pendingWorkWithMissingClient: null },
      suggestedThreadTitle,
    }
  }

  const extracted = extractCreateClientFields(userMessage, { name: pending.missingClientName })
  const effectiveName = extracted.name?.trim() || pending.missingClientName.trim()

  const explicitYes = isConfirmLikeMessage(userMessage)
  const renamed =
    !!extracted.name?.trim() &&
    extracted.name.trim().toLowerCase() !== pending.missingClientName.trim().toLowerCase()
  const hasExtra =
    !!(extracted.contactName || extracted.email || extracted.phone || extracted.notes) || renamed
  const detailCue = /chiamalo|chiamat|referente|contatto|email|tel\b|telefono/i.test(userMessage)

  if (!explicitYes && !hasExtra && !detailCue) {
    return {
      reply: `Non ho trovato il cliente **${pending.missingClientName}**. Vuoi che lo crei prima di creare il lavoro? Rispondi **sì** o **no**, oppure aggiungi dettagli (es. "sì, chiamalo Azienda AAA e metti contatto Mario").`,
      mode: 'clarification',
      suggestedThreadTitle,
    }
  }

  const dup = await findExistingClientByNormalizedName(effectiveName)
  if (dup) {
    const normalized = await normalizeWriteIntent(
      'create_work',
      pendingDraftToWriteParams(pending.pendingWorkDraft, dup.name),
      threadCtx
    )
    if (normalized.ok === true) {
      const res = await buildNeedsConfirmationResponse({
        user,
        threadId,
        baseReply: `Nel frattempo esiste già il cliente **${dup.name}** in anagrafica: uso quello e non creo un duplicato.`,
        normalized: { actionType: normalized.actionType, payload: normalized.payload },
        suggestedThreadTitle,
      })
      return {
        ...res,
        threadContextUpdate: {
          ...(res.threadContextUpdate ?? {}),
          pendingWorkWithMissingClient: null,
        },
      }
    }
    if (normalized.ok === false) {
      return {
        reply: normalized.reply,
        mode: 'clarification',
        threadContextUpdate: { pendingWorkWithMissingClient: null },
        suggestedThreadTitle,
      }
    }
    return {
      reply:
        'Non sono riuscito a collegare il lavoro al cliente trovato in anagrafica. Riprova con il nome del cliente o un nuovo nome.',
      mode: 'clarification',
      threadContextUpdate: { pendingWorkWithMissingClient: null },
      suggestedThreadTitle,
    }
  }

  const flow: CreateClientFlowState = {
    status: 'awaiting_details',
    draft: {
      name: effectiveName,
      contactName: extracted.contactName,
      email: extracted.email,
      phone: extracted.phone,
      notes: extracted.notes,
    },
    promptedForOptional: false,
  }

  const inner = await handleCreateClientFlowTurn({
    user,
    threadId,
    userMessage,
    flow,
    suggestedThreadTitle,
    pendingWorkAfterClient: pending.pendingWorkDraft,
    clearPendingMissingClient: true,
  })

  const prefix = `Perfetto, creo prima il cliente **${effectiveName}** e poi proseguo con il lavoro.\n\n`
  return {
    ...inner,
    reply: prefix + inner.reply,
    threadContextUpdate: {
      ...(inner.threadContextUpdate ?? {}),
      pendingWorkWithMissingClient: null,
    },
  }
}

async function buildNeedsConfirmationResponse(params: {
  user: CurrentUser
  threadId: string
  baseReply: string
  normalized: { actionType: string; payload: Record<string, unknown> }
  suggestedThreadTitle?: string | null
}): Promise<AssistantChatResponse> {
  const { user, threadId, baseReply, normalized, suggestedThreadTitle } = params
  const pendingConfirmationId = randomUUID()
  const preview = previewPayload(normalized.actionType, normalized.payload)
  const confirmationMeta: PendingConfirmationMetadata = {
    version: 1,
    pendingConfirmationId,
    actionType: normalized.actionType,
    payload: normalized.payload,
    preview,
    mode: 'needs_confirmation',
  }

  await logAssistantAction({
    userId: user.id,
    threadId,
    actionType: normalized.actionType,
    entityType: 'Pending',
    input: normalized.payload,
    status: 'needs_confirmation',
  })

  const intro = baseReply ? `${baseReply}\n\n` : ''
  return {
    reply: `${intro}Ho capito questa azione:\n${preview}\n\nConfermi? Rispondi **sì**, scrivi **Confermo**, oppure usa i pulsanti sotto.`,
    mode: 'needs_confirmation',
    pendingConfirmationId,
    proposedAction: { type: normalized.actionType, payload: normalized.payload },
    confirmationMeta,
    threadContextUpdate: buildThreadContextForProposedAction(normalized.actionType, normalized.payload),
    suggestedThreadTitle: suggestedThreadTitle ?? null,
  }
}

async function findLatestPendingPreview(threadId: string): Promise<string | null> {
  const rows = await prisma.chatMessage.findMany({
    where: { threadId, role: 'assistant' },
    orderBy: { createdAt: 'desc' },
    take: 8,
    select: { metadata: true },
  })
  for (const r of rows) {
    const m = r.metadata as Record<string, unknown> | null
    if (m && typeof m.preview === 'string') return m.preview as string
  }
  return null
}

async function runLlmPipeline(
  systemContent: string,
  history: { role: string; content: string }[],
  userContent: string
): Promise<LlmOut> {
  const messages = [
    { role: 'system' as const, content: systemContent },
    ...history.map((m) => ({
      role: m.role as 'user' | 'assistant' | 'system',
      content: m.content,
    })),
    { role: 'user' as const, content: userContent },
  ]
  let raw = await callOpenAiChat(messages)
  let parsed = safeParseLlmJson(raw)
  const tr = parsed.tool_requests
  if (Array.isArray(tr) && tr.length > 0) {
    const toolOut = await runLlmToolRequests(tr)
    const messages2 = [
      ...messages,
      { role: 'assistant' as const, content: raw },
      {
        role: 'user' as const,
        content: `Risultati strumenti interni:\n\n${toolOut}\n\nRispondi ORA con JSON finale (imposta tool_requests a null o [], stesso schema di prima).`,
      },
    ]
    raw = await callOpenAiChat(messages2)
    parsed = safeParseLlmJson(raw)
  }
  return parsed
}

export async function processAssistantMessage(params: {
  user: CurrentUser
  threadId: string
  userMessage: string
}): Promise<AssistantChatResponse> {
  const { user, threadId, userMessage } = params

  const threadCtx = await loadThreadAssistantContext(threadId)
  const follow = tryParseFollowUpRule(userMessage, threadCtx)
  const rule = parseRuleBasedIntent(userMessage) ?? follow
  const suggestedThreadTitle = suggestThreadTitleFromRule(rule, userMessage)

  const userOpts = { currentUserId: user.id, currentUserName: user.name }

  if (rule?.kind === 'undo_last_action') {
    if (!canWrite(user)) {
      return {
        reply: 'Con il tuo ruolo non puoi annullare azioni sul database.',
        mode: 'clarification',
        suggestedThreadTitle,
      }
    }
    if (!threadCtx.lastUndo) {
      return {
        reply:
          'Non trovo un’azione creata di recente da annullare in questa chat (supportate: ultima credenziale, ultimo lavoro, ultimo step).',
        mode: 'clarification',
        suggestedThreadTitle,
      }
    }
    const result = await performAssistantUndo(user.id, threadId, threadCtx.lastUndo)
    return {
      reply: result.success
        ? `${result.summary ?? 'Operazione annullata.'}${result.href ? `\n\nApri: ${result.href}` : ''}`
        : `Non sono riuscito ad annullare: ${result.summary ?? 'errore'}`,
      mode: 'action_result',
      result,
      threadContextUpdate: result.success ? buildThreadContextAfterUndoSuccess() : null,
      suggestedThreadTitle,
    }
  }

  const createRuleEarly = parseCreateClientRule(userMessage)
  if (process.env.NODE_ENV !== 'production') {
    console.log('[assistant] orchestrator', {
      threadId,
      pendingCreateClientFlow: threadCtx.createClientFlow ?? null,
      createRuleEarly: !!createRuleEarly,
      detectedIntent: rule?.kind ?? null,
    })
  }

  if (canWrite(user) && threadCtx.pendingWorkCompletion) {
    return handlePendingWorkCompletionTurn({
      user,
      threadId,
      userMessage,
      state: threadCtx.pendingWorkCompletion,
      suggestedThreadTitle,
    })
  }

  if (
    canWrite(user) &&
    threadCtx.pendingWorkWithMissingClient?.status === 'awaiting_missing_client_confirmation'
  ) {
    return handlePendingMissingClientTurn({
      user,
      threadId,
      userMessage,
      pending: threadCtx.pendingWorkWithMissingClient,
      threadCtx,
      suggestedThreadTitle,
    })
  }

  if (canWrite(user)) {
    if (threadCtx.createClientFlow?.status === 'awaiting_details') {
      return handleCreateClientFlowTurn({
        user,
        threadId,
        userMessage,
        flow: threadCtx.createClientFlow,
        suggestedThreadTitle,
      })
    }
    if (createRuleEarly) {
      const flow = startCreateClientFlowFromRule(userMessage, createRuleEarly)
      return handleCreateClientFlowTurn({
        user,
        threadId,
        userMessage,
        flow,
        suggestedThreadTitle,
      })
    }
  }

  if (!canWrite(user)) {
    if (rule) {
      const readOnly = await runRuleBasedRead(rule, userOpts)
      if (readOnly !== null) {
        return mergeReadResponse('', readOnly, suggestedThreadTitle)
      }
    }
    const llmCtx = await buildAssistantLlmContext()
    const contextBlock = `Contesto clienti (id|nome): ${llmCtx.clients.slice(0, 50).map((c) => `${c.id}|${c.name}`).join('; ')}`
    const hist = await prisma.chatMessage.findMany({
      where: { threadId },
      orderBy: { createdAt: 'asc' },
      take: 28,
      select: { role: true, content: true, metadata: true },
    })
    const pendingPreview = await findLatestPendingPreview(threadId)
    const memory = buildConversationMemoryBlock(threadCtx, hist, { lastPendingPreview: pendingPreview })
    const userContent = memory ? `${memory}\n\n---\n\n${userMessage}` : userMessage
    try {
      const parsed = await runLlmPipeline(
        `${SYSTEM_PROMPT}\n\n${contextBlock}\n\nL'utente è AGENTE (sola lettura). Se chiede modifiche, spiega che non può eseguirle.`,
        hist.map((m) => ({ role: m.role, content: m.content })),
        userContent
      )
      if (parsed.intent === 'read' && parsed.read_intent) {
        const factual = await runReadIntent(parsed.read_intent as Parameters<typeof runReadIntent>[0], userOpts)
        return mergeReadResponse(parsed.reply ?? '', factual, suggestedThreadTitle)
      }
      return {
        reply:
          parsed.reply ??
          'Il tuo ruolo non consente modifiche ai dati. Puoi chiedere informazioni in lettura.',
        mode: 'clarification',
        suggestedThreadTitle,
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Errore sconosciuto'
      return {
        reply: `Non posso usare il modello linguistico (${msg}). Prova una frase diretta (lavori attivi, rinnovi, …) oppure configura OPENAI_API_KEY.`,
        mode: 'clarification',
        suggestedThreadTitle,
      }
    }
  }

  if (rule) {
    const readText = await runRuleBasedRead(rule, userOpts)
    if (readText !== null) {
      return mergeReadResponse('', readText, suggestedThreadTitle)
    }
    const writeSpec = ruleIntentToWriteParams(rule)
    if (writeSpec) {
      const normalized = await normalizeWriteIntent(writeSpec.type, writeSpec.params, threadCtx)
      if (!normalized.ok) {
        return { reply: normalized.reply, mode: 'clarification', suggestedThreadTitle }
      }
      if (normalized.ok === 'missing_client') {
        return {
          reply: `Non ho trovato il cliente '${normalized.missingClientName}'. Vuoi che lo crei prima di creare il lavoro?`,
          mode: 'clarification',
          threadContextUpdate: {
            pendingWorkWithMissingClient: {
              pendingIntent: 'create_work',
              status: 'awaiting_missing_client_confirmation',
              missingClientName: normalized.missingClientName,
              pendingWorkDraft: normalized.pendingWorkDraft,
            },
          },
          suggestedThreadTitle,
        }
      }
      return buildNeedsConfirmationResponse({
        user,
        threadId,
        baseReply: '',
        normalized: { actionType: normalized.actionType, payload: normalized.payload },
        suggestedThreadTitle,
      })
    }
  }

  const ctx = await buildAssistantLlmContext()
  const contextBlock = [
    `Clienti (id|nome): ${ctx.clients.map((c) => `${c.id}|${c.name}`).join('; ')}`,
    `Categorie (id|nome): ${ctx.categories.map((c) => `${c.id}|${c.name}`).join('; ')}`,
    `Utenti (id|nome): ${ctx.users.map((u) => `${u.id}|${u.name}`).join('; ')}`,
    `Utente corrente: ${user.name} (id: ${user.id})`,
  ].join('\n')

  const history = await prisma.chatMessage.findMany({
    where: { threadId },
    orderBy: { createdAt: 'asc' },
    take: 40,
    select: { role: true, content: true, metadata: true },
  })
  const pendingPreview = await findLatestPendingPreview(threadId)
  const memory = buildConversationMemoryBlock(threadCtx, history, { lastPendingPreview: pendingPreview })
  const userContent = memory ? `${memory}\n\n---\n\n${userMessage}` : userMessage

  let parsed: LlmOut
  try {
    parsed = await runLlmPipeline(
      `${SYSTEM_PROMPT}\n\n${contextBlock}`,
      history.map((m) => ({ role: m.role, content: m.content })),
      userContent
    )
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Errore sconosciuto'
    return {
      reply: `Il modello linguistico non è disponibile (${msg}). Riformula in italiano semplice o verifica OPENAI_API_KEY.`,
      mode: 'clarification',
      suggestedThreadTitle: null,
    }
  }
  const baseReply = typeof parsed.reply === 'string' ? parsed.reply : ''

  if (parsed.intent === 'read' && parsed.read_intent) {
    const factual = await runReadIntent(parsed.read_intent as Parameters<typeof runReadIntent>[0], userOpts)
    return mergeReadResponse(baseReply, factual, suggestedThreadTitle)
  }

  if (parsed.intent === 'write' && parsed.write_intent?.type && parsed.write_intent.params) {
    const normalized = await normalizeWriteIntent(parsed.write_intent.type, parsed.write_intent.params, threadCtx)
    if (!normalized.ok) {
      return { reply: normalized.reply, mode: 'clarification', suggestedThreadTitle }
    }
    if (normalized.ok === 'missing_client') {
      return {
        reply: `Non ho trovato il cliente '${normalized.missingClientName}'. Vuoi che lo crei prima di creare il lavoro?`,
        mode: 'clarification',
        threadContextUpdate: {
          pendingWorkWithMissingClient: {
            pendingIntent: 'create_work',
            status: 'awaiting_missing_client_confirmation',
            missingClientName: normalized.missingClientName,
            pendingWorkDraft: normalized.pendingWorkDraft,
          },
        },
        suggestedThreadTitle,
      }
    }

    return buildNeedsConfirmationResponse({
      user,
      threadId,
      baseReply,
      normalized: { actionType: normalized.actionType, payload: normalized.payload },
      suggestedThreadTitle,
    })
  }

  return {
    reply: baseReply || 'Come posso aiutarti?',
    mode: parsed.intent === 'clarify' ? 'clarification' : 'answer',
    suggestedThreadTitle,
  }
}

export async function confirmPendingAction(params: {
  user: CurrentUser
  threadId: string
  pendingConfirmationId: string
}): Promise<AssistantChatResponse> {
  const { user, threadId, pendingConfirmationId } = params

  if (!canWrite(user)) {
    return { reply: 'Non hai permessi per confermare azioni di scrittura.', mode: 'clarification' }
  }

  const ctxBeforeConfirm = await loadThreadAssistantContext(threadId)
  const workDraftAfterClient = ctxBeforeConfirm.pendingWorkAfterClient ?? null

  const rows = await prisma.chatMessage.findMany({
    where: { threadId, role: 'assistant' },
    orderBy: { createdAt: 'desc' },
    take: 24,
    select: { id: true, metadata: true },
  })
  const msg = rows.find((m) => {
    const meta = m.metadata as Record<string, unknown> | null
    return meta?.pendingConfirmationId === pendingConfirmationId
  })

  if (!msg?.metadata || typeof msg.metadata !== 'object') {
    return { reply: 'Sessione di conferma scaduta o non trovata. Ripeti la richiesta.', mode: 'clarification' }
  }

  const meta = msg.metadata as Record<string, unknown>
  const actionType = meta.actionType as string
  const payload = meta.payload as Record<string, unknown>
  if (!actionType || !payload) {
    return { reply: 'Dati di conferma non validi.', mode: 'clarification' }
  }

  const result = await executeAssistantAction(user.id, threadId, actionType, payload)

  await prisma.chatMessage.update({
    where: { id: msg.id },
    data: { metadata: { mode: 'answer' } },
  })

  const basePatch = result.success
    ? await buildThreadContextAfterConfirmedAction(actionType, payload, result)
    : null

  if (
    result.success &&
    actionType === 'create_client' &&
    workDraftAfterClient &&
    result.entityId
  ) {
    const row = await prisma.client.findUnique({
      where: { id: result.entityId },
      select: { id: true, name: true },
    })
    if (row) {
      const built = await buildCreateWorkPayloadFromResolvedClient(row, workDraftAfterClient)
      const okLine = `Cliente **${row.name}** creato con successo.`

      if (built.ok === true) {
        const workRes = await buildNeedsConfirmationResponse({
          user,
          threadId,
          baseReply: okLine,
          normalized: { actionType: 'create_work', payload: built.payload },
          suggestedThreadTitle: null,
        })
        return {
          reply: workRes.reply,
          mode: 'needs_confirmation',
          result,
          pendingConfirmationId: workRes.pendingConfirmationId,
          proposedAction: workRes.proposedAction,
          confirmationMeta: workRes.confirmationMeta,
          threadContextUpdate: {
            ...(basePatch ?? {}),
            ...(workRes.threadContextUpdate ?? {}),
            pendingWorkAfterClient: null,
            pendingWorkWithMissingClient: null,
          },
        }
      }

      if (built.ok === 'need_category') {
        return {
          reply: `${okLine}\n\nOra mi serve confermare la categoria o la deadline del lavoro.`,
          mode: 'clarification',
          result,
          threadContextUpdate: {
            ...(basePatch ?? {}),
            pendingWorkAfterClient: null,
            pendingWorkWithMissingClient: null,
            pendingWorkCompletion: {
              reason: 'category',
              clientId: row.id,
              clientName: row.name,
              baseDraft: workDraftAfterClient,
            },
          },
        }
      }

      if (built.ok === 'need_deadline') {
        return {
          reply: `${okLine}\n\n${built.reply}`,
          mode: 'clarification',
          result,
          threadContextUpdate: {
            ...(basePatch ?? {}),
            pendingWorkAfterClient: null,
            pendingWorkWithMissingClient: null,
            pendingWorkCompletion: {
              reason: 'deadline',
              clientId: row.id,
              clientName: row.name,
              baseDraft: workDraftAfterClient,
            },
          },
        }
      }

      return {
        reply: `${okLine}\n\nNon sono riuscito a preparare il lavoro: ${built.reply}`,
        mode: 'action_result',
        result,
        threadContextUpdate: {
          ...(basePatch ?? {}),
          pendingWorkAfterClient: null,
        },
      }
    }
  }

  const replyBase = result.success
    ? (result.summary ?? 'Operazione completata.')
    : `Non sono riuscito a completare l'operazione: ${result.summary ?? 'errore'}`

  return {
    reply: replyBase,
    mode: 'action_result',
    result,
    threadContextUpdate:
      result.success && actionType === 'create_client'
        ? { ...(basePatch ?? {}), pendingWorkAfterClient: null }
        : basePatch,
  }
}

export async function cancelPendingAssistantAction(params: {
  user: CurrentUser
  threadId: string
  pendingConfirmationId: string
}): Promise<AssistantChatResponse> {
  const { user, threadId, pendingConfirmationId } = params

  if (!canWrite(user)) {
    return { reply: 'Non hai permessi per annullare questa azione.', mode: 'clarification' }
  }

  const rows = await prisma.chatMessage.findMany({
    where: { threadId, role: 'assistant' },
    orderBy: { createdAt: 'desc' },
    take: 40,
    select: { id: true, metadata: true },
  })
  const found = rows.find((r) => {
    const m = r.metadata as Record<string, unknown> | null
    return m?.pendingConfirmationId === pendingConfirmationId
  })

  if (!found) {
    return { reply: 'Nessuna azione in sospeso con quell’identificativo.', mode: 'clarification' }
  }

  const prev = found.metadata as Record<string, unknown>
  const actionType = typeof prev.actionType === 'string' ? prev.actionType : 'unknown'
  const payload = (prev.payload as Record<string, unknown>) ?? {}

  await prisma.chatMessage.update({
    where: { id: found.id },
    data: { metadata: { mode: 'answer' } },
  })

  await logAssistantAction({
    userId: user.id,
    threadId,
    actionType,
    entityType: 'Pending',
    input: payload,
    result: { cancelled: true },
    status: 'failed',
  })

  const clearChain =
    actionType === 'create_client'
      ? {
          lastProposed: null,
          pendingWorkAfterClient: null,
          pendingWorkWithMissingClient: null,
          pendingWorkCompletion: null,
        }
      : { lastProposed: null }

  return {
    reply: 'Ok, ho annullato l’azione in sospeso.',
    mode: 'answer',
    threadContextUpdate: clearChain,
  }
}
