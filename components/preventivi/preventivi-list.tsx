'use client'

import Link from 'next/link'
import type { PreventivoItem, Client } from '@prisma/client'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import { Button } from '@/components/ui/button'

type PreventivoWithRelations = {
  id: string
  clientId: string | null
  prospectName: string | null
  title: string
  type: string
  status: string
  totalAmount: number | null
  notes: string | null
  filePath: string | null
  createdAt: Date
  updatedAt: Date
  client: Client | null
  items: PreventivoItem[]
}

function clienteLabel(p: PreventivoWithRelations) {
  return p.client?.name ?? p.prospectName ?? '—'
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
  void canWrite
  return (
    <>
      <div className="hidden md:block bg-dark border border-accent/20 rounded-lg overflow-hidden">
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
                  {p.clientId ? (
                    <Link href={`/clients/${p.clientId}`} className="text-accent hover:underline">
                      {clienteLabel(p)}
                    </Link>
                  ) : (
                    <span>{clienteLabel(p)}</span>
                  )}
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

      <div className="md:hidden space-y-3">
        {preventivi.map((p) => (
          <div key={p.id} className="rounded-xl border border-accent/20 bg-dark/80 p-4 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <h3 className="min-w-0 flex-1 text-base font-semibold text-white break-words">{p.title}</h3>
              <span className="shrink-0 px-2 py-1 text-xs rounded bg-accent/20 text-accent">
                {statusLabels[p.status] || p.status}
              </span>
            </div>
            <dl className="mt-3 space-y-1.5 text-sm text-white/70">
              <div className="flex gap-2 min-w-0">
                <dt className="shrink-0 text-white/45">Cliente</dt>
                <dd className="min-w-0 break-words">
                  {p.clientId ? (
                    <Link href={`/clients/${p.clientId}`} className="text-accent">
                      {clienteLabel(p)}
                    </Link>
                  ) : (
                    clienteLabel(p)
                  )}
                </dd>
              </div>
              <div className="flex gap-2">
                <dt className="shrink-0 text-white/45">Tipo</dt>
                <dd>{typeLabels[p.type] || p.type}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="shrink-0 text-white/45">Data</dt>
                <dd>{format(new Date(p.createdAt), 'dd MMM yyyy', { locale: it })}</dd>
              </div>
              {p.totalAmount != null && (
                <div className="flex gap-2">
                  <dt className="shrink-0 text-white/45">Importo</dt>
                  <dd className="font-medium text-white">
                    {p.totalAmount.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })}
                  </dd>
                </div>
              )}
            </dl>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Link
                href={`/preventivi/${p.id}`}
                className="flex min-h-[44px] items-center justify-center rounded-lg bg-accent/15 text-sm font-medium text-accent"
              >
                Dettagli
              </Link>
              <a
                href={`/api/preventivi/${p.id}/pdf`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex min-h-[44px] items-center justify-center rounded-lg border border-white/15 text-sm text-white/80"
              >
                PDF
              </a>
            </div>
          </div>
        ))}
        {preventivi.length === 0 && (
          <div className="rounded-xl border border-accent/20 p-8 text-center text-white/50">
            Nessun preventivo. Crea un preventivo o carica un PDF dalla scheda cliente.
          </div>
        )}
      </div>
    </>
  )
}
