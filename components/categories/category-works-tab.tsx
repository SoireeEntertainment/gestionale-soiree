'use client'

import Link from 'next/link'
import { Work, Client } from '@prisma/client'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'

interface CategoryWorksTabProps {
  categoryId: string
  works: (Work & { client: Client })[]
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

export function CategoryWorksTab({ works }: CategoryWorksTabProps) {
  return (
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
              <td className="px-6 py-4 text-white/70">{work.client.name}</td>
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
  )
}

