import { requireAuth } from '@/lib/auth-dev'
import { AssistantPanel } from '@/components/assistant/assistant-panel'
import { AssistantPanelV2 } from '@/components/assistant/assistant-panel-v2'
import { isAssistantV2Enabled } from '@/lib/assistant-v2/config'

export const dynamic = 'force-dynamic'

export default async function AssistenteRoute() {
  await requireAuth()
  if (isAssistantV2Enabled()) {
    return (
      <div className="mx-auto flex h-[calc(100dvh-4rem)] max-w-3xl flex-col px-2 py-2 md:h-[calc(100dvh-5rem)]">
        <AssistantPanelV2 />
      </div>
    )
  }
  return <AssistantPanel variant="page" />
}
