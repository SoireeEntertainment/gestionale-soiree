import { tool } from 'ai'
import { ASSISTANT_V2_LIMITS } from '@/lib/assistant-v2/config'
import { getToolsForAuth } from '@/lib/assistant-v2/tools/registry'
import type { ToolExecutionContext } from '@/lib/assistant-v2/tools/types'
import type { ToolHandlerResult } from '@/lib/assistant-v2/types'
import { sanitizeUntrustedText } from '@/lib/assistant-v2/redact'

export type BuiltToolTrace = {
  name: string
  result: ToolHandlerResult
}

/** Costruisce i tool AI SDK filtrati per permesso, con execute server-side. */
export function buildAiSdkTools(
  ctx: ToolExecutionContext,
  trace: BuiltToolTrace[],
  counters: { toolCalls: number }
) {
  const defs = getToolsForAuth(ctx.auth)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const out: Record<string, any> = {}

  for (const def of defs) {
    out[def.name] = tool({
      description: def.description,
      parameters: def.inputSchema,
      execute: async (rawInput) => {
        counters.toolCalls += 1
        if (counters.toolCalls > ASSISTANT_V2_LIMITS.maxToolCallsPerTurn) {
          const limited: ToolHandlerResult = {
            ok: false,
            error: 'Limite tool call raggiunto per questo turno.',
            code: 'TOOL_LIMIT',
          }
          trace.push({ name: def.name, result: limited })
          return limited
        }
        try {
          const result = await def.execute(rawInput, ctx)
          // Minimizza testi non attendibili nei risultati verso il modello
          if (result.ok && 'data' in result && result.data) {
            const cloned = JSON.parse(
              JSON.stringify(result.data, (_k, v) =>
                typeof v === 'string' ? sanitizeUntrustedText(v, 500) : v
              )
            )
            const trimmed = { ...result, data: cloned }
            trace.push({ name: def.name, result: trimmed })
            return trimmed
          }
          trace.push({ name: def.name, result })
          return result
        } catch (e) {
          const msg = e instanceof Error ? e.message : 'Errore tool'
          const safe =
            /openai|api key|stack|prisma/i.test(msg)
              ? 'Operazione non riuscita. Riprova.'
              : msg
          const failed: ToolHandlerResult = { ok: false, error: safe }
          trace.push({ name: def.name, result: failed })
          return failed
        }
      },
    })
  }

  return out
}
