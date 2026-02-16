'use client'

import Link from 'next/link'
import { Work, Category, Client, User } from '@prisma/client'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { WorkForm } from '@/components/works/work-form'

interface ClientWorksTabProps {
  clientId: string
  works: (Work & { category: Category })[]
  clients: Client[]
  categories: Category[]
  users: User[]
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

export function ClientWorksTab({ clientId, works, clients, categories, users }: ClientWorksTabProps) {
  return (
    <div>
      <div className="flex justify-end mb-4">
        <Dialog>
          <DialogTrigger asChild>
            <Button>+ Crea Lavoro</Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Crea Nuovo Lavoro</DialogTitle>
            </DialogHeader>
            <WorkForm clientId={clientId} clients={clients} categories={categories} users={users} />
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
                Categoria
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
                <td className="px-6 py-4 text-white/70">{work.category.name}</td>
                <td className="px-6 py-4">
                  <span className="px-2 py-1 text-xs rounded bg-accent/20 text-accent">
                    {statusLabels[work.status] || work.status}
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
            Nessun lavoro trovato
          </div>
        )}
      </div>
    </div>
  )
}

