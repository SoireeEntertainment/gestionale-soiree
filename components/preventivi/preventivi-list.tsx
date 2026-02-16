'use client'

import Link from 'next/link'
import { Preventivo, PreventivoItem, Client } from '@prisma/client'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import { Button } from '@/components/ui/button'

type PreventivoWithRelations = Preventivo & {
  client: Client
  items: PreventivoItem[]
}

const statusLabels: Record<string, string> = {
  BOZZA: 'Bozza',
  INVIATO: 'Inviato',
  ACCETTATO: 'Accettato',
  RIFIUTATO: 'Rifiutato',
}

const typeLabels: Record<string, string> = {
  GENERATED: 'Creato in app',
  UPLOADED: 'PDF caricato',
}

export function PreventiviList({ preventivi, canWrite = true }: { preventivi: PreventivoWithRelations[]; canWrite?: boolean }) {
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
              Tipo
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-accent uppercase">
              Stato
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-accent uppercase">
              Data
            </th>
            <th className="px-6 py-3 text-right text-xs font-medium text-accent uppercase">
              Azioni
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/10">
          {preventivi.map((p) => (
            <tr key={p.id} className="hover:bg-white/5">
              <td className="px-6 py-4 text-white">{p.title}</td>
              <td className="px-6 py-4 text-white/70">
                <Link href={`/clients/${p.clientId}`} className="text-accent hover:underline">
                  {p.client.name}
                </Link>
              </td>
              <td className="px-6 py-4 text-white/70">{typeLabels[p.type] || p.type}</td>
              <td className="px-6 py-4">
                <span className="px-2 py-1 text-xs rounded bg-accent/20 text-accent">
                  {statusLabels[p.status] || p.status}
                </span>
              </td>
              <td className="px-6 py-4 text-white/70">
                {format(new Date(p.createdAt), 'dd MMM yyyy', { locale: it })}
              </td>
              <td className="px-6 py-4 text-right space-x-2">
                <Link href={`/preventivi/${p.id}`}>
                  <Button variant="ghost" size="sm">
                    Dettagli
                  </Button>
                </Link>
                <a
                  href={`/api/preventivi/${p.id}/pdf`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex"
                >
                  <Button variant="ghost" size="sm">
                    PDF
                  </Button>
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {preventivi.length === 0 && (
        <div className="p-12 text-center text-white/50">
          Nessun preventivo. Crea un preventivo o carica un PDF dalla scheda cliente.
        </div>
      )}
    </div>
  )
}
