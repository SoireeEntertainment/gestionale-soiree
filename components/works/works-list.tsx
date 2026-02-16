'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Client, Category, Work, User } from '@prisma/client'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { WorkForm } from './work-form'

interface WorksListProps {
  works: (Work & { client: Client; category: Category; assignedTo?: User | null })[]
  clients: Client[]
  categories: Category[]
  users: User[]
  filters: {
    clientId?: string
    categoryId?: string
    status?: string
    deadlineFilter?: string
  }
}

const statusLabels: Record<string, string> = {
  TODO: 'Da Fare',
  IN_PROGRESS: 'In Corso',
  IN_REVIEW: 'In Revisione',
  WAITING_CLIENT: 'Attesa Cliente',
  DONE: 'Completato',
  PAUSED: 'In Pausa',
  CANCELED: 'Annullato',
}

export function WorksList({ works, clients, categories, users, filters }: WorksListProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const updateFilter = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString())
    if (value) {
      params.set(key, value)
    } else {
      params.delete(key)
    }
    router.push(`/works?${params.toString()}`)
  }

  return (
    <div>
      {/* Filtri */}
      <div className="bg-dark border border-accent/20 rounded-lg p-4 mb-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-white mb-1">
              Cliente
            </label>
            <select
              value={filters.clientId || ''}
              onChange={(e) => updateFilter('clientId', e.target.value)}
              className="w-full px-3 py-2 bg-dark border border-accent/20 rounded-md text-white text-sm focus:outline-none focus:ring-2 focus:ring-accent"
            >
              <option value="">Tutti</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-white mb-1">
              Categoria
            </label>
            <select
              value={filters.categoryId || ''}
              onChange={(e) => updateFilter('categoryId', e.target.value)}
              className="w-full px-3 py-2 bg-dark border border-accent/20 rounded-md text-white text-sm focus:outline-none focus:ring-2 focus:ring-accent"
            >
              <option value="">Tutte</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-white mb-1">
              Stato
            </label>
            <select
              value={filters.status || ''}
              onChange={(e) => updateFilter('status', e.target.value)}
              className="w-full px-3 py-2 bg-dark border border-accent/20 rounded-md text-white text-sm focus:outline-none focus:ring-2 focus:ring-accent"
            >
              <option value="">Tutti</option>
              {Object.entries(statusLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-white mb-1">
              Scadenza
            </label>
            <select
              value={filters.deadlineFilter || 'TUTTI'}
              onChange={(e) => updateFilter('deadlineFilter', e.target.value)}
              className="w-full px-3 py-2 bg-dark border border-accent/20 rounded-md text-white text-sm focus:outline-none focus:ring-2 focus:ring-accent"
            >
              <option value="TUTTI">Tutti</option>
              <option value="SCADUTI">Scaduti</option>
              <option value="IN_SCADENZA_7_GIORNI">In scadenza (7 giorni)</option>
            </select>
          </div>
        </div>
      </div>

      <div className="flex justify-end mb-4">
        <Dialog>
          <DialogTrigger asChild>
            <Button>+ Nuovo Lavoro</Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Nuovo Lavoro</DialogTitle>
            </DialogHeader>
            <WorkForm clients={clients} categories={categories} users={users} />
          </DialogContent>
        </Dialog>
      </div>

      <div className="bg-dark border border-accent/20 rounded-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-accent/10">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-accent uppercase">
                Titolo
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-accent uppercase">
                Cliente
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-accent uppercase">
                Categoria
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-accent uppercase">
                Stato
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-accent uppercase">
                Scadenza
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-accent uppercase">
                Assegnato a
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-accent uppercase">
                Azioni
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {works.map((work) => {
              const isExpired = work.deadline && new Date(work.deadline) < new Date() && work.status !== 'DONE'
              return (
                <tr key={work.id} className="hover:bg-white/5">
                  <td className="px-6 py-4 text-white">{work.title}</td>
                  <td className="px-6 py-4 text-white/70">{work.client.name}</td>
                  <td className="px-6 py-4 text-white/70">{work.category.name}</td>
                  <td className="px-6 py-4">
                    <span className="px-2 py-1 text-xs rounded bg-accent/20 text-accent">
                      {statusLabels[work.status] || work.status}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    {work.deadline ? (
                      <span className={isExpired ? 'text-red-400' : 'text-white/70'}>
                        {format(new Date(work.deadline), 'dd MMM yyyy', { locale: it })}
                        {isExpired && <span className="ml-2 text-xs text-red-400">Scaduto</span>}
                      </span>
                    ) : (
                      <span className="text-white/50">-</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-white/70">
                    {work.assignedTo?.name || '-'}
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
              )
            })}
          </tbody>
        </table>
        {works.length === 0 && (
          <div className="p-12 text-center text-white/50">
            Nessun lavoro trovato
          </div>
        )}
      </div>
    </div>
  )
}

