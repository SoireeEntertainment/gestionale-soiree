'use client'

import { useState } from 'react'
import Link from 'next/link'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { PreventivoForm } from '@/components/preventivi/preventivo-form'
import { createPreventivoWithUpload } from '@/app/actions/preventivi'

type PreventivoWithItems = {
  id: string
  title: string
  type: string
  status: string
  createdAt: Date
  filePath?: string | null
  items: { id: string; description: string; quantity: number; unitPrice: number }[]
}

const statusLabels: Record<string, string> = {
  BOZZA: 'Bozza',
  INVIATO: 'Inviato',
  ACCETTATO: 'Accettato',
  RIFIUTATO: 'Rifiutato',
}

interface ClientPreventiviSectionProps {
  clientId: string
  clientName: string
  preventivi: PreventivoWithItems[]
  allClients: { id: string; name: string }[]
  canWrite?: boolean
}

export function ClientPreventiviSection({
  clientId,
  clientName,
  preventivi,
  allClients,
  canWrite = true,
}: ClientPreventiviSectionProps) {
  const [uploadTitle, setUploadTitle] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadKey, setUploadKey] = useState(0)

  const handleUpload = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = e.currentTarget
    const formData = new FormData(form)
    if (!formData.get('pdf') || (formData.get('pdf') as File).size === 0) {
      alert('Seleziona un file PDF')
      return
    }
    setUploading(true)
    try {
      await createPreventivoWithUpload(clientId, uploadTitle || (formData.get('pdf') as File).name, formData)
      setUploadTitle('')
      setUploadKey((k) => k + 1)
      window.location.reload()
    } catch (err) {
      console.error(err)
      alert(err instanceof Error ? err.message : 'Errore nel caricamento')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="mt-10 pt-8 border-t border-accent/20">
      <h2 className="text-xl font-semibold text-white mb-4">Preventivi</h2>
      <div className="flex flex-wrap gap-2 mb-4">
        {canWrite && (
          <>
            <Dialog>
              <DialogTrigger asChild>
                <Button>+ Crea preventivo</Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Nuovo preventivo – {clientName}</DialogTitle>
                </DialogHeader>
                <PreventivoForm
                  clients={allClients}
                  clientId={clientId}
                  onSuccess={() => window.location.reload()}
                />
              </DialogContent>
            </Dialog>

            <Dialog>
              <DialogTrigger asChild>
                <Button variant="ghost">Carica PDF</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Carica preventivo (PDF)</DialogTitle>
                </DialogHeader>
                <form key={uploadKey} onSubmit={handleUpload} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-white mb-1">
                      Titolo (opzionale)
                    </label>
                    <input
                      type="text"
                      value={uploadTitle}
                      onChange={(e) => setUploadTitle(e.target.value)}
                      className="w-full px-3 py-2 bg-dark border border-accent/20 rounded-md text-white"
                      placeholder="Es. Preventivo gennaio 2025"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-white mb-1">
                      File PDF *
                    </label>
                    <input
                      type="file"
                      name="pdf"
                      accept=".pdf,application/pdf"
                      required
                      className="w-full px-3 py-2 bg-dark border border-accent/20 rounded-md text-white file:mr-2 file:py-1 file:px-3 file:rounded file:border-0 file:bg-accent/20 file:text-accent"
                    />
                  </div>
                  <div className="flex justify-end">
                    <Button type="submit" disabled={uploading}>
                      {uploading ? 'Caricamento...' : 'Carica'}
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </>
        )}

        <Link href="/preventivi">
          <Button variant="ghost">Vedi tutti i preventivi</Button>
        </Link>
      </div>

      <div className="bg-dark border border-accent/20 rounded-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-accent/10">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-accent uppercase">
                Titolo
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
                  {p.type === 'UPLOADED' ? 'PDF caricato' : 'Creato in app'}
                </td>
                <td className="px-6 py-4">
                  <span className="px-2 py-1 text-xs rounded bg-accent/20 text-accent">
                    {statusLabels[p.status] || p.status}
                  </span>
                </td>
                <td className="px-6 py-4 text-white/70">
                  {format(new Date(p.createdAt), 'dd MMM yyyy', { locale: it })}
                </td>
                <td className="px-6 py-4 text-right">
                  <Link href={`/preventivi/${p.id}`} className="text-accent hover:underline text-sm mr-2">
                    Dettagli
                  </Link>
                  <a
                    href={`/api/preventivi/${p.id}/pdf`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-accent hover:underline text-sm"
                  >
                    PDF
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {preventivi.length === 0 && (
          <div className="p-8 text-center text-white/50">
            Nessun preventivo. Crea un preventivo o carica un PDF.
          </div>
        )}
      </div>
    </div>
  )
}
