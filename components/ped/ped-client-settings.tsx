'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { upsertPedClientSetting, removePedClientSetting } from '@/app/actions/ped'

type Client = { id: string; name: string }
type Setting = { id: string; clientId: string; contentsPerWeek: number; client: { id: string; name: string } }

export function PedClientSettings({
  settings,
  clients,
  userName,
}: {
  settings: Setting[]
  clients: Client[]
  userName?: string
}) {
  const router = useRouter()
  const [adding, setAdding] = useState(false)
  const [selectedClientId, setSelectedClientId] = useState('')
  const [contentsPerWeek, setContentsPerWeek] = useState(0)
  const clientIdsInPed = new Set(settings.map((s) => s.clientId))
  const availableClients = clients.filter((c) => !clientIdsInPed.has(c.id))

  const handleAdd = async () => {
    if (!selectedClientId) return
    try {
      await upsertPedClientSetting(selectedClientId, contentsPerWeek)
      setSelectedClientId('')
      setContentsPerWeek(0)
      setAdding(false)
      router.refresh()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Errore')
    }
  }

  const handleUpdate = async (clientId: string, value: number) => {
    try {
      await upsertPedClientSetting(clientId, value)
      router.refresh()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Errore')
    }
  }

  const handleRemove = async (clientId: string) => {
    if (!confirm('Rimuovere questo cliente dal PED?')) return
    try {
      await removePedClientSetting(clientId)
      router.refresh()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Errore')
    }
  }

  const totalTarget = settings.reduce((s, x) => s + x.contentsPerWeek, 0)

  return (
    <div className="bg-dark border border-accent/20 rounded-xl p-4 mb-6">
      <h2 className="text-lg font-semibold text-white mb-3">
        {userName ? `Clienti del PED di ${userName}` : 'Clienti nel PED'}
      </h2>
      <ul className="space-y-2 mb-3">
        {settings.map((s) => (
          <li key={s.id} className="flex items-center gap-3 flex-wrap">
            <span className="text-white min-w-[220px] shrink-0">{s.client.name}</span>
            <input
              type="number"
              min={0}
              value={s.contentsPerWeek}
              onChange={(e) => handleUpdate(s.clientId, parseInt(e.target.value, 10) || 0)}
              className="w-20 px-2 py-1 bg-dark border border-accent/20 rounded text-white text-sm"
            />
            <span className="text-white/60 text-sm">contenuti/mese</span>
            <Button variant="ghost" size="sm" onClick={() => handleRemove(s.clientId)} className="text-red-400">
              Rimuovi
            </Button>
          </li>
        ))}
      </ul>
      {adding ? (
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-white/10">
          <select
            value={selectedClientId}
            onChange={(e) => setSelectedClientId(e.target.value)}
            className="px-2 py-1 bg-dark border border-accent/20 rounded text-white text-sm"
          >
            <option value="">Seleziona cliente</option>
            {availableClients.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <input
            type="number"
            min={0}
            value={contentsPerWeek}
            onChange={(e) => setContentsPerWeek(parseInt(e.target.value, 10) || 0)}
            placeholder="N/mese"
            className="w-20 px-2 py-1 bg-dark border border-accent/20 rounded text-white text-sm"
          />
          <Button size="sm" onClick={handleAdd}>Aggiungi</Button>
          <Button variant="ghost" size="sm" onClick={() => setAdding(false)}>Annulla</Button>
        </div>
      ) : (
        <Button size="sm" variant="secondary" onClick={() => setAdding(true)} disabled={availableClients.length === 0}>
          + Aggiungi cliente
        </Button>
      )}
      {settings.length > 0 && (
        <p className="text-white/50 text-sm mt-2">Totale contenuti/mese pianificati: {totalTarget}</p>
      )}
    </div>
  )
}
