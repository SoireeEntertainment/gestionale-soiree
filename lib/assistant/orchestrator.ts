import { randomUUID } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import type { CurrentUser } from '@/lib/auth-dev'
import { canWrite } from '@/lib/auth-dev'
import { buildAssistantLlmContext } from '@/lib/assistant/context'
import { callOpenAiChat } from '@/lib/assistant/openai'
import type { AssistantChatResponse, PendingConfirmationMetadata } from '@/lib/assistant/types'
import { executeAssistantAction, logAssistantAction } from '@/lib/assistant/action-executor'
import {
  resolveSingleClient,
  findCategoryByNameHint,
  findWorksByClientCategoryOrTitle,
} from '@/lib/assistant/resolve-entities'
import {
  readPedTasksThisWeekForUser,
  readRenewalsDueWithinDays,
  readActiveWorksForUser,
  readClientCredentialsForQuery,
} from '@/lib/assistant/read-handlers'
import { parseRuleBasedIntent, type RuleBasedIntent } from '@/lib/assistant/intent-parser'
import { parseItalianDatePhrase } from '@/lib/assistant/parse-it-date'

const SYSTEM_PROMPT = `Sei l'assistente interno del gestionale Soirëe Studio. Rispondi SOLO con JSON valido, senza markdown.

Schema di output obbligatorio:
{
  "reply": "testo in italiano per l'utente",
  "intent": "read" | "write" | "clarify" | "chat",
  "read_intent": null | { "type": "ped_week_tasks", "userName": "string" } | { "type": "renewals_due", "days": number } | { "type": "active_works_for_user", "userName": "string" } | { "type": "client_credentials", "clientName": "string", "labelHint": "string" },
  "write_intent": null | {
    "type": "create_client_credential" | "create_work" | "create_work_step" | "update_work" | "create_ped_task" | "update_ped_task" | "create_client_renewal" | "update_client_renewal" | "update_client_credential" | "update_work_step",
    "params": { ... campi estratti dal messaggio utente, usa nomi cliente/categoria/lavoro come stringhe se non hai id }
  }
}

Regole:
- Se mancano informazioni essenziali, usa intent "clarify" e read_intent/write_intent null.
- Per letture (read): imposta read_intent appropriato; reply può essere breve (es. "Ecco i dati richiesti.").
- Per "lavori attivi di [nome]": read_intent { "type": "active_works_for_user", "userName": "..." }.
- Per credenziali cliente: read_intent { "type": "client_credentials", "clientName": "...", "labelHint": "Instagram" }.
- Per modifiche (write): imposta write_intent con type e params; NON dire di aver già eseguito l'azione.
- Per conversazione generica senza azione sul DB: intent "chat", read_intent e write_intent null.
- Date: preferisci formato YYYY-MM-DD nei params quando possibile.
- Per create_work: params includono title, clientName (o clientId se noto), categoryName (o categoryId).
- Per create_work_step: clientName, workTitleHint, stepTitle.
- Per update_work: clientName, workTitleHint, e opzionalmente deadline (YYYY-MM-DD), title, status, priority.
- Per create_client_credential: clientName, label (es. Instagram), username, password se forniti.
- Per create_ped_task: clientName, date (YYYY-MM-DD), title, type (es. POST, REEL), kind tipicamente CONTENT.
- Non inventare id: usa nomi; il sistema risolverà.`

type LlmOut = {
  reply?: string
  intent?: string
  read_intent?: { type?: string; userName?: string; days?: number } | null
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
  const parsed = parseItalianDatePhrase(t)
  return parsed
}

async function runReadIntent(read: {
  type?: string
  userName?: string
  days?: number
  clientName?: string
  labelHint?: string
}): Promise<string> {
  if (read.type === 'ped_week_tasks' && read.userName) {
    return readPedTasksThisWeekForUser(read.userName)
  }
  if (read.type === 'renewals_due') {
    const days = typeof read.days === 'number' && read.days > 0 ? read.days : 30
    return readRenewalsDueWithinDays(days)
  }
  if (read.type === 'active_works_for_user' && read.userName) {
    return readActiveWorksForUser(read.userName)
  }
  if (read.type === 'client_credentials' && read.clientName && read.labelHint) {
    return readClientCredentialsForQuery(read.clientName, read.labelHint)
  }
  return 'Richiesta di lettura non riconosciuta.'
}

