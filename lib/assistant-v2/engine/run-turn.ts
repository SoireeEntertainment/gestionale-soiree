import { generateText } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import type { CurrentUser } from '@/lib/auth-dev'
import { ASSISTANT_V2_ENV, ASSISTANT_V2_LIMITS } from '@/lib/assistant-v2/config'
import { buildAssistantAuthContext } from '@/lib/assistant-v2/auth-context'
import { buildAssistantV2SystemPrompt } from '@/lib/assistant-v2/engine/system-prompt'
import { buildAiSdkTools, type BuiltToolTrace } from '@/lib/assistant-v2/engine/build-tools'
import {
  loadRecentMessagesForLlm,
  loadThreadV2Memory,
  memoryPatchFromToolResult,
  patchThreadV2Memory,
} from '@/lib/assistant-v2/memory/thread'
import { assistantV2Log } from '@/lib/assistant-v2/logging'
import type { AssistantV2Card, AssistantV2Response, ToolHandlerResult } from '@/lib/assistant-v2/types'

function cardsFromTrace(trace: BuiltToolTrace[]): AssistantV2Card[] {
  const cards: AssistantV2Card[] = []
  for (const t of trace) {
    const r = t.result
    if ('needsConfirmation' in r && r.needsConfirmation) {
      cards.push({
        type: 'confirmation',
        pendingId: r.pendingId,
        toolName: r.toolName,
        preview: r.preview,
      })
      continue
    }
    if (!r.ok && r.choices?.length) {
      cards.push({
        type: 'choices',
        prompt: r.error,
        choices: r.choices,
      })
      continue
    }
    if (r.ok && 'data' in r && r.data && typeof r.data === 'object') {
      const data = r.data as Record<string, unknown>
      const listKey = [
        'pedItems',
        'tasks',
        'clients',
        'works',
        'items',
        'renewals',
        'preventivi',
        'categories',
      ].find((k) => Array.isArray(data[k]))
      if (listKey) {
        const arr = data[listKey] as Record<string, unknown>[]
        const kind =
          listKey === 'pedItems' || t.name.includes('ped')
            ? ('ped' as const)
            : listKey === 'tasks' || t.name.includes('task') || t.name.includes('contact')
              ? ('task' as const)
              : listKey === 'works' || t.name.includes('work')
                ? ('work' as const)
                : undefined
        cards.push({
          type: 'list',
          title: r.summary,
          items: arr.slice(0, 20).map((row) => ({
            id: typeof row.id === 'string' ? row.id : undefined,
            kind,
            label: String(row.title ?? row.name ?? row.clientName ?? row.topic ?? row.id ?? '—'),
            href: typeof row.href === 'string' ? row.href : undefined,
            meta:
              typeof row.dueDate === 'string'
                ? row.dueDate
                : typeof row.date === 'string'
                  ? row.date
                  : typeof row.labelText === 'string'
                    ? row.labelText
                    : typeof row.status === 'string'
                      ? row.status
                      : undefined,
          })),
        })
      }
    }
  }
  return cards
}

function pendingFromTrace(trace: BuiltToolTrace[]): string | undefined {
  for (const t of trace) {
    const r = t.result
    if ('needsConfirmation' in r && r.needsConfirmation) return r.pendingId
  }
  return undefined
}

async function applyMemoryFromTrace(threadId: string, trace: BuiltToolTrace[]) {
  let patch = {}
  for (const t of trace) {
    const r = t.result as ToolHandlerResult & { data?: unknown; entityId?: string; summary?: string }
    if (r.ok && !('needsConfirmation' in r && r.needsConfirmation)) {
      patch = { ...patch, ...memoryPatchFromToolResult(t.name, r) }
    }
  }
  if (Object.keys(patch).length) await patchThreadV2Memory(threadId, patch)
}

export async function runAssistantV2Turn(input: {
  user: CurrentUser
  threadId: string
  userMessage: string
  abortSignal?: AbortSignal
}): Promise<AssistantV2Response> {
  const apiKey = ASSISTANT_V2_ENV.apiKey()
  if (!apiKey) {
    return {
      reply: 'Assistente non disponibile: manca la configurazione AI. Contatta un amministratore.',
      mode: 'clarification',
      threadId: input.threadId,
    }
  }

  const auth = buildAssistantAuthContext(input.user)
  const memory = await loadThreadV2Memory(input.threadId)
  const history = await loadRecentMessagesForLlm(input.threadId)

  const trace: BuiltToolTrace[] = []
  const counters = { toolCalls: 0 }
  const tools = buildAiSdkTools(
    { auth, threadId: input.threadId, memory },
    trace,
    counters
  )

  const openai = createOpenAI({ apiKey })
  const modelId = ASSISTANT_V2_ENV.model()
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), ASSISTANT_V2_LIMITS.requestTimeoutMs)
  const onAbort = () => controller.abort()
  input.abortSignal?.addEventListener('abort', onAbort)

  try {
    const result = await generateText({
      model: openai(modelId),
      system: buildAssistantV2SystemPrompt(auth, memory),
      messages: [
        ...history.map((m) => ({ role: m.role, content: m.content })),
        { role: 'user', content: input.userMessage.slice(0, ASSISTANT_V2_LIMITS.maxMessageChars) },
      ],
      tools,
      maxSteps: ASSISTANT_V2_LIMITS.maxSteps,
      maxTokens: ASSISTANT_V2_LIMITS.maxTokens,
      temperature: 0.2,
      abortSignal: controller.signal,
    })

    await applyMemoryFromTrace(input.threadId, trace)

    const pendingId = pendingFromTrace(trace)
    const cards = cardsFromTrace(trace)
    const hasClarify = trace.some((t) => !t.result.ok && t.result.clarify)
    const reply =
      result.text?.trim() ||
      (pendingId
        ? 'Ho preparato l’operazione. Conferma o annulla con i pulsanti qui sotto.'
        : hasClarify
          ? 'Ho bisogno di un chiarimento per procedere.'
          : 'Operazione elaborata.')

    const mode = pendingId
      ? 'needs_confirmation'
      : hasClarify
        ? 'clarification'
        : 'answer'

    const suggestedThreadTitle =
      input.userMessage.length > 3 ? input.userMessage.slice(0, 60) : null

    assistantV2Log('turn_ok', {
      userId: auth.currentUserId,
      threadId: input.threadId,
      model: modelId,
      toolCalls: counters.toolCalls,
      usage: result.usage,
    })

    return {
      reply,
      mode,
      threadId: input.threadId,
      pendingConfirmationId: pendingId,
      cards,
      toolTrace: trace.map((t) => ({
        name: t.name,
        ok: t.result.ok,
        summary:
          t.result.ok && 'summary' in t.result
            ? t.result.summary
            : !t.result.ok && 'error' in t.result
              ? t.result.error
              : undefined,
      })),
      suggestedThreadTitle,
      usage: {
        promptTokens: result.usage?.promptTokens,
        completionTokens: result.usage?.completionTokens,
        totalTokens: result.usage?.totalTokens,
      },
    }
  } catch (e) {
    const aborted = controller.signal.aborted
    assistantV2Log('turn_error', {
      aborted,
      message: e instanceof Error ? e.message : 'unknown',
    })
    return {
      reply: aborted
        ? 'La richiesta ha impiegato troppo tempo. Riprova con una domanda più specifica.'
        : 'L’assistente non è al momento disponibile. Riprova tra poco.',
      mode: 'clarification',
      threadId: input.threadId,
    }
  } finally {
    clearTimeout(timeout)
    input.abortSignal?.removeEventListener('abort', onAbort)
  }
}
