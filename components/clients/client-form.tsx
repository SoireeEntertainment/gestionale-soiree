'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Client, User } from '@prisma/client'
import { createClient, updateClient } from '@/app/actions/clients'
import { Button } from '@/components/ui/button'
import { UserSelect } from '@/components/ui/user-select'

interface ClientFormProps {
  client?: Client & { assignedTo?: User | null }
  users: User[]
  onSuccess?: () => void
}

export function ClientForm({ client, users, onSuccess }: ClientFormProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    name: client?.name || '',
    contactName: client?.contactName || '',
    email: client?.email || '',
    phone: client?.phone || '',
    notes: client?.notes || '',
    assignedToUserId: client?.assignedToUserId || null,
    metaBusinessSuiteUrl: (client as { metaBusinessSuiteUrl?: string | null })?.metaBusinessSuiteUrl ?? '',
    gestioneInserzioniUrl: (client as { gestioneInserzioniUrl?: string | null })?.gestioneInserzioniUrl ?? '',
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      if (client) {
        await updateClient(client.id, formData)
      } else {
        await createClient(formData)
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
          Nome *
        </label>
        <input
          type="text"
          required
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          className="w-full px-3 py-2 bg-dark border border-accent/20 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-accent"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-white mb-1">
          Contatto
        </label>
        <input
          type="text"
          value={formData.contactName}
          onChange={(e) => setFormData({ ...formData, contactName: e.target.value })}
          className="w-full px-3 py-2 bg-dark border border-accent/20 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-accent"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-white mb-1">
          Email
        </label>
        <input
          type="email"
          value={formData.email}
          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
          className="w-full px-3 py-2 bg-dark border border-accent/20 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-accent"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-white mb-1">
          Telefono
        </label>
        <input
          type="tel"
          value={formData.phone}
          onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
          className="w-full px-3 py-2 bg-dark border border-accent/20 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-accent"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-white mb-1">
          Note
        </label>
        <textarea
          value={formData.notes}
          onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
          rows={4}
          className="w-full px-3 py-2 bg-dark border border-accent/20 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-accent"
        />
      </div>

      <div>
        <UserSelect
          users={users}
          value={formData.assignedToUserId}
          onChange={(value) => setFormData({ ...formData, assignedToUserId: value })}
          label="Assegnato a"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-white mb-1">
          Link Business Suite
        </label>
        <input
          type="url"
          placeholder="https://business.facebook.com/..."
          value={formData.metaBusinessSuiteUrl}
          onChange={(e) => setFormData({ ...formData, metaBusinessSuiteUrl: e.target.value })}
          className="w-full px-3 py-2 bg-dark border border-accent/20 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-accent"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-white mb-1">
          Link Gestione Inserzioni
        </label>
        <input
          type="url"
          placeholder="https://..."
          value={formData.gestioneInserzioniUrl}
          onChange={(e) => setFormData({ ...formData, gestioneInserzioniUrl: e.target.value })}
          className="w-full px-3 py-2 bg-dark border border-accent/20 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-accent"
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
          {loading ? 'Salvataggio...' : client ? 'Salva Modifiche' : 'Crea Cliente'}
        </Button>
      </div>
    </form>
  )
}

