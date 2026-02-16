'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Category } from '@prisma/client'
import { createCategory, updateCategory } from '@/app/actions/categories'
import { Button } from '@/components/ui/button'

interface CategoryFormProps {
  category?: Category
  onSuccess?: () => void
}

export function CategoryForm({ category, onSuccess }: CategoryFormProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    name: category?.name || '',
    description: category?.description || '',
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      if (category) {
        await updateCategory(category.id, formData)
      } else {
        await createCategory(formData)
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
          Descrizione
        </label>
        <textarea
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          rows={4}
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
          {loading ? 'Salvataggio...' : category ? 'Salva Modifiche' : 'Crea Categoria'}
        </Button>
      </div>
    </form>
  )
}

