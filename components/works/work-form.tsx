'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Work, Client, Category, User } from '@prisma/client'
import { createWork, updateWork } from '@/app/actions/works'
import { createClient } from '@/app/actions/clients'
import { Button } from '@/components/ui/button'
import { UserSelect } from '@/components/ui/user-select'
import { showToast } from '@/lib/toast'

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
  const [creatingClient, setCreatingClient] = useState(false)
  const [clientSearch, setClientSearch] = useState('')
  const [clientDropdownOpen, setClientDropdownOpen] = useState(false)
  const clientComboboxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setClientOptions(clients)
  }, [clients])

  const buildInitialFormData = () => ({
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
  const [formData, setFormData] = useState(buildInitialFormData)

  /** Solo creazione lavoro senza cliente già fissato (es. /works), non dalla scheda cliente */
  const canQuickCreateClient = !work && !initialClientId

  const filteredClients = clientSearch.trim()
    ? clientOptions.filter((c) => c.name.toLowerCase().includes(clientSearch.toLowerCase()))
    : clientOptions
  const exactMatch = clientOptions.find((c) => c.name.toLowerCase() === clientSearch.trim().toLowerCase())
  const showCreateClientOption = Boolean(clientSearch.trim()) && !exactMatch

  useEffect(() => {
    if (!canQuickCreateClient || !clientDropdownOpen) return
    function onDocMouseDown(e: MouseEvent) {
      if (clientComboboxRef.current?.contains(e.target as Node)) return
      setClientDropdownOpen(false)
    }
    document.addEventListener('mousedown', onDocMouseDown)
    return () => document.removeEventListener('mousedown', onDocMouseDown)
  }, [canQuickCreateClient, clientDropdownOpen])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (loading) return
    if (canQuickCreateClient && !formData.clientId) {
      showToast('Seleziona un cliente dall’elenco o creane uno nuovo con il nome che hai digitato.', 'error')
      return
    }
    setLoading(true)

    try {
      const data = {
        ...formData,
        deadline: formData.deadline || undefined,
        priority: formData.priority || undefined,
      }

      if (work) {
        await updateWork(work.id, data)
        showToast('Lavoro aggiornato con successo', 'success')
      } else {
        await createWork(data)
        showToast('Lavoro creato con successo', 'success')
        setFormData(buildInitialFormData())
        setClientSearch('')
        setClientDropdownOpen(false)
      }
      router.refresh()
      onSuccess?.()
    } catch (error) {
      const msg = error instanceof Error
        ? error.message
        : (work ? 'Errore durante il salvataggio del lavoro' : 'Errore durante la creazione del lavoro')
      showToast(msg, 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleCreateClientFromSearch = async () => {
    const name = clientSearch.trim()
    if (!name) {
      showToast('Inserisci il nome del nuovo cliente', 'error')
      return
    }
    setCreatingClient(true)
    try {
      const res = await createClient({ name })
      if (res.client) {
        setClientOptions((prev) => [...prev, res.client])
        setFormData((fd) => ({ ...fd, clientId: res.client.id }))
        setClientSearch(res.client.name)
        setClientDropdownOpen(false)
        router.refresh()
      }
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Errore nella creazione del cliente', 'error')
    } finally {
      setCreatingClient(false)
    }
  }

  const handleSelectClient = (c: Client) => {
    setFormData((fd) => ({ ...fd, clientId: c.id }))
    setClientSearch(c.name)
    setClientDropdownOpen(false)
  }

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
          {canQuickCreateClient ? (
            <div className="relative" ref={clientComboboxRef}>
              <input
                type="text"
                value={clientSearch}
                onChange={(e) => {
                  const v = e.target.value
                  setClientSearch(v)
                  setClientDropdownOpen(true)
                  setFormData((fd) => {
                    if (!v.trim()) return { ...fd, clientId: '' }
                    const sel = fd.clientId ? clientOptions.find((c) => c.id === fd.clientId) : null
                    if (sel && v.trim().toLowerCase() !== sel.name.toLowerCase()) {
                      return { ...fd, clientId: '' }
                    }
                    return fd
                  })
                }}
                onFocus={() => setClientDropdownOpen(true)}
                placeholder="Cerca cliente o scrivi un nome per crearne uno nuovo"
                autoComplete="off"
                className="w-full px-3 py-2 bg-dark border border-accent/20 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-accent"
              />
              {clientDropdownOpen && (
                <div className="absolute z-30 top-full left-0 right-0 mt-1 max-h-52 overflow-y-auto rounded-md border border-accent/20 bg-dark shadow-lg">
                  {filteredClients.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault()
                        handleSelectClient(c)
                      }}
                      className={`block w-full text-left px-3 py-2 text-sm hover:bg-accent/10 ${
                        formData.clientId === c.id ? 'text-accent' : 'text-white'
                      }`}
                    >
                      {c.name}
                    </button>
                  ))}
                  {showCreateClientOption && (
                    <button
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault()
                        void handleCreateClientFromSearch()
                      }}
                      disabled={creatingClient}
                      className="block w-full text-left px-3 py-2 text-sm text-accent hover:bg-accent/10 border-t border-white/10 disabled:opacity-50"
                    >
                      {creatingClient ? 'Creazione…' : `➕ Crea cliente “${clientSearch.trim()}”`}
                    </button>
                  )}
                  {filteredClients.length === 0 && !showCreateClientOption && clientSearch.trim() && (
                    <div className="px-3 py-2 text-sm text-white/50">Nessun cliente trovato</div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <select
              required
              value={formData.clientId}
              onChange={(e) => setFormData({ ...formData, clientId: e.target.value })}
              className="w-full px-3 py-2 bg-dark border border-accent/20 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-accent"
            >
              <option value="">Seleziona cliente</option>
              {clientOptions.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                </option>
              ))}
            </select>
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
          {loading ? (work ? 'Salvataggio...' : 'Creazione...') : work ? 'Salva Modifiche' : 'Crea Lavoro'}
        </Button>
      </div>
    </form>
  )
}

