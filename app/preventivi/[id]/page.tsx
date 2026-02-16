import { notFound } from 'next/navigation'
import Link from 'next/link'
import { requireAuth } from '@/lib/auth-dev'
import { getPreventivo } from '@/app/actions/preventivi'

export const dynamic = 'force-dynamic'
import { PreventivoDetail } from '@/components/preventivi/preventivo-detail'

export default async function PreventivoDetailPage(props: {
  params: Promise<{ id: string }>
}) {
  const user = await requireAuth()
  const { id } = await props.params
  const preventivo = await getPreventivo(id)
  if (!preventivo) notFound()

  const canWrite = user.role === 'ADMIN'

  return (
    <div className="min-h-screen bg-dark p-6">
      <div className="w-[90vw] max-w-[90vw] mx-auto">
        <Link href="/preventivi" className="text-accent hover:underline mb-4 inline-block">
          ← Torna ai preventivi
        </Link>
        <PreventivoDetail preventivo={preventivo} canWrite={canWrite} />
      </div>
    </div>
  )
}
