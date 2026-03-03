'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { upsertPedClientSetting, removePedClientSetting, createPreset10ForWeek } from '@/app/actions/ped'
import { PED_PLATFORMS } from '@/lib/validations'
import { showToast } from '@/lib/toast'

const SAVE_DEBOUNCE_MS = 600
const PLATFORM_LABELS: Record<string, string> = { INSTAGRAM: 'Instagram', LINKEDIN: 'LinkedIn', TIKTOK: 'TikTok' }

type Client = { id: string; name: string }
type Setting = { id: string; clientId: string; contentsPerWeek: number; platforms?: string[]; client: { id: string; name: string } }

export function PedClientSettings({
  settings,
  clients,
  userName,
  readOnly = false,
}: {
  settings: Setting[]
  clients: Client[]
  userName?: string
  readOnly?: boolean
}) {
  const router = useRouter()
  const [adding, setAdding] = useState(false)
  const [selectedClientId, setSelectedClientId] = useState('')
  const [contentsPerWeek, setContentsPerWeek] = useState(0)
  const [draftByClientId, setDraftByClientId] = useState<Record<string, number>>({})
  const [editingClientId, setEditingClientId] = useState<string | null>(null)
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const clientIdsInPed = new Set(settings.map((s) => s.clientId))
  const availableClients = clients.filter((c) => !clientIdsInPed.has(c.id))

  const saveDraft = useCallback(
    async (clientId: string, value: number, platforms?: string[]) => {
      setEditingClientId(null)
      try {
        await upsertPedClientSetting(clientId, Math.max(0, Math.floor(value)), platforms)
        setDraftByClientId((prev) => {
          const next = { ...prev }
          delete next[clientId]
          return next
        })
        router.refresh()
      } catch (e) {
        alert(e instanceof Error ? e.message : 'Errore')
      }
    },
    [router]
  )

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    }
  }, [])

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

  const handleUpdate = useCallback(
    (clientId: string, value: number, currentPlatforms?: string[]) => {
      const safe = Math.max(0, Math.floor(Number(value)) || 0)
      setDraftByClientId((prev) => ({ ...prev, [clientId]: safe }))
      setEditingClientId(clientId)
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
      saveTimeoutRef.current = setTimeout(() => {
        saveTimeoutRef.current = null
        saveDraft(clientId, safe, currentPlatforms)
      }, SAVE_DEBOUNCE_MS)
    },
    [saveDraft]
  )

  const handleStepper = useCallback(
    (clientId: string, delta: number) => {
      const setting = settings.find((s) => s.clientId === clientId)
      const current = editingClientId === clientId ? draftByClientId[clientId] : setting?.contentsPerWeek ?? 0
      const next = Math.max(0, (current ?? 0) + delta)
      handleUpdate(clientId, next, setting?.platforms)
    },
    [settings, editingClientId, draftByClientId, handleUpdate]
  )

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
        {settings.map((s) => {
          const isEditing = editingClientId === s.clientId
          const displayValue = isEditing && draftByClientId[s.clientId] !== undefined ? draftByClientId[s.clientId] : s.contentsPerWeek
          return (
            <li key={s.id} className="flex items-center gap-3 flex-wrap">
              <span className="text-white min-w-[220px] shrink-0">{s.client.name}</span>
              {readOnly ? (
                <span className="text-white/80 text-sm">{s.contentsPerWeek} contenuti/mese</span>
              ) : (
                <>
                  <div className="flex items-center gap-0 rounded overflow-hidden border border-accent/20">
                    <button
                      type="button"
                      aria-label="Diminuisci"
                      className="w-8 h-8 flex items-center justify-center bg-dark hover:bg-white/10 text-white text-lg leading-none"
                      onClick={() => handleStepper(s.clientId, -1)}
                    >
                      −
                    </button>
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={displayValue}
                      onChange={(e) => handleUpdate(s.clientId, e.target.value === '' ? 0 : parseInt(e.target.value, 10), s.platforms)}
                      className="w-16 px-2 py-1 bg-dark text-white text-sm text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    <button
                      type="button"
                      aria-label="Aumenta"
                      className="w-8 h-8 flex items-center justify-center bg-dark hover:bg-white/10 text-white text-lg leading-none"
                      onClick={() => handleStepper(s.clientId, 1)}
                    >
                      +
                    </button>
                  </div>
                  <span className="text-white/60 text-sm">contenuti/mese</span>
                  <div className="flex items-center gap-2 flex-wrap">
                    {PED_PLATFORMS.map((pf) => {
                      const checked = (s.platforms ?? ['INSTAGRAM']).includes(pf)
                      return (
                        <label key={pf} className="flex items-center gap-1 text-white/80 text-xs cursor-pointer">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={async () => {
                              const next = checked
                                ? (s.platforms ?? ['INSTAGRAM']).filter((x) => x !== pf)
                                : [...(s.platforms ?? ['INSTAGRAM']), pf]
                              if (next.length === 0) return
                              try {
                                await upsertPedClientSetting(s.clientId, s.contentsPerWeek, next)
                                router.refresh()
                              } catch (e) {
                                alert(e instanceof Error ? e.message : 'Errore')
                              }
                            }}
                            className="rounded border-white/50"
                          />
                          {PLATFORM_LABELS[pf] ?? pf}
                        </label>
                      )
                    })}
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="text-accent border-accent/40"
                    onClick={async () => {
                      const { created, error } = await createPreset10ForWeek(s.clientId)
                      if (error) alert(error)
                      else if (created > 0) { showToast(`${created} task create per questa settimana`, 'success'); router.refresh(); }
                      else showToast('Nessuna nuova task: la settimana ha già 10 slot.')
                    }}
                  >
                    Preset 10/sett
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => handleRemove(s.clientId)} className="text-red-400">
                    Rimuovi
                  </Button>
                </>
              )}
            </li>
          )
        })}
      </ul>
      {!readOnly && (adding ? (
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
      ))}
      {settings.length > 0 && (
        <p className="text-white/50 text-sm mt-2">Totale contenuti/mese pianificati: {totalTarget}</p>
      )}
    </div>
  )
}
