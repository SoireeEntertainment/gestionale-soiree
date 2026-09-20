'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { LoadingButton } from '@/components/ui/loading-button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { PED_ITEM_TYPE_LABELS } from '@/lib/ped-utils'
import { PED_ITEM_KINDS, PED_ITEM_TYPES, PED_PLATFORMS } from '@/lib/validations'
import { PED_LABELS, PED_LABEL_CONFIG, getEffectiveLabel, DEFAULT_LABEL, DONE_LABEL, type PedLabel } from '@/lib/pedLabels'
import { createPedItem, updatePedItem, deletePedItem, togglePedItemDone, duplicatePedItem } from '@/app/actions/ped'
import { getClientShootingsForPed } from '@/app/actions/client-shootings'
import type { PedShootingOption } from '@/lib/types/client-shootings'
import { createClient } from '@/app/actions/clients'
import Link from 'next/link'
import { format, startOfMonth, endOfMonth, eachDayOfInterval, addMonths, subMonths, isSameMonth, parseISO, startOfWeek, endOfWeek } from 'date-fns'
import { it } from 'date-fns/locale'

type Client = { id: string; name: string }
type Work = { id: string; title: string }
type User = { id: string; name: string }
type PedItem = {
  id: string
  date: string
  clientId: string
  kind: string
  type: string
  title: string
  description?: string | null
  priority?: string
  label?: string | null
  status: string
  workId?: string | null
  isExtra?: boolean
  assignedToUserId?: string | null
  assignedTo?: { id: string; name: string } | null
  platforms?: string[]
  shootingReelId?: string | null
  shootingReel?: {
    id: string
    topic: string
    published: boolean
    shooting: {
      id: string
      name: string
      date: string | Date
      location: string | null
    }
  } | null
  client: { id: string; name: string }
  work?: { id: string; title: string } | null
}

function formatShootingOptionDate(dateStr: string): string {
  const [y, m, d] = dateStr.slice(0, 10).split('-').map(Number)
  if (!y || !m || !d) return dateStr
  return format(new Date(y, m - 1, d), 'dd/MM/yyyy')
}

