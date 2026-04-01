'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Work, Client, Category, User } from '@prisma/client'
import { createWork, updateWork } from '@/app/actions/works'
import { createClient } from '@/app/actions/clients'
import { Button } from '@/components/ui/button'
import { UserSelect } from '@/components/ui/user-select'

interface WorkFormProps {
  work?: Work & { client: Client; category: Category; assignedTo?: User | null }
  clients: Client[]
  categories: Category[]
  users: User[]
  clientId?: string
  categoryId?: string
  onSuccess?: () => void
}

export function WorkForm({ work, clients, categories, users, clientId: initialClientId, categoryId: initialCategoryId, onSuccess }: WorkFormProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [clientOptions, setClientOptions] = useState<Client[]>(clients)
  const [showNewClient, setShowNewClient] = useState(false)
  const [newClientName, setNewClientName] = useState('')
  const [creatingClient, setCreatingClient] = useState(false)

  useEffect(() => {
    setClientOptions(clients)
  }, [clients])

  const [formData, setFormData] = useState({
    title: work?.title || '',
    description: work?.description || '',
    clientId: work?.clientId || initialClientId || '',
    categoryId: work?.categoryId || initialCategoryId || '',
    status: work?.status || 'TODO',
    priority: work?.priority || '',
    deadline: work?.deadline
      ? new Date(work.deadline).toISOString().slice(0, 10)
      : '',
    assignedToUserId: work?.assignedToUserId || null,
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const data = {
        ...formData,
        deadline: formData.deadline || undefined,
        priority: formData.priority || undefined,
      }

      if (work) {
        await updateWork(work.id, data)
      } else {
        await createWork(data)
      }
      router.refresh()
      onSuccess?.()
    } catch (error) {
      console.error('Error:', error)
      alert('Errore nel salvataggio')
    } finally {
      setLoading(false)
    }
  }

  const handleCreateClientInline = async () => {
    const name = newClientName.trim()
    if (!name) {
      alert('Inserisci il nome del cliente')
      return
    }
    setCreatingClient(true)
    try {
      const res = await createClient({ name })
      if (res.client) {
        setClientOptions((prev) => [...prev, res.client])
        setFormData((fd) => ({ ...fd, clientId: res.client.id }))
        setNewClientName('')
        setShowNewClient(false)
        router.refresh()
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Errore nella creazione del cliente')
    } finally {
      setCreatingClient(false)
    }
  }

  /** Solo creazione lavoro senza cliente già fissato (es. /works), non dalla scheda cliente */
  const canQuickCreateClient = !work && !initialClientId

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-white mb-1">
          Titolo *
        </label>
        <input
          type="text"
          required
          value={formData.title}
          onChange={(e) => setFormData({ ...formData, title: e.target.value })}
          className="w-full px-3 py-2 bg-dark border border-accent/20 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-accent"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-white mb-1">
            Cliente *
          </label>
          <select
            required
            value={formData.clientId}
            onChange={(e) => {
              const v = e.target.value
              if (v === '__new__') {
                setShowNewClient(true)
                return
              }
              setFormData({ ...formData, clientId: v })
            }}
            className="w-full px-3 py-2 bg-dark border border-accent/20 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-accent"
          >
            <option value="">Seleziona cliente</option>
            {clientOptions.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name}
              </option>
            ))}
            {canQuickCreateClient && (
              <option value="__new__">+ Nuovo cliente…</option>
            )}
          </select>
          {canQuickCreateClient && (
            <div className="mt-2 space-y-2">
              {showNewClient && (
                <div className="flex flex-col gap-2 rounded-md border border-accent/20 bg-dark/80 p-3">
                  <label className="text-xs text-white/70">Nome nuovo cliente</label>
                  <div className="flex flex-wrap gap-2">
                    <input
                      type="text"
                      value={newClientName}
                      onChange={(e) => setNewClientName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          void handleCreateClientInline()
                        }
                      }}
                      placeholder="Es. Studio Rossi"
                      className="min-w-[12rem] flex-1 px-3 py-2 bg-dark border border-accent/20 rounded-md text-white text-sm focus:outline-none focus:ring-2 focus:ring-accent"
                    />
                    <Button
                      type="button"
                      size="sm"
                      disabled={creatingClient}
                      onClick={() => void handleCreateClientInline()}
                    >
                      {creatingClient ? 'Creazione…' : 'Crea e seleziona'}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={creatingClient}
                      onClick={() => {
                        setShowNewClient(false)
                        setNewClientName('')
                      }}
                    >
                      Annulla
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-white mb-1">
            Categoria *
          </label>
          <select
            required
            value={formData.categoryId}
            onChange={(e) => setFormData({ ...formData, categoryId: e.target.value })}
            className="w-full px-3 py-2 bg-dark border border-accent/20 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-accent"
          >
            <option value="">Seleziona categoria</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-white mb-1">
          Descrizione
        </label>
        <textarea
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          rows={4}
          className="w-full px-3 py-2 bg-dark border border-accent/20 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-accent"
        />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium text-white mb-1">
            Stato
          </label>
          <select
            value={formData.status}
            onChange={(e) => setFormData({ ...formData, status: e.target.value })}
            className="w-full px-3 py-2 bg-dark border border-accent/20 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-accent"
          >
            <option value="TODO">Da Fare</option>
            <option value="IN_PROGRESS">In Corso</option>
            <option value="IN_REVIEW">In Revisione</option>
            <option value="WAITING_CLIENT">Attesa Cliente</option>
            <option value="DONE">Completato</option>
            <option value="PAUSED">In Pausa</option>
            <option value="CANCELED">Annullato</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-white mb-1">
            Priorità
          </label>
          <select
            value={formData.priority}
            onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
            className="w-full px-3 py-2 bg-dark border border-accent/20 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-accent"
          >
            <option value="">Nessuna</option>
            <option value="LOW">Bassa</option>
            <option value="MEDIUM">Media</option>
            <option value="HIGH">Alta</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-white mb-1">
            Scadenza
          </label>
          <input
            type="date"
            value={formData.deadline}
            onChange={(e) => setFormData({ ...formData, deadline: e.target.value })}
            className="w-full px-3 py-2 bg-dark border border-accent/20 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-accent [color-scheme:dark]"
          />
        </div>
      </div>

      <div>
        <UserSelect
          users={users}
          value={formData.assignedToUserId}
          onChange={(value) => setFormData({ ...formData, assignedToUserId: value })}
          label="Assegnato a"
        />
      </div>

      <div className="flex justify-end space-x-2 pt-4">
        <Button
          type="button"
          variant="ghost"
          onClick={onSuccess}
          disabled={loading}
        >
          Annulla
        </Button>
        <Button type="submit" disabled={loading}>
          {loading ? 'Salvataggio...' : work ? 'Salva Modifiche' : 'Crea Lavoro'}
        </Button>
      </div>
    </form>
  )
}

