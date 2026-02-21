import { redirect } from 'next/navigation'
import { requireAuth } from '@/lib/auth-dev'
import { getClient } from '@/app/actions/clients'
import { getClientCredentials } from '@/app/actions/client-credentials'
import { getClientRenewals } from '@/app/actions/client-renewals'
import { getPedClientSettingByClient, getClientPedTaskCounts, ensureClientSocialIfInPed, isClientInPed } from '@/app/actions/ped'
import { ClientDetail, type ClientDetailProps } from '@/components/clients/client-detail'
import { prisma } from '@/lib/prisma'
import { getUsers } from '@/lib/users'

export default async function ClientDetailPage(props: {
  params: Promise<{ id: string }>
}) {
  const user = await requireAuth()
  const { id } = await props.params
  const isAdmin = user.role === 'ADMIN'

  let client = await getClient(id)
  if (!client) redirect('/clients')

  try {
    await ensureClientSocialIfInPed(id)
    client = (await getClient(id)) ?? client
  } catch {
    // Non bloccare il caricamento scheda se l'auto-associazione Social fallisce
  }

  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth() + 1

  let pedTaskCounts: { monthCount: number; totalCount: number } | undefined
  let clientInPed = false

  const [categories, users, credentials, renewals, pedData] = await Promise.all([
    prisma.category.findMany(),
    getUsers(),
    getClientCredentials(id),
    getClientRenewals(id),
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

  try {
    const [counts, inPed] = await Promise.all([
      getClientPedTaskCounts(id, currentYear, currentMonth),
      isClientInPed(id),
    ])
    pedTaskCounts = counts
    clientInPed = inPed
  } catch {
    // Conteggi PED opzionali: scheda cliente caricabile anche se falliscono
  }

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
      renewals={renewals}
      pedTaskCounts={pedTaskCounts}
      clientInPed={clientInPed}
    />
  )
}

