'use client'

import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { upsertPedClientSetting, removePedClientSetting, fillPedMonthForClient } from '@/app/actions/ped'
import { showToast } from '@/lib/toast'
import {
  DEFAULT_PED_CLIENT_SORT,
  isPedClientSort,
  PED_CLIENT_SORT_OPTIONS,
  PED_CLIENT_SORT_STORAGE_KEY,
  sortPedClients,
  type PedClientSort,
} from '@/lib/ped-client-sort'

const SAVE_DEBOUNCE_MS = 600

const WEEKDAY_CHIPS: { iso: number; label: string }[] = [
  { iso: 1, label: 'Lun' },
  { iso: 2, label: 'Mar' },
  { iso: 3, label: 'Mer' },
  { iso: 4, label: 'Gio' },
  { iso: 5, label: 'Ven' },
  { iso: 6, label: 'Sab' },
  { iso: 7, label: 'Dom' },
]

type Client = { id: string; name: string }
type Setting = {
  id: string
  clientId: string
  contentsPerWeek: number
  publishingWeekdays?: number[]
  platforms?: string[]
  client: { id: string; name: string }
}

export function PedClientSettings({
  settings,
  clients,
  userName,
  readOnly = false,
  year,
  month,
  onDataMutated,
}: {
  settings: Setting[]
  clients: Client[]
  userName?: string
  readOnly?: boolean
  year?: number
  month?: number
  onDataMutated?: () => void
}) {
  const router = useRouter()
  const afterMutate = useCallback(() => {
    if (onDataMutated) onDataMutated()
    else router.refresh()
  }, [onDataMutated, router])
  const [fillingClientId, setFillingClientId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [selectedClientId, setSelectedClientId] = useState('')
  const [contentsPerWeek, setContentsPerWeek] = useState(0)
  const [draftByClientId, setDraftByClientId] = useState<Record<string, number>>({})
  const [editingClientId, setEditingClientId] = useState<string | null>(null)
  const [weekdaysByClientId, setWeekdaysByClientId] = useState<Record<string, number[]>>({})
  const [sortMode, setSortMode] = useState<PedClientSort>(DEFAULT_PED_CLIENT_SORT)
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const clientIdsInPed = new Set(settings.map((s) => s.clientId))
  const availableClients = clients.filter((c) => !clientIdsInPed.has(c.id))

  useEffect(() => {
    try {
      const stored = localStorage.getItem(PED_CLIENT_SORT_STORAGE_KEY)
      if (isPedClientSort(stored)) setSortMode(stored)
    } catch {
      // ignore
    }
  }, [])

  const handleSortChange = (value: string) => {
    if (!isPedClientSort(value)) return
    setSortMode(value)
    try {
      localStorage.setItem(PED_CLIENT_SORT_STORAGE_KEY, value)
    } catch {
      // ignore
    }
  }

  const sortedSettings = useMemo(() => sortPedClients(settings, sortMode), [settings, sortMode])

  const saveDraft = useCallback(
    async (clientId: string, value: number) => {
      setEditingClientId(null)
      try {
        await upsertPedClientSetting(clientId, Math.max(0, Math.floor(value)))
        setDraftByClientId((prev) => {
          const next = { ...prev }
          delete next[clientId]
          return next
        })
        afterMutate()
      } catch (e) {
        showToast(e instanceof Error ? e.message : 'Errore', 'error')
      }
    },
    [afterMutate]
  )

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    }
  }, [])

  const handleAdd = async () => {
    if (!selectedClientId) return
    try {
      await upsertPedClientSetting(selectedClientId, contentsPerWeek, {
        publishingWeekdays: [],
      })
      setSelectedClientId('')
      setContentsPerWeek(0)
      setAdding(false)
      afterMutate()
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Errore', 'error')
    }
  }

  const handleUpdate = useCallback(
    (clientId: string, value: number) => {
      const safe = Math.max(0, Math.floor(Number(value)) || 0)
      setDraftByClientId((prev) => ({ ...prev, [clientId]: safe }))
      setEditingClientId(clientId)
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
      saveTimeoutRef.current = setTimeout(() => {
        saveTimeoutRef.current = null
        saveDraft(clientId, safe)
      }, SAVE_DEBOUNCE_MS)
    },
    [saveDraft]
  )

  const handleStepper = useCallback(
    (clientId: string, delta: number) => {
      const setting = settings.find((s) => s.clientId === clientId)
      const current = editingClientId === clientId ? draftByClientId[clientId] : setting?.contentsPerWeek ?? 0
      const next = Math.max(0, (current ?? 0) + delta)
      handleUpdate(clientId, next)
    },
    [settings, editingClientId, draftByClientId, handleUpdate]
  )

  const getWeekdays = (clientId: string, fallback?: number[]) =>
    weekdaysByClientId[clientId] ?? fallback ?? []

  const handleToggleWeekday = async (setting: Setting, isoDay: number) => {
    const current = getWeekdays(setting.clientId, setting.publishingWeekdays)
    const next = current.includes(isoDay)
      ? current.filter((d) => d !== isoDay)
      : [...current, isoDay].sort((a, b) => a - b)
    const previous = current
    setWeekdaysByClientId((prev) => ({ ...prev, [setting.clientId]: next }))
    try {
      await upsertPedClientSetting(setting.clientId, setting.contentsPerWeek, {
        publishingWeekdays: next,
      })
    } catch (e) {
      setWeekdaysByClientId((prev) => ({ ...prev, [setting.clientId]: previous }))
      showToast(e instanceof Error ? e.message : 'Errore salvataggio giorni', 'error')
    }
  }

  const handleRemove = async (clientId: string) => {
    if (!confirm('Rimuovere questo cliente dal PED?')) return
    try {
      await removePedClientSetting(clientId)
      afterMutate()
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Errore', 'error')
    }
  }

  const totalTarget = settings.reduce((s, x) => s + x.contentsPerWeek, 0)

  return (
    <div className="bg-dark border border-accent/20 rounded-xl p-4 mb-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <h2 className="text-lg font-semibold text-white">
          {userName ? `Clienti del PED di ${userName}` : 'Clienti nel PED'}
        </h2>
        <label className="flex items-center gap-2 text-sm text-white/70 shrink-0">
          <span>Ordina per</span>
          <select
            value={sortMode}
            onChange={(e) => handleSortChange(e.target.value)}
            className="px-2 py-1 bg-dark border border-accent/20 rounded text-white text-sm max-w-[220px]"
          >
            {PED_CLIENT_SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <ul className="space-y-3 mb-3">
        {sortedSettings.map((s) => {
          const isEditing = editingClientId === s.clientId
          const displayValue =
            isEditing && draftByClientId[s.clientId] !== undefined
              ? draftByClientId[s.clientId]
              : s.contentsPerWeek
          const selectedDays = getWeekdays(s.clientId, s.publishingWeekdays)
          return (
            <li key={s.id} className="flex items-center gap-3 flex-wrap">
              <span className="text-white min-w-[220px] shrink-0">{s.client.name}</span>
              {readOnly ? (
                <>
                  <span className="text-white/80 text-sm">{s.contentsPerWeek} contenuti/mese</span>
                  <div className="flex items-center gap-1 flex-wrap">
                    {WEEKDAY_CHIPS.map(({ iso, label }) => {
                      const on = selectedDays.includes(iso)
                      return (
                        <span
                          key={iso}
                          className={`px-2 py-0.5 rounded text-xs ${
                            on ? 'bg-accent text-dark font-medium' : 'bg-white/5 text-white/40'
                          }`}
                        >
                          {label}
                        </span>
                      )
                    })}
                  </div>
                </>
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
                      onChange={(e) =>
                        handleUpdate(s.clientId, e.target.value === '' ? 0 : parseInt(e.target.value, 10))
                      }
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
                  <div className="flex items-center gap-1 flex-wrap" role="group" aria-label="Giorni di pubblicazione">
                    {WEEKDAY_CHIPS.map(({ iso, label }) => {
                      const on = selectedDays.includes(iso)
                      return (
                        <button
                          key={iso}
                          type="button"
                          aria-pressed={on}
                          onClick={() => void handleToggleWeekday(s, iso)}
                          className={`px-2 py-1 rounded text-xs transition-colors ${
                            on
                              ? 'bg-accent text-dark font-semibold'
                              : 'bg-white/5 text-white/60 hover:bg-white/10 hover:text-white'
                          }`}
                        >
                          {label}
                        </button>
                      )
                    })}
                  </div>
                  {typeof year === 'number' && typeof month === 'number' && (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="border border-accent/40 text-accent hover:bg-accent/10 shrink-0 text-xs whitespace-nowrap"
                      disabled={fillingClientId === s.clientId || s.contentsPerWeek <= 0}
                      title={
                        s.contentsPerWeek <= 0
                          ? 'Imposta un numero di contenuti/mese maggiore di zero'
                          : undefined
                      }
                      onClick={async () => {
                        setFillingClientId(s.clientId)
                        try {
                          const { created, clientName, warning } = await fillPedMonthForClient(
                            s.clientId,
                            year,
                            month
                          )
                          if (warning) showToast(warning, 'error')
                          if (created > 0) {
                            showToast(`Create ${created} task per ${clientName} nel mese corrente`, 'success')
                          } else if (!warning) {
                            showToast(
                              'Il cliente ha già raggiunto il numero di contenuti previsto per questo mese',
                              'success'
                            )
                          }
                          afterMutate()
                        } catch (e) {
                          showToast(e instanceof Error ? e.message : 'Errore', 'error')
                        } finally {
                          setFillingClientId(null)
                        }
                      }}
                    >
                      {fillingClientId === s.clientId ? 'Riempimento…' : 'Riempi il mese attuale'}
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" onClick={() => handleRemove(s.clientId)} className="text-red-400">
                    Rimuovi
                  </Button>
                </>
              )}
            </li>
          )
        })}
      </ul>
      {!readOnly &&
        (adding ? (
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-white/10">
            <select
              value={selectedClientId}
              onChange={(e) => setSelectedClientId(e.target.value)}
              className="px-2 py-1 bg-dark border border-accent/20 rounded text-white text-sm"
            >
              <option value="">Seleziona cliente</option>
              {availableClients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
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
            <Button size="sm" onClick={handleAdd}>
              Aggiungi
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setAdding(false)}>
              Annulla
            </Button>
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