async function runRuleBasedRead(rule: RuleBasedIntent): Promise<string | null> {
  switch (rule.kind) {
    case 'query_active_works':
      return readActiveWorksForUser(rule.userName)
    case 'query_renewals':
      return readRenewalsDueWithinDays(rule.days)
    case 'query_client_credentials':
      return readClientCredentialsForQuery(rule.clientName, rule.labelHint)
    default:
      return null
  }
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
      return {
        type: 'create_work',
        params: {
          title,
          clientName: rule.clientName,
          categoryName: rule.categoryName,
          deadline: deadline ?? '',
        },
      }
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
  params: Record<string, unknown>
): Promise<{ ok: true; actionType: string; payload: Record<string, unknown> } | { ok: false; reply: string }> {
  const str = (k: string) => (typeof params[k] === 'string' ? (params[k] as string).trim() : '')

  switch (type) {
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
      const title = str('title')
      const clientHint = str('clientName') || str('client')
      const catHint = str('categoryName') || str('category') || 'Website'
      if (!title) return { ok: false, reply: 'Che titolo deve avere il lavoro?' }
      if (!clientHint) return { ok: false, reply: 'Per quale cliente è il lavoro?' }
      const cr = await resolveSingleClient(clientHint)
      if (!cr) return { ok: false, reply: `Cliente non trovato per "${clientHint}".` }
      if ('ambiguous' in cr) {
        return {
          ok: false,
          reply: `Ho trovato più clienti: ${cr.ambiguous.map((c) => c.name).join(', ')}. Quale intendi?`,
        }
      }
      const client = cr
      const cat = await findCategoryByNameHint(catHint)
      if (!cat) return { ok: false, reply: `Non ho trovato una categoria simile a "${catHint}".` }
      const rawDl = str('deadline')
      let deadline: string | null = null
      if (rawDl) {
        deadline = normalizeDeadlineInput(rawDl)
        if (!deadline) {
          return {
            ok: false,
            reply: `Non ho capito la data "${rawDl}". Indica una data tipo 15 marzo o YYYY-MM-DD.`,
          }
        }
      }
      return {
        ok: true,
        actionType: 'create_work',
        payload: {
          title,
          clientId: client.id,
          categoryId: cat.id,
          description: str('description') || null,
          status: str('status') || undefined,
          priority: str('priority') || null,
          deadline,
          assignedToUserId: str('assignedToUserId') || null,
        },
      }
    }

    case 'create_work_step': {
      const clientHint = str('clientName') || str('client')
      const workHint = str('workTitleHint') || str('workTitle') || str('titleWork')
      const stepTitle = str('stepTitle') || str('title')
      if (!clientHint || !workHint || !stepTitle) {
        return { ok: false, reply: 'Indica cliente, titolo del lavoro e titolo dello step.' }
      }
      const cr = await resolveSingleClient(clientHint)
      if (!cr || 'ambiguous' in cr) {
        return { ok: false, reply: 'Cliente non univoco o non trovato. Specifica meglio il nome.' }
      }
      const works = await findWorksByClientCategoryOrTitle(cr.id, workHint)
      if (works.length === 0) return { ok: false, reply: `Nessun lavoro trovato per "${workHint}" su ${cr.name}.` }
      if (works.length > 1) {
        return {
          ok: false,
          reply: `Ho trovato più lavori: ${works.map((w) => w.title).join(', ')}. Quale intendi?`,
        }
      }
      return {
        ok: true,
        actionType: 'create_work_step',
        payload: { workId: works[0].id, title: stepTitle },
      }
    }

    case 'update_work': {
      const clientHint = str('clientName') || str('client')
      const workHint = str('workTitleHint') || str('workTitle')
      if (!clientHint || !workHint) {
        return { ok: false, reply: 'Indica cliente e titolo (o parte del titolo) del lavoro da aggiornare.' }
      }
      const cr = await resolveSingleClient(clientHint)
      if (!cr || 'ambiguous' in cr) {
        return { ok: false, reply: 'Cliente non univoco o non trovato.' }
      }
      const works = await findWorksByClientCategoryOrTitle(cr.id, workHint)
      if (works.length !== 1) {
        return {
          ok: false,
          reply:
            works.length === 0
              ? 'Nessun lavoro corrispondente (né per titolo né per categoria).'
              : `Più lavori: ${works.map((w) => w.title).join(', ')}. Quale?`,
        }
      }
      const patch: Record<string, unknown> = { workId: works[0].id }
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
      if (Object.keys(patch).length === 1) {
        return { ok: false, reply: 'Cosa vuoi modificare del lavoro (deadline, titolo, stato, …)?' }
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

function previewPayload(actionType: string, payload: Record<string, unknown>): string {
  const redact = { ...payload }
  if ('password' in redact && redact.password) redact.password = '***'
  return `${actionType}: ${JSON.stringify(redact)}`
}

async function buildNeedsConfirmationResponse(params: {
  user: CurrentUser
  threadId: string
  baseReply: string
  normalized: { actionType: string; payload: Record<string, unknown> }
}): Promise<AssistantChatResponse> {
  const { user, threadId, baseReply, normalized } = params
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
  }
}

export async function processAssistantMessage(params: {
  user: CurrentUser
  threadId: string
  userMessage: string
}): Promise<AssistantChatResponse> {
  const { user, threadId, userMessage } = params

  const rule = parseRuleBasedIntent(userMessage)

  if (!canWrite(user)) {
    if (rule) {
      const readOnly = await runRuleBasedRead(rule)
      if (readOnly !== null) {
        return { reply: readOnly, mode: 'answer' }
      }
    }
    let raw: string
    try {
      const ctx = await buildAssistantLlmContext()
      raw = await callOpenAiChat([
        { role: 'system', content: SYSTEM_PROMPT + '\nL\'utente è AGENTE (sola lettura). Se chiede modifiche, spiega che non può eseguirle.' },
        {
          role: 'user',
          content: `Contesto clienti (id|nome): ${ctx.clients.slice(0, 50).map((c) => `${c.id}|${c.name}`).join('; ')}\n\nMessaggio: ${userMessage}`,
        },
      ])
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Errore sconosciuto'
      return {
        reply: `Non posso usare il modello linguistico (${msg}). Per le letture frequenti (lavori attivi, rinnovi, credenziali) prova una frase più diretta oppure configura OPENAI_API_KEY.`,
        mode: 'clarification',
      }
    }
    const parsed = safeParseLlmJson(raw)
    if (parsed.intent === 'read' && parsed.read_intent) {
      const text = await runReadIntent(
        parsed.read_intent as {
          type?: string
          userName?: string
          days?: number
          clientName?: string
          labelHint?: string
        }
      )
      return { reply: `${parsed.reply ?? ''}\n\n${text}`.trim(), mode: 'answer' }
    }
    return {
      reply:
        parsed.reply ??
        'Il tuo ruolo non consente modifiche ai dati. Puoi chiedere informazioni in lettura (es. task PED della settimana, rinnovi in scadenza).',
      mode: 'clarification',
    }
  }

  if (rule) {
    const readText = await runRuleBasedRead(rule)
    if (readText !== null) {
      return { reply: readText, mode: 'answer' }
    }
    const writeSpec = ruleIntentToWriteParams(rule)
    if (writeSpec) {
      const normalized = await normalizeWriteIntent(writeSpec.type, writeSpec.params)
      if (!normalized.ok) {
        return { reply: normalized.reply, mode: 'clarification' }
      }
      return buildNeedsConfirmationResponse({
        user,
        threadId,
        baseReply: '',
        normalized: { actionType: normalized.actionType, payload: normalized.payload },
      })
    }
  }

  const ctx = await buildAssistantLlmContext()
  const contextBlock = [
    `Clienti (id|nome): ${ctx.clients.map((c) => `${c.id}|${c.name}`).join('; ')}`,
    `Categorie (id|nome): ${ctx.categories.map((c) => `${c.id}|${c.name}`).join('; ')}`,
    `Utenti (id|nome): ${ctx.users.map((u) => `${u.id}|${u.name}`).join('; ')}`,
  ].join('\n')

  const history = await prisma.chatMessage.findMany({
    where: { threadId },
    orderBy: { createdAt: 'asc' },
    take: 40,
    select: { role: true, content: true },
  })

  const messages = [
    { role: 'system' as const, content: `${SYSTEM_PROMPT}\n\n${contextBlock}` },
    ...history.map((m) => ({
      role: m.role as 'user' | 'assistant' | 'system',
      content: m.content,
    })),
    { role: 'user' as const, content: userMessage },
  ]

  let raw: string
  try {
    raw = await callOpenAiChat(messages)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Errore sconosciuto'
    return {
      reply: `Il modello linguistico non è disponibile (${msg}). Riformula la richiesta in italiano semplice (es. «crea lavoro Website per Cliente X») oppure verifica OPENAI_API_KEY.`,
      mode: 'clarification',
    }
  }
  const parsed = safeParseLlmJson(raw)
  const baseReply = typeof parsed.reply === 'string' ? parsed.reply : ''

  if (parsed.intent === 'read' && parsed.read_intent) {
    const factual = await runReadIntent(
      parsed.read_intent as {
        type?: string
        userName?: string
        days?: number
        clientName?: string
        labelHint?: string
      }
    )
    return {
      reply: [baseReply, factual].filter(Boolean).join('\n\n'),
      mode: 'answer',
    }
  }

  if (parsed.intent === 'write' && parsed.write_intent?.type && parsed.write_intent.params) {
    const normalized = await normalizeWriteIntent(parsed.write_intent.type, parsed.write_intent.params)
    if (!normalized.ok) {
      return { reply: normalized.reply, mode: 'clarification' }
    }

    return buildNeedsConfirmationResponse({
      user,
      threadId,
      baseReply,
      normalized: { actionType: normalized.actionType, payload: normalized.payload },
    })
  }

  return {
    reply: baseReply || 'Come posso aiutarti?',
    mode: parsed.intent === 'clarify' ? 'clarification' : 'answer',
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

  return {
    reply: result.success
      ? (result.summary ?? 'Operazione completata.')
      : `Non sono riuscito a completare l'operazione: ${result.summary ?? 'errore'}`,
    mode: 'action_result',
    result,
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

  return { reply: 'Ok, ho annullato l’azione in sospeso.', mode: 'answer' }
}
