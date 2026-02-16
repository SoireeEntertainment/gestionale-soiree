'use client'

import Link from 'next/link'
import { Work, Category, Client, ClientCategory, User } from '@prisma/client'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import { upsertClientCategory } from '@/app/actions/client-categories'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { WorkForm } from '@/components/works/work-form'

const clientCategoryStatusLabels: Record<string, string> = {
  NOT_ACTIVE: 'Non Attivo',
  ACTIVE: 'Attivo',
  IN_PROGRESS: 'In Corso',
  ON_HOLD: 'In Attesa',
  COMPLETED: 'Completato',
}

const workStatusLabels: Record<string, string> = {
  TODO: 'Da Fare',
  IN_PROGRESS: 'In Corso',
  IN_REVIEW: 'In Revisione',
  WAITING_CLIENT: 'Attesa Cliente',
  DONE: 'Completato',
  PAUSED: 'In Pausa',
  CANCELED: 'Annullato',
}

interface ClientCategoryTabProps {
  clientId: string
  category: Category
  works: (Work & { category: Category })[]
  clientCategory: (ClientCategory & { category: Category }) | null
  clients: Client[]
  categories: Category[]
  users: User[]
  canWrite?: boolean
}

export function ClientCategoryTab({
  clientId,
  category,
  works,
  clientCategory,
  clients,
  categories,
  users,
  canWrite = true,
}: ClientCategoryTabProps) {
  const handleStatusChange = async (newStatus: string) => {
    if (!newStatus) return
    try {
      await upsertClientCategory({ clientId, categoryId: category.id, status: newStatus as any })
      window.location.reload()
    } catch (error) {
      console.error('Error:', error)
      alert('Errore nell\'aggiornamento dello stato')
    }
  }

  return (
    <div className="space-y-6">
      {/* Stato categoria per questo cliente */}
      <div className="bg-dark border border-accent/20 rounded-lg p-4">
        <div className="text-sm text-white/50 mb-2">Stato categoria per questo cliente</div>
        <div className="flex items-center gap-4 flex-wrap">
          {canWrite ? (
            <>
              <select
                value={clientCategory?.status ?? ''}
                onChange={(e) => handleStatusChange(e.target.value)}
                className="px-3 py-2 bg-dark border border-accent/20 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-accent"
              >
                <option value="">— Nessuno —</option>
                {Object.entries(clientCategoryStatusLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              {clientCategory?.status && (
                <span className="text-white/70 text-sm">
                  (aggiornando si associa la categoria al cliente se non presente)
                </span>
              )}
            </>
          ) : (
            <span className="text-white/70 text-sm">
              {clientCategory?.status ? (clientCategoryStatusLabels[clientCategory.status] ?? clientCategory.status) : '— Nessuno —'}
            </span>
          )}
          <Link
            href={`/categories/${category.id}`}
            className="text-accent hover:underline text-sm"
          >
            Vai alla categoria →
          </Link>
        </div>
      </div>

      {/* Lavori */}
      <div>
        {canWrite && (
        <div className="flex justify-end mb-4">
          <Dialog>
            <DialogTrigger asChild>
              <Button>+ Crea Lavoro</Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Crea Lavoro – {category.name}</DialogTitle>
              </DialogHeader>
              <WorkForm
                clientId={clientId}
                categoryId={category.id}
                clients={clients}
                categories={categories}
                users={users}
              />
            </DialogContent>
          </Dialog>
        </div>
        )}

        <div className="bg-dark border border-accent/20 rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-accent/10">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-accent uppercase">
                  Titolo
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-accent uppercase">
                  Stato
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-accent uppercase">
                  Scadenza
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-accent uppercase">
                  Azioni
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {works.map((work) => (
                <tr key={work.id} className="hover:bg-white/5">
                  <td className="px-6 py-4 text-white">{work.title}</td>
                  <td className="px-6 py-4">
                    <span className="px-2 py-1 text-xs rounded bg-accent/20 text-accent">
                      {workStatusLabels[work.status] || work.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-white/70">
                    {work.deadline
                      ? format(new Date(work.deadline), 'dd MMM yyyy', { locale: it })
                      : '-'}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <Link
                      href={`/works/${work.id}`}
                      className="text-accent hover:underline text-sm"
                    >
                      Dettagli
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {works.length === 0 && (
            <div className="p-12 text-center text-white/50">
              Nessun lavoro in questa categoria
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
