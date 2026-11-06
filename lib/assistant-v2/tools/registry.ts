import { canUseToolPermission } from '@/lib/assistant-v2/permissions'
import { categoryTools } from '@/lib/assistant-v2/tools/categories'
import { clientTools } from '@/lib/assistant-v2/tools/clients'
import { dailyTaskTools } from '@/lib/assistant-v2/tools/daily-tasks'
import { dashboardTools } from '@/lib/assistant-v2/tools/dashboard'
import { pedTools } from '@/lib/assistant-v2/tools/ped'
import { preventiviTools } from '@/lib/assistant-v2/tools/preventivi'
import { renewalTools } from '@/lib/assistant-v2/tools/renewals'
import { shootingTools } from '@/lib/assistant-v2/tools/shootings'
import type { AssistantToolDefinition } from '@/lib/assistant-v2/tools/types'
import { workTools } from '@/lib/assistant-v2/tools/works'
import type { AssistantAuthContext } from '@/lib/assistant-v2/types'

export const ALL_ASSISTANT_TOOLS: AssistantToolDefinition[] = [
  ...dailyTaskTools,
  ...clientTools,
  ...workTools,
  ...pedTools,
  ...shootingTools,
  ...renewalTools,
  ...preventiviTools,
  ...categoryTools,
  ...dashboardTools,
]

const TOOLS_BY_NAME = new Map<string, AssistantToolDefinition>()
for (const tool of ALL_ASSISTANT_TOOLS) {
  if (TOOLS_BY_NAME.has(tool.name)) {
    throw new Error(`[assistant-v2] Nome tool duplicato: ${tool.name}`)
  }
  // Ogni tool in scrittura deve richiedere conferma e avere un commit.
  if (tool.kind === 'write' && (!tool.requiresConfirmation || !tool.commit)) {
    throw new Error(`[assistant-v2] Tool di scrittura senza conferma/commit: ${tool.name}`)
  }
  TOOLS_BY_NAME.set(tool.name, tool)
}

export function getToolByName(name: string): AssistantToolDefinition | undefined {
  return TOOLS_BY_NAME.get(name)
}

/** Tool esposti al modello per questo utente (filtrati per permesso e tipo). */
export function getToolsForAuth(auth: AssistantAuthContext): AssistantToolDefinition[] {
  return ALL_ASSISTANT_TOOLS.filter((tool) => canUseToolPermission(auth, tool.permission, tool.kind))
}
