'use client'

import Link from 'next/link'
import { Category } from '@prisma/client'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { CategoryForm } from './category-form'

interface CategoriesListProps {
  categories: Category[]
}

export function CategoriesList({ categories }: CategoriesListProps) {
  return (
    <div>
      <div className="flex justify-stretch md:justify-end mb-4">
        <Dialog>
          <DialogTrigger asChild>
            <Button className="w-full min-h-[48px] md:w-auto md:min-h-0">+ Nuova Categoria</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nuova Categoria</DialogTitle>
            </DialogHeader>
            <CategoryForm />
          </DialogContent>
        </Dialog>
      </div>

      <div className="hidden md:block bg-dark border border-accent/20 rounded-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-accent/10">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-accent uppercase">
                Nome
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-accent uppercase">
                Descrizione
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-accent uppercase">
                Azioni
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {categories.map((category) => (
              <tr key={category.id} className="hover:bg-white/5">
                <td className="px-6 py-4 text-white">{category.name}</td>
                <td className="px-6 py-4 text-white/70">
                  {category.description || '-'}
                </td>
                <td className="px-6 py-4 text-right">
                  <Link
                    href={`/categories/${category.id}`}
                    className="text-accent hover:underline text-sm"
                  >
                    Dettagli
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {categories.length === 0 && (
          <div className="p-12 text-center text-white/50">
            Nessuna categoria trovata
          </div>
        )}
      </div>

      <div className="md:hidden space-y-3">
        {categories.map((category) => (
          <Link
            key={category.id}
            href={`/categories/${category.id}`}
            className="block rounded-xl border border-accent/20 bg-dark/80 p-4 min-w-0 active:bg-white/5"
          >
            <h3 className="text-base font-semibold text-white break-words">{category.name}</h3>
            <p className="mt-1 text-sm text-white/60 break-words">
              {category.description || 'Nessuna descrizione'}
            </p>
          </Link>
        ))}
        {categories.length === 0 && (
          <div className="rounded-xl border border-accent/20 p-8 text-center text-white/50">
            Nessuna categoria trovata
          </div>
        )}
      </div>
    </div>
  )
}