export function PedItemModal({
  open,
  onClose,
  dateKey,
  editItem,
  initialIsExtra = false,
  initialClientId,
  clients,
  works,
  users,
  currentUserId,
  onSuccess,
}: {
  open: boolean
  onClose: () => void
  dateKey: string | null
  editItem: PedItem | null
  initialIsExtra?: boolean
  initialClientId?: string
  clients: Client[]
  works: Work[]
  users: User[]
  currentUserId: string
  onSuccess?: () => void
}) {
  const router = useRouter()
  const [clientList, setClientList] = useState<Client[]>(clients)
  const [clientId, setClientId] = useState('')
  const [clientSearch, setClientSearch] = useState('')
  const [clientDropdownOpen, setClientDropdownOpen] = useState(false)
  const [creatingClient, setCreatingClient] = useState(false)
  const clientDropdownRef = useRef<HTMLDivElement>(null)

  const [kind, setKind] = useState<'CONTENT' | 'WORK_TASK'>('CONTENT')
  const [type, setType] = useState<string>('POST')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [label, setLabel] = useState<PedLabel>(DEFAULT_LABEL)
  const [status, setStatus] = useState<'TODO' | 'DONE'>('TODO')
  const [workId, setWorkId] = useState('')
  const [isExtra, setIsExtra] = useState(false)
  const [assignedToUserId, setAssignedToUserId] = useState('')
  const [platforms, setPlatforms] = useState<string[]>(['INSTAGRAM'])
  const [saving, setSaving] = useState(false)
  const [modalDateKey, setModalDateKey] = useState('')
  const [calendarOpen, setCalendarOpen] = useState(false)
  const [calendarMonth, setCalendarMonth] = useState(new Date())
  const calendarRef = useRef<HTMLDivElement>(null)

  const [shootingId, setShootingId] = useState('')
  const [shootingReelId, setShootingReelId] = useState('')
  const [shootings, setShootings] = useState<PedShootingOption[]>([])
  const [shootingsLoading, setShootingsLoading] = useState(false)
  const [clearLinkConfirmOpen, setClearLinkConfirmOpen] = useState(false)
  const [pendingType, setPendingType] = useState<string | null>(null)

  useEffect(() => {
    setClientList(clients)
  }, [clients, open])

  useEffect(() => {
    if (editItem) {
      const dateStr = typeof editItem.date === 'string' ? editItem.date.slice(0, 10) : ''
      setModalDateKey(dateStr)
      setCalendarMonth(dateStr ? parseISO(dateStr) : new Date())
      setClientId(editItem.clientId)
      setClientSearch(editItem.client.name)
      setKind(editItem.kind as 'CONTENT' | 'WORK_TASK')
      setType(editItem.type)
      setTitle(editItem.title)
      setDescription(editItem.description ?? '')
      const effectiveLabel = getEffectiveLabel(editItem)
      setLabel(effectiveLabel)
      setStatus(editItem.status as 'TODO' | 'DONE')
      setWorkId(editItem.workId ?? '')
      setIsExtra(Boolean(editItem.isExtra))
      setAssignedToUserId(editItem.assignedToUserId ?? editItem.assignedTo?.id ?? currentUserId)
      setPlatforms(editItem.platforms ?? [])
      setShootingReelId(editItem.shootingReelId ?? '')
      setShootingId(editItem.shootingReel?.shooting.id ?? '')
    } else {
      const dateKeyVal = dateKey ?? format(new Date(), 'yyyy-MM-dd')
      setModalDateKey(dateKeyVal)
      setCalendarMonth(dateKeyVal ? parseISO(dateKeyVal) : new Date())
      const initialClient = initialClientId ? clients.find((c) => c.id === initialClientId) : null
      setClientId(initialClient ? initialClient.id : '')
      setClientSearch(initialClient ? initialClient.name : '')
      setKind('CONTENT')
      setType('POST')
      setTitle('')
      setDescription('')
      setLabel(DEFAULT_LABEL)
      setStatus('TODO')
      setWorkId('')
      setIsExtra(initialIsExtra)
      setAssignedToUserId(currentUserId)
      setPlatforms(['INSTAGRAM'])
      setShootingId('')
      setShootingReelId('')
    }
  }, [editItem, initialIsExtra, initialClientId, clients, currentUserId, open, dateKey])

  // Carica shooting solo quando form aperto + cliente + tipologia REEL
  useEffect(() => {
    if (!open || !clientId || type !== 'REEL') {
      setShootings([])
      setShootingsLoading(false)
      return
    }
    let cancelled = false
    setShootingsLoading(true)
    getClientShootingsForPed(clientId)
      .then((rows) => {
        if (!cancelled) setShootings(rows)
      })
      .catch(() => {
        if (!cancelled) setShootings([])
      })
      .finally(() => {
        if (!cancelled) setShootingsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, clientId, type])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (calendarOpen && calendarRef.current && !calendarRef.current.contains(e.target as Node)) {
        setCalendarOpen(false)
      }
    }
    if (calendarOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [calendarOpen])

  const filteredClients = clientSearch.trim()
    ? clientList.filter((c) => c.name.toLowerCase().includes(clientSearch.toLowerCase()))
    : clientList
  const exactMatch = clientList.find((c) => c.name.toLowerCase() === clientSearch.trim().toLowerCase())
  const showCreateOption = clientSearch.trim() && !exactMatch

  const resetShootingLink = () => {
    setShootingId('')
    setShootingReelId('')
  }

  const handleSelectClient = (c: Client) => {
    setClientId(c.id)
    setClientSearch(c.name)
    setClientDropdownOpen(false)
    resetShootingLink()
  }

  const handleTypeChange = (nextType: string) => {
    if (type === 'REEL' && nextType !== 'REEL' && shootingReelId) {
      setPendingType(nextType)
      setClearLinkConfirmOpen(true)
      return
    }
    setType(nextType)
    if (nextType !== 'REEL') resetShootingLink()
  }

  const confirmClearLink = () => {
    if (pendingType) {
      setType(pendingType)
      resetShootingLink()
    }
    setPendingType(null)
    setClearLinkConfirmOpen(false)
  }

  const handleCreateClient = async () => {
    const name = clientSearch.trim()
    if (!name) return
    setCreatingClient(true)
    try {
      const res = await createClient({ name })
      if (res.client) {
        const newClient = { id: res.client.id, name: res.client.name }
        setClientList((prev) => [...prev, newClient])
        setClientId(newClient.id)
        setClientSearch(newClient.name)
        setClientDropdownOpen(false)
        resetShootingLink()
        if (onSuccess) onSuccess()
        else router.refresh()
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Errore nella creazione del cliente')
    } finally {
      setCreatingClient(false)
    }
  }

  const handleSave = async () => {
    if (!title.trim() || !clientId || !modalDateKey) return
    setSaving(true)
    try {
      const payload = {
        clientId,
        date: modalDateKey,
        kind,
        type,
        title: title.trim(),
        description: description.trim() || null,
        label,
        status: (label === DONE_LABEL ? 'DONE' : 'TODO') as 'TODO' | 'DONE',
        workId: workId || null,
        isExtra,
        assignedToUserId: assignedToUserId || null,
        platforms,
        shootingReelId: type === 'REEL' ? shootingReelId || null : null,
      }
      if (editItem) {
        await updatePedItem(editItem.id, payload)
      } else {
        await createPedItem({
          ...payload,
          assignedToUserId: assignedToUserId || currentUserId,
        })
      }
      onClose()
      onSuccess ? onSuccess() : router.refresh()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Errore')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!editItem || !confirm('Eliminare questa voce?')) return
    try {
      await deletePedItem(editItem.id)
      onClose()
      onSuccess ? onSuccess() : router.refresh()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Errore')
    }
  }

  const handleToggleDone = async () => {
    if (!editItem) return
    const result = await togglePedItemDone(editItem.id)
    if (result.ok) {
      setStatus((s) => (s === 'DONE' ? 'TODO' : 'DONE'))
      setLabel((l) => (l === DONE_LABEL ? DEFAULT_LABEL : DONE_LABEL))
      onSuccess ? onSuccess() : router.refresh()
    } else {
      alert(result.error ?? 'Errore')
    }
  }

  const handleDuplicate = async (targetDate: string) => {
    if (!editItem) return
    try {
      await duplicatePedItem(editItem.id, targetDate)
      onClose()
      onSuccess ? onSuccess() : router.refresh()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Errore')
    }
  }

  const selectedShooting = shootings.find((s) => s.id === shootingId)
  const reelOptions = selectedShooting?.reels ?? []
  const showShootingSection = type === 'REEL' && !!clientId

  const linkedSummary =
    editItem?.shootingReel && editItem.type === 'REEL'
      ? editItem.shootingReel
      : null

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto bg-dark border border-accent/20">
          <DialogHeader>
            <DialogTitle className="text-white">{editItem ? 'Modifica voce' : 'Aggiungi voce'}</DialogTitle>
          </DialogHeader>
          {editItem && (
            <div className="flex justify-start border-b border-white/10 pb-3 mb-3">
              <Button variant="danger" size="sm" onClick={handleDelete}>Elimina</Button>
            </div>
          )}
          <div className="space-y-4">
            <div className="relative" ref={calendarRef}>
              <label className="block text-sm text-white/70 mb-1">Data</label>
              <button
                type="button"
                onClick={() => setCalendarOpen((o) => !o)}
                className="w-full px-3 py-2 bg-dark border border-accent/20 rounded text-white text-left hover:border-accent/40 flex items-center justify-between"
              >
                <span>{modalDateKey ? format(parseISO(modalDateKey), 'd MMMM yyyy', { locale: it }) : 'Seleziona data'}</span>
                <span className="text-white/50">📅</span>
              </button>
              {calendarOpen && (
                <div className="absolute z-50 top-full left-0 mt-1 p-3 bg-dark border border-accent/20 rounded-lg shadow-xl min-w-[280px]">
                  <div className="flex items-center justify-between mb-2">
                    <Button type="button" variant="ghost" size="sm" onClick={() => setCalendarMonth((m) => subMonths(m, 1))} className="text-white">‹</Button>
                    <span className="text-white font-medium">{format(calendarMonth, 'MMMM yyyy', { locale: it })}</span>
                    <Button type="button" variant="ghost" size="sm" onClick={() => setCalendarMonth((m) => addMonths(m, 1))} className="text-white">›</Button>
                  </div>
                  <div className="grid grid-cols-7 gap-0.5 text-center text-sm">
                    {['Lu', 'Ma', 'Me', 'Gi', 'Ve', 'Sa', 'Do'].map((d) => (
                      <div key={d} className="text-white/50 py-1">{d}</div>
                    ))}
                    {(() => {
                      const start = startOfWeek(startOfMonth(calendarMonth), { weekStartsOn: 1 })
                      const end = endOfWeek(endOfMonth(calendarMonth), { weekStartsOn: 1 })
                      const days = eachDayOfInterval({ start, end })
                      return days.map((day) => {
                        const dayKey = format(day, 'yyyy-MM-dd')
                        const sameMonth = isSameMonth(day, calendarMonth)
                        const selected = modalDateKey === dayKey
                        return (
                          <button
                            key={dayKey}
                            type="button"
                            onClick={() => {
                              setModalDateKey(dayKey)
                              setCalendarOpen(false)
                            }}
                            className={`py-1.5 rounded ${!sameMonth ? 'text-white/30' : 'text-white'} ${selected ? 'bg-accent text-dark font-semibold' : 'hover:bg-white/10'}`}
                          >
                            {format(day, 'd')}
                          </button>
                        )
                      })
                    })()}
                  </div>
                </div>
              )}
            </div>
            <div>
              <label className="block text-sm text-white/70 mb-1">Assegnato a</label>
              <select
                value={assignedToUserId}
                onChange={(e) => setAssignedToUserId(e.target.value)}
                className="w-full px-3 py-2 bg-dark border border-accent/20 rounded text-white"
              >
                {users.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            </div>
            <div className="relative" ref={clientDropdownRef}>
              <label className="block text-sm text-white/70 mb-1">Cliente</label>
              <input
                type="text"
                value={clientSearch}
                onChange={(e) => {
                  setClientSearch(e.target.value)
                  setClientDropdownOpen(true)
                  if (!e.target.value) {
                    setClientId('')
                    resetShootingLink()
                  }
                }}
                onFocus={() => setClientDropdownOpen(true)}
                onBlur={() => setTimeout(() => setClientDropdownOpen(false), 200)}
                placeholder="Cerca o scrivi il nome per creare un nuovo cliente"
                className="w-full px-3 py-2 bg-dark border border-accent/20 rounded text-white"
              />
              {clientDropdownOpen && (
                <div className="absolute z-10 top-full left-0 right-0 mt-1 max-h-48 overflow-y-auto bg-dark border border-accent/20 rounded shadow-lg">
                  {filteredClients.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault()
                        handleSelectClient(c)
                      }}
                      className={`block w-full text-left px-3 py-2 text-sm hover:bg-accent/10 ${clientId === c.id ? 'text-accent' : 'text-white'}`}
                    >
                      {c.name}
                    </button>
                  ))}
                  {showCreateOption && (
                    <button
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault()
                        handleCreateClient()
                      }}
                      disabled={creatingClient}
                      className="block w-full text-left px-3 py-2 text-sm text-accent hover:bg-accent/10 border-t border-white/10"
                    >
                      {creatingClient ? 'Creazione...' : `➕ Crea cliente "${clientSearch.trim()}"`}
                    </button>
                  )}
                  {filteredClients.length === 0 && !showCreateOption && clientSearch.trim() && (
                    <div className="px-3 py-2 text-sm text-white/50">Nessun cliente trovato</div>
                  )}
                </div>
              )}
            </div>
            <div>
              <label className="block text-sm text-white/70 mb-1">Tipo</label>
              <select value={kind} onChange={(e) => setKind(e.target.value as 'CONTENT' | 'WORK_TASK')} className="w-full px-3 py-2 bg-dark border border-accent/20 rounded text-white">
                <option value="CONTENT">Contenuto</option>
                <option value="WORK_TASK">Lavoro/Task</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-white/70 mb-1">Tipologia</label>
              <select value={type} onChange={(e) => handleTypeChange(e.target.value)} className="w-full px-3 py-2 bg-dark border border-accent/20 rounded text-white">
                {PED_ITEM_TYPES.map((t) => (
                  <option key={t} value={t}>{PED_ITEM_TYPE_LABELS[t] ?? t}</option>
                ))}
              </select>
            </div>

            {showShootingSection && (
              <div className="space-y-3 rounded-md border border-accent/15 p-3">
                <div className="text-sm font-medium text-white/80">Shooting</div>
                {linkedSummary && (
                  <div className="text-xs text-white/60 space-y-0.5 mb-1">
                    <div>
                      Collegato: {formatShootingOptionDate(
                        typeof linkedSummary.shooting.date === 'string'
                          ? linkedSummary.shooting.date
                          : linkedSummary.shooting.date.toISOString()
                      )}{' '}
                      — {linkedSummary.shooting.name}
                    </div>
                    <div>Argomento: {linkedSummary.topic}</div>
                    <div>Pubblicato: {linkedSummary.published ? 'sì' : 'no'}</div>
                  </div>
                )}
                <div>
                  <label className="block text-sm text-white/70 mb-1">Shooting collegato</label>
                  <select
                    value={shootingId}
                    onChange={(e) => {
                      setShootingId(e.target.value)
                      setShootingReelId('')
                    }}
                    disabled={shootingsLoading}
                    className="w-full px-3 py-2 bg-dark border border-accent/20 rounded text-white"
                  >
                    <option value="">Nessuno shooting</option>
                    {shootings.map((s) => (
                      <option key={s.id} value={s.id}>
                        {formatShootingOptionDate(s.date)} — {s.name}
                      </option>
                    ))}
                  </select>
                  {shootingsLoading && <p className="text-xs text-white/40 mt-1">Caricamento shooting…</p>}
                  {!shootingsLoading && shootings.length === 0 && (
                    <p className="text-xs text-white/40 mt-1">Nessuno shooting in scheda cliente.</p>
                  )}
                </div>
                {shootingId && (
                  <div>
                    <label className="block text-sm text-white/70 mb-1">Argomento del Reel</label>
                    <select
                      value={shootingReelId}
                      onChange={(e) => setShootingReelId(e.target.value)}
                      className="w-full px-3 py-2 bg-dark border border-accent/20 rounded text-white"
                    >
                      <option value="">Nessun argomento</option>
                      {reelOptions.map((r) => {
                        const takenByOther = !!r.linkedPedItemId && r.linkedPedItemId !== editItem?.id
                        return (
                          <option key={r.id} value={r.id} disabled={takenByOther}>
                            {r.topic}
                            {takenByOther ? ' (Già collegato)' : ''}
                            {r.published ? ' · Pubblicato' : ''}
                          </option>
                        )
                      })}
                    </select>
                  </div>
                )}
              </div>
            )}

            <div>
              <label className="block text-sm text-white/70 mb-1">Piattaforme</label>
              <div className="flex flex-wrap gap-3">
                {PED_PLATFORMS.map((pf) => {
                  const checked = platforms.includes(pf)
                  return (
                    <label key={pf} className="flex items-center gap-2 text-white/90 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          if (checked) {
                            const next = platforms.filter((x) => x !== pf)
                            setPlatforms(next)
                          } else {
                            setPlatforms([...platforms, pf])
                          }
                        }}
                        className="rounded border-white/50"
                      />
                      <span>{pf === 'INSTAGRAM' ? 'Instagram' : pf === 'LINKEDIN' ? 'LinkedIn' : 'TikTok'}</span>
                    </label>
                  )
                })}
              </div>
            </div>
            <div>
              <label className="block text-sm text-white/70 mb-1">Titolo *</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)} className="w-full px-3 py-2 bg-dark border border-accent/20 rounded text-white" placeholder="Breve titolo" />
            </div>
            <div>
              <label className="block text-sm text-white/70 mb-1">Descrizione</label>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} className="w-full px-3 py-2 bg-dark border border-accent/20 rounded text-white min-h-[80px]" />
            </div>
            <div>
              <label className="block text-sm text-white/70 mb-1">Etichetta</label>
              <div className="flex flex-wrap gap-2">
                {PED_LABELS.map((key) => {
                  const c = PED_LABEL_CONFIG[key]
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => {
                        setLabel(key)
                        setStatus(key === DONE_LABEL ? 'DONE' : 'TODO')
                      }}
                      className={`px-3 py-1.5 rounded text-sm ${label === key ? c.bg + ' ' + c.text : 'bg-white/10 text-white/70'}`}
                    >
                      {c.label}
                    </button>
                  )
                })}
              </div>
            </div>
            <div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={isExtra} onChange={(e) => setIsExtra(e.target.checked)} className="rounded" />
                <span className="text-sm text-white/70">Mostra in colonna Extra (settimana)</span>
              </label>
            </div>
            {editItem && (
              <div>
                <label className="block text-sm text-white/70 mb-1">Completato</label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={status === 'DONE'}
                    onChange={(e) => {
                      const checked = e.target.checked
                      setStatus(checked ? 'DONE' : 'TODO')
                      setLabel(checked ? DONE_LABEL : DEFAULT_LABEL)
                    }}
                    className="rounded"
                  />
                  <span className="text-sm text-white/70">Task completata (Fatto)</span>
                </label>
                <Button variant="ghost" size="sm" onClick={handleToggleDone} className="mt-2">Toggle completato</Button>
              </div>
            )}
            <div>
              <label className="block text-sm text-white/70 mb-1">Collega a lavoro (opzionale)</label>
              <select value={workId} onChange={(e) => setWorkId(e.target.value)} className="w-full px-3 py-2 bg-dark border border-accent/20 rounded text-white">
                <option value="">Nessuno</option>
                {works.map((w) => (
                  <option key={w.id} value={w.id}>{w.title}</option>
                ))}
              </select>
              {workId && <Link href={`/works/${workId}`} className="text-accent text-sm mt-1 inline-block">Apri lavoro →</Link>}
            </div>
          </div>
          <div className="flex justify-between flex-wrap gap-2 pt-4">
            <div className="flex gap-2">
              {editItem && (
                <>
                  <Button variant="secondary" size="sm" onClick={() => handleDuplicate(modalDateKey)}>Duplica (stesso giorno)</Button>
                  <Button variant="secondary" size="sm" onClick={() => {
                    const d = new Date(modalDateKey + 'T00:00:00.000Z')
                    d.setUTCDate(d.getUTCDate() + 1)
                    handleDuplicate(d.toISOString().slice(0, 10))
                  }}>Duplica (giorno dopo)</Button>
                </>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={onClose}>Annulla</Button>
              <LoadingButton onClick={handleSave} loading={saving} loadingText="Salvataggio…">
                Salva
              </LoadingButton>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={clearLinkConfirmOpen} onOpenChange={(o) => {
        if (!o) {
          setClearLinkConfirmOpen(false)
          setPendingType(null)
        }
      }}>
        <DialogContent aria-describedby="clear-shooting-link-desc">
          <DialogHeader>
            <DialogTitle>Rimuovere collegamento shooting?</DialogTitle>
            <DialogDescription id="clear-shooting-link-desc">
              Cambiando tipologia da Reel, il collegamento allo shooting verrà rimosso. La task e lo shooting restano.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="secondary" onClick={() => {
              setClearLinkConfirmOpen(false)
              setPendingType(null)
            }}>
              Annulla
            </Button>
            <Button onClick={confirmClearLink}>Continua</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
