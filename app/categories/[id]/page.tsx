import { redirect } from 'next/navigation'
import { requireAuth } from '@/lib/auth-dev'
import { getCategory } from '@/app/actions/categories'
import { CategoryDetail } from '@/components/categories/category-detail'
import { prisma } from '@/lib/prisma'

export default async function CategoryDetailPage(props: {
  params: Promise<{ id: string }>
}) {
  const user = await requireAuth()
  if (user.role === 'AGENTE') redirect('/clients')

  const { id } = await props.params
  const [category, clients] = await Promise.all([
    getCategory(id),
    prisma.client.findMany({ orderBy: { name: 'asc' } }),
  ])

  if (!category) redirect('/categories')

  return <CategoryDetail category={category} allClients={clients} />
}

