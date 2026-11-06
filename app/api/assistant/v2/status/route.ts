import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth-dev'
import { ASSISTANT_V2_ENV, isAssistantV2Enabled } from '@/lib/assistant-v2/config'
import { getToolsForAuth } from '@/lib/assistant-v2/tools/registry'
import { buildAssistantAuthContext } from '@/lib/assistant-v2/auth-context'

export const runtime = 'nodejs'

/** Stato feature flag + tool disponibili (senza segreti). */
export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

  const enabled = isAssistantV2Enabled()
  const auth = buildAssistantAuthContext(user)
  const tools = enabled ? getToolsForAuth(auth).map((t) => ({ name: t.name, kind: t.kind })) : []

  return NextResponse.json({
    enabled,
    model: enabled ? ASSISTANT_V2_ENV.model() : null,
    toolCount: tools.length,
    tools,
    role: auth.role,
  })
}
