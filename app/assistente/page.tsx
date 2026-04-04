import { requireAuth } from '@/lib/auth-dev'
import { AssistantPanel } from '@/components/assistant/assistant-panel'

export const dynamic = 'force-dynamic'

export default async function AssistenteRoute() {
  await requireAuth()
  return <AssistantPanel variant="page" />
}
