import { redirect } from 'next/navigation'
import Link from 'next/link'
import { requireAuth } from '@/lib/auth-dev'
import { prisma } from '@/lib/prisma'
import { PreventivoForm } from '@/components/preventivi/preventivo-form'

export const dynamic = 'force-dynamic'

export default async function NuovoPreventivoPage() {
  const user = await requireAuth()
  if (user.role === 'AGENTE') redirect('/preventivi')

  const clients = await prisma.client.findMany({ orderBy: { name: 'asc' } })

  return (
    <div className="min-h-screen bg-dark p-6">
      <div className="w-[90vw] max-w-[90vw] mx-auto">
        <Link href="/preventivi" className="text-accent hover:underline mb-4 inline-block">
          ← Torna ai preventivi
        </Link>
        <h1 className="text-3xl font-bold text-white mb-6">Nuovo preventivo</h1>
        <div className="bg-dark border border-accent/20 rounded-lg p-6">
          <PreventivoForm clients={clients} />
        </div>
      </div>
    </div>
  )
}
