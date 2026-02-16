'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Preventivo, PreventivoItem, Client } from '@prisma/client'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { deletePreventivo } from '@/app/actions/preventivi'
import { useRouter } from 'next/navigation'

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

export function PreventivoDetail({ preventivo, canWrite = true }: { preventivo: PreventivoWithRelations; canWrite?: boolean }) {
  const router = useRouter()
  const [deleteOpen, setDeleteOpen] = useState(false)

  const handleDelete = async () => {
    try {
      await deletePreventivo(preventivo.id)
      setDeleteOpen(false)
      router.push('/preventivi')
      router.refresh()
    } catch (e) {
      console.error(e)
      alert('Errore durante l\'eliminazione')
    }
  }

  const total =
    preventivo.type === 'GENERATED' && preventivo.items.length > 0
      ? preventivo.items.reduce((s, i) => s + i.quantity * i.unitPrice, 0)
      : preventivo.totalAmount

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold text-white">{preventivo.title}</h1>
        <div className="flex gap-2">
          <a
            href={`/api/preventivi/${preventivo.id}/pdf`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button>Esporta / Apri PDF</Button>
          </a>
          {canWrite && (
          <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
            <DialogTrigger asChild>
              <Button variant="ghost">Elimina</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Conferma eliminazione</DialogTitle>
              </DialogHeader>
              <p className="text-white/80 mb-4">
                Vuoi eliminare il preventivo &quot;{preventivo.title}&quot;?
              </p>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setDeleteOpen(false)}>
                  Annulla
                </Button>
                <Button onClick={handleDelete}>Elimina</Button>
              </div>
            </DialogContent>
          </Dialog>
          )}
        </div>
      </div>

      <div className="bg-dark border border-accent/20 rounded-lg p-6 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <div className="text-sm text-white/50 mb-1">Cliente</div>
            <Link
              href={`/clients/${preventivo.clientId}`}
              className="text-accent hover:underline"
            >
              {preventivo.client.name}
            </Link>
          </div>
          <div>
            <div className="text-sm text-white/50 mb-1">Tipo</div>
            <div className="text-white">{typeLabels[preventivo.type] || preventivo.type}</div>
          </div>
          <div>
            <div className="text-sm text-white/50 mb-1">Stato</div>
            <span className="px-2 py-1 text-xs rounded bg-accent/20 text-accent">
              {statusLabels[preventivo.status] || preventivo.status}
            </span>
          </div>
          <div>
            <div className="text-sm text-white/50 mb-1">Data</div>
            <div className="text-white">
              {format(new Date(preventivo.createdAt), 'dd MMMM yyyy', { locale: it })}
            </div>
          </div>
          {total != null && (
            <div>
              <div className="text-sm text-white/50 mb-1">Totale</div>
              <div className="text-white font-medium">€ {Number(total).toFixed(2)}</div>
            </div>
          )}
        </div>
        {preventivo.notes && (
          <div className="mt-4 pt-4 border-t border-white/10">
            <div className="text-sm text-white/50 mb-1">Note</div>
            <div className="text-white whitespace-pre-wrap">{preventivo.notes}</div>
          </div>
        )}
      </div>

      {preventivo.type === 'GENERATED' && preventivo.items.length > 0 && (
        <div className="bg-dark border border-accent/20 rounded-lg overflow-hidden mb-6">
          <div className="px-6 py-3 bg-accent/10 text-accent font-medium">
            Righe preventivo
          </div>
          <table className="w-full">
            <thead className="bg-white/5">
              <tr>
                <th className="px-6 py-2 text-left text-xs text-white/70">Descrizione</th>
                <th className="px-6 py-2 text-right text-xs text-white/70">Qtà</th>
                <th className="px-6 py-2 text-right text-xs text-white/70">Prezzo unit.</th>
                <th className="px-6 py-2 text-right text-xs text-white/70">Importo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {preventivo.items.map((item) => (
                <tr key={item.id}>
                  <td className="px-6 py-3 text-white">{item.description}</td>
                  <td className="px-6 py-3 text-right text-white/80">{item.quantity}</td>
                  <td className="px-6 py-3 text-right text-white/80">
                    € {item.unitPrice.toFixed(2)}
                  </td>
                  <td className="px-6 py-3 text-right text-white">
                    € {(item.quantity * item.unitPrice).toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {preventivo.type === 'UPLOADED' && preventivo.filePath && (
        <div className="text-white/70 text-sm">
          File PDF caricato. Usa il pulsante &quot;Esporta / Apri PDF&quot; per visualizzarlo.
        </div>
      )}
    </div>
  )
}
