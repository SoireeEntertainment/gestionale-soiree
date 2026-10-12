import { redirect } from 'next/navigation'
import { requireAuth } from '@/lib/auth-dev'
import { prisma } from '@/lib/prisma'
import { CategoriesList } from '@/components/categories/categories-list'

export default async function CategoriesPage() {
  await requireAuth()

  const categories = await prisma.category.findMany({
    orderBy: { name: 'asc' },
  })

  return (
    <div className="min-h-screen bg-dark p-4 md:p-6">
      <div className="w-full px-4 md:w-[90vw] md:max-w-[90vw] md:px-6 mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold text-white">Categorie</h1>
        </div>
        <CategoriesList categories={categories} />
      </div>
    </div>
  )
}

