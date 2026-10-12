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
    <div className="min-h-screen bg-dark p-4 md:p-6">
      <div className="w-full px-4 md:w-[90vw] md:max-w-[90vw] md:px-6 mx-auto">
        <div className="flex flex-col gap-3 mb-6 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-2xl md:text-3xl font-bold text-white">Preventivi</h1>
          {canWrite && (
            <Link href="/preventivi/nuovo" className="w-full sm:w-auto">
              <Button className="w-full min-h-[48px] sm:w-auto sm:min-h-0">+ Nuovo preventivo</Button>
            </Link>
          )}
        </div>
        <PreventiviList preventivi={preventivi} canWrite={canWrite} />
      </div>
    </div>
  )
}
