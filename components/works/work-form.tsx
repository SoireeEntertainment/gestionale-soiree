'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Work, Client, Category, User } from '@prisma/client'
import { createWork, updateWork } from '@/app/actions/works'
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

  const [formData, setFormData] = useState({
    title: work?.title || '',
    description: work?.description || '',
    clientId: work?.clientId || initialClientId || '',
    categoryId: work?.categoryId || initialCategoryId || '',
    status: work?.status || 'TODO',
    priority: work?.priority || '',
    deadline: work?.deadline
      ? new Date(work.deadline).toISOString().slice(0, 16)
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
            onChange={(e) => setFormData({ ...formData, clientId: e.target.value })}
            className="w-full px-3 py-2 bg-dark border border-accent/20 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-accent"
          >
            <option value="">Seleziona cliente</option>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name}
              </option>
            ))}
          </select>
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
            type="datetime-local"
            value={formData.deadline}
            onChange={(e) => setFormData({ ...formData, deadline: e.target.value })}
            className="w-full px-3 py-2 bg-dark border border-accent/20 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-accent"
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

