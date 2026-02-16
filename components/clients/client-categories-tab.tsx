'use client'

import { useState } from 'react'
import { Category, ClientCategory } from '@prisma/client'
import { upsertClientCategory } from '@/app/actions/client-categories'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'

interface ClientCategoriesTabProps {
  clientId: string
  clientCategories: (ClientCategory & { category: Category })[]
  allCategories: Category[]
}

const statusLabels: Record<string, string> = {
  NOT_ACTIVE: 'Non Attivo',
  ACTIVE: 'Attivo',
  IN_PROGRESS: 'In Corso',
  ON_HOLD: 'In Attesa',
  COMPLETED: 'Completato',
}

export function ClientCategoriesTab({
  clientId,
  clientCategories,
  allCategories,
}: ClientCategoriesTabProps) {
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [selectedCategoryId, setSelectedCategoryId] = useState('')
  const [status, setStatus] = useState('ACTIVE')

  const handleAdd = async () => {
    if (!selectedCategoryId) return

    try {
      await upsertClientCategory({
        clientId,
        categoryId: selectedCategoryId,
        status: status as any,
      })
      setIsAddOpen(false)
      window.location.reload()
    } catch (error) {
      console.error('Error:', error)
      alert('Errore nell\'aggiunta della categoria')
    }
  }

  const handleStatusChange = async (categoryId: string, newStatus: string) => {
    try {
      await upsertClientCategory({
        clientId,
        categoryId,
        status: newStatus as any,
      })
      window.location.reload()
    } catch (error) {
      console.error('Error:', error)
      alert('Errore nell\'aggiornamento dello stato')
    }
  }

  const availableCategories = allCategories.filter(
    (cat) => !clientCategories.some((cc) => cc.categoryId === cat.id)
  )

  return (
    <div>
      <div className="flex justify-end mb-4">
        <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
          <DialogTrigger asChild>
            <Button disabled={availableCategories.length === 0}>
              + Aggiungi Categoria
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Aggiungi Categoria</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-white mb-1">
                  Categoria
                </label>
                <select
                  value={selectedCategoryId}
                  onChange={(e) => setSelectedCategoryId(e.target.value)}
                  className="w-full px-3 py-2 bg-dark border border-accent/20 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-accent"
                >
                  <option value="">Seleziona categoria</option>
                  {availableCategories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-white mb-1">
                  Stato
                </label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="w-full px-3 py-2 bg-dark border border-accent/20 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-accent"
                >
                  {Object.entries(statusLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex justify-end space-x-2">
                <Button variant="ghost" onClick={() => setIsAddOpen(false)}>
                  Annulla
                </Button>
                <Button onClick={handleAdd}>Aggiungi</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="bg-dark border border-accent/20 rounded-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-accent/10">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-accent uppercase">
                Categoria
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-accent uppercase">
                Stato
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-accent uppercase">
                Azioni
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {clientCategories.map((cc) => (
              <tr key={cc.id} className="hover:bg-white/5">
                <td className="px-6 py-4 text-white">{cc.category.name}</td>
                <td className="px-6 py-4">
                  <select
                    value={cc.status}
                    onChange={(e) => handleStatusChange(cc.categoryId, e.target.value)}
                    className="px-3 py-1 bg-dark border border-accent/20 rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-accent"
                  >
                    {Object.entries(statusLabels).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-6 py-4 text-right">
                  <a
                    href={`/categories/${cc.categoryId}`}
                    className="text-accent hover:underline text-sm"
                  >
                    Dettagli
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {clientCategories.length === 0 && (
          <div className="p-12 text-center text-white/50">
            Nessuna categoria associata
          </div>
        )}
      </div>
    </div>
  )
}

