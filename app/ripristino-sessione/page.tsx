import { RipristinoSessioneClient } from './ripristino-sessione-client'
import { safeInternalPath } from '@/lib/auth-classification'

export const dynamic = 'force-dynamic'

export default async function RipristinoSessionePage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>
}) {
  const params = await searchParams
  const nextPath = safeInternalPath(params.next)
  return <RipristinoSessioneClient nextPath={nextPath} />
}
