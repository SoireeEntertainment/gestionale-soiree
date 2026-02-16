'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Client, User } from '@prisma/client'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { ClientForm } from './client-form'
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

  const filteredClients = useMemo(
    () => clients.filter((c) => matchSearch(c, search)),
    [clients, search]
  )

  const handleDelete = async (client: Client) => {
    if (!confirm(`Eliminare il cliente "${client.name}"? Verranno eliminati anche lavori, preventivi e dati collegati.`)) return
    setDeletingId(client.id)
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
      <div className="flex flex-wrap items-center gap-4 mb-4">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cerca per nome, contatto, email, telefono..."
          className="flex-1 min-w-[200px] px-3 py-2 bg-dark border border-accent/20 rounded text-white placeholder-white/40"
        />
        {canWrite && (
          <Dialog>
            <DialogTrigger asChild>
              <Button>+ Nuovo Cliente</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Nuovo Cliente</DialogTitle>
              </DialogHeader>
              <ClientForm users={users} />
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="bg-dark border border-accent/20 rounded-lg overflow-hidden overflow-x-auto">
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
    </div>
  )
}
