import { requireAuth } from '@/lib/auth-dev'
import { AssistantPage } from '@/components/assistant/assistant-page'

export const dynamic = 'force-dynamic'

export default async function AssistenteRoute() {
  await requireAuth()
  return <AssistantPage />
}
