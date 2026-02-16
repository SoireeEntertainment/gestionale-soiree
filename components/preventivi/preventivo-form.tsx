'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createPreventivo } from '@/app/actions/preventivi'
import { Button } from '@/components/ui/button'

interface PreventivoFormProps {
  clients: { id: string; name: string }[]
  clientId?: string
  preventivo?: {
    title: string
    clientId: string
    notes?: string | null
    items: { description: string; quantity: number; unitPrice: number }[]
  }
  onSuccess?: () => void
}

export function PreventivoForm({
  clients,
  clientId: initialClientId,
  preventivo,
  onSuccess,
}: PreventivoFormProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [title, setTitle] = useState(preventivo?.title ?? '')
  const [selectedClientId, setSelectedClientId] = useState(
    preventivo?.clientId ?? initialClientId ?? (clients[0]?.id ?? '')
  )
  const [notes, setNotes] = useState(preventivo?.notes ?? '')
  const [items, setItems] = useState<
    { description: string; quantity: number; unitPrice: number }[]
  >(
    preventivo?.items?.length
      ? preventivo.items.map((i) => ({
          description: i.description,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
        }))
      : [{ description: '', quantity: 1, unitPrice: 0 }]
  )

  const addRow = () => {
    setItems([...items, { description: '', quantity: 1, unitPrice: 0 }])
  }

  const removeRow = (index: number) => {
    if (items.length <= 1) return
    setItems(items.filter((_, i) => i !== index))
  }

  const updateItem = (index: number, field: string, value: string | number) => {
    const next = [...items]
    next[index] = { ...next[index], [field]: value }
    setItems(next)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedClientId || !title.trim()) return
    setLoading(true)
    try {
      const validItems = items.filter((i) => i.description.trim())
      await createPreventivo({
        clientId: selectedClientId,
        title: title.trim(),
        type: 'GENERATED',
        status: 'BOZZA',
        notes: notes.trim() || undefined,
        items: validItems.length
          ? validItems.map((i) => ({
              description: i.description.trim(),
              quantity: Number(i.quantity) || 0,
              unitPrice: Number(i.unitPrice) || 0,
            }))
          : [],
      })
      router.refresh()
      onSuccess?.()
      if (!onSuccess) router.push('/preventivi')
    } catch (err) {
      console.error(err)
      alert('Errore nel salvataggio')
    } finally {
      setLoading(false)
    }
  }

  const total = items.reduce(
    (sum, i) => sum + (Number(i.quantity) || 0) * (Number(i.unitPrice) || 0),
    0
  )

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-white mb-1">Cliente *</label>
        <select
          value={selectedClientId}
          onChange={(e) => setSelectedClientId(e.target.value)}
          required
          className="w-full px-3 py-2 bg-dark border border-accent/20 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-accent"
        >
          <option value="">Seleziona cliente</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-white mb-1">Titolo *</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          className="w-full px-3 py-2 bg-dark border border-accent/20 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-accent"
          placeholder="Es. Preventivo sito web 2025"
        />
      </div>

      <div>
        <div className="flex justify-between items-center mb-2">
          <label className="block text-sm font-medium text-white">Righe preventivo</label>
          <Button type="button" variant="ghost" size="sm" onClick={addRow}>
            + Aggiungi riga
          </Button>
        </div>
        <div className="border border-accent/20 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-accent/10">
              <tr>
                <th className="px-3 py-2 text-left text-accent">Descrizione</th>
                <th className="px-3 py-2 text-right text-accent w-24">Qtà</th>
                <th className="px-3 py-2 text-right text-accent w-28">Prezzo unit.</th>
                <th className="px-3 py-2 w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {items.map((item, i) => (
                <tr key={i}>
                  <td className="px-3 py-2">
                    <input
                      type="text"
                      value={item.description}
                      onChange={(e) => updateItem(i, 'description', e.target.value)}
                      className="w-full px-2 py-1 bg-dark border border-accent/20 rounded text-white text-sm"
                      placeholder="Descrizione"
                    />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={item.quantity}
                      onChange={(e) => updateItem(i, 'quantity', e.target.value)}
                      className="w-full px-2 py-1 bg-dark border border-accent/20 rounded text-white text-sm text-right"
                    />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      value={item.unitPrice}
                      onChange={(e) => updateItem(i, 'unitPrice', e.target.value)}
                      className="w-full px-2 py-1 bg-dark border border-accent/20 rounded text-white text-sm text-right"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeRow(i)}
                      disabled={items.length <= 1}
                    >
                      ×
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-2 text-right text-accent font-medium">
          Totale: € {total.toFixed(2)}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-white mb-1">Note</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="w-full px-3 py-2 bg-dark border border-accent/20 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-accent"
        />
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={() => router.back()}>
          Annulla
        </Button>
        <Button type="submit" disabled={loading}>
          {loading ? 'Salvataggio...' : 'Salva preventivo'}
        </Button>
      </div>
    </form>
  )
}
