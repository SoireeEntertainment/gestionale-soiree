'use client'

import { useState, useEffect, useRef } from 'react'
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
  const lockedClient = Boolean(initialClientId)
  const [loading, setLoading] = useState(false)
  const [title, setTitle] = useState(preventivo?.title ?? '')
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

  const [clientSearch, setClientSearch] = useState('')
  const [selectedClientId, setSelectedClientId] = useState('')
  const [clientDropdownOpen, setClientDropdownOpen] = useState(false)
  const [addAsClient, setAddAsClient] = useState(false)
  const clientComboboxRef = useRef<HTMLDivElement>(null)

  const lockedClientName = initialClientId
    ? clients.find((c) => c.id === initialClientId)?.name ?? 'Cliente'
    : ''

  const filteredClients = clientSearch.trim()
    ? clients.filter((c) => c.name.toLowerCase().includes(clientSearch.toLowerCase()))
    : clients
  const exactMatch = clients.find((c) => c.name.toLowerCase() === clientSearch.trim().toLowerCase())
  const isProspectName =
    !lockedClient &&
    Boolean(clientSearch.trim()) &&
    !selectedClientId &&
    !exactMatch

  useEffect(() => {
    if (lockedClient || !clientDropdownOpen) return
    function onDocMouseDown(e: MouseEvent) {
      if (clientComboboxRef.current?.contains(e.target as Node)) return
      setClientDropdownOpen(false)
    }
    document.addEventListener('mousedown', onDocMouseDown)
    return () => document.removeEventListener('mousedown', onDocMouseDown)
  }, [lockedClient, clientDropdownOpen])

  const handleSelectClient = (c: { id: string; name: string }) => {
    setSelectedClientId(c.id)
    setClientSearch(c.name)
    setClientDropdownOpen(false)
    setAddAsClient(false)
  }

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

  const buildItemsPayload = () => {
    const validItems = items.filter((i) => i.description.trim())
    return validItems.length
      ? validItems.map((i) => ({
          description: i.description.trim(),
          quantity: Number(i.quantity) || 0,
          unitPrice: Number(i.unitPrice) || 0,
        }))
      : []
  }

  const syncSelectionFromSearch = (v: string) => {
    if (!v.trim()) {
      setSelectedClientId('')
      return
    }
    setSelectedClientId((prev) => {
      if (!prev) return prev
      const sel = clients.find((c) => c.id === prev)
      if (sel && v.trim().toLowerCase() !== sel.name.toLowerCase()) return ''
      return prev
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return

    let payload: Parameters<typeof createPreventivo>[0]

    if (lockedClient && initialClientId) {
      payload = {
        clientId: initialClientId,
        title: title.trim(),
        type: 'GENERATED',
        status: 'BOZZA',
        notes: notes.trim() || undefined,
        items: buildItemsPayload(),
      }
    } else {
      const t = clientSearch.trim()
      let finalClientId = selectedClientId
      if (!finalClientId && t) {
        const ex = clients.find((c) => c.name.toLowerCase() === t.toLowerCase())
        if (ex) finalClientId = ex.id
      }

      if (finalClientId) {
        payload = {
          clientId: finalClientId,
          title: title.trim(),
          type: 'GENERATED',
          status: 'BOZZA',
          notes: notes.trim() || undefined,
          items: buildItemsPayload(),
        }
      } else if (t) {
        payload = {
          prospectName: t,
          addAsClient,
          title: title.trim(),
          type: 'GENERATED',
          status: 'BOZZA',
          notes: notes.trim() || undefined,
          items: buildItemsPayload(),
        }
      } else {
        alert('Seleziona un cliente dall’elenco o indica un nome (anche non in anagrafica).')
        return
      }
    }

    setLoading(true)
    try {
      await createPreventivo(payload)
      router.refresh()
      onSuccess?.()
      if (!onSuccess) router.push('/preventivi')
    } catch (err) {
      console.error(err)
      alert(err instanceof Error ? err.message : 'Errore nel salvataggio')
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
        {lockedClient ? (
          <div className="w-full px-3 py-2 bg-dark/60 border border-accent/20 rounded-md text-white/90">
            {lockedClientName}
          </div>
        ) : (
          <>
            <div className="relative" ref={clientComboboxRef}>
              <input
                type="text"
                value={clientSearch}
                onChange={(e) => {
                  const v = e.target.value
                  setClientSearch(v)
                  setClientDropdownOpen(true)
                  syncSelectionFromSearch(v)
                }}
                onFocus={() => setClientDropdownOpen(true)}
                placeholder="Cerca in anagrafica o scrivi il nome del destinatario"
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
                        selectedClientId === c.id ? 'text-accent' : 'text-white'
                      }`}
                    >
                      {c.name}
                    </button>
                  ))}
                  {filteredClients.length === 0 && clientSearch.trim() && (
                    <div className="px-3 py-2 text-sm text-white/50">Nessun risultato in anagrafica</div>
                  )}
                </div>
              )}
            </div>
            {isProspectName && (
              <label className="mt-3 flex items-start gap-3 cursor-pointer text-sm text-white/90">
                <input
                  type="checkbox"
                  checked={addAsClient}
                  onChange={(e) => setAddAsClient(e.target.checked)}
                  className="mt-1 rounded border-accent/40"
                />
                <span>
                  Aggiungi come nuovo cliente in anagrafica (se deselezioni, il preventivo resta solo col nome
                  indicato, senza scheda cliente)
                </span>
              </label>
            )}
          </>
        )}
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
        <div className="mt-2 text-right text-accent font-medium">Totale: € {total.toFixed(2)}</div>
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
