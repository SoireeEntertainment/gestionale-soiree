'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { PED_PRIORITY_COLORS, PED_ITEM_TYPE_LABELS } from '@/lib/ped-utils'
import { PED_ITEM_KINDS, PED_ITEM_TYPES, PED_PRIORITIES } from '@/lib/validations'
import { createPedItem, updatePedItem, deletePedItem, togglePedItemDone, duplicatePedItem } from '@/app/actions/ped'
import { createClient } from '@/app/actions/clients'
import Link from 'next/link'

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
  priority: string
  status: string
  workId?: string | null
  isExtra?: boolean
  assignedToUserId?: string | null
  assignedTo?: { id: string; name: string } | null
  client: { id: string; name: string }
  work?: { id: string; title: string } | null
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
  const [priority, setPriority] = useState<'NOT_URGENT' | 'MEDIUM' | 'URGENT'>('MEDIUM')
  const [status, setStatus] = useState<'TODO' | 'DONE'>('TODO')
  const [workId, setWorkId] = useState('')
  const [isExtra, setIsExtra] = useState(false)
  const [assignedToUserId, setAssignedToUserId] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setClientList(clients)
  }, [clients, open])

  useEffect(() => {
    if (editItem) {
      setClientId(editItem.clientId)
      setClientSearch(editItem.client.name)
      setKind(editItem.kind as 'CONTENT' | 'WORK_TASK')
      setType(editItem.type)
      setTitle(editItem.title)
      setDescription(editItem.description ?? '')
      setPriority(editItem.priority as 'NOT_URGENT' | 'MEDIUM' | 'URGENT')
      setStatus(editItem.status as 'TODO' | 'DONE')
      setWorkId(editItem.workId ?? '')
      setIsExtra(Boolean(editItem.isExtra))
      setAssignedToUserId(editItem.assignedToUserId ?? editItem.assignedTo?.id ?? currentUserId)
    } else {
      const initialClient = initialClientId ? clients.find((c) => c.id === initialClientId) : null
      setClientId(initialClient ? initialClient.id : '')
      setClientSearch(initialClient ? initialClient.name : '')
      setKind('CONTENT')
      setType('POST')
      setTitle('')
      setDescription('')
      setPriority('MEDIUM')
      setStatus('TODO')
      setWorkId('')
      setIsExtra(initialIsExtra)
      setAssignedToUserId(currentUserId)
    }
  }, [editItem, initialIsExtra, initialClientId, clients, currentUserId, open])

  const filteredClients = clientSearch.trim()
    ? clientList.filter((c) => c.name.toLowerCase().includes(clientSearch.toLowerCase()))
    : clientList
  const exactMatch = clientList.find((c) => c.name.toLowerCase() === clientSearch.trim().toLowerCase())
  const showCreateOption = clientSearch.trim() && !exactMatch

  const handleSelectClient = (c: Client) => {
    setClientId(c.id)
    setClientSearch(c.name)
    setClientDropdownOpen(false)
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
        router.refresh()
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Errore nella creazione del cliente')
    } finally {
      setCreatingClient(false)
    }
  }

  const currentDateKey = editItem ? (typeof editItem.date === 'string' ? editItem.date.slice(0, 10) : '') : dateKey ?? ''

  const handleSave = async () => {
    if (!title.trim() || !clientId || !currentDateKey) return
    setSaving(true)
    try {
      if (editItem) {
        await updatePedItem(editItem.id, {
          clientId,
          date: currentDateKey,
          kind,
          type,
          title: title.trim(),
          description: description.trim() || null,
          priority,
          status,
          workId: workId || null,
          isExtra,
          assignedToUserId: assignedToUserId || null,
        })
      } else {
        await createPedItem({
          clientId,
          date: currentDateKey,
          kind,
          type,
          title: title.trim(),
          description: description.trim() || null,
          priority,
          workId: workId || null,
          isExtra,
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

  return (
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
          <div>
            <label className="block text-sm text-white/70 mb-1">Data</label>
            <input type="text" value={currentDateKey} readOnly className="w-full px-3 py-2 bg-white/5 border border-accent/20 rounded text-white" />
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
                if (!e.target.value) setClientId('')
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
            <select value={type} onChange={(e) => setType(e.target.value)} className="w-full px-3 py-2 bg-dark border border-accent/20 rounded text-white">
              {PED_ITEM_TYPES.map((t) => (
                <option key={t} value={t}>{PED_ITEM_TYPE_LABELS[t] ?? t}</option>
              ))}
            </select>
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
            <label className="block text-sm text-white/70 mb-1">Priorità</label>
            <div className="flex gap-2">
              {PED_PRIORITIES.map((p) => {
                const c = PED_PRIORITY_COLORS[p]
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPriority(p)}
                    className={`px-3 py-1.5 rounded text-sm ${priority === p ? c.bg + ' ' + c.text : 'bg-white/10 text-white/70'}`}
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
              <label className="block text-sm text-white/70 mb-1">Stato</label>
              <select value={status} onChange={(e) => setStatus(e.target.value as 'TODO' | 'DONE')} className="w-full px-3 py-2 bg-dark border border-accent/20 rounded text-white">
                <option value="TODO">Da fare</option>
                <option value="DONE">Fatto</option>
              </select>
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
                <Button variant="secondary" size="sm" onClick={() => handleDuplicate(currentDateKey)}>Duplica (stesso giorno)</Button>
                <Button variant="secondary" size="sm" onClick={() => {
                  const d = new Date(currentDateKey + 'T00:00:00.000Z')
                  d.setUTCDate(d.getUTCDate() + 1)
                  handleDuplicate(d.toISOString().slice(0, 10))
                }}>Duplica (giorno dopo)</Button>
              </>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>Annulla</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? 'Salvataggio...' : 'Salva'}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
