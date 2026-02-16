import Link from 'next/link'
import { requireAuth } from '@/lib/auth-dev'
import { getPreventivi } from '@/app/actions/preventivi'
import { Button } from '@/components/ui/button'
import { PreventiviList } from '@/components/preventivi/preventivi-list'

export const dynamic = 'force-dynamic'

export default async function PreventiviPage() {
  const user = await requireAuth()
  const canWrite = user.role === 'ADMIN'

  let preventivi: Awaited<ReturnType<typeof getPreventivi>> = []
  try {
    preventivi = await getPreventivi()
  } catch (e) {
    console.error('Preventivi load error:', e)
  }

  return (
    <div className="min-h-screen bg-dark p-6">
      <div className="w-[90vw] max-w-[90vw] mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold text-white">Preventivi</h1>
          {canWrite && (
            <Link href="/preventivi/nuovo">
              <Button>+ Nuovo preventivo</Button>
            </Link>
          )}
        </div>
        <PreventiviList preventivi={preventivi} canWrite={canWrite} />
      </div>
    </div>
  )
}
