'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Client, User } from '@prisma/client'
import { MoreHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { ClientForm } from './client-form'
import { DomainRenewalsAlertButton } from './domain-renewals-alert-button'
import { deleteClient } from '@/app/actions/clients'
import { showToast } from '@/lib/toast'

interface ClientsListProps {
  clients: (Client & { assignedTo?: User | null })[]
  users: User[]
  canWrite?: boolean
}

function matchSearch(client: Client & { assignedTo?: User | null }, search: string): boolean {
  if (!search.trim()) return true
  const q = search.trim().toLowerCase()
  const name = (client.name ?? '').toLowerCase()
  const contact = (client.contactName ?? '').toLowerCase()
  const email = (client.email ?? '').toLowerCase()
  const phone = (client.phone ?? '').toLowerCase()
  const assigned = (client.assignedTo?.name ?? '').toLowerCase()
  return name.includes(q) || contact.includes(q) || email.includes(q) || phone.includes(q) || assigned.includes(q)
}

export function ClientsList({ clients, users, canWrite = true }: ClientsListProps) {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null)

  const filteredClients = useMemo(
    () => clients.filter((c) => matchSearch(c, search)),
    [clients, search]
  )

  const handleDelete = async (client: Client) => {
    if (!confirm(`Eliminare il cliente "${client.name}"? Verranno eliminati anche lavori, preventivi e dati collegati.`)) return
    setDeletingId(client.id)
    setMenuOpenId(null)
    try {
      await deleteClient(client.id)
      showToast('Cliente eliminato', 'success')
      router.refresh()
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Errore durante l\'eliminazione', 'error')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div>
      <div className="flex flex-col gap-3 mb-4 md:flex-row md:flex-wrap md:items-center md:gap-4">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cerca per nome, contatto, email, telefono..."
          className="w-full md:flex-1 md:min-w-[200px] px-3 py-3 md:py-2 bg-dark border border-accent/20 rounded text-white placeholder-white/40"
        />
        {canWrite && (
          <div className="grid grid-cols-2 gap-2 md:flex md:flex-wrap md:items-center md:gap-4">
            <div className="col-span-2 md:col-span-1 [&_button]:w-full md:[&_button]:w-auto">
              <DomainRenewalsAlertButton />
            </div>
            <Link href="/clients/import-domains" className="md:contents">
              <Button variant="secondary" className="w-full border-accent/30 text-accent md:w-auto">
                Importa domini
              </Button>
            </Link>
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <Button className="col-span-2 w-full md:w-auto md:col-span-1">+ Nuovo Cliente</Button>
              </DialogTrigger>
              <DialogContent aria-describedby="new-client-desc">
                <DialogHeader>
                  <DialogTitle>Nuovo Cliente</DialogTitle>
                  <DialogDescription id="new-client-desc">Compila i campi per creare un nuovo cliente.</DialogDescription>
                </DialogHeader>
                <ClientForm
                  users={users}
                  onSuccess={() => {
                    setCreateOpen(false)
                    router.refresh()
                  }}
                />
              </DialogContent>
            </Dialog>
          </div>
        )}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block bg-dark border border-accent/20 rounded-lg overflow-hidden overflow-x-auto">
        <table className="w-full min-w-[640px]">
          <thead className="bg-accent/10">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-accent uppercase tracking-wider">
                Nome
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-accent uppercase tracking-wider">
                Contatto
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-accent uppercase tracking-wider">
                Email
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-accent uppercase tracking-wider">
                Telefono
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-accent uppercase tracking-wider">
                Assegnato a
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-accent uppercase tracking-wider">
                Azioni
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {filteredClients.map((client) => (
              <tr key={client.id} className="hover:bg-white/5">
                <td className="px-6 py-4 whitespace-nowrap text-white">{client.name}</td>
                <td className="px-6 py-4 whitespace-nowrap text-white/70">
                  {client.contactName || '-'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-white/70">
                  {client.email || '-'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-white/70">
                  {client.phone || '-'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-white/70">
                  {client.assignedTo?.name || '-'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <div className="flex items-center justify-end gap-2">
                    <Link
                      href={`/clients/${client.id}`}
                      className="text-accent hover:text-accent/80"
                    >
                      Dettagli
                    </Link>
                    {canWrite && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-400 hover:text-red-300 hover:bg-red-500/20"
                        disabled={deletingId === client.id}
                        onClick={() => handleDelete(client)}
                      >
                        {deletingId === client.id ? '...' : 'Elimina'}
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filteredClients.length === 0 && (
          <div className="p-12 text-center text-white/50">
            {search.trim() ? 'Nessun cliente corrisponde alla ricerca.' : 'Nessun cliente trovato. Crea il primo cliente!'}
          </div>
        )}
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-3">
        {filteredClients.map((client) => (
          <div
            key={client.id}
            className="rounded-xl border border-accent/20 bg-dark/80 p-4 min-w-0"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <h3 className="text-base font-semibold text-white break-words">{client.name}</h3>
                {client.contactName ? (
                  <p className="mt-1 text-sm text-white/70 break-words">{client.contactName}</p>
                ) : null}
              </div>
              {canWrite && (
                <div className="relative shrink-0">
                  <button
                    type="button"
                    aria-label="Altre azioni"
                    className="flex h-11 w-11 items-center justify-center rounded-lg text-white/60 hover:bg-white/5 hover:text-white"
                    onClick={() => setMenuOpenId((id) => (id === client.id ? null : client.id))}
                  >
                    <MoreHorizontal className="h-5 w-5" />
                  </button>
                  {menuOpenId === client.id && (
                    <div className="absolute right-0 top-11 z-20 min-w-[140px] rounded-lg border border-accent/20 bg-dark py-1 shadow-lg">
                      <button
                        type="button"
                        className="w-full px-4 py-2.5 text-left text-sm text-red-300 hover:bg-red-500/10"
                        disabled={deletingId === client.id}
                        onClick={() => handleDelete(client)}
                      >
                        {deletingId === client.id ? '...' : 'Elimina'}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
            <dl className="mt-3 space-y-1.5 text-sm">
              {client.email ? (
                <div className="flex gap-2 min-w-0">
                  <dt className="shrink-0 text-white/45">Email</dt>
                  <dd className="min-w-0 break-words text-white/80">{client.email}</dd>
                </div>
              ) : null}
              {client.phone ? (
                <div className="flex gap-2 min-w-0">
                  <dt className="shrink-0 text-white/45">Tel</dt>
                  <dd className="min-w-0 break-words text-white/80">{client.phone}</dd>
                </div>
              ) : null}
              <div className="flex gap-2 min-w-0">
                <dt className="shrink-0 text-white/45">Assegnato</dt>
                <dd className="min-w-0 break-words text-white/80">{client.assignedTo?.name || '—'}</dd>
              </div>
            </dl>
            <Link
              href={`/clients/${client.id}`}
              className="mt-4 flex min-h-[44px] items-center justify-center rounded-lg bg-accent/15 text-sm font-medium text-accent"
            >
              Dettagli
            </Link>
          </div>
        ))}
        {filteredClients.length === 0 && (
          <div className="rounded-xl border border-accent/20 p-8 text-center text-white/50">
            {search.trim() ? 'Nessun cliente corrisponde alla ricerca.' : 'Nessun cliente trovato. Crea il primo cliente!'}
          </div>
        )}
      </div>
    </div>
  )
}
