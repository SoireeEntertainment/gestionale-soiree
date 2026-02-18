import { redirect } from 'next/navigation'
import { requireAuth } from '@/lib/auth-dev'
import { getClient } from '@/app/actions/clients'
import { getClientCredentials } from '@/app/actions/client-credentials'
import { getPedClientSettingByClient } from '@/app/actions/ped'
import { ClientDetail, type ClientDetailProps } from '@/components/clients/client-detail'
import { prisma } from '@/lib/prisma'
import { getUsers } from '@/lib/users'

export default async function ClientDetailPage(props: {
  params: Promise<{ id: string }>
}) {
  const user = await requireAuth()
  const { id } = await props.params
  const isAdmin = user.role === 'ADMIN'

  const [client, categories, users, credentials, pedData] = await Promise.all([
    getClient(id),
    prisma.category.findMany(),
    getUsers(),
    getClientCredentials(id),
    Promise.all([
      prisma.client.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } }),
      prisma.work.findMany({ orderBy: { title: 'asc' }, select: { id: true, title: true } }),
      getPedClientSettingByClient(id),
    ]).then(([pedClients, pedWorks, pedSetting]) => ({
      pedClients,
      pedWorks,
      pedContentsPerMonth: pedSetting?.contentsPerWeek ?? 0,
    })),
  ])

  if (!client) redirect('/clients')

  const canWrite = isAdmin
  const clientWithCredentials = { ...client, credentials }

  return (
    <ClientDetail
      client={clientWithCredentials as ClientDetailProps['client']}
      allCategories={categories}
      users={users}
      canWrite={canWrite}
      showPedSection={true}
      pedClients={pedData.pedClients}
      pedWorks={pedData.pedWorks}
      pedContentsPerMonth={pedData.pedContentsPerMonth}
      currentUserId={user?.id ?? ''}
      metaBusinessSuiteUrl={(client as { metaBusinessSuiteUrl?: string | null }).metaBusinessSuiteUrl ?? undefined}
      gestioneInserzioniUrl={(client as { gestioneInserzioniUrl?: string | null }).gestioneInserzioniUrl ?? undefined}
    />
  )
}

